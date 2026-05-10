-- =============================================================================
-- Health score materializado (item 2 do polish do flywheel)
--
-- A view v_health_score (P3) é cálculo on-demand — bom até ~10k clientes,
-- ruim acima disso. Esta migration:
--
-- 1. Tabela `health_score_cache` com mesma estrutura da view
-- 2. Função `refresh_health_scores(_org_id uuid default null)` que
--    recalcula. Suporta refresh por org (chamada manual após mudanças
--    grandes) ou full refresh (cron).
-- 3. View v_health_score reescrita pra preferir o cache (com fallback
--    pro cálculo on-demand quando cache vazio)
-- 4. Cron diário 03:00 UTC chama refresh full
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela cache
-- -----------------------------------------------------------------------------
create table if not exists public.health_score_cache (
  organizacao_id     uuid not null references public.organizacoes(id) on delete cascade,
  lead_id            bigint not null references public.leads(id) on delete cascade,
  lead_empresa       text,
  lead_nome          text,
  lead_responsavel_id uuid,
  data_fechamento    date,
  valor_potencial    numeric(12,2),
  dias_sem_interacao int not null,
  pts_recencia       int not null,
  pts_nps            int not null,
  pts_onboarding     int not null,
  pts_indicacao      int not null,
  ultimo_nps_score   int,
  indicacoes_dadas   int not null,
  health_score       int not null,
  categoria          text not null check (categoria in ('saudavel', 'atencao', 'em_risco')),
  computed_at        timestamptz not null default now(),
  primary key (organizacao_id, lead_id)
);

create index idx_health_cache_org_categoria on public.health_score_cache(organizacao_id, categoria);
create index idx_health_cache_score on public.health_score_cache(organizacao_id, health_score);

comment on table public.health_score_cache is
  'Materialização do v_health_score (P3). Refresh diário via cron 03:00 UTC. Acelera consultas em orgs com 10k+ clientes Fechados. v_health_score lê daqui automaticamente.';

-- RLS — leitura padrão multi-tenant; escrita só service role
alter table public.health_score_cache enable row level security;

create policy health_cache_select on public.health_score_cache
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

-- Sem policies de insert/update/delete = só service role (refresh function é SECURITY DEFINER)

