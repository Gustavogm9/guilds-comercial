# Roadmap

Última atualização: **mai/2026** (pós-wave de prospecção + IA SDR + flywheel).

Este doc é a fonte canônica de "o que está pronto, o que vai vir, e o que decidimos não fazer".

---

## ✅ Entregue (mai/2026)

### Núcleo CRM
- ✅ Onboarding transacional (RPC atômico)
- ✅ Multi-tenant via RLS (`current_org_id()`)
- ✅ Impersonificação segura (gestor → SDR)
- ✅ Kanban drag-drop com optimistic updates
- ✅ Detalhe do lead com 9 painéis (histórico, raio-x, cadência, ligações, voice notes, custom fields, score, indicações, eventos)
- ✅ Base de leads com filtros 15+, busca FTS pt-BR, export CSV
- ✅ Hoje (tarefas + cadência + pedidos indicação)
- ✅ Transferência de carteira em massa (chunks 500, audit completo)
- ✅ Soft-delete com retenção 365d (coluna `deleted_at`)

### Raio-X (qualificação)
- ✅ Templates JSON Schema dinâmicos
- ✅ Submissão progressiva (autosave)
- ✅ IA scoring (`avaliar_raiox`)
- ✅ Oferta de Raio-X via WhatsApp/email com link único
- ✅ Documento PDF gerado pós-pagamento

### Cadência (outbound)
- ✅ Fluxos visuais por org (não-code)
- ✅ 6 canais (email, whatsapp, call, linkedin, sms, task_manual)
- ✅ 7 condicionais por passo
- ✅ Presets (B2B SDR, AE, SaaS Trial, Indicação, Reativação)
- ✅ Push notification timezone-aware
- ✅ Geração de mensagem via IA
- ✅ Email validation pipeline (anti-bounce)
- ✅ Versionamento draft → publicado → arquivado

### Prospecção (módulo completo)
- ✅ Consulta CNPJ via BrasilAPI (cache global + privacy pivot)
- ✅ QSA / sócios persistido
- ✅ Bulk import até 500 CNPJs por job
- ✅ Cron diário de refresh + detecção de mudanças (MD5 fingerprint)
- ✅ Alertas em UI dedicada + webhook outbound
- ✅ Favoritos + tags + notas privadas por org
- ✅ Detalhe da empresa com 8 seções
- ✅ Enriquecimento web: Tavily (LinkedIn sócios), Firecrawl (site), Hunter (emails), Similarweb (tráfego)
- ✅ ICP fit score via pgvector + OpenAI embeddings
- ✅ Top 30 empresas por similaridade ao centroide
- ✅ Conversão empresa → lead com 1 clique

### IA (15 features versionadas)
- ✅ Dispatcher multi-provider (Anthropic, OpenAI, Google)
- ✅ Prompts versionados por org
- ✅ Budget caps por feature/usuário
- ✅ Logs completos em `ai_invocations`
- ✅ 15 features ativas: enriquecer_lead, gerar_oferta_raiox, gerar_documento_raiox, gerar_mensagem_cadencia, extrair_ligacao, next_best_action, briefing_pre_call, objection_handler, gerar_proposta, sugerir_motivo_perda, detectar_risco, resumo_diario, digest_semanal, reativar_nutricao, forecast_ml

### Áudio (IA SDR)
- ✅ Voice notes ≤60s (MediaRecorder + Storage)
- ✅ Whisper transcrição + GPT extração estruturada
- ✅ Painel de transcrições no detalhe do lead
- ✅ Upload de gravação de chamada (até 25MB)
- ✅ Análise IA: BANT, objeções, próximos passos, sentimento, tom

### Flywheel (pós-venda)
- ✅ Tabelas `indicacoes` + `pedidos_indicacao`
- ✅ Trigger SQL auto-cria pedido ao fechar
- ✅ Aba `/indicacoes` com 4 sub-abas
- ✅ KPIs Advocacy em `/funil` (K-factor, % indicação, CAC por origem)
- ✅ Top embaixadores ranking
- ✅ NPS automático aos 7d/30d/90d
- ✅ Health score básico (recência + NPS + adoção + pagamento)

### Custom Fields
- ✅ Definições por entidade (lead/empresa)
- ✅ 7 tipos (texto, número, data, boolean, select, multi-select, url)
- ✅ Render dinâmico no detalhe
- ✅ Edit inline com transição

### Lead Score
- ✅ Multi-dimensional: ICP fit + engajamento + comportamento
- ✅ Cron de recálculo diário (06 UTC)
- ✅ Badge visual no card kanban
- ✅ Coluna em `v_leads_enriched`

### Goals + Comissionamento
- ✅ Tabela `meta` com vendedor/periodo/métrica/alvo
- ✅ View `v_meta_progresso` com burndown
- ✅ Painel `/gestao/metas` (gestor)
- ✅ Tabela `comissao_regra` com 3 tipos (fixo_pct, escalonado, por_meta)
- ✅ Cron mensal de cálculo
- ✅ Workflow aprovar → marcar pago
- ✅ Histórico de pagamentos com comprovante

