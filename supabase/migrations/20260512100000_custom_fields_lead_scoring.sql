-- =============================================================================
-- Custom fields por org + lead scoring multi-dimensional + sequência condicional
--
-- Foundation pra customização per-org. Gestor define campos extras que ficam
-- disponíveis em leads, prospeccao_empresa, ou ambos. Substitui hack atual
-- de jogar tudo em observacoes.
-- =============================================================================

create table if not exists public.custom_field_def (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  -- Entidade alvo
  entidade        text not null check (entidade in ('lead', 'empresa', 'expansao')),
  -- Identificador único no contexto da org (lower + sem espaços)
  chave           text not null check (chave ~ '^[a-z][a-z0-9_]{0,40}$'),
  rotulo          text not null check (length(trim(rotulo)) > 0 and length(rotulo) <= 80),
  -- Tipo do campo
  tipo            text not null check (tipo in ('texto', 'numero', 'data', 'boolean', 'select', 'multi_select', 'url')),
  -- Pra select/multi_select
  opcoes          text[] default '{}',
  -- Comportamento
  obrigatorio     boolean not null default false,
  visivel_em_listagem boolean not null default false,
  ordem           int not null default 0,
  descricao       text,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organizacao_id, entidade, chave)
);

create index if not exists idx_custom_field_org on public.custom_field_def(organizacao_id, entidade) where ativo = true;

drop trigger if exists trg_custom_field_def_updated on public.custom_field_def;
create trigger trg_custom_field_def_updated
  before update on public.custom_field_def
  for each row execute function public.set_updated_at();

alter table public.custom_field_def enable row level security;
drop policy if exists custom_field_def_select on public.custom_field_def;
create policy custom_field_def_select on public.custom_field_def
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
drop policy if exists custom_field_def_write on public.custom_field_def;
create policy custom_field_def_write on public.custom_field_def
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id))
  with check (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id));

comment on table public.custom_field_def is
  'Definições de campos customizados por org. Valores ficam em leads.custom_fields JSONB.';

-- =============================================================================
-- Coluna custom_fields nas entidades
-- =============================================================================
alter table public.leads
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.prospeccao_empresa
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.expansoes
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists idx_leads_custom_fields_gin on public.leads using gin (custom_fields);
create index if not exists idx_empresa_custom_fields_gin on public.prospeccao_empresa using gin (custom_fields);

-- =============================================================================
-- Lead scoring multi-dimensional
-- =============================================================================
-- Adiciona colunas pra registrar componentes do score
alter table public.leads
  add column if not exists score_icp_fit numeric(5,1),
  add column if not exists score_engajamento numeric(5,1),
  add column if not exists score_comportamento numeric(5,1),
  add column if not exists score_total numeric(5,1),
  add column if not exists score_calculado_em timestamptz;

