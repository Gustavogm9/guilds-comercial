-- =============================================================
-- MIGRATION v3 — Funil Analytics (conversão, tempo, valor, cohort, perda)
-- Adiciona 5 views que alimentam a tela /funil.
-- Seguras para rodar múltiplas vezes (CREATE OR REPLACE).
-- =============================================================

-- -------------------------------------------------------------
-- 1. v_funil_conversao
--    Snapshot atual do funil. Uma linha por (organizacao_id, responsavel_id, crm_stage).
--    O frontend soma quando filtra por "todo o time".
-- -------------------------------------------------------------
create or replace view public.v_funil_conversao as
select
  l.organizacao_id,
  l.responsavel_id,
  l.crm_stage,
  count(*)::int                        as qtd,
  coalesce(sum(l.valor_potencial), 0)  as valor_aberto,
  coalesce(sum(l.receita_ponderada),0) as valor_weighted
from public.leads l
where l.funnel_stage in ('pipeline', 'arquivado')
  and l.crm_stage is not null
group by l.organizacao_id, l.responsavel_id, l.crm_stage;

-- -------------------------------------------------------------
-- 2. v_tempo_por_etapa
--    Tempo médio (em dias) que leads passam em cada crm_stage.
--    Usa lead_evento.tipo='etapa_alterada' com payload.para=<etapa>.
--    Janela: LAG sobre created_at pega a duração entre transições.
--    A "etapa origem" de cada transição é o LAG(payload.para).
--    Para o primeiro evento de um lead, consideramos que a etapa origem
--    foi 'Prospecção' (entrou no pipeline) e o tempo é (created_at - data_entrada).
-- -------------------------------------------------------------
create or replace view public.v_tempo_por_etapa as
with eventos as (
  select
    le.organizacao_id,
    le.lead_id,
    l.responsavel_id,
    l.data_entrada,
    le.created_at,
    (le.payload->>'para')::text as etapa_destino,
    lag((le.payload->>'para')::text) over w as etapa_origem,
    lag(le.created_at) over w          as tempo_anterior
  from public.lead_evento le
  join public.leads l on l.id = le.lead_id
  where le.tipo = 'etapa_alterada'
    and le.payload ? 'para'
  window w as (partition by le.lead_id order by le.created_at)
),
duracoes as (
  -- Duração em cada etapa de origem (quando o lead saiu dela)
  select
    organizacao_id,
    responsavel_id,
    etapa_origem as crm_stage,
    extract(epoch from (created_at - coalesce(tempo_anterior, data_entrada::timestamptz))) / 86400.0 as dias
  from eventos
  where etapa_origem is not null
  union all
  -- Para o primeiro evento do lead, contabilizar tempo entre data_entrada e a 1ª transição
  -- como tempo na etapa inicial (Prospecção)
  select
    organizacao_id,
    responsavel_id,
    'Prospecção'::text as crm_stage,
    extract(epoch from (created_at - data_entrada::timestamptz)) / 86400.0 as dias
  from eventos
  where tempo_anterior is null
)
select
  organizacao_id,
  responsavel_id,
  crm_stage,
  round(avg(dias)::numeric, 1) as dias_media,
  round(percentile_cont(0.5) within group (order by dias)::numeric, 1) as dias_mediana,
  count(*)::int as amostras
from duracoes
where dias >= 0
group by organizacao_id, responsavel_id, crm_stage;

