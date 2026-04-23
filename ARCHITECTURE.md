# Arquitetura — Guilds Comercial

Documento de arquitetura consolidada após migrations v1→v5.
Referência pra decisões de modelagem, camadas, fluxo de dados.

---

## Stack

- **Next.js 14 (App Router)** — Server Components por default, Server Actions
  pra mutations, `dynamic = "force-dynamic"` em todas as rotas autenticadas.
- **Supabase** — Postgres + Auth + Edge Functions (Deno) + pg_cron.
- **TypeScript** strict — types espelham schema.sql em `lib/types.ts`.
- **Tailwind CSS** — tokens próprios no `tailwind.config` (guild-*, urgent-*, warning-*).
- **@dnd-kit** — drag-and-drop do Kanban.
- **Anthropic/OpenAI/Google** — LLM providers da camada de IA (plug-and-play).

---

## Camadas

```
┌───────────────────────────────────────────────────────────────┐
│  UI (Server + Client Components)                              │
│  - app/(app)/{hoje,pipeline,funil,base,raio-x,admin/ai,...}   │
│  - components/{lead-score-card, motivo-saida-modal, ai/...}   │
└───────────────────────────────────────────────────────────────┘
                                │
                                ▼ Server Actions (use server)
┌───────────────────────────────────────────────────────────────┐
│  Domain Actions                                               │
│  - app/(app)/*/actions.ts — moverEtapa, arquivarLead,         │
│    atualizarPercepcao, importarLeadsEmMassa                   │
│  - lib/ai/actions/index.ts — 15 ações de IA                   │
└───────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│  AI Dispatcher (lib/ai/dispatcher.ts)                         │
│  - resolve feature + prompt + provider                        │
│  - valida papel + budget                                      │
│  - renderiza template, chama adapter, loga invocação          │
└──────────────┬───────────────────────┬────────────────────────┘
               │                       │
               ▼                       ▼
┌──────────────────────┐  ┌─────────────────────────────────────┐
│  Provider Adapters   │  │  Supabase (Postgres + Auth)         │
│  - anthropic.ts      │  │  - schema.sql + migrations v2..v5   │
│  - openai.ts         │  │  - views SQL (v_funil_*, v_lead_*)  │
│  - google.ts         │  │  - RLS por current_org_id()         │
│  (HTTP via fetch)    │  │  - pg_cron + Edge Functions         │
└──────────────────────┘  └─────────────────────────────────────┘
```

---

## Schema (após migrations v1-v5)

### Core (v1)
- `organizacoes`, `profiles`, `membros_organizacao` — multi-tenant
- `leads`, `ligacoes`, `cadencia`, `raio_x`, `raio_x_oferta`
- `meta_semanal`, `meta_mensal`, `lead_evento` (timeline auditoria)
- `newsletter_envios`

### v2 — Completude
- Expande `crm_stage` com 10 etapas (Prospecção → Negociação → Fechado/Perdido/Nutrição)
- Função `lead_probabilidade_por_etapa` + trigger `sync_lead_probabilidade`
- Views `v_kpis_globais`, `v_kpis_por_canal`, `v_kpis_por_responsavel`

### v3 — Funil analytics
- Views: `v_funil_conversao`, `v_tempo_por_etapa`, `v_valor_por_etapa`,
  `v_cohort_entrada`, `v_motivos_perda`
- Alimentam a tela `/funil` com conversão, tempo, valor, cohort e ranking de motivos

### v4 — Score + motivos obrigatórios
- Colunas novas em `leads`: `motivo_perda`, `motivo_perda_detalhe`, `percepcao_vendedor`
- Coluna em `ligacoes`: `tom_interacao`
- Função `lead_score_fechamento(lead_id)` — retorna 0-100 composto por 8 fatores
- Views: `v_lead_score`, `v_forecast_mes`, `v_top_oportunidades`

### v5 — Camada de IA
- `ai_providers` — Anthropic/OpenAI/Google (+ custos/1k tokens)
- `ai_features` — catálogo das 15 features com modelo/temp/max_tokens/budget
- `ai_prompts` — biblioteca versionada, uma versão ativa por (org, feature)
- `ai_invocations` — log completo (tokens, custo, latência, status)
- View `v_ai_uso_30d` — agregação por feature