-- Engagement events (cliques em email, aberturas, visitas)
create table if not exists public.lead_engagement_evento (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  evento          text not null check (evento in (
    'email_aberto', 'email_clicado', 'email_respondeu',
    'whatsapp_lido', 'whatsapp_respondeu',
    'site_visitou', 'lp_visitou', 'lp_enviou_form',
    'reuniao_aceitou', 'reuniao_compareceu',
    'cta_clicou'
  )),
  payload         jsonb default '{}'::jsonb,
  pontos          int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_engagement_lead on public.lead_engagement_evento(lead_id, created_at desc);
create index if not exists idx_engagement_org on public.lead_engagement_evento(organizacao_id, created_at desc);

alter table public.lead_engagement_evento enable row level security;
drop policy if exists engagement_select on public.lead_engagement_evento;
create policy engagement_select on public.lead_engagement_evento
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
drop policy if exists engagement_insert on public.lead_engagement_evento;
create policy engagement_insert on public.lead_engagement_evento
  for insert to authenticated
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- Pontos por tipo de evento (heurística — gestor pode customizar via custom field)
-- email_aberto=1, email_clicado=3, email_respondeu=8
-- whatsapp_lido=2, whatsapp_respondeu=8
-- site_visitou=2, lp_visitou=5, lp_enviou_form=15
-- reuniao_aceitou=10, reuniao_compareceu=20
-- cta_clicou=4
create or replace function public.pontos_engajamento(_evento text) returns int
language sql immutable as $$
  select case _evento
    when 'email_aberto'        then 1
    when 'email_clicado'       then 3
    when 'email_respondeu'     then 8
    when 'whatsapp_lido'       then 2
    when 'whatsapp_respondeu'  then 8
    when 'site_visitou'        then 2
    when 'lp_visitou'          then 5
    when 'lp_enviou_form'      then 15
    when 'reuniao_aceitou'     then 10
    when 'reuniao_compareceu'  then 20
    when 'cta_clicou'          then 4
    else 0
  end;
$$;

-- Trigger pra pontuar automaticamente
create or replace function public.trg_engajamento_pontuar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  NEW.pontos := public.pontos_engajamento(NEW.evento);
  return NEW;
end;
$$;

drop trigger if exists trg_engajamento_auto on public.lead_engagement_evento;
create trigger trg_engajamento_auto
  before insert on public.lead_engagement_evento
  for each row execute function public.trg_engajamento_pontuar();

-- =============================================================================
-- Função: calcular score total do lead (chama on-demand ou via cron)
-- =============================================================================
create or replace function public.recalcular_score_lead(_lead_id bigint)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_engajamento numeric := 0;
  v_comportamento numeric := 0;
  v_icp numeric := 0;
  v_total numeric;
begin
  select organizacao_id into v_org_id from public.leads where id = _lead_id;
  if v_org_id is null then return null; end if;

  -- Engajamento: soma pontos eventos últimos 30 dias, max 100
  select least(100, coalesce(sum(pontos), 0)) into v_engajamento
  from public.lead_engagement_evento
  where lead_id = _lead_id
    and created_at >= now() - interval '30 days';

  -- Comportamento: dias_sem_interacao + estágio
  with l as (select * from public.v_leads_enriched where id = _lead_id)
  select case
    when l.dias_sem_tocar is null then 50
    when l.dias_sem_tocar <= 7  then 90
    when l.dias_sem_tocar <= 14 then 75
    when l.dias_sem_tocar <= 30 then 50
    when l.dias_sem_tocar <= 60 then 25
    else 10
  end +
  case l.crm_stage
    when 'Negociação' then 10
    when 'Proposta' then 8
    when 'Qualificação' then 5
    else 0
  end into v_comportamento
  from l;

  v_comportamento := least(100, coalesce(v_comportamento, 50));

  -- ICP fit: usa o score do embedding (se calculado, via prospeccao_empresa)
  select coalesce((
    select round(((1 - (c.centroide <=> e.embedding) / 2) * 100)::numeric, 1)
    from public.org_icp_centroide c
    join public.prospeccao_empresa e on e.embedding is not null
    where c.organizacao_id = v_org_id
      and (
        e.cnpj = (select origem_prospeccao->>'cnpj' from public.leads where id = _lead_id)
        or e.id = ((select (origem_prospeccao->>'prospeccao_empresa_id')::bigint from public.leads where id = _lead_id))
      )
    limit 1
  ), 50) into v_icp;

  -- Total ponderado: ICP 30% + Engajamento 40% + Comportamento 30%
  v_total := round((v_icp * 0.3 + v_engajamento * 0.4 + v_comportamento * 0.3)::numeric, 1);

  update public.leads
  set score_icp_fit = v_icp,
      score_engajamento = v_engajamento,
      score_comportamento = v_comportamento,
      score_total = v_total,
      score_calculado_em = now()
  where id = _lead_id;

  return v_total;
end;
$$;

grant execute on function public.recalcular_score_lead(bigint) to authenticated;

-- =============================================================================
-- Sequência condicional: adiciona campos no cadencia_fluxo_passo
-- =============================================================================
alter table public.cadencia_fluxo_passo
  add column if not exists condicao_para_executar text check (condicao_para_executar is null or condicao_para_executar in (
    'sempre',                    -- default
    'se_passo_anterior_aberto',
    'se_passo_anterior_clicado',
    'se_score_engajamento_gte_30',
    'se_score_engajamento_gte_60',
    'se_nao_respondeu_em_3d',
    'se_nao_respondeu_em_7d'
  )),
  add column if not exists ramo_alternativo_passo_id bigint;  -- se condição não bater, vai pra esse passo

-- Default = sempre
update public.cadencia_fluxo_passo set condicao_para_executar = 'sempre' where condicao_para_executar is null;
