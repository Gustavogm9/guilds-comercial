-- ============================================================
-- GUILDS COMERCIAL — SCHEMA POSTGRES (Supabase)
-- Versão: 2.0 (multi-tenant híbrido)  |  Data: 2026-04-22
-- ============================================================
-- Modelo multi-empresa:
--   organizacoes          : cada empresa/workspace
--   membros_organizacao   : N-para-N profiles<>organizacoes (gestor pode ter várias)
--   vendedor_segmento     : territórios (segmentos sob responsabilidade de cada vendedor)
--   meta_individual       : metas por vendedor/período
--   convites              : convites por email com token
--   organizacao_config    : flags (distribuição automática, etc.)
--
-- Domínio comercial:
--   profiles  : perfil estendido do usuário (responsável)
--   leads     : todo lead do funil (base_bruta → base_qualificada → pipeline → arquivo)
--   ligacoes  : registro de cada tentativa telefônica
--   cadencia  : cada toque D0/D3/D7/D11/D16/D30 como linha
--   raio_x    : diagnósticos ofertados/pagos
--   newsletter: opt-in de nutrição
--   meta_semanal / meta_mensal : metas globais da org
--   lead_evento : timeline cronológica (auditoria)
-- ============================================================

-- Limpeza para re-execução segura em ambiente de DEV (comente em prod)
drop view  if exists public.v_kpis_por_responsavel cascade;
drop view  if exists public.v_kpis_globais         cascade;
drop view  if exists public.v_leads_enriched       cascade;
drop table if exists public.lead_evento          cascade;
drop table if exists public.cadencia             cascade;
drop table if exists public.ligacoes             cascade;
drop table if exists public.raio_x               cascade;
drop table if exists public.newsletter           cascade;
drop table if exists public.meta_semanal         cascade;
drop table if exists public.meta_mensal          cascade;
drop table if exists public.meta_individual      cascade;
drop table if exists public.vendedor_segmento    cascade;
drop table if exists public.convites             cascade;
drop table if exists public.leads                cascade;
drop table if exists public.organizacao_config   cascade;
drop table if exists public.membros_organizacao  cascade;
drop table if exists public.profiles             cascade;
drop table if exists public.organizacoes         cascade;

-- ============================================================
-- ORGANIZAÇÕES
-- ============================================================
create table public.organizacoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text unique not null,
  owner_id    uuid references auth.users(id) on delete set null,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.organizacoes is 'Workspaces isolados. Cada org tem seu próprio funil/base.';

-- ============================================================
-- PROFILES (estende auth.users)
-- ============================================================
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text        not null,
  role                 text        not null check (role in ('gestor','comercial','sdr')),
  email                text        unique not null,
  home_organizacao_id  uuid        references public.organizacoes(id) on delete set null,
  ativo                boolean     not null default true,
  created_at           timestamptz not null default now()
);

comment on column public.profiles.role is 'gestor = pode pertencer a múltiplas orgs; comercial/sdr = uma só.';
comment on column public.profiles.home_organizacao_id is 'Org default do usuário ao logar.';

-- ============================================================
-- MEMBROS_ORGANIZACAO — relação N-N
-- ============================================================
create table public.membros_organizacao (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id)     on delete cascade,
  role            text not null check (role in ('gestor','comercial','sdr')),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organizacao_id, profile_id)
);
create index idx_membros_profile on public.membros_organizacao(profile_id) where ativo = true;
create index idx_membros_org     on public.membros_organizacao(organizacao_id) where ativo = true;

comment on table public.membros_organizacao is 'Quem é membro de qual org. Gestor pode ter N rows; vendedor só 1.';

-- ============================================================
-- CONFIG por ORG (regra de distribuição etc.)
-- ============================================================
create table public.organizacao_config (
  organizacao_id           uuid primary key references public.organizacoes(id) on delete cascade,
  distribuicao_automatica  boolean not null default false,
  distribuicao_estrategia  text    not null default 'segmento'
                            check (distribuicao_estrategia in ('segmento','round_robin','manual')),
  updated_at               timestamptz not null default now()
);

