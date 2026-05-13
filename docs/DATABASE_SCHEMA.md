# Dicionário de Dados & Database Schema

Banco PostgreSQL gerenciado pelo Supabase. Segurança garantida via **RLS** (Row Level Security) com `organizacao_id` em todas as tabelas transacionais. Extensões habilitadas: `pg_cron`, `pgvector`, `pg_net`, `pgcrypto`, `uuid-ossp`.

## 1. Topologia de Isolamento (Multi-Tenant)

- **`organizacoes`** — entidade pai (root tenant).
- **`membros_organizacao`** — N:N entre `auth.users` e `organizacoes`. Define `role` (`gestor` / `comercial` / `sdr`).
- **`profiles`** — extensão de `auth.users` com `display_name`, `avatar_url`, `timezone`, `locale`.

Função canônica:
```sql
current_org_id() -- retorna UUID da org corrente baseado em cookie/JWT
orgs_do_usuario() -- retorna todas as orgs do usuário logado (multi-org)
```

Toda RLS usa: `USING (organizacao_id = current_org_id())`.

---

## 2. Núcleo Comercial

### 2.1 `leads`
Tabela núcleo. Combina o que antes era "base bruta" + "comercial" em planilhas.

Campos principais:
- **Identidade**: `id BIGSERIAL`, `organizacao_id UUID`, `legacy_id`, `is_demo`, `nome`, `empresa`, `cargo`, `email`, `whatsapp`, `linkedin`, `instagram`, `segmento`, `cidade_uf`, `site`.
- **Pipeline**: `funnel_stage` (`base_bruta|base_qualificada|pipeline|arquivado`), `crm_stage` (`Prospecção|Qualificação|Demonstração|Proposta|Fechado|Perdido|Nutrição`), `temperatura`, `prioridade`, `motion`, `fonte`.
- **Atribuição**: `responsavel_id` (FK profiles), `canal_principal`.
- **Datas**: `data_entrada`, `data_primeiro_contato`, `data_ultimo_toque`, `data_proxima_acao`, `data_proposta`, `data_fechamento`, `proxima_acao` (text).
- **Financeiro**: `valor_potencial`, `probabilidade`, `receita_ponderada` (GENERATED), `valor_setup`, `valor_mensal`, `link_proposta`.
- **Qualificação**: `decisor`, `fit_icp`, `dor_principal`, `observacoes`, `percepcao_vendedor`.
- **Perda**: `motivo_perda`, `motivo_perda_detalhe`.
- **Marketing**: `newsletter_optin`.
- **Score** (mai/2026): `score_icp_fit`, `score_engajamento`, `score_comportamento`, `score_total`, `score_calculado_em`.
- **Custom fields** (mai/2026): `custom_fields JSONB`.
- **Origem prospecção** (mai/2026): `origem_prospeccao_empresa_id` (FK), `indicacao_id` (FK).
- **Auditoria**: `created_at`, `updated_at`, `deleted_at` (soft-delete 365d).

### 2.2 `v_leads_enriched`
View canônica que aplicações sempre consomem. Inclui:
- Todos campos de leads
- `dias_sem_tocar` (computed)
- `responsavel_nome`, `responsavel_email` (join profiles)
- `raiox_status`, `raiox_nivel`, `raiox_score`, `raiox_data_pagamento` (join raio_x)
- `total_ligacoes` (subquery count)
- **(mai/2026)** Score multi-dimensional ao final (não quebra ordem existente)

⚠️ **Importante:** Postgres não permite renomear/reordenar colunas em `CREATE OR REPLACE VIEW`. Toda nova coluna **DEVE ser adicionada ao final** ou caí no erro "cannot change name of view column".

### 2.3 `lead_evento` (audit log)
Timeline 360°. Tipos: `criado`, `responsavel_alterado`, `crm_stage_alterado`, `ligacao_registrada`, `whatsapp_enviado`, `email_enviado`, `raiox_oferta`, `raiox_pago`, `proposta_enviada`, `fechado`, `perdido`, `pediu_indicacao`, `criado_por_indicacao`, `nps_recebido`, `voice_note_anexada`, `audio_processado`.

