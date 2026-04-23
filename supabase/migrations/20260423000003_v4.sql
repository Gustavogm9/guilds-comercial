-- =============================================================
-- MIGRATION v4 — Score de fechamento + motivos obrigatórios
--
-- Mudanças:
--   1. Colunas novas em `leads`: motivo_perda, motivo_perda_detalhe,
--      percepcao_vendedor (avaliação subjetiva do vendedor).
--   2. Coluna `tom_interacao` em ligacoes (positivo/neutro/negativo).
--   3. Função `lead_score_fechamento(lead_id)` → 0-100 composto.
--   4. View `v_lead_score` com score por lead + breakdown.
--   5. View `v_forecast_mes` com previsão de fechamento dos próximos 30 dias.
-- Seguro para rodar múltiplas vezes.
-- =============================================================

-- -------------------------------------------------------------
-- 1. COLUNAS NOVAS EM leads
-- -------------------------------------------------------------
alter table public.leads
  add column if not exists motivo_perda          text,
  add column if not exists motivo_perda_detalhe  text,
  add column if not exists percepcao_vendedor    text
    check (percepcao_vendedor in ('Muito baixa','Baixa','Média','Alta','Muito alta'));

-- Drop+recreate constraint (idempotente)
alter table public.leads drop constraint if exists leads_motivo_perda_check;
alter table public.leads add constraint leads_motivo_perda_check check (
  motivo_perda is null or motivo_perda in (
    'Preço', 'Timing', 'Concorrência', 'Sumiu',
    'Sem orçamento', 'Sem fit', 'Decisor errado', 'Outro'
  )
);

-- -------------------------------------------------------------
-- 2. COLUNA tom_interacao EM ligacoes
-- -------------------------------------------------------------
alter table public.ligacoes
  add column if not exists tom_interacao text
    check (tom_interacao in ('positivo','neutro','negativo'));

-- -------------------------------------------------------------
-- 3. FUNÇÃO lead_score_fechamento(lead_id) → 0..100
--    Composto de 8 fatores ponderados.
-- -------------------------------------------------------------
create or replace function public.lead_score_fechamento(_lead_id bigint)
returns int
language plpgsql
stable
as $$
declare
  l public.leads%rowtype;
  score_etapa        int := 0;  -- até 25
  score_fit          int := 0;  -- até 10
  score_decisor      int := 0;  -- até 8
  score_temperatura  int := 0;  -- até 10
  score_voucher      int := 0;  -- até 10
  score_velocidade   int := 0;  -- até 12
  score_percepcao    int := 0;  -- até 15
  score_interacoes   int := 0;  -- até 10
  dias_sem_tocar     int;
  positivos          int := 0;
  negativos          int := 0;
  raiox_pago         boolean := false;
begin
  select * into l from public.leads where id = _lead_id;
  if not found then return 0; end if;

  -- (1) Etapa CRM (25 pts) — quanto mais avançado, mais peso
  score_etapa := case l.crm_stage
    when 'Prospecção'       then 2
    when 'Qualificado'      then 5
    when 'Raio-X Ofertado'  then 8
    when 'Raio-X Feito'     then 12
    when 'Call Marcada'     then 14
    when 'Diagnóstico Pago' then 18
    when 'Proposta'         then 21
    when 'Negociação'       then 25
    when 'Fechado'          then 25
    when 'Perdido'          then 0
    when 'Nutrição'         then 3
    else 0
  end;

  -- (2) Fit ICP (10 pts)
  score_fit := case l.fit_icp when true then 10 when false then 0 else 3 end;

  -- (3) Decisor (8 pts)
  score_decisor := case l.decisor when true then 8 when false then 0 else 2 end;

  -- (4) Temperatura (10 pts)
  score_temperatura := case l.temperatura
    when 'Quente' then 10
    when 'Morno'  then 5
    when 'Frio'   then 1
    else 3
  end;

  -- (5) Voucher / Raio-X pago (10 pts) — assinatura de comprometimento
  select exists (
    select 1 from public.raiox r
    where r.lead_id = l.id
      and r.status_oferta in ('Pago','Concluído')
  ) into raiox_pago;
  if raiox_pago then score_voucher := 10; end if;

  -- (6) Velocidade — penaliza se muitos dias sem tocar (até 12 pts)
  dias_sem_tocar := (current_date - coalesce(l.data_ultimo_toque, l.data_entrada))::int;
  score_velocidade := greatest(0, 12 - least(12, dias_sem_tocar / 2));

  -- (7) Percepção do vendedor (15 pts) — input subjetivo mais pesado
  score_percepcao := case l.percepcao_vendedor
    when 'Muito alta' then 15
    when 'Alta'       then 11
    when 'Média'      then 6
    when 'Baixa'      then 2
    when 'Muito baixa' then 0
    else 5  -- não preenchida: neutro
  end;

  -- (8) Qualidade das últimas 3 interações (10 pts)
  select
    count(*) filter (where tom_interacao = 'positivo'),
    count(*) filter (where tom_interacao = 'negativo')
  into positivos, negativos
  from (
    select tom_interacao from public.ligacoes
    where lead_id = l.id and tom_interacao is not null
    order by data_hora desc limit 3
  ) t;

  score_interacoes := case
    when positivos >= 2 then 10
    when positivos = 1 and negativos = 0 then 7
    when positivos = 0 and negativos = 0 then 4   -- sem sinal
    when negativos = 1 and positivos = 1 then 5
    when negativos >= 2 then 0
    else 3
  end;

  return least(100, greatest(0,
    score_etapa + score_fit + score_decisor + score_temperatura
    + score_voucher + score_velocidade + score_percepcao + score_interacoes
  ));
