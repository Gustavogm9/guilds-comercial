-- =============================================================================
-- Analytics de uso do flywheel
--
-- Pergunta-chave do gestor: "meu time tá usando o flywheel?"
--   - Quantos vendedores abriram /flywheel essa semana?
--   - Quantas indicações foram criadas via portal vs manual?
--   - Quantos scripts foram copiados?
--   - Quantas propostas de expansão foram geradas?
--   - Quantos modais de breakdown foram abertos?
--
-- Modelo: tabela flat de eventos. Inserções via server action /lib/actions/track.
-- RLS: cada usuário escreve seu próprio evento; gestor lê os da org.
-- =============================================================================

create table if not exists public.flywheel_events (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  profile_id      uuid references public.profiles(id) on delete set null,
  event_name      text not null check (length(event_name) > 0 and length(event_name) <= 64),
  -- Contexto livre — ex: { lead_id: 123, fonte: 'kanban' }
  properties      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_flywheel_events_org_time
  on public.flywheel_events(organizacao_id, created_at desc);
create index if not exists idx_flywheel_events_name_time
  on public.flywheel_events(event_name, created_at desc);
create index if not exists idx_flywheel_events_profile
  on public.flywheel_events(profile_id);

comment on table public.flywheel_events is
  'Eventos de uso do flywheel (clicks, modais, copy, etc.). Não-PII. Server actions inserem; gestor agrega em /flywheel/uso.';

alter table public.flywheel_events enable row level security;

-- Insert: cada user pode inserir eventos das orgs em que está
drop policy if exists flywheel_events_insert_own on public.flywheel_events;
create policy flywheel_events_insert_own on public.flywheel_events
  for insert to authenticated
  with check (
    organizacao_id in (select public.orgs_do_usuario())
    and (profile_id is null or profile_id = (select auth.uid()))
  );

-- Select: gestor lê todos da org; demais só os próprios
drop policy if exists flywheel_events_select_org on public.flywheel_events;
create policy flywheel_events_select_org on public.flywheel_events
  for select to authenticated
  using (
    organizacao_id in (select public.orgs_do_usuario())
    and (public.is_gestor_in_org(organizacao_id) or profile_id = (select auth.uid()))
  );

-- =============================================================================
-- View agregada: uso do flywheel últimos 30d
-- =============================================================================
create or replace view public.v_flywheel_uso_30d as
select
  organizacao_id,
  event_name,
  count(*)::int as total_eventos,
  count(distinct profile_id)::int as usuarios_distintos,
  count(distinct date_trunc('day', created_at))::int as dias_com_atividade,
  max(created_at) as ultimo_evento_em
from public.flywheel_events
where created_at >= now() - interval '30 days'
group by organizacao_id, event_name;

grant select on public.v_flywheel_uso_30d to authenticated;

comment on view public.v_flywheel_uso_30d is
  'Resumo de eventos do flywheel nos últimos 30 dias por (org, nome_evento). Filtrado por RLS via tabela base.';