---

## Fluxo de dados: exemplo

**Usuário arrasta lead pra "Perdido" no Kanban:**

1. `KanbanBoard` (client) detecta drop → se destino ∈ `ETAPAS_EXIGEM_MOTIVO`,
   abre `MotivoSaidaModal` (não chama action direto).
2. Usuário preenche motivo. Opcionalmente clica "Sugerir com IA" → action
   `sugerirMotivoPerda` chama `invokeAI(feature: 'sugerir_motivo_perda', ...)` →
   dispatcher chama Anthropic → retorna JSON `{motivo_padrao: "Sumiu", confianca: 0.87}`.
3. Usuário confirma → action `moverEtapa(id, "Perdido", motivo, detalhe)`.
4. Action valida, faz `UPDATE leads` com novos campos, insere em `lead_evento`
   com payload `{para, motivo, motivo_detalhe}`.
5. `revalidatePath` invalida `/pipeline`, `/funil`, `/hoje`.
6. Próxima consulta em `/funil` puxa `v_motivos_perda` atualizado → aparece no ranking.

---

## Fluxo de dados: Score

**Usuário abre `/pipeline/42`:**

1. Server component faz 6 queries em paralelo — incluindo `v_lead_score` pro score 0-100.
2. Função SQL `lead_score_fechamento(42)` executa:
   - Pega `l.crm_stage` → 0-25pts
   - Pega `l.fit_icp` → 0-10pts
   - ... (8 fatores)
   - Soma e clampa em [0, 100]
3. Frontend renderiza `LeadScoreCard` com gauge, breakdown dos 8 fatores e
   controles pra atualizar `percepcao_vendedor` e tom da última ligação.
4. `NextBestActionCard` (dentro do ScoreCard) oferece botão "Gerar com IA" →
   action `nextBestAction(...)` → dispatcher → prompt ativo → Anthropic →
   narrativa textual devolvida pra UI.

---

## Multi-tenant

- **`organizacao_id`** em todas as tabelas de dados.
- **Cookie `x-organizacao-ativa`** armazena a org corrente do usuário.
- Helper SQL `current_org_id()` (security definer stable) lê o cookie via
  `current_setting('request.jwt.claims')`.
- RLS: `organizacao_id = current_org_id()` — simples e rápido.
- Features e prompts têm duas versões: **global** (`organizacao_id IS NULL`, template
  universal) e **override por org**. Dispatcher prefere org → global.

---

## IA: decisões-chave

1. **Prompts no banco, não no código** — versionamento, auditoria, edição sem deploy.
2. **Provider pluggável por feature** — nada obriga usar o mesmo LLM pra tudo.
3. **API keys via env var referenciada** — `ai_providers.api_key_ref = "ANTHROPIC_API_KEY"`.
   Chave nunca toca o banco, gerenciada no Vercel/Supabase como secret.
4. **Budget cap por feature** — evita fatura-surpresa. Separado por org e usuário.
5. **Log estruturado em `ai_invocations`** — debugging e fine-tuning futuro.
6. **Output JSON parseado pelo dispatcher** — tolera Markdown fences, devolve
   `parsed` tipado pra o action usar sem ceremônia.

---

## Performance

- **Views agregadas no banco** (`v_funil_*`, `v_lead_score`) — UI só renderiza.
- **`receita_ponderada`** é generated column — sem recálculo no select.
- **Optimistic UI** no Kanban e score card — responsivo sem esperar o banco.
- **`force-dynamic`** em rotas autenticadas + `revalidatePath` em actions — sem stale.
- **Índices** em `organizacao_id`, `responsavel_id`, `(organizacao_id, funnel_stage)`,
  `(organizacao_id, crm_stage)`, `data_proxima_acao`, e em todos os FKs de `lead_evento`.

---

## Segurança

- RLS em todas as tabelas de negócio.
- Server Actions validam `getCurrentOrgId()` e `getCurrentRole()` antes de mutate.
- `requireGestor()` em toda action de `/admin/*`.
- Feature AI valida `papel_minimo` antes de chamar o provider.
- Budget cap bloqueia chamada antes de disparar request externo.
- Motivos de perda são enum fixo — valor inválido dá erro SQL.
