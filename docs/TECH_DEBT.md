# Dívidas técnicas conhecidas

Catálogo das dívidas técnicas identificadas durante as auditorias de Maio/2026.
Cada item tem impacto, esforço estimado e plano de ataque.

## 1. Drift entre `calcularBreakdown` (TS) e `lead_score_fechamento` (SQL)

**Onde:** `app/(app)/pipeline/[id]/page.tsx` linha 33+
**Sintoma:** A função TS `calcularBreakdown` duplica a lógica do SQL
`lead_score_fechamento()`. Se o SQL evoluir e o TS não, o detalhe do lead
mostra um score diferente do que aparece em outras telas (kanban, hoje).

**Impacto:** ⚠️ Médio — confusão pra vendedor e gestor (números desbatendo).
**Esforço:** ~2h (criar view, ajustar query, remover função TS).

**Plano:**
1. Criar view `v_lead_score_breakdown` no Supabase retornando os 8 fatores
   já calculados:
   ```sql
   CREATE OR REPLACE VIEW v_lead_score_breakdown AS
   SELECT
     l.id AS lead_id,
     -- temperatura, decisor, dor, etapa, dias_no_estagio, raiox_pago, tom_ligacoes, score_total
     ...
   FROM leads l
   LEFT JOIN raio_x rx ON rx.lead_id = l.id
   LEFT JOIN LATERAL (
     SELECT array_agg(tom_interacao) FROM ligacoes WHERE lead_id = l.id
     ORDER BY data_ligacao DESC LIMIT 5
   ) ult ON TRUE;
   ```
2. Trocar a chamada de `calcularBreakdown` por uma query single-table.
3. Remover a função TS após cliente passar a usar a view.

---

## 2. Detalhe do lead faz 6 queries em paralelo

**Onde:** `app/(app)/pipeline/[id]/page.tsx` linhas 50-90
**Sintoma:** A página carrega lead, raiox, ligações, cadência, eventos,
membros — 6 round-trips Supabase. Em conexão lenta (mobile 3G), é visível.

**Impacto:** 🟢 Baixo — `Promise.all` já paraleliza, mas seria melhor um único query.
**Esforço:** ~3h (view + ajuste do tipo, fallback se algum FK quebrar).

**Plano:**
1. Criar view `v_lead_detail` usando `JSONB` agregado pra trazer raiox/ligações/cadência inline.
2. Ajustar tipos client-side e remover queries paralelas.

---

## 3. Multi-step actions sem transação (RPC transacional)

**Onde:** Vários `actions.ts` (`base/criarLead`, `raio-x/ofertarRaioX`,
`equipe/transferirCarteira`, etc.)
**Sintoma:** Ações que fazem 2-3 INSERTs/UPDATEs em sequência. Se o segundo falha,
o primeiro já foi commitado → estado inconsistente (ex: lead criado sem evento de auditoria).

**Impacto:** 🟡 Médio — raro, mas pode deixar o histórico de eventos com lacunas
e a tabela `cadencia` sem rows pra um lead que está em pipeline.
**Esforço:** ~4h por action (criar RPC PL/pgSQL + atualizar caller TS).

**Prioridade pra atacar primeiro:**
- `base/criarLead` (insert leads + lead_evento + newsletter + cadencia) → RPC `criar_lead_completo`.
- `equipe/transferirCarteira` (update leads + insert lead_evento) → atomic.
- `raio-x/ofertarRaioX` (insert raio_x + update leads + insert lead_evento) → atomic.

**Plano por action:**
1. Mover lógica pra função PL/pgSQL `SECURITY DEFINER` (ou `INVOKER` + RLS).
2. Caller TS chama `supabase.rpc('nome_funcao', { ... })`.
3. Adicionar testes Vitest invariant pra confirmar atomicidade.

---

## 4. Webhooks não implementados (apenas armazenados)

**Onde:** `app/(app)/configuracoes/desenvolvedores/actions.ts` cria webhooks na tabela,
mas nada os dispara.
**Sintoma:** Configurar webhook não tem efeito — eventos não são entregues.

