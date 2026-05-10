# Setup do Supabase — passo a passo

Este guia leva o sistema do zero até "rodando em produção" em ~30 minutos.

---

## 1. Criar projeto

1. Acesse https://supabase.com → "New project".
2. Defina:
   - **Name:** `guilds-comercial`
   - **Database password:** uma senha forte (anote, vai precisar)
   - **Region:** `South America (São Paulo)` — `sa-east-1`
3. Aguarde ~2min até o status ficar verde.

---

## 2. Rodar as migrations (em ordem)

Toda a história do schema vive em **`supabase/migrations/`** com nomes prefixados pela data (`AAAAMMDDhhmmss_descricao.sql`). Essa é a fonte de verdade — execute na ordem do nome do arquivo. O `supabase/schema.sql` na raiz é só uma **referência consolidada** do estado atual; ele *não* deve ser executado em vez das migrations.

### Forma recomendada: `supabase db push` (CLI oficial)

```bash
npm i -g supabase
supabase login                                  # pede o Personal Access Token
supabase link --project-ref mdmbuekuemcjumxcmkls
supabase db push                                # aplica migrations pendentes em ordem
```

O CLI lê `supabase/migrations/` em ordem alfabética e aplica só o que ainda não está em `supabase_migrations.schema_migrations`. Idempotente nativo. `supabase db diff` mostra preview antes; `supabase migration list` mostra o que está aplicado.

### Alternativa manual: SQL Editor

No painel do projeto → **SQL Editor** → "New query". Cole e execute cada arquivo da pasta `migrations/` na ordem alfabética:

| Arquivo | O que entrega |
|---|---|
| `20260423000000_schema.sql` | Schema base v1 — ~15 tabelas + views base + RLS multi-tenant. Dropa tudo no começo, re-rodar é seguro. |
| `20260423000001_v2.sql` | `crm_stage` com 12 etapas, `raio_x.status_oferta`/`tipo_voucher`, trigger de classificação, `lead_probabilidade_por_etapa()`, views `v_leads_enriched`, `v_kpis_globais`, `v_kpis_por_canal`. |
| `20260423000002_v3.sql` | Funil analytics: `v_funil_conversao`, `v_tempo_por_etapa`, `v_valor_por_etapa`, `v_cohort_entrada`, `v_motivos_perda`. |
| `20260423000003_v4.sql` | Score 0-100 composto: colunas `motivo_perda`/`percepcao_vendedor`/`tom_interacao`, função `lead_score_fechamento()`, views `v_lead_score`, `v_forecast_mes`, `v_top_oportunidades`. |
| `20260423000004_v5.sql` | Camada de IA: `ai_providers`, `ai_features`, `ai_prompts`, `ai_invocations`, view `v_ai_uso_30d` + seeds das 15 features e prompts em PT-BR. |
| `20260424000000_cadencia_templates.sql` | Templates de cadência por organização. |
| `20260424000001_api_and_webhooks.sql` | API pública: `api_keys`, `webhooks`, log de entregas. |
| `20260424000002_pg_cron_ai.sql` | pg_cron disparando jobs server-to-server da camada de IA. |
| `20260425000000_billing_activation.sql` | Stripe billing: `plano`, `billing_status`, `trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id` em `organizacoes`. |
| `20260427000000_fix_rls_membros.sql` | Hardening RLS: remove privilege escalation em `membros_organizacao` (insert agora exige `is_gestor_in_org`). |
| `20260427100000_views_security_invoker.sql` | 14 views agregadas com `security_invoker = on` — fecha vazamento de dados entre orgs (RLS das tabelas-base passa a ser respeitada via view). |
| `20260427100001_function_hardening.sql` | `set search_path = public` em 9 funções; `revoke execute from anon` em `is_gestor_in_org` e `orgs_do_usuario`. |
| `20260427100002_rls_perf_and_fk_indexes.sql` | 7 policies reescritas com `(select auth.uid())` (auth_rls_initplan); 14 índices em FKs sem cobertura (responsavel_id, organizacao_id em api_keys/webhooks, etc.). |
| `20260427100003_api_rate_limit_persistent.sql` | `api_rate_counters` + função atômica `consume_rate_token()`; cleanup a cada 15 min via pg_cron. |
| `20260427100004_webhook_retry_hardening.sql` | `webhook_events.error_message`, índice parcial pending+due, cron `webhook_retry` (todo minuto). |
| `20260427100005_ai_invocations_archival.sql` | Tabela archive + função `archive_old_ai_invocations(90)`, cron semanal. |
| `20260427100006_move_pg_net.sql` | No-op documentado: pg_net não suporta SET SCHEMA. |
| `20260427100007_perfil_org_dados_fiscais.sql` | profiles (telefone, avatar_url, timezone) e organizacoes (razao_social, cnpj com check, IE, regime_tributario, telefone, site, endereco jsonb, logo_url, timezone) + índice CNPJ. |
| `20260427100008_web_push_subscriptions.sql` | `web_push_subscriptions` + `notification_preferences` (opt-in granular, janela horário, fuso) + RLS por user + cleanup cron semanal de >180d. |
| `20260427100009_pg_cron_push_cadencia.sql` | Schedule horário de `/api/cron/push-cadencia` via pg_net. |
| `20260427100010_ai_overage_billing.sql` | `ai_features.preco_overage_centavos` (seed por feature, R$0,10 a R$1,00); `ai_usage_mensal` (tracking por org/mês/feature); função `registrar_ai_usage()`; view `v_ai_usage_atual`. |
| `20260427100011_pg_cron_report_overage.sql` | Schedule mensal (dia 1 03:00 UTC) de `/api/cron/report-ai-overage` que reporta usage ao Stripe metered. |

