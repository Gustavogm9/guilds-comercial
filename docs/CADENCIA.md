# Cadência — Fluxos visuais configuráveis

Implementado em **mai/2026**. Substitui a cadência hardcoded de 6 passos (D0/D3/D7/D11/D16/D30) por um builder visual de fluxos por org, configurável pelo gestor.

## TL;DR

- Builder visual (drag-reorder, presets) em `/configuracoes/cadencia/fluxos`
- 6 canais: `email`, `whatsapp`, `call`, `linkedin`, `sms`, `task_manual`
- 7 condicionais por passo (`sempre`, `se_nao_respondeu`, `se_score_alto`, etc.)
- 4 triggers: `manual`, `lead_criado`, `lead_segmento`, `lead_fonte`
- Status `draft → publicado → arquivado` com versionamento
- Push notification timezone-aware ao vendedor
- Email validation pré-envio (anti-bounce)
- Geração de mensagem via IA (`gerar_mensagem_cadencia`)

---

## 1. Modelo de dados

### `cadencia_fluxo`
- `id`, `organizacao_id`
- `nome`, `descricao`
- `trigger` (`manual|lead_criado|lead_segmento|lead_fonte`)
- `trigger_valor` (ex: para `lead_segmento`, "saas"; para `lead_fonte`, "indicacao")
- `status` (`draft|publicado|arquivado`)
- `ativo` boolean
- `default_template` boolean — só 1 por org com `default_template=true` e `status='publicado'`
- `criado_por`, `publicado_em`, `created_at`, `updated_at`

### `cadencia_fluxo_passo`
- `id`, `fluxo_id`
- `ordem` (1-based)
- `offset_dias` (0-365 — quantos dias após entrada do lead no fluxo)
- `canal` (`email|whatsapp|call|linkedin|sms|task_manual`)
- `nome_passo` (display)
- `assunto` (email/sms)
- `corpo` (template Mustache `{{empresa}}`, `{{nome}}`, `{{primeiro_nome}}`, `{{cargo}}`, etc.)
- `pular_se_respondeu` boolean
- `pular_se_clicou_link` boolean
- `condicao_para_executar` (`sempre|se_nao_respondeu|se_clicou_link|se_score_alto|se_score_baixo|se_segmento=X|se_fonte=Y`)

### `cadencia` (instâncias por lead)
Cada lead pode ter N rows.
- `lead_id`, `fluxo_id`, `passo_n`, `passo_origem_id` (FK cadencia_fluxo_passo)
- `canal`, `data_acao`, `data_executado`
- `status` (`pendente|executado|pulado|cancelado`)
- `mensagem_renderizada` (template com vars substituídas)
- `motivo_pulo` (se status=pulado)

---

## 2. Triggers (como leads entram no fluxo)

### 2.1 `manual`
Vendedor escolhe ativamente no detalhe do lead: botão "Adicionar à cadência" → modal seleciona fluxo → enfileira passos.

### 2.2 `lead_criado` (default da org)
Trigger SQL `criar_lead_completo` enfileira automaticamente os passos do fluxo `default_template=true && status='publicado'`.

```sql
-- Pseudo
INSERT INTO leads (...) RETURNING id INTO v_lead_id;
SELECT id INTO v_fluxo_id FROM cadencia_fluxo
  WHERE organizacao_id = p_org_id
    AND default_template = TRUE
    AND status = 'publicado';
IF v_fluxo_id IS NOT NULL THEN
  INSERT INTO cadencia (lead_id, fluxo_id, passo_n, passo_origem_id, canal, data_acao, status)
  SELECT v_lead_id, v_fluxo_id, ordem, id, canal,
         CURRENT_DATE + offset_dias, 'pendente'
  FROM cadencia_fluxo_passo
  WHERE fluxo_id = v_fluxo_id;
END IF;
```

### 2.3 `lead_segmento`
Lead com `segmento = trigger_valor` entra automaticamente.

### 2.4 `lead_fonte`
Lead com `fonte = trigger_valor` entra automaticamente. Útil para fluxos especiais (ex: "fluxo de indicação" para `fonte='indicacao'`).

---

## 3. Condicionais (avaliadas em runtime)

