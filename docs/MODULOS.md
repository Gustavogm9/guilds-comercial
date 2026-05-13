# Módulos — Índice de features

Índice canônico de todas as features do **Guilds Comercial** organizadas por módulo, com rota, status, owner técnico e link pro doc específico quando existe.

Atualizado: **mai/2026**.

Status: ✅ Live • 🚧 Em construção • 📅 Roadmap • ❌ Descartado

---

## 1. Autenticação e Onboarding

| Feature                              | Rota                          | Status | Doc                                      |
|--------------------------------------|-------------------------------|--------|------------------------------------------|
| Login (email + senha)                | `/login`                      | ✅     | —                                        |
| Sign up                              | `/signup`                     | ✅     | —                                        |
| Magic link                           | `/login` (toggle)             | ✅     | —                                        |
| Recuperar senha                      | `/recover`                    | ✅     | —                                        |
| Onboarding wizard 5 passos           | `/onboarding`                 | ✅     | [ONBOARDING.md](./ONBOARDING.md)         |
| RPC transacional onboarding          | `onboarding_finalize`         | ✅     | [ARCHITECTURE.md §11](./ARCHITECTURE.md) |
| Convidar usuários                    | `/equipe/convites`            | ✅     | —                                        |
| Impersonificação gestor→SDR          | `/equipe → impersonar`        | ✅     | [ARCHITECTURE.md §3](./ARCHITECTURE.md)  |
| 2FA TOTP                             | `/configuracoes/seguranca`    | 📅     | —                                        |
| SSO SAML                             | `/configuracoes/sso`          | 📅     | —                                        |

---

## 2. Pipeline e gestão de leads

| Feature                              | Rota                                  | Status | Doc                  |
|--------------------------------------|---------------------------------------|--------|----------------------|
| Kanban drag-drop                     | `/vendas/pipeline`                    | ✅     | —                    |
| Filtros 15+ (responsável/temperatura/etc) | `/vendas/pipeline`               | ✅     | —                    |
| Detalhe do lead (9 painéis)          | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Próxima ação                  | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Raio-X                       | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Histórico (timeline)         | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Ligações + transcrições       | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Voice notes                  | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Custom fields                | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Score multi-dimensional      | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Painel: Cadência                     | `/vendas/pipeline/[id]`               | ✅     | [CADENCIA.md](./CADENCIA.md) |
| Painel: Indicações                   | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Card score badge (kanban)            | —                                     | ✅     | —                    |
| Base de leads (busca FTS)            | `/vendas/base`                        | ✅     | —                    |
| Importar CSV de leads                | `/vendas/base/importar`               | ✅     | —                    |
| Enriquecer lead (IA)                 | `/vendas/base` (botão)                | ✅     | [AI_SETUP.md](./AI_SETUP.md) |
| Arquivar lead (soft-delete 365d)     | `/vendas/pipeline/[id]`               | ✅     | —                    |
| Transferência de carteira em massa   | `/equipe/carteira`                    | ✅     | —                    |

---

## 3. Raio-X (qualificação dinâmica)

| Feature                              | Rota                                   | Status | Doc                  |
|--------------------------------------|----------------------------------------|--------|----------------------|
| Templates JSON Schema                | `/configuracoes/raiox/template`        | ✅     | —                    |
| Submissão progressiva (autosave)     | `/raiox/[lead_id]`                     | ✅     | —                    |
| Renderização dinâmica de form        | `<DynamicRaioXShell>`                  | ✅     | —                    |
| IA scoring (`avaliar_raiox`)          | —                                      | ✅     | [AI_SETUP.md](./AI_SETUP.md) |
| Oferta via WhatsApp/email            | `/vendas/pipeline/[id] → ofertar`      | ✅     | —                    |
| Link público de pagamento            | `/raiox/[token]` (público)             | ✅     | —                    |
| Documento PDF pós-pagamento          | Storage `propostas-pdf`                | ✅     | —                    |
| Webhook `raiox.completed`            | —                                      | ✅     | [AI_AND_AUTOMATIONS.md](./AI_AND_AUTOMATIONS.md) |

---

## 4. Cadência (outbound)