> **Todas as migrations são idempotentes** (`IF NOT EXISTS`, `CREATE OR REPLACE`).
> Re-rodar em produção não apaga dados.

### Como funciona o multi-tenant

- O sistema é **híbrido**: gestores podem pertencer a várias organizações; comercial/sdr ficam em uma só.
- A org ativa é resolvida por cookie `x-organizacao-ativa`. Fallback: `profiles.home_organizacao_id`.
- Toda tabela de dados tem `organizacao_id`. RLS exige que o usuário seja membro ativo.
- Tabelas de governança (membros, convites, config, segmentos, metas) exigem `role = gestor` para escrita.

---

## 3. Criar os 4 usuários no Auth

1. **Authentication > Users** → "Add user".
2. Crie **um por um**, com email + senha + `Email confirm = ON`:

   | Email                       | Senha sugerida    | Display name (vai no profile) |
   |-----------------------------|-------------------|-------------------------------|
   | gustavog.macedo16@gmail.com | (escolha forte)   | Gustavo Macedo                |
   | comercial@guilds.com.br     | (escolha forte)   | Comercial                     |
   | sdr1@guilds.com.br          | (escolha forte)   | SDR 1                         |
   | sdr2@guilds.com.br          | (escolha forte)   | SDR 2                         |

3. **Anote os UUIDs gerados** (clica em cada usuário → copia o `id`).

---

## 4. Criar perfis (profiles)

No SQL Editor, cole **substituindo os UUIDs do passo 3**:

```sql
insert into public.profiles (id, display_name, email, role) values
  ('UUID-DO-GUSTAVO',   'Gustavo Macedo', 'gustavog.macedo16@gmail.com', 'gestor'),
  ('UUID-DO-COMERCIAL', 'Comercial',      'comercial@guilds.com.br',     'comercial'),
  ('UUID-DO-SDR1',      'SDR 1',          'sdr1@guilds.com.br',          'sdr'),
  ('UUID-DO-SDR2',      'SDR 2',          'sdr2@guilds.com.br',          'sdr');
```

> `role` em `profiles` é apenas um "papel default". O papel **efetivo** do usuário
> é o que está em `membros_organizacao` (pois varia por org). Esse campo default
> vira o papel inicial quando o seed cria a org "Guilds" e adiciona os membros.

Verifique:

```sql
select id, display_name, role from public.profiles;
```

Devem aparecer 4 linhas.

---

## 5. Popular dados (seed)

O `seed.sql` já está montado para criar a organização "Guilds" automaticamente:

1. Cria 1 `organizacao` chamada "Guilds"
2. Adiciona os 4 profiles como `membros_organizacao` (Gustavo como gestor, outros comercial/sdr)
3. Define `profiles.home_organizacao_id` para cada um
4. Insere 45 leads + raio_x + cadencias + newsletter (todos já carimbados com `organizacao_id` via DEFAULT)

Para rodar:

1. SQL Editor → cole `supabase/seed.sql` → **RUN**.
2. Verifique:

```sql
select count(*) as leads      from public.leads;       -- 45
select count(*) as cadencia   from public.cadencia;
select count(*) as raio_x     from public.raio_x;
select count(*) as newsletter from public.newsletter;
```

---

## 6. Variáveis de ambiente da app

No painel Supabase → **Project Settings > API**, copie:

- `Project URL` (ex.: `https://abcd1234.supabase.co`)
- `anon public` key (essa é segura para o front)

