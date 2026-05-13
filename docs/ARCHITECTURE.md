# Arquitetura e Decisões de Engenharia

O ecossistema **Guilds Comercial** evoluiu de uma ferramenta baseada em Excel (onde "todo mundo tem acesso a tudo") para um SaaS real de CRM B2B projetado sob fortes paradigmas de isolamento, Server-Side Rendering (SSR), automações assíncronas (pg_cron) e IA versionada multi-provider.

Este documento mapeia o "Porquê" das macro decisões estruturais tomadas no repositório.

---

## 1. Stack Tecnológico Primário

- **Frontend / API Orchestration:** Next.js 14 (App Router) em TypeScript. Todo roteamento utiliza a pasta `app/` garantindo reatividade de componentes do lado do servidor (RSC). Mutations sempre via **Server Actions** (`"use server"`), nunca rotas REST internas.
- **Componentização:** Tailwind CSS acoplado nativamente com [shadcn/ui] permitindo customização agressiva de marcação sem o peso de libraries fechadas como MaterialUI.
- **Banco e Autenticação:** Supabase (PostgreSQL gerenciado + RLS + Realtime + Edge Functions + Storage + pg_cron + pgvector).
- **IA multi-provider:** Anthropic, OpenAI e Google via dispatcher interno (`lib/ai/`). Prompts versionados em DB.
- **Automações Cron:** `pg_cron` rodando dentro do próprio Postgres — não usa worker externo (sem Railway/Render/Lambda).
- **i18n:** `pt-BR` (default) e `en-US` via `lib/i18n/` com namespaces.
- **Observabilidade:** Sentry (frontend + server) + Supabase Logs + tabelas próprias de auditoria (`ai_invocations`, `outbox_email`, `outbox_push`, `prospeccao_jobs`).

---

## 2. A Camada de Multilocação (Multi-Tenant)

Como múltiplos times (ou as próprias empresas filhas da Guilds) podem operar neste CRM, o princípio absoluto foi proibir vazamento cruzado.

- Adotamos o modelo "Single DB, Logical Schema". Existe um **`organizacao_id`** em todas as tabelas transacionais.
- Em cada requisição logada no servidor (`await supabase.auth.getUser()`), ativamos uma função no Postgres `current_org_id()` (ou `orgs_do_usuario()` para multi-org). O motor RLS injeta silenciosamente restrições em toda instrução SELECT/UPDATE onde a linha não contenha o ID do qual o usuário tem permissão para visualizar.
- **Consequência:** Na UI e no backend, o Dev **não precisa se preocupar em ficar inserindo** `WHERE organizacao_id = X` em todas as queries para segurança, o RLS bloqueia invasões na raiz do driver.
- Views aplicam `WITH (security_invoker = true)` para herdar RLS da tabela base ao invés do owner.

---

## 3. O Paradoxo da Impersonificação (Shadowing Segura)

Permitir que o Gestor entre "na pele" de um SDR (ver timeline do SDR, sem poluição do painel global do Gerente) sem reemitir JWT.

### A Solução: Injeção de Cookie Segura
1. **Server Action** cria cookie HTTPOnly `x-impersonate-user` contendo o ID do SDR + log em `impersonation_logs`.
2. **Wrapper SSR** em `lib/supabase/server.ts` intercepta a leitura de Role. Se cookie existir **e** o usuário real for `gestor`, sobrescreve `role` em memória.
3. Isso garante flexibilidade máxima de suporte sem ferir a integridade criptográfica do DB.

---

## 4. Formulários Baseados em Metadados (Raio-X Dinâmico + Custom Fields)

Ao invés de adicionar hard-columns no Postgres a cada nova pergunta de qualificação, dois sistemas são metadado-driven:

### 4.1 Raio-X (qualificação BANT/SPIN)
1. `raiox_templates` mantém JSON Schema (config_json) com layout (seções, perguntas typed).
2. `DynamicRaioXShell` lê o JSON e constrói o componente reativo.
3. Submit dispara IA (`avaliar_raiox`) que retorna score + risco de perda anual + recomendações.

