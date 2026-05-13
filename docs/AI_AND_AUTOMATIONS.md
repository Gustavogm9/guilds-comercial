# IA e Automações — Visão consolidada

Este documento mapeia a camada de IA, eventos, webhooks e jobs cron do **Guilds Comercial**. Para o setup operacional da camada de IA (env vars, providers, controle de custos), veja [AI_SETUP.md](./AI_SETUP.md).

---

## 1. Dispatcher de IA (`invokeAI`)

Para evitar *vendor lock-in* (não ficar preso a OpenAI ou Anthropic) e versionar engenharia de prompt (A/B testing), **todas** as chamadas a LLMs passam pela interface `lib/ai/dispatcher.ts`.

### Como o desenvolvedor invoca

```typescript
const iaResponse = await invokeAI("avaliar_raiox", {
  respostas: respostasFormatadas,
  nomeEmpresa: lead.empresa,
}, lead.organizacao_id);
```

O dispatcher:
1. Carrega `ai_feature` (override por org → fallback global).
2. Valida papel mínimo (`gestor|comercial|sdr`) e budget diário.
3. Carrega prompt ativo daquela `(org, feature)` — versionado.
4. Renderiza Mustache `{{vars}}` no `user_template`.
5. Roteia para adapter `anthropic` / `openai` / `google` (HTTPS).
6. Loga em `ai_invocations` (input, output, tokens, custo USD, latência, status).
7. Parse JSON tolerante a fences ```` ```json ````.

### As 15 features (versionadas no DB)

| Código                       | Quando usar                                                 | Output  |
|------------------------------|-------------------------------------------------------------|---------|
| `enriquecer_lead`            | CSV import — preenche cargo/segmento/decisor                | JSON    |
| `gerar_oferta_raiox`         | Hora de enviar oferta do Raio-X (WhatsApp/email)            | Texto   |
| `gerar_documento_raiox`      | Pós call de diagnóstico — score + recomendações             | JSON    |
| `gerar_mensagem_cadencia`    | Passo D0/D3/D7/D11/D16/D30 personalizado                    | Texto   |
| `extrair_ligacao`            | Transcrição → campos estruturados                           | JSON    |
| `next_best_action`           | Narrativa contextual no detalhe do lead                     | Texto   |
| `briefing_pre_call`          | 30min antes — dossiê executivo                              | Texto   |
| `objection_handler`          | "Cliente disse X" → 3 abordagens com script                 | JSON    |
| `gerar_proposta`             | Minuta em 3 versões a partir do raio-x + histórico          | JSON    |
| `sugerir_motivo_perda`       | Texto livre do vendedor → motivo padronizado                | JSON    |
| `detectar_risco`             | Cron diário — flaga leads esfriando                         | JSON    |
| `resumo_diario`              | Cron 19h — o que foi feito + foco amanhã                    | Texto   |
| `digest_semanal`             | Cron sexta 17h — insights executivos                        | Texto   |
| `reativar_nutricao`          | Timing certo de reengajar lead em Nutrição                  | JSON    |
| `forecast_ml`                | Ajuste heurístico com padrões do histórico                  | JSON    |

Códigos são fixos — não renomear (quebra o dispatcher). Setup em [AI_SETUP.md](./AI_SETUP.md).

---

## 2. Embeddings (ICP Fit Score)

Implementado em mai/2026 com `pgvector` no Supabase.

### Pipeline
1. `lib/embeddings.ts` — gera vetor 1536-dim via OpenAI `text-embedding-3-small`.
2. Empresa é convertida em texto via `textoEmpresaPraEmbedding()` (razão social + CNAE descrição + segmento + sócios).
3. Vetor é persistido em `prospeccao_empresa_embedding.embedding vector(1536)`.
4. Para cada org, calcula-se um **centroide** (média dos vetores das empresas fechadas) em `org_icp_centroide`.
5. RPC `icp_fit_score(cnpj, org_id)` retorna similaridade cosseno (0-100).
6. RPC `top_empresas_icp_fit(org_id, limit)` retorna ranking.

### Fallback determinístico
Quando `OPENAI_API_KEY` não está configurada (free tier), usa hash MD5 + Jaccard similarity sobre tokens do CNAE/segmento. Pior qualidade mas funciona offline.

### UI
- Card "ICP fit" na empresa em `/vendas/prospeccao/empresa/[id]`.
- Página `/vendas/prospeccao/icp-fit` — top 30 empresas por similaridade.

---

## 3. Webhooks (sistema de eventos)

### 3.1 Outbound (CRM → ecossistema cliente: n8n, Make, Zapier, RD Station)

Implementação:
- `lib/webhooks/dispatch.ts` — `dispatchWebhook(eventType, orgId, payload)`.
- Cliente cadastra URL + secret em `/configuracoes/desenvolvedores/webhooks`.
- Worker queue: `webhook_delivery` com retry exponencial.

### Eventos catalogados

| Evento                       | Quando dispara                                          |
|------------------------------|---------------------------------------------------------|
| `lead.created`               | Lead novo criado (qualquer fonte)                       |
| `lead.assigned`              | Carteira transferida                                    |
| `lead.stage_changed`         | `crm_stage` mudou                                       |
| `lead.fechado`               | crm_stage = 'Fechado'                                   |
| `lead.perdido`               | crm_stage = 'Perdido'                                   |
| `raiox.completed`            | Raio-X submetido + IA processou                         |
| `proposta.enviada`           | Proposta gerada/enviada                                 |
| `indicacao.recebida`         | Embaixador indicou alguém                               |
| `indicacao.fechada`          | Indicação virou cliente                                 |
| `nps.respondido`             | NPS recebido (com score + categoria)                    |
| `prospeccao.alerta`          | Mudança detectada em CNPJ ativo                         |
| `prospeccao.bulk_concluido`  | Bulk import finalizou                                   |
| `prospeccao.icp_fit_alto`    | Nova empresa com ICP fit >= 80 entrou na base           |

### Signing
Header `Webhook-Signature: sha256=<hmac(secret, body)>`. Cliente verifica antes de processar.

### Retry / Backoff
1min → 5min → 30min → 2h → 6h. Após 5 falhas, status `abandoned` + alerta ao gestor.

### 3.2 Inbound (ecossistema → CRM)

| Endpoint                                  | Origem               | Função                                      |
|-------------------------------------------|----------------------|---------------------------------------------|
| `POST /api/webhooks/brevo`                | Brevo                | Bounces/spam complaints → `email_bounce`    |
| `POST /api/webhooks/stripe`               | Stripe               | Eventos billing → `org.assinatura`          |
| `POST /api/webhooks/whatsapp` (futuro)    | Twilio / Meta WAB    | Respostas WhatsApp → `lead_evento`          |

Path `/api/webhooks/*` é público (não passa pelo `middleware` de auth). Validação por signature.

---

## 4. Tarefas Cronometradas (pg_cron)

Todas as automações periódicas rodam dentro do PostgreSQL via `pg_cron`. Não dependemos de worker externo.

### 4.1 Lista completa de jobs (mai/2026)

| Job                          | Schedule (UTC)        | Função                                                |
|------------------------------|-----------------------|-------------------------------------------------------|
| `email-outbox`               | a cada 1min           | Envia emails pendentes via Brevo                      |
| `push-outbox`                | a cada 1min           | Envia Web Push via VAPID                              |
| `push-cadencia`              | 09:00 UTC             | Notifica vendedor de passo de cadência do dia (TZ-aware) |
| `prospeccao-bulk`            | a cada 2min           | Processa fila `prospeccao_jobs` (2.85 req/s BrasilAPI) |
| `prospeccao-refresh-cnpj`    | 04:00 UTC             | Re-consulta CNPJs ativos + detecta mudanças            |
| `audio-processor`            | a cada 2min           | Whisper + GPT em `voice_note` e `ligacao_transcricao` |
| `score-recalc`               | 06:00 UTC             | Recalcula `score_total` dos leads                     |
| `nps-survey`                 | 09:00 UTC             | Dispara NPS aos 7d/30d/90d pós-fechamento             |
| `health-score`               | diário 05 UTC         | Recalcula health score dos clientes                    |
| `detect-risco`               | diário 07 UTC         | IA flaga leads esfriando                              |
| `resumo-diario`              | 22 UTC                | IA envia resumo do dia ao vendedor                    |
| `digest-semanal`             | sexta 17 UTC          | IA envia digest executivo ao gestor                   |
| `forecast-semanal`           | domingo 23 UTC        | Snapshot do forecast (acumulado/realizado/gap)        |
| `commission-calc`            | 1º do mês 06 UTC      | Calcula comissão mensal por regra ativa               |
| `cleanup-expired`            | diário 03 UTC         | Hard-delete de leads com `deleted_at < now()`         |

### 4.2 Garantias

- **Idempotência**: cada job é projetado para rodar 2× sem duplicar (UPSERTs ou conditional inserts).
- **Lock**: jobs sensíveis usam `pg_try_advisory_lock` para evitar overlap se previous run não terminou.
- **Timezone-aware**: jobs que mexem com "horário comercial do vendedor" calculam timezone da org via `Intl.DateTimeFormat`. Janela de 3 dias UTC + filtro `dataLocal` por org.
- **Logs**: cada job tem tabela `*_log` ou `*_history` com `executed_at`, `duracao_ms`, `status`, `details JSONB`.
- **Idempotência por payload fingerprint**: cron `prospeccao-refresh-cnpj` usa MD5 do payload importante (`cnae`, `socios[]`, `endereco`, `capital_social`) para detectar se houve mudança real ou só timestamp.

### 4.3 Edge Functions invocadas

Alguns jobs disparam Edge Functions Supabase via `pg_net.http_post`:

- `process-webhook-queue` — entrega webhooks outbound (worker).
- `whisper-transcribe` — chama OpenAI Whisper para áudios.
- `gpt-extract-call` — chama GPT-4 com prompt estruturado.
- `vapid-send-push` — envia Web Push.
- `brevo-send-batch` — envia até 50 emails/batch.
- `vector-embedding-update` — atualiza embeddings de empresas modificadas.

---

## 5. Outbox Pattern (envios assíncronos)

Em vez de chamar Brevo/VAPID síncronamente em handlers HTTP (latência + retries chatos), gravamos em tabela e cron processa.

### Vantagens
- ✅ Retry built-in (status `failed` → cron reprocessa)
- ✅ Não bloqueia request do usuário
- ✅ Auditoria completa (`enviado_em`, `tentativas`, `erro`)
- ✅ Permite agendar (`agendado_para > now()`)
- ✅ Cap de envio (rate limit) ao roteador

### Tabelas
- `outbox_email` — to, subject, html, template_id, vars, status, tentativas, agendado_para.
- `outbox_push` — user_id, title, body, url, icon, status.

### Crons
- `email-outbox` (1min) → Brevo API.
- `push-outbox` (1min) → Web Push VAPID.

---

## 6. Enriquecimento Externo

Plataformas opcionais ativadas via env vars:

| Serviço         | Env var                  | Uso                                                 |
|-----------------|--------------------------|-----------------------------------------------------|
| **BrasilAPI**   | (gratuita, sem key)      | CNPJ consulta (rate 5/s free)                       |
| **OpenAI**      | `OPENAI_API_KEY`         | Whisper, GPT-4o, embeddings text-embedding-3-small  |
| **Anthropic**   | `ANTHROPIC_API_KEY`      | Claude (Sonnet/Opus/Haiku)                          |
| **Google**      | `GOOGLE_API_KEY`         | Gemini (alternativa custo-benefício)                |
| **Tavily**      | `TAVILY_API_KEY`         | Web search (LinkedIn de sócios, notícias)           |
| **Firecrawl**   | `FIRECRAWL_API_KEY`      | Scrape de site (mensagem comercial, preços)         |
| **Hunter.io**   | `HUNTER_API_KEY`         | Emails diretos por domínio                          |
| **Similarweb** | `SIMILARWEB_API_KEY`     | Tráfego + tecnologias do site                       |
| **Brevo**       | `BREVO_API_KEY`          | Envio de email transacional                         |
| **Stripe**      | `STRIPE_SECRET_KEY`      | Billing (opcional, ainda em setup)                  |
| **Sentry**      | `SENTRY_DSN`             | Error tracking                                      |

Todas têm fallback gracioso quando a key está ausente — sistema continua funcionando, só sem aquele recurso.

---

## 7. Monitoramento e Auditoria

### IA: `/admin/ai → Logs`
Últimas 50 invocações com timestamp, feature, provider, modelo, status, tokens, custo USD, latência, erro, e drill-down do input/output.

### Crons: `app_config.cron_log` (futuro UI)
Cada execução loga `executed_at`, `duration_ms`, `status`, `details`. Painel em `/configuracoes/desenvolvedores/crons` mostra status verde/amarelo/vermelho.

### Enrichment: `enrichment_log`
Cada chamada externa (Hunter, Tavily, Similarweb) registra `provider`, `endpoint`, `custo_usd`, `latencia_ms`. Painel agrega custo mensal por provider.

### Webhooks: `webhook_delivery`
Status de cada entrega. Painel mostra taxa de sucesso, tempo médio, últimos 100 deliveries com payload.

### Geral: Sentry
Erros não tratados (frontend + server) com breadcrumbs, user context (org_id, user_id), release tracking.

---

## 8. Controle de Custo

### IA (per-feature)
- `limite_dia_org` — total de invocações OK por org/24h.
- `limite_dia_usuario` — mesmo por ator.
- Quando atinge: status `bloqueado_budget`, app cai pro fluxo manual.

### Enriquecimento (Hunter/Tavily/Similarweb)
- Cap por org configurado em `app_config` (default: 1000 consultas/mês).
- Painel `/admin/enrichment` mostra consumo + projeção.

### Email/Push (Brevo/VAPID)
- Cap diário em `outbox_email` (default 5000/dia/org).
- Excedente fica `agendado_para = amanhã`.

---

## 9. Próximos passos (roadmap automação)

- **Supabase Vault** para cifrar API keys em repouso (hoje via env vars).
- **Retry automático em 429/5xx** com backoff exponencial no dispatcher IA.
- **Fine-tuning por org** — armazenar exemplos favoritos como few-shot.
- **Cron de re-embedding** para empresas modificadas (atualmente é manual).
- **Streaming** para outputs longos (proposta gerada, digest semanal).
- **A/B testing nativo** — duas versões de prompt rodam em paralelo, métricas comparam conversão.
