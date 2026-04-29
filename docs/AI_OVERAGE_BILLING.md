# Cobrança por consumo de IA — Overage Billing

Como funciona, como configurar Stripe metered, e como ajustar preços.

---

## Modelo de cobrança

- **Plano fixo mensal** continua existindo (Starter R$149, Growth R$399, Scale sob consulta).
- Cada plano tem **limite mensal incluído** de invocações de IA:
  - Starter / Trial: 300/mês
  - Growth: 2.000/mês
  - Scale: ilimitado
- Acima do limite → **overage** cobrado por feature, com preço próprio:

| Faixa | Features | Preço por invocação extra |
|---|---|---|
| Premium | `gerar_proposta` | R$1,00 |
| Alta | `gerar_documento_raiox`, `digest_semanal` | R$0,80 |
| Média | `briefing_pre_call`, `extrair_ligacao`, `resumo_diario` | R$0,40 |
| Padrão | `gerar_oferta_raiox`, `next_best_action`, `objection_handler`, `detectar_risco`, `reativar_nutricao`, `forecast_ml` | R$0,30 |
| Baixa | `gerar_mensagem_cadencia` | R$0,20 |
| Mínima | `enriquecer_lead` | R$0,15 |
| Microtransação | `sugerir_motivo_perda` | R$0,10 |

**Os preços são editáveis** por feature via SQL ou (futuramente) via UI em `/admin/ai`. Coluna `ai_features.preco_overage_centavos`.

---

## Comportamento operacional

1. Usuário/sistema invoca uma feature de IA via `invokeAI()` ou `invokeAISystem()`.
2. Após sucesso, o dispatcher chama `registrar_ai_usage(org, feature_codigo)` (RPC).
3. A função SQL:
   - Faz upsert na tabela `ai_usage_mensal` (1 row por org/mes/feature)
   - Soma o total de invocações da org no mês atual
   - Se ultrapassou o limite incluído do plano → marca a invocação como overage e adiciona `preco_overage_centavos` ao acumulado
4. **Não há bloqueio**: o usuário continua usando IA. O custo entra na próxima fatura.
5. **Banner em `/admin/ai`** avisa em 80% e 100% do limite.
6. **Card em `/configuracoes/billing`** mostra consumo em tempo real.
7. **Cron mensal** (`report_ai_overage_monthly`, dia 1 às 03:00 UTC) reporta o total ao Stripe via metered usage record.

---

## Setup Stripe metered (uma vez por ambiente)

Necessário antes que o cron mensal funcione. Sem isso, o consumo é registrado no banco mas **não é faturado**.

### 1. Criar produto e price metered no Stripe

Pode ser via Dashboard ou API. Pelo Dashboard:

1. **Products** → **Add product** → "Guilds AI Overage"
2. **Pricing** → **Add price**:
   - Pricing model: **Standard pricing** com **Recurring**
   - Billing period: **Monthly**
   - Usage type: **Metered usage**
   - Aggregate usage: **Sum**
   - Currency: **BRL**
   - Price: **R$0,30** (= 30 centavos por unit)
3. Salvar. Copiar o `price_id` (formato `price_xxx`).

### 2. Adicionar env var

No `.env.local` (dev) e Vercel (prod):

```
STRIPE_PRICE_AI_OVERAGE=price_1Abc...
```

### 3. Adicionar item metered às subscriptions existentes

Para cada cliente já assinante (não automatizado):

```bash
# via Stripe CLI ou Dashboard:
stripe subscriptions update sub_xxx \
  --items[0][price]=price_<plano_atual> \
  --items[1][price]=$STRIPE_PRICE_AI_OVERAGE \
  --proration_behavior=none
```

Para clientes novos: o checkout já faz isso automaticamente se incluirmos `STRIPE_PRICE_AI_OVERAGE` no `createCheckoutSession`. **TODO: integrar isso em `lib/stripe.ts`** (ainda não feito — precisa adicionar `line_items[1][price]` quando STRIPE_PRICE_AI_OVERAGE existe).