end;
$$;

grant execute on function public.lead_score_fechamento(bigint) to authenticated;

-- -------------------------------------------------------------
-- 4. v_lead_score — score + breakdown por lead
-- -------------------------------------------------------------
create or replace view public.v_lead_score as
select
  l.id,
  l.organizacao_id,
  l.responsavel_id,
  l.empresa,
  l.nome,
  l.crm_stage,
  l.funnel_stage,
  l.valor_potencial,
  l.probabilidade,
  l.receita_ponderada,
  l.fit_icp,
  l.decisor,
  l.temperatura,
  l.percepcao_vendedor,
  (current_date - coalesce(l.data_ultimo_toque, l.data_entrada))::int as dias_sem_tocar,
  public.lead_score_fechamento(l.id) as score,
  -- Valor esperado ajustado por score
  round((coalesce(l.valor_potencial, 0) * public.lead_score_fechamento(l.id) / 100.0)::numeric, 2) as valor_esperado_score
from public.leads l
where l.funnel_stage = 'pipeline'
  and l.crm_stage not in ('Fechado','Perdido');

grant select on public.v_lead_score to authenticated;

-- -------------------------------------------------------------
-- 5. v_forecast_mes — previsão dos próximos 30 dias
--    Calcula 3 cenários: best (só score>=70), likely (weighted by score),
--    worst (apenas Negociação + Proposta).
-- -------------------------------------------------------------
create or replace view public.v_forecast_mes as
with ls as (
  select * from public.v_lead_score
)
select
  organizacao_id,
  responsavel_id,
  -- best: leads com score >= 70 fecham pelo valor cheio
  coalesce(sum(valor_potencial) filter (where score >= 70), 0) as forecast_best,
  -- likely: sum(valor * score/100) para todos ativos
  coalesce(sum(valor_esperado_score), 0) as forecast_likely,
  -- worst: apenas Proposta/Negociação com score >= 50
  coalesce(sum(valor_potencial) filter (
    where crm_stage in ('Proposta','Negociação') and score >= 50
  ), 0) as forecast_worst,
  count(*) filter (where score >= 70)::int as leads_altos,
  count(*)::int as leads_ativos
from ls
group by organizacao_id, responsavel_id;

grant select on public.v_forecast_mes to authenticated;

-- -------------------------------------------------------------
-- 6. v_top_oportunidades — top 20 leads por score * valor (para /hoje)
-- -------------------------------------------------------------
create or replace view public.v_top_oportunidades as
select
  l.id,
  l.organizacao_id,
  l.responsavel_id,
  l.empresa,
  l.nome,
  l.crm_stage,
  l.valor_potencial,
  l.data_proxima_acao,
  l.proxima_acao,
  l.percepcao_vendedor,
  public.lead_score_fechamento(l.id) as score,
  round((coalesce(l.valor_potencial, 0) * public.lead_score_fechamento(l.id) / 100.0)::numeric, 2) as valor_esperado
from public.leads l
where l.funnel_stage = 'pipeline'
  and l.crm_stage not in ('Fechado','Perdido','Nutrição');

grant select on public.v_top_oportunidades to authenticated;