Não bloqueiam enfileiramento — passo entra `pendente`. Na hora de executar, avalia:

| Condição                  | Lógica                                                              |
|---------------------------|---------------------------------------------------------------------|
| `sempre`                  | Executa                                                             |
| `se_nao_respondeu`        | Pula se há `lead_evento` tipo `whatsapp_recebido` ou `email_aberto` |
| `se_clicou_link`          | Executa apenas se houve `email_link_clicado` em passo anterior     |
| `se_score_alto`           | Executa se `leads.score_total >= 70`                                |
| `se_score_baixo`          | Executa se `leads.score_total < 40`                                 |
| `se_segmento=X`           | Executa se `leads.segmento = X`                                     |
| `se_fonte=Y`              | Executa se `leads.fonte = Y`                                        |

Implementação: função SQL `cadencia_avaliar_condicao(lead_id, passo_id) RETURNS BOOLEAN`. Cron `push-cadencia` chama antes de notificar.

---

## 4. Canais

| Canal          | Modo de execução                                              |
|----------------|---------------------------------------------------------------|
| `email`        | Enfileira em `outbox_email`. Pipeline anti-bounce valida antes.|
| `whatsapp`     | Gera deep link `wa.me/{tel}?text=<msg>`. Vendedor clica e envia. |
| `call`         | Cria tarefa em `/hoje`. Vendedor liga manualmente.            |
| `linkedin`     | Gera link `linkedin.com/in/<slug>` + copy. Vendedor envia manualmente. |
| `sms`          | Twilio API (futuro — env var `TWILIO_API_KEY`).              |
| `task_manual`  | Cria tarefa genérica em `/hoje`.                             |

Email e SMS são totalmente automáticos. Demais são "semi-automáticos" (notifica vendedor, ele executa).

---

## 5. UI

### `/configuracoes/cadencia/fluxos`
Lista de fluxos da org com:
- Status badge (draft/publicado/arquivado)
- Default marker (★)
- Total de passos
- Última edição
- Botões: editar, arquivar, marcar default, duplicar.

### `/configuracoes/cadencia/fluxos/novo`
Wizard de 3 passos:
1. **Identificação**: nome, descrição, trigger (+ valor se aplicável).
2. **Passos**: lista drag-reorder. Cada passo abre modal com canal/offset/assunto/corpo/condicional.
3. **Revisão**: preview da timeline + summary.

Salvar cria em `status='draft'`. Botão "Publicar" valida (>=1 passo + nome único) e atualiza.

### `/configuracoes/cadencia/fluxos/[id]`
Editor do fluxo existente. Mesma UX do wizard mas com:
- Timeline visual horizontal de passos
- Drag-reorder via `@dnd-kit`
- "Visualizar como vendedor" — preview de como aparecerá em `/hoje`
- "Testar com lead fake" — gera mensagens renderizadas para inspeção
- "Estatísticas" — % executado vs pulado vs cancelado por passo (alimenta otimização)

### Presets de fluxo (sai do template vazio)
Botão "Começar de um preset" mostra:
1. **Outbound B2B SDR** — 6 passos (D0/D3/D7/D11/D16/D30), mix email+whatsapp+call.
2. **AE Pipeline ativo** — 4 passos focados em lead já em qualificação.
3. **B2B SaaS Trial expirado** — 5 passos reativação.
4. **Indicação recebida** — 3 passos curtos (D0/D2/D5) priority.
5. **Lead frio (>30 dias)** — 4 passos de "tentativa final".

Preset clona estrutura para a org, gestor edita à vontade.

---

## 6. Execução (cron `push-cadencia`)

Schedule: 09:00 UTC.

```
1. Calcula janela: passos com data_acao entre (hoje-1) e (hoje+1) em UTC.
2. Para cada org:
   a. Determina timezone via Intl.DateTimeFormat.
   b. Filtra rows onde dataLocal(data_acao, tz) = dataLocal(now(), tz).
3. Para cada passo:
   a. Avalia condicao_para_executar.
   b. Se = FALSE: marca status='pulado', motivo='condicao_nao_atendida'.
   c. Se canal=email:
      - Valida email do lead via pipeline.
      - Se inválido: marca pulado, motivo='email_invalido'.
      - Senão: enfileira em outbox_email com mensagem renderizada.
   d. Se canal=whatsapp/call/linkedin/task_manual:
      - Cria notificação push ao responsavel_id.
      - Aparece em /hoje com botão "Executar" e "Adiar".
4. Atualiza data_executado se foi automático (email/sms).
```