| Feature                              | Rota                                              | Status | Doc                          |
|--------------------------------------|---------------------------------------------------|--------|------------------------------|
| Builder visual                       | `/configuracoes/cadencia/fluxos/[id]`             | ✅     | [CADENCIA.md](./CADENCIA.md) |
| Drag-reorder de passos               | `/configuracoes/cadencia/fluxos/[id]`             | ✅     | [CADENCIA.md](./CADENCIA.md) |
| Presets (B2B SDR, AE, Trial, etc)    | `/configuracoes/cadencia/fluxos/novo`             | ✅     | [CADENCIA.md](./CADENCIA.md) |
| 6 canais (email/whatsapp/call/...)   | —                                                 | ✅     | [CADENCIA.md](./CADENCIA.md) |
| 7 condicionais por passo             | —                                                 | ✅     | [CADENCIA.md](./CADENCIA.md) |
| Status draft → publicado → arquivado | `/configuracoes/cadencia/fluxos`                  | ✅     | [CADENCIA.md](./CADENCIA.md) |
| Default per-org                      | `/configuracoes/cadencia/fluxos`                  | ✅     | [CADENCIA.md](./CADENCIA.md) |
| Trigger automático (lead_criado)     | Trigger SQL                                       | ✅     | [CADENCIA.md](./CADENCIA.md) |
| Push notification timezone-aware     | Cron `push-cadencia`                              | ✅     | —                            |
| Geração de mensagem via IA           | Editor → "Gerar via IA"                           | ✅     | —                            |
| Email validation pré-envio           | `lib/email-validation.ts`                         | ✅     | —                            |
| Webhook bounce Brevo                 | `POST /api/webhooks/brevo`                        | ✅     | —                            |
| Métricas / estatísticas              | `/configuracoes/cadencia/fluxos/[id]/stats`       | ✅     | —                            |
| A/B testing                          | —                                                 | 📅     | —                            |
| Branching                            | —                                                 | 📅     | —                            |
| Trigger por webhook externo          | —                                                 | 📅     | —                            |
| Marketplace de templates             | —                                                 | 📅     | —                            |

---

## 5. Prospecção (CNPJ + sócios + ICP)

| Feature                              | Rota                                                | Status | Doc                            |
|--------------------------------------|-----------------------------------------------------|--------|--------------------------------|
| Consulta CNPJ via BrasilAPI          | `POST /api/prospeccao/cnpj`                         | ✅     | [PROSPECCAO.md](./PROSPECCAO.md) |
| Cache global + privacy pivot          | `prospeccao_empresa` + `_org`                       | ✅     | [PROSPECCAO.md](./PROSPECCAO.md) |
| Base de empresas (filtros 6+)        | `/vendas/prospeccao/base-de-empresas`               | ✅     | [PROSPECCAO.md](./PROSPECCAO.md) |
| Export CSV (empresas e QSA)          | `/vendas/prospeccao/base-de-empresas`               | ✅     | —                              |
| Bulk import até 500 CNPJs            | `/vendas/prospeccao/bulk-import`                    | ✅     | [PROSPECCAO.md](./PROSPECCAO.md) |
| Cron worker bulk (2min)              | `prospeccao-bulk`                                   | ✅     | —                              |
| Cron refresh diário + alertas        | `prospeccao-refresh-cnpj`                           | ✅     | —                              |
| Alertas (mudança sócio/CNAE/etc)     | `/vendas/prospeccao/alertas`                        | ✅     | —                              |
| Favoritos / bookmarks                | `/vendas/prospeccao/favoritos`                      | ✅     | —                              |
| Detalhe da empresa (8 seções)        | `/vendas/prospeccao/empresa/[id]`                   | ✅     | —                              |
| Tavily search (LinkedIn sócios)      | `POST /api/prospeccao/enriquecer-socios`            | ✅     | —                              |
| Firecrawl (scrape site)              | `POST /api/prospeccao/enriquecer-site`              | ✅     | —                              |
| Hunter.io (emails por domínio)       | `POST /api/prospeccao/hunter`                       | ✅     | —                              |
| Similarweb (tráfego + tech)          | `POST /api/prospeccao/similarweb`                   | ✅     | —                              |
| ICP fit score via pgvector            | RPC `icp_fit_score`                                 | ✅     | [PROSPECCAO.md §4](./PROSPECCAO.md) |
| Top 30 empresas ICP fit              | `/vendas/prospeccao/icp-fit`                        | ✅     | —                              |
| Conversão empresa → lead             | `/vendas/prospeccao/empresa/[id]` (botão)           | ✅     | —                              |
| Filtros salvos + alertas             | —                                                   | 📅     | —                              |
| Lookalike audience                   | —                                                   | 📅     | —                              |
| Mirror parcial RFB (5M empresas)     | —                                                   | 📅     | —                              |
| Compras públicas integration         | —                                                   | 📅     | —                              |
| Mirror completo RFB (60M)            | —                                                   | ❌     | —                              |