### 2.4 `ligacoes` + `ligacao_transcricao` (mai/2026)
- `ligacoes`: registro manual da chamada (data, duração, tom_interacao, resumo).
- `ligacao_transcricao` (novo): linkado a `ligacoes`, contém `audio_url`, `transcricao_completa`, `topicos[]`, `objecoes[]`, `proximos_passos[]`, `sentimento`, `tom_interacao` (analisado por IA), `status` (`pendente|processando|concluido|erro`).

### 2.5 `voice_note` (mai/2026)
Notas de áudio curtas (≤60s) gravadas no celular pelo vendedor.
Campos: `lead_id`, `audio_url`, `duracao_seg`, `transcricao`, `dados_extraidos JSONB`, `status`.

---

## 3. Raio-X (qualificação dinâmica)

### 3.1 `raiox_templates`
JSON Schema do formulário em `config_json JSONB`. Array de seções → array de perguntas (typed: `text|number|select|multi_select|textarea|boolean|scale_1_5`). 1 template ativo por org.

### 3.2 `raiox_respostas`
Submissões progressivas. `lead_id` + `dados JSONB` (chave-valor com `pergunta_id`) + `concluido boolean`.

### 3.3 `raio_x`
Tabela legada (compatibilidade). Resultado analítico: `status_oferta`, `nivel`, `score`, `data_pagamento`, `documento_url`.

---

## 4. Cadência (Outbound)

### 4.1 `cadencia` (registros de passos por lead)
Cada lead tem N rows: `lead_id`, `passo_n`, `canal`, `data_acao`, `status` (`pendente|executado|pulado|cancelado`), `mensagem_renderizada`, `template_id`.

### 4.2 `cadencia_fluxo` (mai/2026 — fluxos visuais)
Fluxo configurável por org.
- `nome`, `descricao`, `status` (`draft|publicado|arquivado`), `trigger` (`manual|lead_criado|lead_segmento|lead_fonte`), `trigger_valor`, `default_template`, `ativo`, `publicado_em`, `criado_por`.

### 4.3 `cadencia_fluxo_passo` (mai/2026)
Passos do fluxo:
- `fluxo_id`, `ordem`, `offset_dias` (0-365), `canal` (`email|whatsapp|call|linkedin|sms|task_manual`), `nome_passo`, `assunto`, `corpo`.
- `pular_se_respondeu`, `pular_se_clicou_link`.
- `condicao_para_executar` (`sempre|se_nao_respondeu|se_clicou_link|se_score_alto|se_score_baixo|se_segmento=X|se_fonte=Y`).

---

## 5. Prospecção (mai/2026)

### 5.1 `prospeccao_empresa`
Cache global de CNPJs consultados. **Não tem `organizacao_id`** — é compartilhado entre todas orgs para economizar consultas BrasilAPI. Privacidade preservada via tabela de pivot.
- `cnpj` (PK), `razao_social`, `nome_fantasia`, `situacao`, `data_situacao`, `capital_social`, `natureza_juridica`, `cnae_principal`, `cnae_principal_descricao`, `cnae_secundarios[]`.
- `endereco` (objeto JSONB com `logradouro`, `numero`, `cep`, `bairro`, `municipio`, `uf`).
- `socios` (array JSONB com `nome`, `cpf_cnpj`, `qualificacao`, `data_entrada`).
- `payload_completo JSONB`, `payload_fingerprint TEXT` (MD5 do payload importante).
- `consultado_em`, `atualizado_em`.

### 5.2 `prospeccao_empresa_org` (pivot privacy)
- `(cnpj, organizacao_id)` PK
- `is_favorito`, `tags[]`, `observacoes`, `notas_internas`, `responsavel_id`, `created_at`.

### 5.3 `prospeccao_socio`
- `cnpj`, `nome`, `cpf_cnpj`, `qualificacao`, `data_entrada`, `linkedin_url` (preenchido por Tavily).

### 5.4 `prospeccao_alerta`
Detecção de mudanças.
- `cnpj`, `tipo` (`mudanca_socio|mudanca_endereco|mudanca_cnae|mudanca_capital|baixa|reativacao`), `payload_anterior JSONB`, `payload_atual JSONB`, `detectado_em`.