### Landing Pages
- ✅ Builder com slug + branding + campos JSON
- ✅ Página pública renderizada do slug
- ✅ Submit cria lead com `fonte='landing:{slug}'`
- ✅ Tracking UTM + dispositivo + IP hash

### Forecast histórico
- ✅ Snapshot semanal domingo 23 UTC
- ✅ Bar chart 12 semanas no flywheel
- ✅ Tooltip com breakdown por etapa

### Configurações
- ✅ Perfil / org / billing / desenvolvedores
- ✅ Dark mode
- ✅ i18n pt-BR + en-US
- ✅ App config UI (cron secrets, webhook URLs, feature flags)
- ✅ Webhook delivery worker queue

### Infraestrutura
- ✅ pg_cron jobs (15 ativos)
- ✅ Outbox pattern (email + push)
- ✅ Web Push (VAPID)
- ✅ pgvector habilitado
- ✅ Storage buckets (voice-notes, ligacoes-audio, propostas-pdf)
- ✅ Sentry frontend + server
- ✅ PWA com manifest + service worker

### Testes
- ✅ Vitest unit (~70% das server actions críticas)
- ✅ DB invariants via Management API

---

## 🚧 Em andamento / próxima sprint

| Item                                         | Esforço | Prioridade |
|----------------------------------------------|---------|------------|
| Drift `calcularBreakdown` → view SQL         | 2h      | 🟡 Média   |
| Detalhe do lead: 9 queries → 1 view JSONB    | 3h      | 🟡 Média   |
| Re-embedding automático (cron 6h)            | 4h      | 🟡 Média   |
| Rate limiting endpoints públicos             | 3h      | 🟡 Média   |
| Política LGPD formal + export JSON           | 8h      | 🔴 Alta    |
| Rotação de credenciais expostas              | 4h      | 🔴 Alta    |
| Cobertura E2E (Playwright)                   | 16h     | 🟡 Média   |
| UI escalonado para regras de comissão        | 6h      | 🟢 Baixa   |
| Stripe USD (Price IDs + lib)                 | 3h      | 🟢 Baixa   |

---

## 📅 Roadmap Q3 2026 (jun-ago)

### Flywheel completo
- **Onboarding pós-venda** — checklist configurável após Fechado, 7 dias de NPS, integrações Stripe/Asaas.
- **Health Score avançado** — incluir adoção real (eventos no sistema do cliente, integrações via webhook).
- **Expansão / Upsell** — sub-pipeline de expansão dentro do CRM, gatilhos automáticos.
- **Renovação automática** — coluna `data_renovacao`, alertas 60/30/7 dias antes.
- **Portal embaixador** — área pública pro cliente indicar direto (sem precisar do vendedor).

### Prospecção avançada
- **Filtros salvos + alertas** — "me avisa quando nova empresa SaaS SP entrar na base".
- **Lookalike** — encontrar empresas similares a uma específica.
- **Score de contato** (quão fácil contatar).
- **Mirror parcial RFB** — 5M empresas mais relevantes localmente.
- **Compras públicas** — integração com base do governo.

### IA avançada
- **A/B testing nativo** de prompts.
- **Fine-tuning por org** com exemplos favoritos.
- **Streaming** para outputs longos.
- **Retry automático em 429/5xx** com backoff.
- **Supabase Vault** para API keys cifradas em repouso.

### Cadência avançada
- **Branching** (passo A se respondeu, B se não).
- **Trigger por evento webhook** externo.
- **Goal-based** (termina ao atingir crm_stage X).
- **Marketplace de templates** entre orgs (anonimizado).

### Integrações
- **Webhook WhatsApp inbound** (Twilio/Meta) — receber respostas como `lead_evento`.
- **Calendar booking via Cal.com MCP** — modal de agendamento direto no CRM.
- **Email warm-up pool** (rotação inter-org de envio) — 70% pronto.
- **Pandadoc / Docusign** — geração de proposta + tracking de abertura.
- **HubSpot / Pipedrive importer** — assistente de migração.

### Mobile
- **PWA refinado** — instalável iOS/Android com push, offline mode para /hoje.
- ❌ **Mobile app nativo** — excluído explicitamente.

### Marketing / Self-serve
- **Marketing site público** + blog SEO.
- **Free tier real** (10 leads ativos, 1 vendedor).
- **Trial 14 dias** com call de onboarding.
- **Plano pago via Stripe Checkout self-serve**.

---

## 📅 Roadmap Q4 2026 (set-dez)

### Analytics & BI
- **Painel BI executivo** (CMO/CEO dashboards).
- **Coortes** por mês de fechamento (LTV, churn).
- **Atribuição multi-touch** (de onde veio cada R$ fechado).
- **Export pra BigQuery/Snowflake** (data warehouse cliente).