---

## 6. IA (15 features versionadas)

| Feature                              | Rota                                          | Status | Doc                          |
|--------------------------------------|-----------------------------------------------|--------|------------------------------|
| Dispatcher multi-provider            | `lib/ai/dispatcher.ts`                        | ✅     | [AI_SETUP.md](./AI_SETUP.md) |
| Editor de prompts versionado         | `/admin/ai → prompts`                         | ✅     | [AI_SETUP.md](./AI_SETUP.md) |
| Gestão de providers                  | `/admin/ai → providers`                       | ✅     | [AI_SETUP.md](./AI_SETUP.md) |
| Gestão de features (toggle/budget)   | `/admin/ai → features`                        | ✅     | [AI_SETUP.md](./AI_SETUP.md) |
| Logs de invocações                   | `/admin/ai → logs`                            | ✅     | [AI_SETUP.md](./AI_SETUP.md) |
| `enriquecer_lead`                    | Botão na base                                 | ✅     | —                            |
| `gerar_oferta_raiox`                 | Botão "Ofertar raio-x"                        | ✅     | —                            |
| `gerar_documento_raiox`              | Pós call (auto)                               | ✅     | —                            |
| `gerar_mensagem_cadencia`            | Editor cadência                                | ✅     | —                            |
| `extrair_ligacao`                    | Voice note + transcrição                       | ✅     | —                            |
| `next_best_action`                   | Card no detalhe do lead                       | ✅     | —                            |
| `briefing_pre_call`                  | Botão "Briefing"                               | ✅     | —                            |
| `objection_handler`                  | Card "Cliente disse..."                       | ✅     | —                            |
| `gerar_proposta`                     | Botão "Gerar proposta"                        | ✅     | —                            |
| `sugerir_motivo_perda`               | Modal de perda                                | ✅     | —                            |
| `detectar_risco`                     | Cron diário                                   | ✅     | —                            |
| `resumo_diario`                      | Cron 22 UTC                                   | ✅     | —                            |
| `digest_semanal`                     | Cron sexta 17 UTC                             | ✅     | —                            |
| `reativar_nutricao`                  | Card no detalhe lead em Nutrição              | ✅     | —                            |
| `forecast_ml`                        | Cron forecast                                  | ✅     | —                            |
| Embeddings (text-embedding-3-small)  | `lib/embeddings.ts`                           | ✅     | [PROSPECCAO.md](./PROSPECCAO.md) |
| A/B testing nativo de prompts        | —                                             | 📅     | —                            |
| Fine-tuning por org (few-shot)       | —                                             | 📅     | —                            |
| Streaming responses                  | —                                             | 📅     | —                            |
| Supabase Vault para API keys         | —                                             | 📅     | —                            |

---

## 7. Áudio (voice notes + análise de chamadas)

| Feature                              | Rota                                  | Status | Doc                          |
|--------------------------------------|---------------------------------------|--------|------------------------------|
| Voice note recorder ≤60s             | `<VoiceNoteRecorder>` em /hoje        | ✅     | —                            |
| Upload pra Storage `voice-notes`     | `POST /api/voice-notes/upload`        | ✅     | —                            |
| Whisper transcrição                  | Cron `audio-processor`                | ✅     | —                            |
| GPT estruturação                     | Feature `extrair_ligacao`             | ✅     | —                            |
| Painel transcrições no lead          | `<LigacaoTranscricaoPanel>`           | ✅     | —                            |
| Upload de gravação até 25MB          | `POST /api/ligacoes/transcrever`      | ✅     | —                            |
| Análise BANT + objeções + sentimento | —                                     | ✅     | —                            |
| Re-análise (rodar IA de novo)        | Botão em transcrição                  | ✅     | —                            |
| AI SDR autônomo (Vapi/Bland)         | —                                     | 📅     | —                            |