### 5.5 `prospeccao_jobs`
Fila de bulk import.
- `org_id`, `cnpjs[]`, `status` (`pending|processing|done|partial|failed`), `progresso`, `total`, `iniciado_em`, `concluido_em`, `iniciado_por`.

### 5.6 RPCs
- `upsert_prospeccao_empresa(payload_json, org_id)` — mescla empresa + sócios + cria/atualiza pivot.
- `registrar_alerta_prospeccao(cnpj, tipo, anterior, atual)` — usado pelo cron refresh.

### 5.7 Views
- `v_prospeccao_empresa` — join empresa + pivot da org + último alerta.
- `v_prospeccao_alertas_org` — alertas filtrados pra org logada.

---

## 6. ICP Fit Embeddings (mai/2026)

Requer extensão `pgvector`.

### 6.1 `prospeccao_empresa_embedding`
- `cnpj` (PK), `embedding vector(1536)`, `gerado_em`.
- Texto fonte: `textoEmpresaPraEmbedding()` em `lib/embeddings.ts` (razão social + CNAE descrição + segmento + sócios).

### 6.2 `org_icp_centroide`
- `organizacao_id` (PK), `centroide vector(1536)`, `qtd_empresas_fonte`, `calculado_em`.
- Centroide = média dos vetores das empresas com `crm_stage='Fechado'` na org.

### 6.3 RPCs
- `icp_fit_score(empresa_cnpj, org_id)` → 0-100 (cosine distance).
- `top_empresas_icp_fit(org_id, limit)` → top N CNPJs por similaridade ao centroide.
- `recalcular_centroide_org(org_id)` → recomputa baseado nos fechamentos atuais.

---

## 7. IA Multi-Provider (já existia, mantida)

- **`ai_providers`** — anthropic/openai/google, `api_key_ref` (nome de env var), `base_url`, `custos_por_1k`, ativo.
- **`ai_features`** — 15 features (`enriquecer_lead`, `next_best_action`, ...). Por org: provider, modelo, temperature, max_tokens, budget dia, papel_minimo.
- **`ai_prompts`** — versionado por `(org, feature)`. Uma versão ativa. `system_prompt`, `user_template`, `variaveis_esperadas[]`.
- **`ai_invocations`** — log completo. `input_vars JSONB`, `output_text`, `output_json`, `tokens_in`, `tokens_out`, `custo_usd`, `latencia_ms`, `status` (`sucesso|erro|bloqueado_budget|timeout`).
- **`v_ai_uso_30d`** — agregação 30d por feature.

---

## 8. Outbox Pattern (Email + Push)

### 8.1 `outbox_email`
- `to`, `from`, `subject`, `html`, `text`, `template_id`, `template_vars JSONB`, `status` (`pending|sending|sent|failed|bounced`), `tentativas`, `erro`, `agendado_para`, `enviado_em`, `org_id`.
- Cron `email-outbox` (1min) lê pending, envia via Brevo, atualiza status.

### 8.2 `outbox_push`
- `user_id`, `title`, `body`, `icon`, `url`, `status`, `agendado_para`.
- Cron `push-outbox` (1min) envia via Web Push (VAPID).

### 8.3 `webpush_subscription`
- `user_id`, `endpoint`, `keys` (p256dh, auth), `criado_em`, `ultimo_uso`.

---

## 9. Email Anti-Bounce (mai/2026)

### 9.1 `email_validacao_cache`
- `email` (PK), `valido boolean`, `motivo`, `mx_existe`, `disposable`, `role_based`, `validado_em` (TTL 30d).

### 9.2 `email_disposable_domains`
- `dominio` (PK). >5000 domínios temporários populados via seed.

### 9.3 `email_bounce`
- `email`, `tipo` (`hard|soft|complaint`), `motivo`, `recebido_em`, `bounce_perm boolean`.
- Atualizado por webhook Brevo (`POST /api/webhooks/brevo`).

### 9.4 RPC `registrar_bounce_email(email, tipo, motivo)`
Marca `bounce_perm=true` se hard bounce ou >3 soft em 30d.

---

## 10. Flywheel (Indicações + NPS + Health)

