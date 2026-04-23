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

## 2. Rodar os schemas (em ordem)

No painel do projeto → **SQL Editor** → "New query". Execute as 5 migrations **nesta ordem**:

### 2.1. `supabase/schema.sql`
Cria ~15 tabelas + views base + RLS multi-tenant. **Dropa tudo no começo** — re-rodar é seguro.

### 2.2. `supabase/migration_v2_completude.sql` (idempotente)
- `crm_stage` expandido com 12 etapas
- `raio_x.status_oferta` + `tipo_voucher` + trigger de classificação
- Função `lead_probabilidade_por_etapa()` + trigger
- Views ampliadas: `v_leads_enriched`, `v_kpis_globais`, `v_kpis_por_canal`

### 2.3. `supabase/migration_v3_funil.sql` (idempotente)
Analytics do funil — alimenta a tela `/funil`:
- `v_funil_conversao` — snapshot do funil (qty + valor por etapa/responsável)
- `v_tempo_por_etapa` — tempo médio em cada etapa via LAG sobre `lead_evento`
- `v_valor_por_etapa` — bruto + weighted + ganho/perdido segregados
- `v_cohort_entrada` — coortes semanais dos últimos 180 dias
- `v_motivos_perda` — ranking dos motivos de perda

### 2.4. `supabase/migration_v4_score.sql` (idempotente)
Score de fechamento composto + motivos de perda padronizados:
- Colunas novas em `leads`: `motivo_perda` (enum), `motivo_perda_detalhe`, `percepcao_vendedor`
- Coluna em `ligacoes`: `tom_interacao` (positivo/neutro/negativo)
- Função `lead_score_fechamento(lead_id)` → 0-100 composto por 8 fatores
- Views: `v_lead_score`, `v_forecast_mes`, `v_top_oportunidades`

### 2.5. `supabase/migration_v5_ai.sql` (idempotente)
Camada de IA com prompts versionados:
- `ai_providers` — Anthropic/OpenAI/Google (seed global)
- `ai_features` — catálogo das 15 features (toggle + budget por feature)
- `ai_prompts` — biblioteca versionada (seed v1 em PT-BR das 15)
- `ai_invocations` — log completo (tokens, custo, latência)
- View `v_ai_uso_30d`

> **Todas as migrations são idempotentes** (IF NOT EXISTS, CREATE OR REPLACE).
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