---

## 8. Flywheel (pós-venda + advocacy)

| Feature                              | Rota                                  | Status | Doc                          |
|--------------------------------------|---------------------------------------|--------|------------------------------|
| Tabelas `indicacoes` + `pedidos`     | Migration `20260507000000`            | ✅     | [FLYWHEEL.md](./FLYWHEEL.md) |
| Trigger auto-pedido pós-fechamento   | SQL trigger                            | ✅     | —                            |
| Aba `/indicacoes`                    | `/indicacoes`                          | ✅     | —                            |
| Sub-aba: Pendentes                   | `/indicacoes?tab=pendentes`            | ✅     | —                            |
| Sub-aba: Ativas                      | `/indicacoes?tab=ativas`               | ✅     | —                            |
| Sub-aba: Top embaixadores            | `/indicacoes?tab=embaixadores`         | ✅     | —                            |
| Sub-aba: Recompensas                 | `/indicacoes?tab=recompensas`          | ✅     | —                            |
| KPIs Advocacy em /funil              | `/flywheel`                            | ✅     | —                            |
| K-factor                             | View `v_advocacy_kpis`                 | ✅     | —                            |
| NPS auto (7d/30d/90d)                | Cron `nps-survey`                      | ✅     | —                            |
| Health score básico                  | Cron `health-score`                    | ✅     | —                            |
| Forecast histórico (12 sem)          | `<ForecastHistorico>` no flywheel      | ✅     | —                            |
| Snapshot semanal                     | Cron `forecast-semanal`                | ✅     | —                            |
| Onboarding pós-venda                 | —                                      | 📅     | —                            |
| Health score avançado                | —                                      | 📅     | —                            |
| Sub-pipeline de expansão             | —                                      | 📅     | —                            |
| Portal embaixador (público)          | —                                      | 📅     | —                            |
| Renovação automática (alertas)       | —                                      | 📅     | —                            |

---

## 9. Goals + Comissionamento

| Feature                              | Rota                                  | Status | Doc                          |
|--------------------------------------|---------------------------------------|--------|------------------------------|
| Cadastro de metas                    | `/gestao/metas`                        | ✅     | —                            |
| Burndown bar por vendedor            | `/gestao/metas`                        | ✅     | —                            |
| 5 métricas (receita/leads/etc)       | —                                      | ✅     | —                            |
| Regras de comissão (3 tipos)         | `/gestao/comissoes/regras`             | ✅     | —                            |
| Cron mensal de cálculo               | `commission-calc`                      | ✅     | —                            |
| Workflow aprovar → pago              | `/gestao/comissoes`                    | ✅     | —                            |
| Histórico de pagamentos              | `/gestao/comissoes`                    | ✅     | —                            |
| UI escalonado para regras            | —                                      | 🚧     | [TECH_DEBT.md](./TECH_DEBT.md) |

---

## 10. Landing Pages

| Feature                              | Rota                                  | Status | Doc                          |
|--------------------------------------|---------------------------------------|--------|------------------------------|
| Builder com slug + branding          | `/configuracoes/landing-pages`         | ✅     | —                            |
| Página pública                        | `/[slug]` (não autenticada)            | ✅     | —                            |
| Submit cria lead                     | —                                      | ✅     | —                            |
| Tracking UTM + dispositivo            | `landing_submission`                   | ✅     | —                            |
| Builder visual de campos             | `/configuracoes/landing-pages/[id]`    | ✅     | —                            |

---

## 11. Custom Fields

| Feature                              | Rota                                  | Status | Doc                          |
|--------------------------------------|---------------------------------------|--------|------------------------------|
| Editor de definições                 | `/configuracoes/campos`                | ✅     | —                            |
| 7 tipos (texto/num/data/bool/...)    | —                                      | ✅     | —                            |
| Render dinâmico no detalhe lead      | `<CustomFieldsPanel>`                  | ✅     | —                            |
| Edit inline com transição            | —                                      | ✅     | —                            |
| Custom fields em /vendas/base        | —                                      | 📅     | —                            |
| Custom fields em export CSV          | —                                      | 📅     | —                            |

---

## 12. Configurações