Crie o arquivo `.env.local` na raiz:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcd1234.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Camada de IA — configure conforme os providers que quiser usar
# (a tabela ai_providers referencia estes nomes em api_key_ref)
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...    # opcional
GOOGLE_API_KEY=AIzaSy...       # opcional
```

Veja [`AI_SETUP.md`](./AI_SETUP.md) pra detalhes da configuração de IA (features,
prompts, budgets, monitoramento).

---

## 7. Subir a Edge Function (notificações diárias 7h)

### 7.1 Instalar a CLI do Supabase

```bash
npm install -g supabase
supabase login
```

### 7.2 Linkar projeto local

Da raiz do `guilds-comercial`:

```bash
supabase link --project-ref <PROJECT_REF>
```

(O `PROJECT_REF` está na URL do dashboard, ex.: `abcd1234`).

### 7.3 Criar conta na Resend

1. https://resend.com → criar conta gratuita (1000 emails/mês).
2. **Domain** → adicionar `guilds.com.br` e validar (TXT no DNS).
3. **API Keys** → criar uma chave → copiar (`re_xxx...`).

### 7.4 Configurar variáveis da função

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set FROM_EMAIL='Guilds Comercial <comercial@guilds.com.br>'
supabase secrets set APP_URL=https://guilds-comercial.vercel.app
```

### 7.5 Deploy

```bash
supabase functions deploy daily-digest --no-verify-jwt
```

> `--no-verify-jwt` porque será chamado por pg_cron com bearer token interno.

### 7.6 Agendar via pg_cron

1. SQL Editor → cole `supabase/cron.sql`.
2. **Antes de rodar**, substitua `<PROJECT_REF>` pelo seu.
3. Salve a service role key no Vault:

```sql
select vault.create_secret(
  '<sua_service_role_key_aqui>',
  'SERVICE_ROLE_KEY'
);
```

(A service role key está em **Project Settings > API > service_role** — **NUNCA** exponha no front.)

4. **RUN** o `cron.sql`.

### 7.7 Testar manualmente

```bash
curl -X POST 'https://<PROJECT_REF>.functions.supabase.co/daily-digest' \
     -H 'Authorization: Bearer <SERVICE_ROLE_KEY>'
```

Deve retornar JSON com `{ ok: true, enviados: [...] }`.

---

## 8. Deploy do front na Vercel

1. https://vercel.com → "Add New… > Project" → import o repo.
2. **Root directory:** `guilds-comercial`
3. **Environment Variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy → aguarde build → abrir URL → login.

---

## 9. Conferir funcionamento

1. Login com sua conta de gestor.
2. Vá em `/hoje` — deve listar suas ações vencidas/de hoje (45 leads do seed).
3. Vá em `/pipeline` — Kanban com 8 colunas, cards arrastáveis.
4. Vá em `/time` — KPIs globais e ranking dos 4 vendedores.
5. Vá em `/equipe` — tela de gestão multi-tenant (só visível para gestores).
6. Receba o email às 7h do próximo dia útil.

---

## 10. Recursos multi-tenant

### 10.1 Trocador de organização (sidebar)

No topo da sidebar há um dropdown que lista todas as organizações em que
o usuário é membro ativo. Clicar em outra troca o cookie `x-organizacao-ativa`
e recarrega o layout. Se o usuário pertence a apenas 1 org **e** não é gestor,
o dropdown vira um rótulo estático.

Gestores veem o link **"+ Nova empresa"** no final do dropdown.

### 10.2 Tela `/equipe` (só gestor)

Acessível apenas para quem é `gestor` na org ativa. 6 abas:

- **Membros** — lista profiles ativos/inativos, permite alterar role (gestor/comercial/sdr) e desativar/reativar.
- **Convites** — criar convite (email + role), copiar link `/api/convite/{token}`, revogar pendentes.
- **Metas** — definir metas semanais/mensais por vendedor (contatos, reuniões, propostas, fechamentos, receita).
- **Territórios** — atribuir segmentos específicos a cada vendedor (autocompletado com os segmentos existentes nos leads).
- **Carteiras** — transferir leads em massa de um vendedor para outro, com filtros opcionais (funil, estágio de CRM).
- **Config** — ativar/desativar distribuição automática de novos leads e escolher estratégia (manual / round-robin / por segmento / por carga).

Toda ação escreve em `lead_evento` (quando aplicável) para manter auditoria.

### 10.3 Fluxo de convite

1. Gestor cria convite em `/equipe → Convites`. Um `token` é gerado e
   o convite expira em 7 dias.