### 10.1 `indicacoes`
Quem indicou quem.
- `embaixador_lead_id`, `solicitado_por`, `indicado_nome`, `indicado_empresa`, `indicado_cargo`, `indicado_email`, `indicado_whatsapp`, `contexto`.
- `lead_convertido_id` (FK leads, SET NULL).
- `status` (`recebida|contactado|virou_lead|fechado|perdido|descartado`).
- Datas: `data_recebida`, `data_contactado`, `data_convertido`, `data_fechado`, `data_perdido`.
- Recompensa: `recompensa_tipo`, `recompensa_valor`, `recompensa_paga`.

### 10.2 `pedidos_indicacao`
- `lead_id`, `solicitado_por`, `momento` (`pos_fechamento|pos_raio_x|pos_resultado|renovacao|outro`), `canal`, `status` (`pendente|respondido|negado|ignorado|agendado`), `qtd_indicacoes_recebidas`.
- Trigger SQL `trg_criar_pedido_apos_fechamento` cria automaticamente quando lead.crm_stage = 'Fechado'.

### 10.3 `nps_resposta`
- `lead_id`, `score` (0-10), `categoria` (`detrator|neutro|promotor` GENERATED), `comentario`, `respondido_em`, `enviado_em`.

### 10.4 `health_score`
- `lead_id`, `score_total`, `componentes JSONB` (recencia, nps, adocao, pagamento), `calculado_em`.

### 10.5 Views
- `v_advocacy_kpis` — K-factor, % indicação no pipeline, CAC por origem.
- `v_top_embaixadores` — ranking por receita gerada.

---

## 11. Onboarding & Configurações

### 11.1 RPC `onboarding_finalize` (mai/2026 — transacional)
Substitui 10 INSERTs sequenciais.
Input JSONB: nome_org, tier, raiox_template, cadencia_default, primeiro_vendedor, metas[], ICP description.
Output: `{ org_id, user_role, default_fluxo_id }`.
Transação implícita: falha qualquer passo → rollback total.

### 11.2 `app_config` (mai/2026 — UI exposed)
- `key` (PK), `value JSONB`, `descricao`, `atualizado_em`, `atualizado_por`.
- Cron secrets, webhook URLs, feature flags. Editável em `/configuracoes/desenvolvedores/app-config-manager`.

### 11.3 `webhook_subscription`
- `org_id`, `url`, `events[]` (lead.created, raiox.completed, indicacao.fechada, ...), `secret`, `ativo`, `ultimo_disparo`.

### 11.4 `webhook_delivery` (worker queue)
- `subscription_id`, `event_type`, `payload JSONB`, `status` (`pending|sent|failed|abandoned`), `tentativas`, `proximo_retry`.
- Backoff exponencial 1min/5min/30min/2h/6h.

---

## 12. Custom Fields (mai/2026)

### 12.1 `custom_field_def`
- `org_id`, `entidade` (`lead|empresa`), `chave`, `rotulo`, `tipo` (`texto|numero|data|boolean|select|multi_select|url`), `opcoes[]`, `obrigatorio`, `descricao`, `ordem`, `ativo`.

### 12.2 Valores
Armazenados em `leads.custom_fields JSONB` (não cria coluna física).

---

## 13. Goals, Comissionamento (mai/2026)

### 13.1 `meta`
- `org_id`, `vendedor_id` (NULL = meta global), `periodo` (`mes|trimestre|ano`), `periodo_inicio`, `periodo_fim`, `metrica` (`receita_fechada|leads_qualificados|propostas_enviadas|fechamentos|raiox_oferecidos`), `valor_alvo`.

### 13.2 `v_meta_progresso`
Calcula `realizado`, `gap`, `% atingimento` em runtime.

### 13.3 `comissao_regra`
- `org_id`, `vendedor_id` (NULL = global), `tipo` (`fixo_pct|escalonado|por_meta`), `params JSONB`, `ativa`, `vigencia_inicio`, `vigencia_fim`.

### 13.4 `comissao_calculo`
- `vendedor_id`, `periodo`, `valor_apurado`, `breakdown JSONB`, `status` (`pendente|aprovado|pago`), `aprovado_em`, `pago_em`.