**Impacto:** 🔴 Alto se cliente confiar no recurso — silenciosamente quebra integrações.
**Esforço:** ~6-8h (worker queue + retry + signing + circuit breaker).

**Plano:**
1. Criar tabela `webhook_deliveries` (queue) com status `pending|sent|failed|abandoned`.
2. Edge function `process-webhook-queue` rodando cron (a cada 30s).
3. Trigger PL/pgSQL nos eventos relevantes (lead.created, etc.) que enfileira.
4. Worker faz POST com `Webhook-Signature: sha256=hmac(secret, body)`.
5. Retry exponencial 5x com timeout 10s. Se falhar 5x, marca `abandoned`.

---

## 5. ✅ RESOLVIDO — Duplicação `lead_evento` em transferência de carteira

**Onde:** `app/(app)/equipe/actions.ts:transferirCarteira`
**Sintoma resolvido em commit posterior:** Antes gravava 1 meta-evento no primeiro lead;
agora insere 1 `responsavel_alterado` por lead em chunks de 500.
Rastreabilidade completa: "quem moveu lead X quando" agora aparece no histórico de cada lead.

---

## 6. Sem rate limiting em endpoints públicos

**Onde:** `app/api/*/route.ts` (a maioria)
**Sintoma:** Sem proteção contra abuso. Atacante pode brute-force convites,
spam de leads via API key roubada, etc.

**Impacto:** 🟡 Médio — depende de quantos endpoints são públicos.
**Esforço:** ~3h (instalar `@upstash/ratelimit` + Redis ou usar Supabase + KV).

**Plano:**
1. Instalar `@upstash/ratelimit` ou similar.
2. Middleware em rotas públicas: 60 req/min por IP, 600 req/min por API key.
3. Headers `X-RateLimit-*` na resposta.
4. Documentar em `docs/API.md`.

---

## 7. Sem soft-delete em `leads`

**Onde:** `app/(app)/base/actions.ts:arquivarLead`
**Sintoma:** "Arquivar" muda `funnel_stage='arquivado'` mas o lead continua na tabela
com todos os campos. Não há retenção/expurgo.

**Impacto:** 🟢 Baixo (com 1k-10k leads/org) → 🟡 Médio (>100k).
**Esforço:** ~2h pra adicionar coluna `deleted_at` + cron pra hard-delete > 365d.

**Plano:**
1. Migration: `ALTER TABLE leads ADD COLUMN deleted_at timestamptz NULL`.
2. Atualizar `arquivarLead` pra setar `deleted_at = now() + interval '365 days'` quando hard-delete agendado.
3. Cron diário fazendo `DELETE FROM leads WHERE deleted_at < now()`.
4. Adicionar à política LGPD (item externo).

---

## Pendências externas (ação do usuário/produto)

Itens que dependem de configuração externa, decisão de produto ou serviços de terceiros.

### Stripe USD
Adicionar Price IDs USD ao Stripe Dashboard e atualizar `lib/stripe.ts:PRICES_BY_CURRENCY`.

### Rotação de credenciais
Tokens vazados em commits antigos (Management API: `sbp_713b...`).
- Rotar Supabase Service Role Key
- Rotar Anthropic API Key
- Rotar Sentry DSN
- Rotar Stripe Webhook Secret
- Audit `git log` por mais segredos com `git secrets` ou `trufflehog`.

### Política LGPD
- Termo de uso na landing
- Política de privacidade explicitando: dados coletados, base legal, retenção (365d), DPO contact
- Botão "Solicitar exclusão de dados" no perfil
- Export de dados em JSON (LGPD art. 18)

### Webhook WhatsApp
Falta implementar receiver pra webhooks do Twilio/Meta:
- Endpoint `app/api/webhooks/whatsapp/route.ts` com verificação de signature
- Inserir resposta como `lead_evento` tipo `whatsapp_recebido`
- Atualizar `cadencia.status='respondido'` se vier resposta a um passo enviado