### 4. Validar cron

```bash
# Manualmente, simulando o cron:
curl -X POST $APP_URL/api/cron/report-ai-overage \
  -H "X-Cron-Secret: $CRON_SECRET"
```

Resposta esperada:
```json
{
  "ok": true,
  "periodo": "2026-03-01",
  "processed": 3,
  "reported": 1,
  "skipped": 2,
  "errors": 0,
  "results": [
    { "organizacao_id": "...", "valorCentavos": 4500, "units": 150, "status": "reported" },
    { "organizacao_id": "...", "valorCentavos": 200, "units": 0, "status": "skipped", "motivo": "sem_stripe_subscription" }
  ]
}
```

### 5. Schedule pg_cron

Já feito automaticamente pela migration `20260427100011_pg_cron_report_overage.sql`, **se** `CRON_SECRET` e `APP_URL` estiverem no Supabase Vault. Validar:

```sql
select jobname, schedule from cron.job where jobname = 'report_ai_overage_monthly';
```

---

## Ajustar preços

Editar diretamente no banco via `/admin/ai` (futuro UI) ou SQL:

```sql
update public.ai_features
set preco_overage_centavos = 50  -- R$0,50
where codigo = 'gerar_proposta'
  and organizacao_id is null;  -- afeta default global; deixa null pra org-specific override
```

Mudanças se aplicam a invocações **a partir do momento** do update. Histórico já cobrado fica imutável.

Para criar **override por org** (ex: cliente premium com preço melhor):

```sql
insert into public.ai_features (organizacao_id, codigo, ..., preco_overage_centavos)
select '<org_uuid>', codigo, ..., 20  -- preço especial
from public.ai_features
where codigo = 'gerar_proposta' and organizacao_id is null;
```

A função `registrar_ai_usage` prefere override por org; cai no global se não encontrar.

---

## Como auditar uma fatura

1. Cliente recebeu fatura com R$45 de overage. Quer entender de onde veio.
2. Consultar:

```sql
select feature_codigo, invocacoes, invocacoes_overage, valor_overage_centavos
from public.ai_usage_mensal
where organizacao_id = '<uuid>'
  and periodo_inicio = '2026-03-01'  -- mês cobrado
order by valor_overage_centavos desc;
```

Resultado mostra exatamente quais features estouraram o limite e quanto cada uma custou.

3. Comparar com o detalhamento por feature em `/configuracoes/billing` (mesmos dados, UI amigável).

---

## Limitações conhecidas

- **Stripe price único** (R$0,30/unit) com weighted units: cliente vê na fatura "150 unidades de IA", sem detalhe por feature. Pra detalhe granular: criar 1 price por faixa de preço (5 prices) e reportar separadamente. Trade-off: mais complexidade pra menos confusão.
- **Overage não bloqueia**: foi decisão explícita pra UX. Se org rodar 100k invocações por engano, fatura pode ser absurda. Mitigação: alerta visual em 80%/100% + monitorar via Sentry quando `valor_overage_centavos` passa de R$X em uma org.
- **Idempotency Key** é `<orgId>-<periodo>` — se o cron rodar múltiplas vezes no mesmo mês (incomum), Stripe não duplica. Se quiser **rerodar manualmente** (ex: reportagem corrigida), use chave diferente.
- **Trial** conta no limite (300 inclusas). Se a org passou pra `active` no meio do mês, o limite vira o do plano novo, mas usage anterior já foi contabilizado.

---

## Pendentes para V1.1

- Integrar `STRIPE_PRICE_AI_OVERAGE` no `createCheckoutSession` (hoje só monta line_item do plano fixo)
- UI no `/admin/ai` pra gestor editar preços (hoje só via SQL)
- Cap mensal de hard-stop (proteção: bloqueia se overage passar de 5x do plano)
- Webhook do Stripe pra refletir `invoice.payment_failed` em `organizacoes.billing_status`
- Relatório em PDF com detalhamento por feature pra gestor enviar pro CFO