### 13.5 `comissao_pagamento`
- `calculo_id`, `valor`, `data_pagamento`, `comprovante_url`, `observacao`.

---

## 14. Landing Pages (mai/2026)

### 14.1 `landing_page`
- `org_id`, `slug` (UNIQUE), `nome`, `titulo`, `subtitulo`, `cta_label`, `branding JSONB` (logo_url, cor_primaria, fonte), `campos JSONB` (array de fields a coletar), `ativo`, `criado_por`.

### 14.2 `landing_submission`
- `landing_page_id`, `lead_id` (criado automaticamente), `dados JSONB`, `utm JSONB` (source, medium, campaign), `dispositivo`, `ip_hash`, `submetido_em`.

---

## 15. Outros

### 15.1 `forecast_snapshot` (mai/2026)
Snapshots semanais (domingo 23 UTC).
- `org_id`, `semana`, `forecast_acumulado`, `realizado`, `gap`, `breakdown_por_etapa JSONB`.
- Alimenta `<ForecastHistorico>` (12 semanas bar chart).

### 15.2 `notificacao` (in-app)
- `user_id`, `tipo`, `titulo`, `corpo`, `url`, `lida`, `criada_em`.

### 15.3 `impersonation_logs`
- `gestor_id`, `target_user_id`, `started_at`, `ended_at`, `ip`, `user_agent`.

### 15.4 `enrichment_log`
Histórico de enriquecimento (Hunter, Similarweb, Tavily, Firecrawl) com custo USD por consulta.

### 15.5 `external_event` (audit externo)
Webhooks recebidos (Brevo bounce, Stripe events, ...). `provider`, `tipo`, `payload`, `processado_em`.

---

## Migrations canônicas (mai/2026)

```
20260423000004_v5_ai.sql                              -- Camada IA inicial
20260507000000_indicacoes.sql                         -- Flywheel + advocacy
20260511080000_template_publish_validate_webhook_insert.sql
20260511090000_onboarding_transacional.sql            -- RPC atômico
20260511100000_prospeccao_empresa_socio.sql           -- Cache + RPCs
20260511110000_prospeccao_bulk_jobs.sql               -- Fila + cron 2min
20260511120000_prospeccao_refresh_alertas.sql         -- Refresh + alertas
20260511130000_prospeccao_meta_e_webhooks.sql         -- Meta/bookmarks/webhooks
20260511140000_cadencia_fluxos_visuais.sql            -- Fluxos visuais
20260511150000_email_validacao.sql                    -- Cache + disposable + bounce
20260511160000_icp_fit_embedding.sql                  -- pgvector + centroide
20260512100000_custom_fields_lead_scoring.sql         -- Custom fields + score
20260512110000_ai_sdr_calls_voicenotes_forecast.sql   -- Voice notes + transcrição + snapshot
20260512120000_goals_commission.sql                   -- Metas + comissão
20260512130000_hunter_similarweb_enrichment.sql       -- Enrichment APIs
20260512140000_landing_pages.sql                      -- Landing builder
20260512150000_v_leads_enriched_score.sql             -- View update com score
```

Veja `supabase/migrations/` para sequência completa e detalhes de cada DDL.

---

## Convenções

- **PKs**: `BIGSERIAL` em transacional (escalável até bilhões); `UUID` em entidades root (organizacoes, profiles).
- **Timestamps**: sempre `TIMESTAMPTZ` (timezone explícito).
- **JSONB**: para `dados` semi-estruturados; `JSON` apenas em legado.
- **Indexes**: sempre criar `idx_<tabela>_org` em `organizacao_id`. Em colunas frequentes de WHERE/JOIN.
- **RLS**: sempre `ENABLE` + 1 policy `USING (organizacao_id = current_org_id())`. Para tabelas com `_org` pivot, usar a coluna correta.
- **Soft-delete**: `deleted_at TIMESTAMPTZ NULL`. Cron diário `cleanup-expired` faz hard-delete em rows com `deleted_at < now()`.
- **Audit columns**: `created_at DEFAULT now()` + `updated_at` com trigger `set_updated_at()`.