---

## 7. Geração de mensagem via IA

Cada passo pode usar `gerar_mensagem_cadencia` (feature IA) com vars dinâmicas.

Exemplo de template no passo:
```
Olá {{primeiro_nome}}, vi que vocês da {{empresa}} estão crescendo no segmento {{segmento}}.

[IA: gerar abertura personalizada baseada no contexto.]

{{cta_padrao}}
```

Botão "Gerar via IA" no editor renderiza:
```
Olá Marina, vi que vocês da Tech Stark estão crescendo no segmento de software jurídico.

Notei que vocês estão expandindo o atendimento para mais cidades — geralmente nesse estágio, o gargalo está na qualificação dos leads que chegam pelo site. Faz sentido conversarmos 15min essa semana?

Posso compartilhar um exemplo prático que ajudou uma empresa similar.
```

Variáveis disponíveis: `empresa`, `primeiro_nome`, `cargo`, `segmento`, `cidade_uf`, `score_total`, `dias_no_estagio`, `dor_principal`, `valor_potencial`, `responsavel_nome`.

---

## 8. Anti-bounce e quality gates

Antes de enviar email automaticamente:

```typescript
// lib/email-validation.ts
async function validarEmailParaEnvio(email) {
  // 1. Cache 30d
  const cached = await sb.from('email_validacao_cache').select('*').eq('email', email).maybeSingle();
  if (cached?.data) return cached.data;

  // 2. Sintaxe
  if (!regexEmail.test(email)) return { valido: false, motivo: 'sintaxe' };

  // 3. Disposable domain
  const domain = email.split('@')[1];
  const disposable = await sb.from('email_disposable_domains').select('dominio').eq('dominio', domain).maybeSingle();
  if (disposable?.data) return { valido: false, motivo: 'disposable' };

  // 4. MX lookup
  const mx = await checkMx(domain);
  if (!mx) return { valido: false, motivo: 'no_mx' };

  // 5. Role-based check
  const localPart = email.split('@')[0];
  const roleBased = ['info', 'contato', 'admin', 'suporte', 'vendas'].includes(localPart);

  // 6. Bounce history
  const bounce = await sb.from('email_bounce').select('bounce_perm').eq('email', email).maybeSingle();
  if (bounce?.data?.bounce_perm) return { valido: false, motivo: 'bounce_perm' };

  // Cache + return
  const result = { valido: true, mx_existe: true, disposable: false, role_based: roleBased };
  await sb.from('email_validacao_cache').upsert({ email, ...result });
  return result;
}
```

Webhook Brevo `/api/webhooks/brevo` recebe bounces e atualiza `email_bounce.bounce_perm` via RPC `registrar_bounce_email`.

---

## 9. Métricas e otimização

View `v_cadencia_metricas` agrega:
- Total enviado/pulado/cancelado por passo, por fluxo, por canal.
- Taxa de abertura (email — via tracking pixel Brevo).
- Taxa de clique (email — links com UTM).
- Taxa de resposta (whatsapp/email).
- Taxa de conversão (passo → próximo crm_stage).

Painel `/configuracoes/cadencia/fluxos/[id]/stats` mostra:
- Funnel visual: 100% entrou → X% executou passo 1 → Y% respondeu → ...
- Heatmap de melhor horário/dia.
- Comparação A/B (se duas versões publicadas).

---

## 10. Próximos passos (roadmap cadência)

- **A/B nativo** — duas versões do fluxo rodam em paralelo, sistema rotaciona, mede conversão.
- **Branching** — após passo 3, vai pra fluxo A se respondeu / fluxo B se não.
- **Trigger por evento webhook** — fluxo dispara ao receber evento externo (ex: cliente abriu proposta no Pandadoc → entra em fluxo de close).
- **Goal-based** — fluxo termina quando lead atinge crm_stage X, não em passo N.
- **Templates por marketplace** — gestor escolhe templates compartilhados por outras orgs do Guilds (anonimizado).