| Feature                              | Rota                                              | Status | Doc                          |
|--------------------------------------|---------------------------------------------------|--------|------------------------------|
| Perfil do usuário                    | `/configuracoes/perfil`                            | ✅     | —                            |
| Organização (nome, logo, timezone)   | `/configuracoes/organizacao`                       | ✅     | —                            |
| Membros e convites                   | `/equipe`                                          | ✅     | —                            |
| Plano e billing                      | `/configuracoes/plano`                             | ✅     | —                            |
| Desenvolvedores (API keys/webhooks)  | `/configuracoes/desenvolvedores`                   | ✅     | —                            |
| App config manager                   | `/configuracoes/desenvolvedores/app-config-manager`| ✅     | —                            |
| Dark mode toggle                     | `/configuracoes/perfil`                            | ✅     | —                            |
| i18n switcher (pt-BR / en-US)        | `/configuracoes/perfil`                            | ✅     | [I18N.md](./I18N.md)         |
| Webhook subscriptions UI             | `/configuracoes/desenvolvedores/webhooks`          | ✅     | —                            |
| Notifications preferences            | `/configuracoes/notificacoes`                      | ✅     | —                            |
| 2FA                                  | —                                                  | 📅     | —                            |
| SSO SAML                             | —                                                  | 📅     | —                            |
| Data residency                       | —                                                  | 📅     | —                            |

---

## 13. Analytics e dashboards

| Feature                              | Rota                                  | Status | Doc                          |
|--------------------------------------|---------------------------------------|--------|------------------------------|
| Dashboard "/hoje"                    | `/hoje`                                | ✅     | —                            |
| Funil de conversão                   | `/funil`                               | ✅     | —                            |
| Flywheel                             | `/flywheel`                            | ✅     | —                            |
| Forecast (heurístico + ML)           | `/flywheel → forecast`                 | ✅     | —                            |
| Painel BI executivo                  | —                                      | 📅     | —                            |
| Coortes por mês de fechamento        | —                                      | 📅     | —                            |
| Atribuição multi-touch               | —                                      | 📅     | —                            |
| Export pra BigQuery/Snowflake        | —                                      | 📅     | —                            |

---

## 14. Infra & Plataforma

| Feature                              | Notas                                  | Status | Doc                          |
|--------------------------------------|----------------------------------------|--------|------------------------------|
| Multi-tenant RLS                     | `current_org_id()` everywhere          | ✅     | [ARCHITECTURE.md §2](./ARCHITECTURE.md) |
| Soft-delete com retenção 365d        | `deleted_at` + cron                    | ✅     | —                            |
| Outbox email + push                  | `outbox_email`, `outbox_push`          | ✅     | —                            |
| Web Push (VAPID)                     | —                                      | ✅     | [PWA.md](./PWA.md)           |
| PWA installable                      | `next-pwa`                             | ✅     | [PWA.md](./PWA.md)           |
| Sentry frontend + server             | —                                      | ✅     | —                            |
| pg_cron 15 jobs                      | —                                      | ✅     | [AI_AND_AUTOMATIONS.md](./AI_AND_AUTOMATIONS.md) |
| pgvector                             | Embeddings ICP fit                     | ✅     | —                            |
| Storage buckets                      | voice-notes, ligacoes-audio, propostas | ✅     | —                            |
| Webhook outbound (signed HMAC)       | —                                      | ✅     | —                            |
| Webhook inbound (Brevo, Stripe)      | —                                      | ✅     | —                            |
| Rate limiting endpoints públicos     | —                                      | 🚧     | [TECH_DEBT.md](./TECH_DEBT.md) |
| Disaster recovery procedure          | —                                      | ✅     | [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) |

---

## 15. Testes

| Feature                              | Status | Doc                          |
|--------------------------------------|--------|------------------------------|
| Vitest unit (server actions)         | ✅     | —                            |
| DB invariants via Management API     | ✅     | —                            |
| Playwright/Cypress E2E               | 📅     | [TECH_DEBT.md](./TECH_DEBT.md) |
| Load testing (k6)                    | 📅     | —                            |

---

## Total numérico

- ✅ **~135 features Live** (mai/2026)
- 🚧 **~5 features em construção / parciais**
- 📅 **~40 features no roadmap Q3/Q4 2026**
- ❌ **~5 features descartadas explicitamente**

Para detalhes de cada item por status, veja [ROADMAP.md](./ROADMAP.md).