### 4.2 Custom Fields por org (entregue mai/2026)
1. `custom_field_def` declara campos extras (`texto`, `numero`, `data`, `boolean`, `select`, `multi_select`, `url`) por entidade (`lead`, `empresa`).
2. Valores ficam em `leads.custom_fields JSONB` (não cria coluna física).
3. Componente `<CustomFieldsPanel>` renderiza inputs dinâmicos no detalhe do lead.
4. Gestor configura em `/configuracoes/campos`.

---

## 5. Optimistic Updates e Latência Sensorial

Em interações de altíssima latência sensorial (arrastar lead pelo Kanban), aplicamos `useOptimistic` do React + `@dnd-kit`. UI salta instantaneamente; se backend recusar (validação/queda), rollback elástico visual. Mesma estratégia no toggle de status, atribuição rápida e marcação de "no-show" em ligações.

---

## 6. Automação por pg_cron (worker-less)

Todas as automações periódicas rodam **dentro do Postgres** via `pg_cron`, disparando funções PL/pgSQL ou Edge Functions HTTP. Não dependemos de servidor externo (Railway/Lambda/Render).

### Lista canônica de jobs ativos (mai/2026)

| Job | Schedule (UTC) | O quê faz |
|---|---|---|
| `email-outbox` | a cada 1min | Lê `outbox_email`, envia via Brevo, marca status |
| `push-outbox` | a cada 1min | Lê `outbox_push`, envia Web Push via VAPID |
| `push-cadencia` | 09:00 UTC | Notifica vendedor de passo de cadência do dia (timezone-aware via `Intl.DateTimeFormat` por org) |
| `prospeccao-bulk` | a cada 2min | Processa fila `prospeccao_jobs` (CNPJs em lote, ~2.85 req/s na BrasilAPI) |
| `prospeccao-refresh-cnpj` | 04:00 UTC | Re-consulta CNPJs ativos, MD5 fingerprint detecta mudanças, gera alertas |
| `forecast-semanal` | domingo 23 UTC | Snapshot do forecast (acumulado/realizado/gap) em `forecast_snapshot` |
| `audio-processor` | a cada 2min | Processa `voice_notes` e `ligacao_transcricao` via Whisper + GPT estruturado |
| `score-recalc` | 06:00 UTC | Recalcula `score_total` dos leads (ICP fit + engajamento + comportamento) |
| `nps-survey` | 09:00 UTC | Dispara NPS aos 7d/30d/90d pós-fechamento |
| `health-score` | diário 05 UTC | Recalcula health score dos clientes (recência + NPS + adoção + pagamento) |
| `detect-risco` | diário 07 UTC | Roda IA `detectar_risco` em leads esfriando |
| `digest-semanal` | sexta 17 UTC | IA `digest_semanal` envia executivo pro gestor |
| `resumo-diario` | 22 UTC | IA `resumo_diario` envia pro vendedor (o que foi + foco amanhã) |
| `commission-calc` | 1º do mês 06 UTC | Calcula comissionamento mensal por regra ativa |
| `cleanup-expired` | diário 03 UTC | Hard-delete de leads com `deleted_at < now()` (soft-delete 365d) |

Cada job tem:
- **Idempotência** (rodar 2× não duplica resultado)
- **Logs** em tabela dedicada (`*_log` ou `*_history`) com `executed_at`, `status`, `details`
- **Lock** opcional via `pg_try_advisory_lock` para evitar overlap

---

## 7. Plataforma de Prospecção (CNPJ + Sócios + Alertas + ICP fit)

Concorrente direto de **CNPJ.biz, LinkedIn Sales Navigator e RD Station Prospect**. Decisões-chave:

