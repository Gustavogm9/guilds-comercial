-- =============================================================================
-- Portal embaixador self-service (P6 do flywheel)
--
-- Cliente embaixador acessa /indicar/{token} sem login pra registrar
-- indicações direto. Token é único por (org, lead). Vendedor compartilha
-- por email/WhatsApp.
--
-- Tabela:
--   embaixador_tokens — 1 token por embaixador, com revogação simples
--
-- Função pública (SECURITY DEFINER):
--   buscar_embaixador_por_token(token) — retorna dados públicos do embaixador
--                                         (nome, empresa, organizacao_nome) +
--                                         array de indicações já feitas (sem PII)
--   criar_indicacao_via_portal(token, dados) — insere indicacao com origem=
--                                              'embaixador_portal'
--
-- Não cria leads automaticamente — vendedor decide se converte em lead
-- depois (via UI de /indicacoes).
--
-- Ampliação na constraint origem da tabela `indicacoes`:
--   precisamos aceitar 'embaixador_portal' como origem válida da indicação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela: embaixador_tokens
-- -----------------------------------------------------------------------------
create table if not exists public.embaixador_tokens (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  token           text not null unique,
  ativo           boolean not null default true,
  criado_por      uuid references public.profiles(id) on delete set null,
  -- Limites operacionais (anti-abuse)
  max_indicacoes_por_acesso int not null default 5 check (max_indicacoes_por_acesso > 0 and max_indicacoes_por_acesso <= 20),
  expires_at      timestamptz, -- NULL = não expira
  -- Auditoria
  ultimo_acesso   timestamptz,
  total_acessos   int not null default 0,
  total_indicacoes_recebidas int not null default 0,
  -- Mensagem custom do vendedor (aparece no topo do portal)
  mensagem_personalizada text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index uniq_embaixador_token_lead on public.embaixador_tokens(lead_id) where ativo = true;
create index idx_embaixador_token_org on public.embaixador_tokens(organizacao_id);

comment on table public.embaixador_tokens is
  'Tokens públicos pra clientes embaixadores acessarem /indicar/{token} sem login. 1 token ativo por lead. Vendedor compartilha por email/WhatsApp.';

-- -----------------------------------------------------------------------------
-- 2. Adiciona "embaixador_portal" como origem válida
--    (drop + recreate constraint)
-- -----------------------------------------------------------------------------
alter table public.indicacoes drop constraint if exists indicacoes_origem_check;

-- Detecta se há coluna origem com check antigo (de migration anterior)
do $$
declare
  has_origem boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'indicacoes' and column_name = 'origem'
  ) into has_origem;

  if not has_origem then
    -- Coluna pode não existir em alguns ambientes — adiciona
    alter table public.indicacoes
      add column origem text;
  end if;
end $$;

-- Adiciona o novo valor
alter table public.indicacoes
  add constraint indicacoes_origem_check
  check (origem in (
    'pedido_indicacao',
    'manual',
    'embaixador_portal',
    'sistema_outro'
  ) or origem is null);

-- Default razoável pra rows antigas
update public.indicacoes set origem = 'manual' where origem is null;

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger
-- -----------------------------------------------------------------------------
drop trigger if exists trg_embaixador_tokens_updated on public.embaixador_tokens;
create trigger trg_embaixador_tokens_updated
  before update on public.embaixador_tokens
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. RLS — só gestor/comercial gerencia tokens
-- -----------------------------------------------------------------------------
alter table public.embaixador_tokens enable row level security;