-- ============================================================
-- VENDEDOR_SEGMENTO — territórios
-- ============================================================
create table public.vendedor_segmento (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id)     on delete cascade,
  segmento        text not null,
  created_at      timestamptz not null default now(),
  unique (organizacao_id, profile_id, segmento)
);
create index idx_segmento_org on public.vendedor_segmento(organizacao_id, segmento);

comment on table public.vendedor_segmento is 'Mapeia qual vendedor cobre qual segmento (usado na distribuição automática).';

-- ============================================================
-- METAS INDIVIDUAIS por vendedor
-- ============================================================
create table public.meta_individual (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id)     on delete cascade,
  periodo_tipo    text not null check (periodo_tipo in ('semana','mes')),
  periodo_inicio  date not null,
  periodo_fim     date not null,
  meta_leads      int  default 0,
  meta_raiox      int  default 0,
  meta_calls      int  default 0,
  meta_props      int  default 0,
  meta_fech       int  default 0,
  created_at      timestamptz not null default now(),
  unique (organizacao_id, profile_id, periodo_tipo, periodo_inicio)
);
create index idx_meta_ind_periodo on public.meta_individual(organizacao_id, periodo_tipo, periodo_inicio);

-- ============================================================
-- CONVITES
-- ============================================================
create table public.convites (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('gestor','comercial','sdr')),
  token           uuid not null unique default gen_random_uuid(),
  convidado_por   uuid references public.profiles(id) on delete set null,
  expira_em       timestamptz not null default (now() + interval '7 days'),
  aceito_em       timestamptz,
  created_at      timestamptz not null default now()
);
create index idx_convites_email on public.convites(email) where aceito_em is null;
create index idx_convites_org   on public.convites(organizacao_id);

