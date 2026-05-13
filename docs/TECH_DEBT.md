# Dívidas técnicas

Catálogo das dívidas técnicas identificadas e o estado atual de cada uma. Atualizado em **mai/2026** após a wave de implementação de prospecção, IA SDR, flywheel e custom fields.

Legenda: ✅ resolvido • 🚧 parcial • 🔴 aberto

---

## ✅ Resolvidos em mai/2026

### ✅ 1. Onboarding atômico (RPC transacional)
**Era:** 10 INSERTs sequenciais em `app/onboarding/actions.ts`. Se o 7º falhasse, org ficava em estado inconsistente.
**Resolvido:** Migration `20260511090000_onboarding_transacional.sql` cria RPC `onboarding_finalize` PL/pgSQL com transação implícita. Caller TS chama 1× via `supabase.rpc('onboarding_finalize', { payload })`. Rollback completo em caso de falha.

### ✅ 2. Persistência QSA / sócios da prospecção
**Era:** Endpoint `/api/prospeccao/cnpj` retornava dados ao cliente mas **descartava** sócios. CRM perdia info valiosa.
**Resolvido:** Migration `20260511100000_prospeccao_empresa_socio.sql` cria cache + RPC `upsert_prospeccao_empresa` que mescla atomicamente empresa + array de sócios. Endpoint persiste via RPC antes de retornar.

### ✅ 3. Detecção de mudanças em CNPJ
**Era:** CRM consultava CNPJ, mas se sócio mudasse depois ninguém sabia.
**Resolvido:** Cron `prospeccao-refresh-cnpj` (diário 04 UTC) re-consulta CNPJs ativos da org, calcula MD5 fingerprint do payload importante e insere alerta em `prospeccao_alerta` se mudou. UI `/vendas/prospeccao/alertas` lista.

### ✅ 4. Cadência fixa hardcoded
**Era:** 6 passos D0/D3/D7/D11/D16/D30 cravados em código (`cadencia_padrao.ts`). Gestor não conseguia adaptar para times com motion diferente (SDR vs AE, B2B vs B2C).
**Resolvido:** Migration `20260511140000_cadencia_fluxos_visuais.sql` + UI `/configuracoes/cadencia/fluxos`. Editor visual com presets, drag-reorder, condicionais (7 tipos), publicação de drafts e default per-org.

### ✅ 5. Push-cadencia sem timezone
**Era:** Cron `push-cadencia` rodava em UTC, vendedor recebia notificação em horário aleatório local.
**Resolvido:** Job agora calcula janela 3 dias UTC, filtra por `dataLocal` per-org via `Intl.DateTimeFormat`. Cada org notifica suas pendências em horário comercial local.

### ✅ 6. Confirm() nativo em pos-venda
**Era:** 4× `window.confirm()` em `pos-venda-client.tsx` (UX ruim, não acessível, não-tematizável).
**Resolvido:** Componente `<ConfirmDialog>` reusable em 4 tons (default, destructive, warning, info) substitui todos os confirms. Acessível, tema-aware, focus trap.

### ✅ 7. RLS membros (acesso cruzado)
**Era:** Policy de `membros_organizacao` deixava listar membros de outras orgs em alguns casos.
**Resolvido:** Policy reescrita restringindo a `EXISTS (SELECT 1 FROM membros_organizacao WHERE user_id = auth.uid() AND organizacao_id = membros_organizacao.organizacao_id)`.

### ✅ 8. Validação de email antes de envio
**Era:** Envia email pra qualquer endereço, gasta quota Brevo + reputação.
**Resolvido:** Pipeline `lib/email-validation.ts` (cache 30d → syntax → disposable → MX → role-based → bounce history). Bloqueia envio em invalid/disposable/no_mx/bounce_perm. Webhook Brevo registra bounces.

### ✅ 9. Duplicação `lead_evento` em transferência de carteira
**Era:** Antes gravava 1 meta-evento no primeiro lead da transferência em massa.
**Resolvido:** Agora insere 1 `responsavel_alterado` por lead em chunks de 500.

### ✅ 10. App config sem UI
**Era:** Secrets cron / webhook URLs / feature flags em `app_config` eram alterados via SQL Editor (perigoso, sem audit).
**Resolvido:** Página `/configuracoes/desenvolvedores/app-config-manager` (gestor-only) lista keys com reveal/copy. Audit em `app_config.atualizado_por` + `atualizado_em`.

### ✅ 11. Webhooks não disparavam (eram só armazenados)
**Era:** Configurar webhook não tinha efeito.
**Resolvido:** Worker queue `webhook_delivery` com retry exponencial 1/5/30min/2h/6h. Trigger SQL em eventos relevantes enfileira. Edge function `process-webhook-queue` (cron 30s) entrega com signature HMAC.

### ✅ 12. Image optimization
**Era:** `<img>` tag puro em vários lugares, sem lazy/srcset.
**Resolvido:** Migrado para `next/image` em todos pontos críticos (avatar, logo da org, thumbnails de proposta). Sizes definidos, lazy default.

### ✅ 13. CTA de billing
**Era:** Modal/banner ambíguo sobre upgrade.
**Resolvido:** CTA clara em `/configuracoes/plano` mostrando plano atual, próxima fatura, botão direto "Mudar plano" → Stripe Customer Portal.

---

## 🚧 Parcialmente resolvidos