### 7.1 Fonte gratuita primária (BrasilAPI)
- Consultas em tempo real ao endpoint `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`.
- Rate limit: 5 req/s (free). Worker bulk roda a **2.85 req/s** com `setTimeout(350ms)` para margem.
- Cache em `prospeccao_empresa` + `prospeccao_socio` (org-scoped). RPC `upsert_prospeccao_empresa` mescla payload + QSA atomicamente.
- View `v_prospeccao_empresa` joina empresa + sócios + último alerta.

### 7.2 Detecção de mudanças (alertas)
- Cron diário `prospeccao-refresh-cnpj` re-consulta CNPJs ativos (status diferente de `BAIXADA`).
- MD5 fingerprint do payload importante (`cnae`, `socios[]`, `capital_social`, `endereco`, `nome_fantasia`) detecta mudança.
- Insere row em `prospeccao_alerta` com `tipo`, `payload_anterior`, `payload_atual`. Aparece em `/vendas/prospeccao/alertas`.

### 7.3 Enriquecimento web (opcional)
- **Tavily Search API** — busca LinkedIn de sócios (`POST /vendas/prospeccao/enriquecer-socios`).
- **Firecrawl** — scrape de site da empresa (mensagem comercial, produtos, preços).
- **Similarweb** (futuro) — tráfego e tecnologias.
- **Hunter.io** (futuro) — emails diretos por domínio.

### 7.4 ICP fit score (embeddings)
- Tabela `org_icp_centroide` armazena vector(1536) (OpenAI `text-embedding-3-small`).
- Centroide é calculado a partir das empresas com `crm_stage='Fechado'` da org (média dos vetores).
- RPC `icp_fit_score(empresa_id)` retorna similaridade cosseno (0-100).
- Página `/vendas/prospeccao/icp-fit` lista top 30 da base de prospecção por similaridade.
- Fallback: hash MD5 + Jaccard sobre tokens quando OPENAI_API_KEY não está configurada.

### 7.5 Bulk import (gestor-only)
- Upload de até 500 CNPJs via CSV/textarea em `/vendas/prospeccao/bulk-import`.
- Job é enfileirado em `prospeccao_jobs`, worker processa em background.
- Notificação push quando completa.

---

## 8. Cadência de Outbound Visual (não-code)

Antes: cadência fixa de 6 passos hardcoded em `cadencia_padrao`.
Agora: **fluxos visuais por org**, configuráveis em `/configuracoes/cadencia/fluxos`.

### Modelo de dados
- `cadencia_fluxo` (id, org, nome, descrição, trigger, status: `draft|publicado|arquivado`)
- `cadencia_fluxo_passo` (fluxo_id, ordem, offset_dias, canal: `email|whatsapp|call|linkedin|sms|task_manual`, assunto, corpo, condição)

### Workflow do gestor
1. Cria fluxo em modo draft, define triggers (`manual|lead_criado|lead_segmento|lead_fonte`).
2. Adiciona passos (drag-reorder, presets de SDR/AE/B2B SaaS).
3. Cada passo pode ter **condicional**: `sempre`, `se_nao_respondeu`, `se_clicou_link`, `se_score_alto`, `se_segmento=tech`, etc.
4. Publica (status `publicado`) → fluxos default rodam automaticamente.
5. Marca um como `default_template` da org → novos leads entram nele automaticamente.

### Execução
- Trigger SQL `criar_lead_completo` enfileira passos do fluxo default.
- Cada passo vira row em `cadencia` com `data_acao`, `status` (pendente, executado, pulado).
- Cron `push-cadencia` notifica vendedor no dia do passo.
- Pular condicional avalia em runtime (não no enfileiramento).

---

## 9. Email Validation e Anti-Bounce

Antes de qualquer envio outbound, pipeline em `lib/email-validation.ts`:

1. **Cache global** (`email_validacao_cache`) — domínios já validados ficam 30d.
2. **Sintaxe** — regex RFC simplificado.
3. **Disposable domains** — lista de >5000 domínios temporários em `email_disposable_domains`.
4. **MX lookup** — DNS check (Edge Function).
5. **Role-based check** — `info@`, `contato@` flagged como baixa qualidade.
6. **Bounce history** — `email_bounce` registra hard bounces via webhook Brevo (`registrar_bounce_email` RPC). Endereços com `bounce_perm=true` são bloqueados.

Resultado: bloqueia envio em invalid/disposable/no_mx/bounce_perm antes de gastar quota Brevo.

---

## 10. IA Multi-Provider Versionada (15 Features)

Dispatcher `invokeAI` em `lib/ai/`:
1. Carrega `ai_feature` (override por org → fallback global).
2. Valida `papel_minimo` (RBAC) e budget diário (`limite_dia_org`, `limite_dia_usuario`).
3. Carrega `ai_prompt` ativa daquela `(org, feature)` (versionada).
4. Renderiza template Mustache substituindo `{{vars}}`.
5. Chama adapter HTTP (Anthropic / OpenAI / Google).
6. Loga em `ai_invocations` (input, output, tokens, custo USD, latência, status).
7. Parse JSON tolerante (suporta ```` ```json ```` fences).

API keys **nunca** ficam no DB — `api_key_ref` aponta para env var. Permite rotação sem migration.

### 15 features ativas

| Código | Quando | Output |
|---|---|---|
| `enriquecer_lead` | CSV import | JSON |
| `gerar_oferta_raiox` | enviar oferta diagnóstico | Texto |
| `gerar_documento_raiox` | pós-call | JSON |
| `gerar_mensagem_cadencia` | passo D0/D3/D7/... | Texto |
| `extrair_ligacao` | resumo→campos | JSON |
| `next_best_action` | sugestão contextual | Texto |
| `briefing_pre_call` | 30min antes | Texto |
| `objection_handler` | "cliente disse X" | JSON |
| `gerar_proposta` | 3 versões | JSON |
| `sugerir_motivo_perda` | texto livre→padrão | JSON |
| `detectar_risco` | cron diário | JSON |
| `resumo_diario` | cron 19h | Texto |
| `digest_semanal` | cron sexta 17h | Texto |
| `reativar_nutricao` | timing | JSON |
| `forecast_ml` | ajuste heurístico | JSON |

Detalhes em [AI_SETUP.md](./AI_SETUP.md).

---

## 11. Onboarding Transacional (RPC atômico)

Antes: 10 INSERTs sequenciais. Se o 7º falhasse, org ficava em estado inconsistente.
Agora: **RPC `onboarding_finalize`** PL/pgSQL com transação implícita. Falha qualquer passo → rollback completo.

Inputs: payload completo (nome_org, tier, raiox_template, cadencia_default, primeiro_vendedor, metas, ICP).
Outputs: `{ org_id, user_role, default_fluxo_id }`.

---

## 12. Áudio: Voice Notes + Análise de Chamadas

### 12.1 Voice notes (vendedor grava nota no celular)
- `<VoiceNoteRecorder>` usa `MediaRecorder` API. Limite 60s.
- POST `/api/voice-notes/upload` → Storage bucket `voice-notes` + row em `voice_note` (status `pending`).
- Cron `audio-processor` chama Whisper → transcrição → GPT `extrair_ligacao` → campos estruturados em `voice_note.dados_extraidos`.
- UI mostra transcrição + tags + ação sugerida.

### 12.2 Análise de chamadas (upload de gravação completa)
- POST `/api/ligacoes/transcrever` aceita áudio até 25MB.
- Pipeline: Storage `ligacoes-audio` → Whisper → GPT estruturado (BANT, objeções, próximos passos, sentimento, tom).
- Row em `ligacao_transcricao` com `tom_interacao` (-1 a +1), `topicos`, `objecoes`, `proximos_passos`.
- `<LigacaoTranscricaoPanel>` no detalhe do lead lista todas + permite re-análise.

---

## 13. Flywheel Borboleta (Pós-Venda)

Concretiza o RFC [FLYWHEEL.md](./FLYWHEEL.md):

- **`indicacoes`** — quem indicou quem, status (recebida → contactado → virou_lead → fechado).
- **`pedidos_indicacao`** — quando vendedor pediu (pós-fechamento, pós-raio-x, renovação).
- **Triggers SQL** auto-criam pedido ao fechar lead; ao indicação fechar, atualiza status.
- **Aba `/indicacoes`** com 4 sub-abas (Pendentes, Ativas, Top embaixadores, Recompensas).
- **KPIs Advocacy em `/funil`** — K-factor, % indicação→fechado, CAC por origem.
- **Health Score** (em construção) — composto recência + NPS + adoção + pagamento.

---

## 14. Goals, Comissionamento e Landing Pages

### Goals (`/gestao/metas`)
- Tabela `meta` (org, vendedor, periodo, métrica, valor_alvo).
- View `v_meta_progresso` calcula `realizado`, `gap`, `% atingimento`.
- Burndown bar por vendedor, agregado por gestor.

### Comissionamento (`/gestao/comissoes`)
- Regras em `comissao_regra` (org, tipo: `fixo_pct|escalonado|por_meta`, params JSON).
- Cron mensal calcula `comissao_calculo` (vendedor, periodo, valor_apurado, status: `pendente|aprovado|pago`).
- Workflow: Gestor aprova → Marca pago (gera linha em `comissao_pagamento` com data + comprovante).

### Landing Pages (`/configuracoes/landing-pages`)
- Tabela `landing_page` (slug, branding JSON, campos JSON).
- Página pública em `/[slug]` (fora do `(app)` group, sem auth).
- Submit cria lead com `fonte='landing:{slug}'`.
- Tracking UTM + dispositivo + IP (hashado) em `landing_submission`.

---

## 15. Convenções de Código

### Pastas
- `app/(app)/` — rotas autenticadas (com sidebar + layout principal)
- `app/(public)/` — landing/login/onboarding
- `app/api/` — REST endpoints (webhooks Brevo/Stripe, cron triggers, uploads)
- `lib/` — utilities, supabase clients, AI dispatcher, helpers
- `components/` — reusable UI (shadcn-based)
- `supabase/migrations/` — versão linear `YYYYMMDD_*.sql`

### Patterns
- **Server Actions sempre tipadas**: `Promise<{ ok: true; ... } | { ok: false; error: string }>`.
- **`revalidatePath` em toda mutation**.
- **Form: server action + `useFormState`** (não fetch+JSON).
- **i18n keys completas** — nunca hardcode strings em pt; `t("namespace.key")`.
- **RLS first, app logic second** — assumir DB já filtrou; app só ordena/projeta.

---

## 16. Decisões deliberadamente NÃO adotadas

- **Worker externo (Railway/Lambda/Render):** `pg_cron` é suficiente; sem necessidade de outra plataforma.
- **GraphQL:** Supabase REST + Server Actions são suficientes. GraphQL adicionaria complexidade sem benefício.
- **Mobile app nativo (React Native/Swift/Kotlin):** PWA cobre 90% dos casos sem app store overhead. Excluído pelo founder em mai/2026.
- **WhatsApp Cloud API oficial:** Excluído pelo founder. Cliente usa WhatsApp comum (web/desktop). Cadência gera deep links `wa.me`.
- **Mirror RFB completo (60M CNPJs):** Custaria ~R$300/mo de servidor dedicado. Consulta on-demand via BrasilAPI suficiente.
- **LinkedIn Sales Nav dados privados:** Legalmente impossível (ToS proíbe scraping). Tavily search público resolve casos críticos.

Veja [ROADMAP.md](./ROADMAP.md) para lista completa do que está entregue, pendente e excluído.