-- -------------------------------------------------------------
-- 3. v_valor_por_etapa
--    Soma de valor em aberto e weighted por etapa, por responsável.
--    (Complementa v_funil_conversao para queries dedicadas ao valor.)
-- -------------------------------------------------------------
create or replace view public.v_valor_por_etapa as
select
  l.organizacao_id,
  l.responsavel_id,
  l.crm_stage,
  count(*) filter (where l.crm_stage not in ('Fechado','Perdido','Nutrição'))::int as leads_abertos,
  coalesce(sum(l.valor_potencial)   filter (where l.crm_stage not in ('Fechado','Perdido','Nutrição')), 0) as valor_aberto,
  coalesce(sum(l.receita_ponderada) filter (where l.crm_stage not in ('Fechado','Perdido','Nutrição')), 0) as valor_weighted,
  coalesce(sum(l.valor_potencial)   filter (where l.crm_stage = 'Fechado'), 0) as valor_ganho,
  coalesce(sum(l.valor_potencial)   filter (where l.crm_stage = 'Perdido'), 0) as valor_perdido,
  coalesce(avg(l.probabilidade) filter (where l.crm_stage not in ('Fechado','Perdido','Nutrição')), 0) as prob_media
from public.leads l
where l.funnel_stage in ('pipeline', 'arquivado')
  and l.crm_stage is not null
group by l.organizacao_id, l.responsavel_id, l.crm_stage;

-- -------------------------------------------------------------
-- 4. v_cohort_entrada
--    Coortes semanais de entrada no pipeline (leads que sairam da base).
--    Mostra: quantos entraram, quantos seguem abertos, ganhos, perdidos.
-- -------------------------------------------------------------
create or replace view public.v_cohort_entrada as
select
  l.organizacao_id,
  l.responsavel_id,
  date_trunc('week', l.data_entrada)::date as semana,
  count(*)::int as entraram,
  count(*) filter (where l.crm_stage = 'Fechado')::int as ganhos,
  count(*) filter (where l.crm_stage = 'Perdido')::int as perdidos,
  count(*) filter (where l.crm_stage = 'Nutrição')::int as nutricao,
  count(*) filter (where l.crm_stage not in ('Fechado','Perdido','Nutrição') and l.funnel_stage = 'pipeline')::int as em_aberto,
  coalesce(sum(l.valor_potencial) filter (where l.crm_stage = 'Fechado'), 0) as receita_ganha,
  -- tempo médio de fechamento (ganho ou perdido) em dias
  round(avg(
    case when l.data_fechamento is not null
         then (l.data_fechamento - l.data_entrada)::numeric
    end
  )::numeric, 1) as dias_para_fechar
from public.leads l
where l.funnel_stage in ('pipeline','arquivado')
  and l.data_entrada >= (current_date - interval '180 days')
group by l.organizacao_id, l.responsavel_id, date_trunc('week', l.data_entrada);

-- -------------------------------------------------------------
-- 5. v_motivos_perda
--    Ranking de motivos de perda extraídos de lead_evento.tipo='arquivado'.
--    Também inclui qualquer lead com crm_stage='Perdido' via lookup no último evento.
-- -------------------------------------------------------------
create or replace view public.v_motivos_perda as
with ultimo_motivo as (
  select
    le.organizacao_id,
    le.lead_id,
    (le.payload->>'motivo')::text as motivo,
    row_number() over (partition by le.lead_id order by le.created_at desc) as rn
  from public.lead_evento le
  where le.tipo in ('arquivado', 'perdido')
    and le.payload ? 'motivo'
    and nullif(le.payload->>'motivo', '') is not null
)
select
  l.organizacao_id,
  l.responsavel_id,
  coalesce(nullif(trim(um.motivo), ''), 'Não informado') as motivo,
  count(*)::int as qtd,
  coalesce(sum(l.valor_potencial), 0) as valor_perdido
from public.leads l
left join ultimo_motivo um
  on um.lead_id = l.id and um.rn = 1
where l.crm_stage = 'Perdido'
group by l.organizacao_id, l.responsavel_id, coalesce(nullif(trim(um.motivo), ''), 'Não informado');

-- -------------------------------------------------------------
-- Grants (RLS passa pela tabela base leads/lead_evento)
-- -------------------------------------------------------------
grant select on public.v_funil_conversao to authenticated;
grant select on public.v_tempo_por_etapa to authenticated;
grant select on public.v_valor_por_etapa to authenticated;
grant select on public.v_cohort_entrada  to authenticated;
grant select on public.v_motivos_perda   to authenticated;