-- ============================================================
-- LEADS — fonte única do funil (agora com organizacao_id)
-- ============================================================
create table public.leads (
  id                bigserial primary key,
  organizacao_id    uuid not null references public.organizacoes(id) on delete cascade,
  legacy_id         text,
  is_demo           boolean not null default false,

  nome              text,
  empresa           text,
  cargo             text,
  email             text,
  whatsapp          text,
  linkedin          text,
  instagram         text,
  segmento          text,
  cidade_uf         text,
  site              text,

  responsavel_id    uuid references public.profiles(id) on delete set null,
  motion            text,
  fonte             text,
  temperatura       text check (temperatura in ('Frio','Morno','Quente')) default 'Frio',
  prioridade        text check (prioridade in ('A','B','C')) default 'B',

  funnel_stage      text not null
                      check (funnel_stage in ('base_bruta','base_qualificada','pipeline','arquivado'))
                      default 'base_bruta',

  crm_stage         text check (crm_stage in (
                      'Prospecção','Qualificado','Raio-X Ofertado','Raio-X Feito',
                      'Call Marcada','Diagnóstico Pago','Proposta','Fechado','Perdido','Nutrição'
                    )),

  decisor           boolean,
  fit_icp           boolean,
  dor_principal     text,
  observacoes       text,
  canal_principal   text,

  data_entrada           date not null default current_date,
  data_primeiro_contato  date,
  data_ultimo_toque      date,
  data_proxima_acao      date,
  proxima_acao           text,

  valor_potencial   numeric(12,2) default 0,
  probabilidade     numeric(5,4)  default 0 check (probabilidade between 0 and 1),
  receita_ponderada numeric(12,2) generated always as
                      (coalesce(valor_potencial,0) * coalesce(probabilidade,0)) stored,

  data_proposta     date,
  data_fechamento   date,

  newsletter_optin  boolean default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_leads_org          on public.leads(organizacao_id);
create index idx_leads_responsavel  on public.leads(responsavel_id);
create index idx_leads_funnel_stage on public.leads(organizacao_id, funnel_stage);
create index idx_leads_crm_stage    on public.leads(organizacao_id, crm_stage);
create index idx_leads_proxima_acao on public.leads(data_proxima_acao);

-- ============================================================
-- LIGAÇÕES
-- ============================================================
create table public.ligacoes (
  id                bigserial primary key,
  organizacao_id    uuid not null references public.organizacoes(id) on delete cascade,
  lead_id           bigint not null references public.leads(id) on delete cascade,
  responsavel_id    uuid   references public.profiles(id) on delete set null,
  tipo_ligacao      text,
  tentativa         int default 1,
  data_hora         timestamptz not null default now(),
  duracao_min       int default 0,
  atendeu           boolean,
  resultado         text,
  call_gerou_raio_x boolean default false,
  agendou_call      boolean default false,
  resumo            text,
  observacoes       text,
  created_at        timestamptz not null default now()
);
create index idx_ligacoes_lead on public.ligacoes(lead_id);
create index idx_ligacoes_org  on public.ligacoes(organizacao_id, data_hora desc);

-- ============================================================
-- CADÊNCIA
-- ============================================================
create table public.cadencia (
  id                bigserial primary key,
  organizacao_id    uuid not null references public.organizacoes(id) on delete cascade,
  lead_id           bigint not null references public.leads(id) on delete cascade,
  passo             text   not null check (passo in ('D0','D3','D7','D11','D16','D30')),
  canal             text,
  objetivo          text,
  data_prevista     date,
  data_executada    date,
  status            text not null default 'pendente'
                      check (status in ('pendente','enviado','respondido','pular','removido')),
  mensagem_enviada  text,
  observacoes       text,
  created_at        timestamptz not null default now(),
  unique (lead_id, passo)
);
create index idx_cadencia_lead on public.cadencia(lead_id);
create index idx_cadencia_data on public.cadencia(data_prevista) where status = 'pendente';
create index idx_cadencia_org  on public.cadencia(organizacao_id);

-- ============================================================
-- RAIO-X
-- ============================================================
create table public.raio_x (
  id                        bigserial primary key,
  organizacao_id            uuid not null references public.organizacoes(id) on delete cascade,
  lead_id                   bigint not null references public.leads(id) on delete cascade,
  responsavel_id            uuid references public.profiles(id) on delete set null,
  data_oferta               date not null default current_date,
  preco_lista               numeric(10,2) default 97,
  voucher_desconto          numeric(10,2) default 0,
  gratuito                  boolean default false,
  preco_final               numeric(10,2) generated always as
                              (case when gratuito then 0
                                    else coalesce(preco_lista,0) - coalesce(voucher_desconto,0)
                               end) stored,
  pago                      boolean default false,
  data_pagamento            date,
  score                     int check (score between 0 and 100),
  perda_anual_estimada      numeric(12,2),
  nivel                     text check (nivel in ('Alto','Médio','Baixo','Pendente')) default 'Pendente',
  saida_recomendada         text,
  call_revisao              boolean default false,
  data_call                 date,
  diagnostico_pago_sugerido text,
  observacoes               text,
  created_at                timestamptz not null default now()
);
create index idx_raiox_lead on public.raio_x(lead_id);
create index idx_raiox_org  on public.raio_x(organizacao_id);

-- ============================================================
-- NEWSLETTER
-- ============================================================
create table public.newsletter (
  id                      bigserial primary key,
  organizacao_id          uuid not null references public.organizacoes(id) on delete cascade,
  lead_id                 bigint references public.leads(id) on delete cascade,
  responsavel_id          uuid references public.profiles(id) on delete set null,
  optin                   boolean not null default true,
  data_entrada            date not null default current_date,
  ultima_edicao_enviada   date,
  proxima_edicao_sugerida date,
  status                  text not null default 'Ativo'
                            check (status in ('Ativo','Pausado','Remover')),
  cta_provavel            text,
  observacoes             text,
  created_at              timestamptz not null default now()
);
create index idx_newsletter_lead on public.newsletter(lead_id);
create index idx_newsletter_org  on public.newsletter(organizacao_id);

-- ============================================================
-- METAS GLOBAIS DA ORG (diferente de meta_individual)
-- ============================================================
create table public.meta_semanal (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  inicio          date not null,
  fim             date not null,
  meta_leads      int default 15,
  meta_resp       int default 4,
  meta_raiox      int default 2,
  meta_calls      int default 2,
  meta_props      int default 1,
  meta_fech       int default 1,
  unique (organizacao_id, inicio)
);

create table public.meta_mensal (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  inicio          date not null,
  fim             date not null,
  rotulo          text,
  meta_leads      int default 60,
  meta_raiox      int default 8,
  meta_calls      int default 6,
  meta_props      int default 3,
  meta_fech       int default 1,
  unique (organizacao_id, inicio)
);

-- ============================================================
-- TIMELINE
-- ============================================================
create table public.lead_evento (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  ator_id         uuid references public.profiles(id) on delete set null,
  tipo            text not null,
  payload         jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index idx_evento_lead on public.lead_evento(lead_id, created_at desc);
create index idx_evento_org  on public.lead_evento(organizacao_id);

-- ============================================================
-- TRIGGERS — updated_at
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_leads_updated
before update on public.leads
for each row execute function public.touch_updated_at();

-- ============================================================
-- VIEWS
-- ============================================================
create or replace view public.v_leads_enriched as
select
  l.*,
  (current_date - coalesce(l.data_ultimo_toque, l.data_entrada))::int as dias_sem_tocar,
  case
    when l.data_proxima_acao is null            then 'sem_acao'
    when l.data_proxima_acao <  current_date    then 'vencida'
    when l.data_proxima_acao =  current_date    then 'hoje'
    when l.data_proxima_acao <= current_date+1  then 'amanha'
    when l.data_proxima_acao <= current_date+7  then 'esta_semana'
    else 'futuro'
  end as urgencia,
  p.display_name as responsavel_nome
from public.leads l
left join public.profiles p on p.id = l.responsavel_id;

create or replace view public.v_kpis_globais as
select
  l.organizacao_id,
  count(*) filter (where l.funnel_stage='pipeline'
                   and l.crm_stage not in ('Fechado','Perdido','Nutrição')) as leads_ativos,
  count(*) filter (where l.crm_stage='Qualificado')   as qualificados,
  count(*) filter (where l.crm_stage='Raio-X Feito')  as raiox_feito,
  count(*) filter (where l.crm_stage='Proposta')      as propostas,
  count(*) filter (where l.crm_stage='Fechado')       as fechados,
  count(*) filter (where l.data_proxima_acao < current_date
                   and l.crm_stage not in ('Fechado','Perdido')) as acoes_vencidas,
  coalesce(sum(l.receita_ponderada) filter (where l.crm_stage not in ('Fechado','Perdido')), 0) as pipeline_ponderado_aberto,
  coalesce(sum(l.valor_potencial)   filter (where l.crm_stage = 'Fechado'), 0)                  as receita_fechada
from public.leads l
group by l.organizacao_id;

create or replace view public.v_kpis_por_responsavel as
select
  m.organizacao_id,
  p.id,
  p.display_name,
  m.role,
  count(l.*) filter (where l.funnel_stage='pipeline'
                     and l.crm_stage not in ('Fechado','Perdido','Nutrição')) as leads_ativos,
  count(l.*) filter (where l.crm_stage='Qualificado')  as qualificados,
  count(l.*) filter (where l.crm_stage='Raio-X Feito') as raiox_feito,
  count(l.*) filter (where l.crm_stage='Proposta')     as propostas,
  count(l.*) filter (where l.crm_stage='Fechado')      as fechados,
  count(l.*) filter (where l.data_proxima_acao = current_date
                     and l.crm_stage not in ('Fechado','Perdido')) as acoes_hoje,
  count(l.*) filter (where l.data_proxima_acao < current_date
                     and l.crm_stage not in ('Fechado','Perdido')) as acoes_vencidas
from public.membros_organizacao m
join public.profiles p on p.id = m.profile_id
left join public.leads l
  on l.responsavel_id = p.id
 and l.organizacao_id = m.organizacao_id
where m.ativo = true
group by m.organizacao_id, p.id, p.display_name, m.role;

-- ============================================================
-- HELPERS DE AUTORIZAÇÃO
-- ============================================================
-- retorna o conjunto de orgs ativas em que o usuário logado é membro
create or replace function public.orgs_do_usuario()
returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select organizacao_id
  from public.membros_organizacao
  where profile_id = auth.uid() and ativo = true;
$$;

-- verifica se o usuário logado é gestor em uma org específica
create or replace function public.is_gestor_in_org(_org uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists(
    select 1
    from public.membros_organizacao m
    where m.profile_id = auth.uid()
      and m.organizacao_id = _org
      and m.ativo = true
      and m.role = 'gestor'
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- Estratégia:
--   • Tabelas de dados (leads, ligacoes, etc.): RW se organizacao_id ∈ orgs_do_usuario()
--   • Tabelas de governança (membros, convites, config): leitura para qualquer membro,
--     escrita só para gestor da org
--   • profiles: vê quem compartilha org com você + próprio perfil
--   • organizacoes: vê orgs em que você é membro; cria livre; update só owner/gestor
-- ============================================================
alter table public.organizacoes        enable row level security;
alter table public.profiles            enable row level security;
alter table public.membros_organizacao enable row level security;
alter table public.organizacao_config  enable row level security;
alter table public.vendedor_segmento   enable row level security;
alter table public.meta_individual     enable row level security;
alter table public.convites            enable row level security;
alter table public.leads               enable row level security;
alter table public.ligacoes            enable row level security;
alter table public.cadencia            enable row level security;
alter table public.raio_x              enable row level security;
alter table public.newsletter          enable row level security;
alter table public.meta_semanal        enable row level security;
alter table public.meta_mensal         enable row level security;
alter table public.lead_evento         enable row level security;

-- organizacoes
create policy org_select_member on public.organizacoes
  for select to authenticated
  using (id in (select public.orgs_do_usuario()));

create policy org_insert_self on public.organizacoes
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy org_update_gestor on public.organizacoes
  for update to authenticated
  using (public.is_gestor_in_org(id))
  with check (public.is_gestor_in_org(id));

-- profiles: seu próprio perfil + membros da sua org
create policy profiles_select_own_or_sameorg on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.membros_organizacao m1
      join public.membros_organizacao m2 on m1.organizacao_id = m2.organizacao_id
      where m1.profile_id = auth.uid() and m1.ativo = true
        and m2.profile_id = profiles.id and m2.ativo = true
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- membros_organizacao: todos os membros da org podem ler; gestor pode escrever
create policy membros_select on public.membros_organizacao
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy membros_insert_gestor on public.membros_organizacao
  for insert to authenticated
  with check (public.is_gestor_in_org(organizacao_id));

create policy membros_update_gestor on public.membros_organizacao
  for update to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

create policy membros_delete_gestor on public.membros_organizacao
  for delete to authenticated
  using (public.is_gestor_in_org(organizacao_id));

-- organizacao_config
create policy orgcfg_select on public.organizacao_config
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy orgcfg_write_gestor on public.organizacao_config
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

-- vendedor_segmento
create policy segmento_select on public.vendedor_segmento
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy segmento_write_gestor on public.vendedor_segmento
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

-- meta_individual
create policy metaind_select on public.meta_individual
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy metaind_write_gestor on public.meta_individual
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

-- convites
create policy convites_select on public.convites
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy convites_write_gestor on public.convites
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

-- tabelas de dados (mesmo padrão)
do $$
declare t text;
begin
  for t in select unnest(array[
    'leads','ligacoes','cadencia','raio_x','newsletter',
    'meta_semanal','meta_mensal','lead_evento'
  ]) loop
    execute format(
      'create policy %I on public.%I
       for all to authenticated
       using (organizacao_id in (select public.orgs_do_usuario()))
       with check (organizacao_id in (select public.orgs_do_usuario()));',
      t || '_org_rw', t);
  end loop;
end $$;

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