### IA Avançada (Phase 2)
- **AI SDR autônomo** — IA agenda calls 1x1 com leads via WhatsApp/email com supervisão humana.
- **Voz natural com clients** (Vapi / Bland AI) — IA faz primeiro call.
- **Análise de email response** (responder cliente automaticamente em FAQ).

### Compliance & Enterprise
- **SOC 2 Type 1** audit.
- **SSO via SAML/Okta**.
- **Audit log exportável** (todas as ações em CSV/JSON).
- **Data residency** (escolher região do banco — Brasil/EU/US).

### Verticalizações
- **Templates por vertical**: SaaS B2B, Agências, Consultoria, Indústria, Educacional.
- **Métricas customizadas por vertical**.

---

## ❌ Explicitamente fora do roadmap

Decisões deliberadas para focar e não diluir o produto.

### Mobile app nativo (React Native / Swift / Kotlin)
**Por que não:** PWA cobre 90% dos casos de uso. App nativo adiciona overhead (App Store reviews, push duplo, etc.) sem benefício marginal claro. Decidido pelo founder em mai/2026.

### WhatsApp Cloud API oficial
**Por que não:** Cliente usa WhatsApp comum (Web/Desktop). Deep links `wa.me` + cadência manual cobrem 95% do uso. Cloud API custa caro + exige número dedicado + Meta approval. Decidido pelo founder em mai/2026.

### Mirror RFB completo (60M CNPJs)
**Por que não:** Custaria ~R$300/mo de servidor dedicado (storage + reindex). Consulta on-demand via BrasilAPI + cache compartilhado já cobre. Reavaliar se atingir >100 orgs ativas.

### LinkedIn Sales Navigator dados privados (scraping)
**Por que não:** Legalmente impossível (LinkedIn ToS proíbe explicitamente, casos jurídicos perdidos pelos scrapers). Tavily search público resolve casos críticos.

### GraphQL
**Por que não:** Supabase REST + Server Actions são suficientes. GraphQL adicionaria complexidade sem benefício real para a stack atual.

### Microsserviços
**Por que não:** Monolito Next.js + Supabase escala até pelo menos 10k orgs. Microsserviços = overhead operacional sem benefício até esse ponto.

### Real-time colaboração tipo Notion
**Por que não:** Caso de uso raro (vendedor edita lead concorrentemente com outro). Optimistic updates + revalidate cobrem. Realtime Supabase está disponível se virar requisito (notifs instantâneas), mas não pra edição multi-user.

### CRM "tudo pra todos"
**Por que não:** Foco em **B2B comercial PT-BR**. Não vamos perseguir B2C, suporte ao cliente, helpdesk, success ops, etc. Cada vertical mereceria produto próprio.

---

## Comparativo competitivo (mai/2026)

| Categoria              | Concorrentes principais                   | Status Guilds                                  |
|------------------------|-------------------------------------------|------------------------------------------------|
| CRM B2B core           | HubSpot, Pipedrive, RD Station, Salesforce | ✅ Paridade essencial + diferencial (raio-x, indicações nativas) |
| Prospecção CNPJ        | CNPJ.biz                                  | ✅ Paridade + diferencial (alertas, ICP fit)   |
| LinkedIn outbound      | LinkedIn Sales Navigator                  | ⚠️ Parcial (Tavily search público)            |
| Cadência outbound      | Apollo, Outreach, Reply.io                | ✅ Paridade essencial + IA gerativa            |
| Análise de chamadas    | Gong, Chorus                              | ✅ Paridade (Whisper + GPT estruturado)        |
| AI SDR autônomo        | Regie, 11x Alice                          | 🚧 Fase 2 (voice notes prontas)               |
| Email warmup           | Smartlead, Lemwarm                        | 🚧 70% pronto (pool inter-org)                |
| Doc + e-sign           | Pandadoc, Docusign                        | ❌ Roadmap Q3                                  |
| Pre-pipeline (RFB)     | Cortex Intelligence                       | 🚧 Mirror parcial roadmap Q3                  |

**Diferenciais únicos do Guilds:**
1. 🇧🇷 Brasil-first (PT-BR, LGPD, CNPJ nativo, Pix, Brasil API)
2. 🤖 IA versionada multi-provider com prompts editáveis
3. 🪜 Flywheel borboleta nativo (nenhum CRM B2B sério tem)
4. 🎯 ICP fit score por embeddings
5. ☁️ Tudo num produto só (não precisa stack 5 ferramentas)
6. 💰 Preço (~R$ ?/usuário/mês — TBD) substancialmente menor que stack equivalente

---

## Observações estratégicas

- **Stripe USD** é gargalo para vender pra fora do Brasil. Priorizar Q3.
- **SOC 2** é requisito de enterprise mid-market. Sem isso, perdemos deals >R$50k/mês.
- **AI SDR autônomo** é onde o mercado vai (Q4). Investir agora em base de voz/transcrição é estratégico.
- **Marketplace de templates** entre orgs cria efeito de rede genuíno (já temos org_id em cada template).