-- -----------------------------------------------------------------------------
-- 2. Função: refresh_health_scores(org_id default null)
--
-- Se org_id fornecido: recalcula só pra ela (chamada após mudanças grandes
-- como import em massa, batch update). Se NULL: full refresh.
--
-- Estratégia: DELETE rows antigas + INSERT recalculadas. Atomicamente.
-- -----------------------------------------------------------------------------
create or replace function public.refresh_health_scores(_org_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if _org_id is null then
    -- Full refresh
    truncate public.health_score_cache;
  else
    delete from public.health_score_cache where organizacao_id = _org_id;
  end if;

  with fechados as (
    select
      l.id, l.organizacao_id, l.empresa, l.nome, l.responsavel_id,
      l.data_fechamento, l.data_ultimo_toque, l.valor_potencial
    from public.leads l
    where l.crm_stage = 'Fechado'
      and (_org_id is null or l.organizacao_id = _org_id)
  ),
  recencia as (
    select
      f.id as lead_id, f.organizacao_id,
      coalesce(
        (current_date - greatest(
          f.data_ultimo_toque,
          (select max(le.created_at::date) from public.lead_evento le where le.lead_id = f.id),
          (select max(li.data_hora::date) from public.ligacoes li where li.lead_id = f.id)
        ))::int,
        999
      ) as dias_sem_interacao
    from fechados f
  ),
  nps_ultimo as (
    select distinct on (lead_id) lead_id, score
    from public.nps_responses
    where score is not null
    order by lead_id, respondido_em desc nulls last
  ),
  onb as (
    select
      c.lead_id,
      case
        when count(i.id) = 0 then null
        else round(100.0 * count(i.id) filter (where i.status = 'concluido') / count(i.id))
      end as pct_concluido
    from public.onboarding_checklist c
    left join public.onboarding_item i on i.checklist_id = c.id
    group by c.lead_id
  ),
  indicacoes_dadas as (
    select embaixador_lead_id as lead_id, count(*) as qtd
    from public.indicacoes
    where embaixador_lead_id is not null
    group by embaixador_lead_id
  ),
  computed as (
    select
      f.organizacao_id, f.id as lead_id, f.empresa, f.nome, f.responsavel_id,
      f.data_fechamento, f.valor_potencial,
      r.dias_sem_interacao,
      case
        when r.dias_sem_interacao <= 14 then 100
        when r.dias_sem_interacao >= 90 then 0
        else round(100 - (r.dias_sem_interacao - 14) * 100.0 / (90 - 14))
      end::int as pts_recencia,
      (case when nps.score is null then 50 else nps.score * 10 end)::int as pts_nps,
      coalesce(onb.pct_concluido, 50)::int as pts_onboarding,
      (case
        when ind.qtd is null or ind.qtd = 0 then 50
        when ind.qtd >= 3 then 100
        else 50 + (ind.qtd * 25)
      end)::int as pts_indicacao,
      nps.score as ultimo_nps_score,
      coalesce(ind.qtd, 0) as indicacoes_dadas
    from fechados f
    join recencia r on r.lead_id = f.id
    left join nps_ultimo nps on nps.lead_id = f.id
    left join onb on onb.lead_id = f.id
    left join indicacoes_dadas ind on ind.lead_id = f.id
  )
  insert into public.health_score_cache (
    organizacao_id, lead_id, lead_empresa, lead_nome, lead_responsavel_id,
    data_fechamento, valor_potencial,
    dias_sem_interacao, pts_recencia, pts_nps, pts_onboarding, pts_indicacao,
    ultimo_nps_score, indicacoes_dadas, health_score, categoria
  )
  select
    organizacao_id, lead_id, empresa, nome, responsavel_id,
    data_fechamento, valor_potencial,
    dias_sem_interacao, pts_recencia, pts_nps, pts_onboarding, pts_indicacao,
    ultimo_nps_score, indicacoes_dadas,
    -- Score final ponderado
    round(pts_recencia * 0.30 + pts_nps * 0.30 + pts_onboarding * 0.20 + pts_indicacao * 0.20)::int as health_score,
    case
      when round(pts_recencia * 0.30 + pts_nps * 0.30 + pts_onboarding * 0.20 + pts_indicacao * 0.20) >= 70 then 'saudavel'
      when round(pts_recencia * 0.30 + pts_nps * 0.30 + pts_onboarding * 0.20 + pts_indicacao * 0.20) >= 40 then 'atencao'
      else 'em_risco'
    end as categoria
  from computed;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.refresh_health_scores(uuid) is
  'Recalcula health_score_cache. Sem args: full refresh (cron diário). Com org_id: refresh só dessa org (chamada manual após mudanças grandes). Retorna # de rows materializadas.';

-- -----------------------------------------------------------------------------
-- 3. Reescreve v_health_score pra ler do cache (com fallback)
--
-- Comportamento:
--   - Se cache tem rows pra a org: retorna direto (rápido)
--   - Se cache vazio (org nova ou pré-cron): cálculo on-demand igual antes
-- -----------------------------------------------------------------------------
drop view if exists public.v_health_score cascade;
create view public.v_health_score
with (security_invoker = true) as
with orgs_com_cache as (
  select distinct organizacao_id from public.health_score_cache
)
-- Dados do cache (rápido)
select
  organizacao_id, lead_id, lead_empresa, lead_nome, lead_responsavel_id,
  data_fechamento, valor_potencial,
  dias_sem_interacao, pts_recencia, pts_nps, pts_onboarding, pts_indicacao,
  ultimo_nps_score, indicacoes_dadas, health_score, categoria
from public.health_score_cache
union all
-- Fallback: orgs sem cache (recalcula on-demand — pode ser org nova ou pré-cron)
select
  f.organizacao_id, f.id as lead_id, f.empresa as lead_empresa, f.nome as lead_nome, f.responsavel_id as lead_responsavel_id,
  f.data_fechamento, f.valor_potencial,
  r.dias_sem_interacao,
  case
    when r.dias_sem_interacao <= 14 then 100
    when r.dias_sem_interacao >= 90 then 0
    else round(100 - (r.dias_sem_interacao - 14) * 100.0 / (90 - 14))
  end::int as pts_recencia,
  (case when nps.score is null then 50 else nps.score * 10 end)::int as pts_nps,
  coalesce(onb.pct_concluido, 50)::int as pts_onboarding,
  (case
    when ind.qtd is null or ind.qtd = 0 then 50
    when ind.qtd >= 3 then 100
    else 50 + (ind.qtd * 25)
  end)::int as pts_indicacao,
  nps.score as ultimo_nps_score,
  coalesce(ind.qtd, 0) as indicacoes_dadas,
  round(
    (case
       when r.dias_sem_interacao <= 14 then 100
       when r.dias_sem_interacao >= 90 then 0
       else 100 - (r.dias_sem_interacao - 14) * 100.0 / (90 - 14)
     end) * 0.30
    + (case when nps.score is null then 50 else nps.score * 10 end) * 0.30
    + coalesce(onb.pct_concluido, 50) * 0.20
    + (case
         when ind.qtd is null or ind.qtd = 0 then 50
         when ind.qtd >= 3 then 100
         else 50 + (ind.qtd * 25)
       end) * 0.20
  )::int as health_score,
  case
    when round(
      (case when r.dias_sem_interacao <= 14 then 100 when r.dias_sem_interacao >= 90 then 0
            else 100 - (r.dias_sem_interacao - 14) * 100.0 / (90 - 14) end) * 0.30
      + (case when nps.score is null then 50 else nps.score * 10 end) * 0.30
      + coalesce(onb.pct_concluido, 50) * 0.20
      + (case when ind.qtd is null or ind.qtd = 0 then 50
              when ind.qtd >= 3 then 100
              else 50 + (ind.qtd * 25) end) * 0.20
    ) >= 70 then 'saudavel'
    when round(
      (case when r.dias_sem_interacao <= 14 then 100 when r.dias_sem_interacao >= 90 then 0
            else 100 - (r.dias_sem_interacao - 14) * 100.0 / (90 - 14) end) * 0.30
      + (case when nps.score is null then 50 else nps.score * 10 end) * 0.30
      + coalesce(onb.pct_concluido, 50) * 0.20
      + (case when ind.qtd is null or ind.qtd = 0 then 50
              when ind.qtd >= 3 then 100
              else 50 + (ind.qtd * 25) end) * 0.20
    ) >= 40 then 'atencao'
    else 'em_risco'
  end as categoria
from public.leads f
join lateral (
  select coalesce(
    (current_date - greatest(
      f.data_ultimo_toque,
      (select max(le.created_at::date) from public.lead_evento le where le.lead_id = f.id),
      (select max(li.data_hora::date) from public.ligacoes li where li.lead_id = f.id)
    ))::int, 999
  ) as dias_sem_interacao
) r on true
left join lateral (
  select score from public.nps_responses where lead_id = f.id and score is not null
  order by respondido_em desc nulls last limit 1
) nps on true
left join lateral (
  select case when count(i.id) = 0 then null
              else round(100.0 * count(i.id) filter (where i.status = 'concluido') / count(i.id))
         end as pct_concluido
  from public.onboarding_checklist c
  left join public.onboarding_item i on i.checklist_id = c.id
  where c.lead_id = f.id
) onb on true
left join lateral (
  select count(*) as qtd from public.indicacoes
  where embaixador_lead_id = f.id
) ind on true
where f.crm_stage = 'Fechado'
  and f.organizacao_id not in (select organizacao_id from orgs_com_cache);

-- v_health_resumo já existia — recriar pra apontar pro novo v_health_score
drop view if exists public.v_health_resumo cascade;
create view public.v_health_resumo
with (security_invoker = true) as
select
  organizacao_id,
  count(*)                                              as total_fechados,
  count(*) filter (where categoria = 'saudavel')        as saudaveis,
  count(*) filter (where categoria = 'atencao')         as atencao,
  count(*) filter (where categoria = 'em_risco')        as em_risco,
  round(avg(health_score)::numeric, 1)                  as score_medio,
  coalesce(sum(valor_potencial) filter (where categoria = 'em_risco'), 0) as arr_em_risco
from public.v_health_score
group by organizacao_id;

-- -----------------------------------------------------------------------------
-- 4. Cron diário 03:00 UTC
-- -----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('health-score-refresh');
exception when others then null;
end $$;

select cron.schedule(
  'health-score-refresh',
  '0 3 * * *',
  $$ select public.refresh_health_scores(null); $$
);

-- -----------------------------------------------------------------------------
-- 5. Primeira população (chama agora pra ter dados imediatos)
-- -----------------------------------------------------------------------------
select public.refresh_health_scores();
