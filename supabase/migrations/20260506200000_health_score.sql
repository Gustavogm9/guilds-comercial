-- =============================================================================
-- Health Score / Churn risk
--
-- Fase P3 do flywheel completo. Calcula um score 0-100 por cliente fechado
-- pra alertar churn antes que aconteça.
--
-- Composição (alinhada com docs/FLYWHEEL.md item P3):
--   30% Recência: dias desde a última interação (ligação, email, evento)
--                 100 pts até 14d, decai linear até 0 em 90d.
--   30% NPS:     score do último NPS respondido (0=0, 6=60, 10=100).
--                Se sem NPS: 50 (neutro).
--   20% Onboarding: % de items concluídos no checklist (0-100 direto).
--                   Se sem checklist: 50.
--   20% Indicação:  cliente que indicou recebe boost (1+ indicação = 100).
--                   Se zero indicações: 50.
--
-- Decisão: faltando billing tracking, troquei "pagamento em dia" por
-- "indicação dada" — sinal forte de advocacy é também sinal de saúde.
--
-- Score < 40 = alerta vermelho (em risco de churn)
-- Score 40-69 = atenção
-- Score 70+ = saudável
--
-- Implementação: VIEW (não tabela). Cálculo on-demand. Performance OK até
-- ~10k clientes fechados; depois disso, materializar como tabela com refresh
-- via cron (item de tech debt futuro).
-- =============================================================================

drop view if exists public.v_health_score cascade;

create view public.v_health_score
with (security_invoker = true) as
with fechados as (
  select
    l.id,
    l.organizacao_id,
    l.empresa,
    l.nome,
    l.responsavel_id,
    l.data_fechamento,
    l.data_ultimo_toque,
    l.valor_potencial
  from public.leads l
  where l.crm_stage = 'Fechado'
),
recencia as (
  -- Calcula dias desde a última interação. Considera lead_evento, ligacoes, e data_ultimo_toque do lead.
  select
    f.id as lead_id,
    f.organizacao_id,
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
  select distinct on (lead_id)
    lead_id, score
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
)
select
  f.organizacao_id,
  f.id                                 as lead_id,
  f.empresa                            as lead_empresa,
  f.nome                               as lead_nome,
  f.responsavel_id                     as lead_responsavel_id,
  f.data_fechamento,
  f.valor_potencial,
  r.dias_sem_interacao,
  -- Componentes (cada um 0-100)
  case
    when r.dias_sem_interacao <= 14 then 100
    when r.dias_sem_interacao >= 90 then 0
    else round(100 - (r.dias_sem_interacao - 14) * 100.0 / (90 - 14))
  end::int                             as pts_recencia,
  case
    when nps.score is null then 50
    else (nps.score * 10)
  end::int                             as pts_nps,
  coalesce(onb.pct_concluido, 50)::int as pts_onboarding,
  case
    when ind.qtd is null or ind.qtd = 0 then 50
    when ind.qtd >= 3 then 100
    else 50 + (ind.qtd * 25)
  end::int                             as pts_indicacao,
  nps.score                            as ultimo_nps_score,
  coalesce(ind.qtd, 0)                 as indicacoes_dadas,
  -- Score final ponderado (0-100)
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
  )::int                               as health_score,
  -- Categoria derivada
  case
    when round(
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
    ) >= 70 then 'saudavel'
    when round(
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
    ) >= 40 then 'atencao'
    else 'em_risco'
  end                                  as categoria
from fechados f
join recencia r on r.lead_id = f.id
left join nps_ultimo nps on nps.lead_id = f.id
left join onb on onb.lead_id = f.id
left join indicacoes_dadas ind on ind.lead_id = f.id;

comment on view public.v_health_score is
  'Health score 0-100 por cliente fechado. Composto por recência (30%), NPS (30%), onboarding (20%), indicações (20%). Categoria: saudavel/atencao/em_risco.';

-- View resumo por org pra dashboard
drop view if exists public.v_health_resumo;
create view public.v_health_resumo
with (security_invoker = true) as
select
  organizacao_id,
  count(*)                                              as total_fechados,
  count(*) filter (where categoria = 'saudavel')        as saudaveis,
  count(*) filter (where categoria = 'atencao')         as atencao,
  count(*) filter (where categoria = 'em_risco')        as em_risco,
  round(avg(health_score)::numeric, 1)                  as score_medio,
  -- ARR em risco: soma do valor_potencial dos clientes em_risco
  coalesce(sum(valor_potencial) filter (where categoria = 'em_risco'), 0) as arr_em_risco
from public.v_health_score
group by organizacao_id;

comment on view public.v_health_resumo is
  'Resumo de health score por organização: contagem por categoria + score médio + ARR em risco.';