2. Gestor copia o link `https://<app>/api/convite/<token>` e envia para a pessoa.
3. Pessoa abre o link:
   - Se não estiver logada → vai para `/login?next=/api/convite/<token>&email=...`.
   - Se o email do login não bate com o do convite → erro.
   - Se o convite já foi aceito ou expirou → erro.
4. Em caso de sucesso, é inserido um registro em `membros_organizacao`
   (ou reativado se já existia), o convite é marcado como aceito, e a
   nova org vira a ativa via cookie.

### 10.4 Criar nova empresa (`/empresa/nova`)

Qualquer gestor pode criar uma nova org independente pelo botão
**"+ Nova empresa"** no dropdown da sidebar. O fluxo:

1. Gera um `slug` a partir do nome (com fallback timestamp se já existir).
2. Cria a `organizacao` com `owner_id = usuário`.
3. Adiciona o criador como `membros_organizacao` com role `gestor`.
4. Cria `organizacao_config` com `distribuicao_automatica = false`.
5. Troca o cookie para a nova org e redireciona para `/equipe`.

### 10.5 Helpers e RLS

Todas as queries em Server Components usam:

- `getCurrentOrgId()` — resolve org ativa (cookie → home → 1ª org), validando membership.
- `getCurrentRole()` — role efetivo do usuário na org ativa.
- `listarOrgsDoUsuario()` — todas as orgs em que o usuário é membro ativo.
- `listarMembrosDaOrg(orgId)` — profiles + role de cada membro da org.

No banco, duas funções `security definer stable` suportam as políticas RLS:

- `orgs_do_usuario()` — retorna set de `organizacao_id` em que o `auth.uid()` é ativo.
- `is_gestor_in_org(_org uuid)` — booleano para políticas de escrita em tabelas de governança.

---

## Email mock para dev local

Para testar fluxos que enviam email (convites, welcome, password reset) sem realmente disparar pra inboxes reais, suba o **Mailpit**:

```bash
docker compose -f docker-compose.dev.yml up -d
# UI: http://localhost:8025
```

O Mailpit aceita conexões SMTP em `localhost:1025` sem auth. Conexão:

- **Stack Supabase local** (`supabase start`): edite `supabase/config.toml` adicionando `[auth.email]` com `host = "localhost"` e `port = 1025`.
- **Stack Supabase remoto** (Pro+): SMTP custom é configurado no Dashboard → Project Settings → Auth → SMTP. Em produção use Resend/SendGrid; o Mailpit é só pra dev.
- **Emails diretos do app** (lib/email.ts via Resend): aponte `SMTP_HOST=localhost SMTP_PORT=1025` no `.env.local`.

Limitação conhecida: testes E2E de **cadastro com email de confirmação real** requerem stack local + Mailpit conectado. Pra CI estável, recomendamos:
- Criar users de teste via Auth admin API com `email_confirm: true` (pula o email)
- Testar fluxo de convite via aceite programático do token (ver `tests/db/rls-isolation.test.ts`)

---

## Troubleshooting

### "Auth session missing" no login
- Verifique se `.env.local` tem as 2 variáveis e bata o servidor (`npm run dev`).

### Login funciona mas redireciona para login de novo
- Profile não foi criado. Cheque `select * from public.profiles where email = 'seu@email'`.

### Kanban não arrasta no mobile
- Use o ícone de "agarrar" (3 listras) no canto esquerdo do card. Touch-drag de outras áreas é desabilitado de propósito (evita scroll vs drag conflito).

### Email não chega
- Confira `cron.job_run_details` no SQL Editor.
- Verifique Resend dashboard → "Emails" — pode ser que tenha caído em soft-bounce.
- Confirme que `FROM_EMAIL` usa um domínio verificado.

### "permission denied for view v_leads_enriched"
- Rode novamente o bloco de RLS do final do `schema.sql`. As views herdam permissão das tabelas-base.

### Link de convite dá "convite_invalido" / "email_nao_confere"
- Confira `select * from public.convites where token = '...'`. O token expira em 7 dias.
- O email do usuário logado precisa ser exatamente igual (case-insensitive) ao email do convite.

### Trocar de organização não funciona
- Confira se o usuário é membro ativo da org no `membros_organizacao`.
- Se o cookie `x-organizacao-ativa` ficou inválido, basta trocar pelo dropdown da sidebar — ele valida e sobrescreve.

### `/equipe` retorna 404 ou redireciona
- Só gestores têm acesso. Confira `select role from public.membros_organizacao where profile_id = '...' and organizacao_id = '...'`.

---

Pronto. Sistema rodando.