create policy embaixador_tokens_select on public.embaixador_tokens
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy embaixador_tokens_write on public.embaixador_tokens
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- -----------------------------------------------------------------------------
-- 5. Função pública: buscar_embaixador_por_token
--
-- Chamada do portal `/indicar/{token}`. Sem auth — usa SECURITY DEFINER
-- pra contornar RLS, mas valida token estritamente.
--
-- Retorna NULL se token inválido/inativo/expirado.
-- -----------------------------------------------------------------------------
create or replace function public.buscar_embaixador_por_token(_token text)
returns table (
  organizacao_id uuid,
  organizacao_nome text,
  lead_id bigint,
  embaixador_empresa text,
  embaixador_nome text,
  mensagem_personalizada text,
  total_indicacoes_recebidas int,
  max_indicacoes_por_acesso int,
  qtd_minhas_indicacoes int,
  qtd_minhas_que_fecharam int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_lead_id bigint;
begin
  -- Valida token estritamente
  if _token is null or length(_token) < 16 then
    return;
  end if;

  -- Busca token ativo e não-expirado
  select t.organizacao_id, t.lead_id
    into v_org_id, v_lead_id
  from public.embaixador_tokens t
  where t.token = _token
    and t.ativo = true
    and (t.expires_at is null or t.expires_at > now())
  limit 1;

  if v_org_id is null then return; end if;

  -- Atualiza auditoria de acesso (não bloqueia se falhar)
  begin
    update public.embaixador_tokens
       set ultimo_acesso = now(),
           total_acessos = total_acessos + 1
     where token = _token;
  exception when others then null;
  end;

  return query
  select
    o.id,
    o.nome,
    l.id,
    l.empresa,
    l.nome,
    et.mensagem_personalizada,
    et.total_indicacoes_recebidas,
    et.max_indicacoes_por_acesso,
    (select count(*)::int from public.indicacoes i
       where i.embaixador_lead_id = v_lead_id
         and i.origem = 'embaixador_portal'),
    (select count(*)::int from public.indicacoes i
       where i.embaixador_lead_id = v_lead_id
         and i.status = 'fechado')
  from public.organizacoes o
  join public.leads l on l.organizacao_id = o.id
  join public.embaixador_tokens et on et.lead_id = l.id
  where l.id = v_lead_id
    and et.token = _token
  limit 1;
end;
$$;

comment on function public.buscar_embaixador_por_token(text) is
  'Endpoint público (sem auth) usado pelo portal /indicar/{token}. Valida token, atualiza auditoria de acesso e retorna dados públicos do embaixador + contadores de indicações.';

revoke all on function public.buscar_embaixador_por_token(text) from public;
grant execute on function public.buscar_embaixador_por_token(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Função pública: criar_indicacao_via_portal
--
-- Vendedor não criou — embaixador inseriu diretamente. Cria indicação com
-- origem='embaixador_portal'. Vendedor depois decide se converte em lead.
--
-- Anti-abuse:
--   - Cap por dia: max 20 indicações via portal por embaixador
--   - Validação de email se preenchido
--   - Tamanho dos campos
-- -----------------------------------------------------------------------------
create or replace function public.criar_indicacao_via_portal(
  _token text,
  _indicado_nome text,
  _indicado_empresa text default null,
  _indicado_cargo text default null,
  _indicado_email text default null,
  _indicado_whatsapp text default null,
  _contexto text default null
)
returns table (
  ok boolean,
  erro text,
  indicacao_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_lead_id bigint;
  v_qtd_hoje int;
  v_indicacao_id bigint;
begin
  -- Validações de input
  if _token is null or length(_token) < 16 then
    return query select false, 'Token inválido.'::text, null::bigint;
    return;
  end if;
  if _indicado_nome is null or length(trim(_indicado_nome)) < 2 then
    return query select false, 'Nome obrigatório.'::text, null::bigint;
    return;
  end if;
  if length(_indicado_nome) > 120 then
    return query select false, 'Nome muito longo (máx. 120 chars).'::text, null::bigint;
    return;
  end if;
  if _indicado_email is not null and length(trim(_indicado_email)) > 0
     and _indicado_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return query select false, 'Email inválido.'::text, null::bigint;
    return;
  end if;

  -- Busca token ativo
  select t.organizacao_id, t.lead_id
    into v_org_id, v_lead_id
  from public.embaixador_tokens t
  where t.token = _token
    and t.ativo = true
    and (t.expires_at is null or t.expires_at > now())
  limit 1;

  if v_org_id is null then
    return query select false, 'Token inválido ou expirado.'::text, null::bigint;
    return;
  end if;

  -- Anti-abuse: máx 20 indicações por dia por embaixador
  select count(*) into v_qtd_hoje
  from public.indicacoes
  where embaixador_lead_id = v_lead_id
    and origem = 'embaixador_portal'
    and created_at >= (current_date::timestamptz);
  if v_qtd_hoje >= 20 then
    return query select false, 'Limite diário atingido (20). Tente amanhã.'::text, null::bigint;
    return;
  end if;

  -- Cria indicação
  insert into public.indicacoes (
    organizacao_id,
    embaixador_lead_id,
    indicado_nome,
    indicado_empresa,
    indicado_cargo,
    indicado_email,
    indicado_whatsapp,
    contexto,
    status,
    origem
  ) values (
    v_org_id,
    v_lead_id,
    trim(_indicado_nome),
    nullif(trim(coalesce(_indicado_empresa, '')), ''),
    nullif(trim(coalesce(_indicado_cargo, '')), ''),
    nullif(trim(coalesce(_indicado_email, '')), ''),
    nullif(trim(coalesce(_indicado_whatsapp, '')), ''),
    nullif(trim(coalesce(_contexto, '')), ''),
    'recebida',
    'embaixador_portal'
  )
  returning id into v_indicacao_id;

  -- Atualiza contador no token
  update public.embaixador_tokens
     set total_indicacoes_recebidas = total_indicacoes_recebidas + 1
   where token = _token;

  -- Audit no embaixador
  insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
  values (
    v_org_id,
    v_lead_id,
    null,
    'indicacao_via_portal',
    jsonb_build_object(
      'indicacao_id', v_indicacao_id,
      'nome', _indicado_nome,
      'empresa', _indicado_empresa
    )
  );

  return query select true, null::text, v_indicacao_id;
end;
$$;

comment on function public.criar_indicacao_via_portal(text, text, text, text, text, text, text) is
  'Endpoint público (sem auth) chamado pelo portal /indicar/{token}. Valida token, cria indicação com origem=embaixador_portal, atualiza contadores. Anti-abuse: 20/dia/embaixador.';

revoke all on function public.criar_indicacao_via_portal(text, text, text, text, text, text, text) from public;
grant execute on function public.criar_indicacao_via_portal(text, text, text, text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. View: tokens com info do embaixador (alimenta /indicacoes UI)
-- -----------------------------------------------------------------------------
drop view if exists public.v_embaixador_tokens;
create view public.v_embaixador_tokens
with (security_invoker = true) as
select
  et.id,
  et.organizacao_id,
  et.lead_id,
  et.token,
  et.ativo,
  et.expires_at,
  et.ultimo_acesso,
  et.total_acessos,
  et.total_indicacoes_recebidas,
  et.mensagem_personalizada,
  et.max_indicacoes_por_acesso,
  et.created_at,
  et.criado_por,
  l.empresa as embaixador_empresa,
  l.nome as embaixador_nome,
  l.crm_stage as embaixador_crm_stage,
  pr.display_name as criado_por_nome
from public.embaixador_tokens et
join public.leads l on l.id = et.lead_id
left join public.profiles pr on pr.id = et.criado_por
where et.ativo = true;

comment on view public.v_embaixador_tokens is
  'Tokens ativos com dados do embaixador (empresa, nome) e do criador (vendedor). Alimenta painel em /indicacoes onde gestor/vendedor gera/copia o link.';