### 🚧 14. Drift entre `calcularBreakdown` (TS) e `lead_score_fechamento` (SQL)
**Status:** Score multi-dimensional (icp_fit + engajamento + comportamento) agora vive no DB em colunas `leads.score_*` + view `v_leads_enriched`. Mas `calcularBreakdown` em `pipeline/[id]/page.tsx` ainda existe para o breakdown didático mostrado ao vendedor.
**Pendente:** Migrar para view `v_lead_score_breakdown` que retorna os 8 fatores já calculados, eliminando o cálculo TS duplicado.

### 🚧 15. Detalhe do lead faz 6 queries em paralelo
**Status:** Adicionamos 3 painéis novos (custom fields, ligacoes transcricao, voice notes), virou 9 queries.
**Pendente:** Criar view `v_lead_detail` agregando tudo em JSONB. Reduz round-trips para 1.

---

## 🔴 Abertos

### 🔴 16. Multi-step actions sem transação (RPC transacional)
**Status:** `onboarding_finalize` e `upsert_prospeccao_empresa` foram convertidos. Mas ainda restam:
- `base/criarLead` (insert leads + lead_evento + newsletter + cadencia) — precisa virar RPC `criar_lead_completo`.
- `equipe/transferirCarteira` (update leads + insert lead_evento em massa).
- `raio-x/ofertarRaioX` (insert raio_x + update leads + insert lead_evento).
- `indicacoes/responderPedidoIndicacao` (update pedido + insert N indicacoes + insert N leads).

**Esforço:** ~4h por action.

### 🔴 17. Rate limiting em endpoints públicos
**Status:** Não implementado.
**Impacto:** 🟡 Médio. Endpoints como `/api/prospeccao/cnpj` e `/api/webhooks/brevo` podem ser abusados.
**Plano:** Instalar `@upstash/ratelimit` (ou Supabase + KV). 60 req/min por IP, 600 req/min por API key. Headers `X-RateLimit-*`.

### 🔴 18. Soft-delete cleanup
**Status:** Coluna `deleted_at` adicionada em `leads`. Cron `cleanup-expired` agendado mas não rodando em prod ainda (config pendente).
**Plano:** Ativar cron + adicionar à política LGPD.

### 🔴 19. Política LGPD formal
**Status:** Coletamos dados conforme LGPD, mas falta documentação pública.
**Plano:**
- Termo de uso na landing
- Política de privacidade detalhando dados/base legal/retenção (365d)/DPO contact
- Botão "Solicitar exclusão" no perfil
- Export JSON (LGPD art. 18)

### 🔴 20. Rotação de credenciais expostas em commits antigos
**Status:** Audit não rodado.
**Plano:** Trufflehog / git-secrets no histórico. Rotar Supabase Service Role Key, Anthropic, Sentry DSN, Stripe Webhook Secret.

### 🔴 21. Webhook WhatsApp inbound
**Status:** Não implementado.
**Plano:** `app/api/webhooks/whatsapp/route.ts` com verificação Twilio/Meta signature. Insere resposta como `lead_evento`. Atualiza `cadencia.status='respondido'`. ⚠️ Founder excluiu WhatsApp Cloud API oficial em mai/2026, então isso fica adiado/cancelado.

### 🔴 22. Testes E2E
**Status:** Vitest unit + DB invariants OK. Falta E2E (Playwright/Cypress).
**Plano:** Smoke tests dos 5 fluxos críticos: onboarding, criar lead, registrar ligação, mover kanban, fechar venda.

### 🔴 23. UI escalonado para comissão
**Status:** Hoje regras escalonadas precisam ser cadastradas via SQL Editor (params JSONB livre).
**Plano:** Builder visual em `/gestao/comissoes/regras/novo` para regras escalonadas (faixas, percentuais por faixa).

### 🔴 24. Stripe USD
**Status:** Só BRL configurado. Atendimento de cliente USA/Europa precisa Price IDs USD.
**Plano:** Adicionar no Stripe Dashboard + atualizar `lib/stripe.ts:PRICES_BY_CURRENCY`.

### 🔴 25. Re-embedding automático
**Status:** Embeddings de empresas são gerados sob demanda. Quando empresa muda (refresh CNPJ detecta CNAE novo), embedding fica stale.
**Plano:** Cron `vector-embedding-update` (a cada 6h) reprocessa empresas modificadas nas últimas 24h.

---

## Pendências externas (ação do usuário/produto)

Itens que dependem de configuração externa ou decisão de produto:

### Operacional (Vercel)
- Redeploy para pegar últimos commits da wave mai/2026.
- Configurar opcionalmente: `HUNTER_API_KEY`, `SIMILARWEB_API_KEY`, `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`. Sistema funciona sem (fallback graceful).

### Cobrança
- Quando ativar Stripe: definir preços, criar Customer Portal, configurar webhooks.

### Roadmap explicitamente fora
- Mobile app nativo (excluído pelo founder)
- WhatsApp Cloud API oficial (excluído)
- Mirror RFB completo (60M CNPJs, custo proibitivo)
- LinkedIn Sales Navigator dados privados (legalmente impossível)

---

## Resumo numérico (mai/2026)

- ✅ **13 itens resolvidos** nesta wave
- 🚧 **2 itens parciais** (precisam só polimento)
- 🔴 **12 itens abertos** (sendo 4 de produto/operacional, 8 técnicos)
- 📊 Cobertura de testes Vitest: ~70% das server actions críticas
- 🛡️ Auditoria de segurança: pendente
