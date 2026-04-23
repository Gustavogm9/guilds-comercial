-- ============================================================
-- MIGRATION v2 — PARIDADE COM PLANILHA CONTROLE COMERCIAL v2
-- ============================================================
-- Deve ser rodada DEPOIS do schema.sql base. Incluí tudo que
-- faltava pra sistema ficar 1:1 com a planilha, mais melhorias.
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- === 1. ENUMS DE LEAD (expandir crm_stage) =====================
alter table public.leads drop constraint if exists leads_crm_stage_check;
alter table public.leads add constraint leads_crm_stage_check check (
  crm_stage in (
    'Base','Prospecção','Qualificado','Raio-X Ofertado','Raio-X Feito',
    'Call Marcada','Diagnóstico Pago','Proposta','Negociação',
    'Fechado','Perdido','Nutrição'
  )
);

-- === 2. RAIO-X — status e tipo de voucher =====================
alter table public.raio_x
  add column if not exists status_oferta text
    check (status_oferta in (
      'Não ofertado','Ofertado','Pago','Concluído','Recusou'
    )) default 'Não ofertado';

alter table public.raio_x
  add column if not exists tipo_voucher text
    check (tipo_voucher in ('Nenhum','R$50','Gratuito estratégico'))
    default 'Nenhum';

-- Backfill: se já existe raio_x com "pago=true" vira 'Pago', etc.
update public.raio_x
   set status_oferta =
     case when pago then 'Pago'
          when data_pagamento is not null then 'Concluído'
          else 'Ofertado'
     end
 where status_oferta = 'Não ofertado' and (pago or data_pagamento is not null);

-- Voucher: se gratuito=true vira 'Gratuito estratégico', se voucher_desconto=50 vira 'R$50'
update public.raio_x
   set tipo_voucher = case
     when gratuito then 'Gratuito estratégico'
     when voucher_desconto = 50 then 'R$50'
     else 'Nenhum'
   end
 where tipo_voucher = 'Nenhum';

-- Trigger: quando tipo_voucher muda, sincroniza voucher_desconto e gratuito
create or replace function public.sync_raiox_voucher()
returns trigger language plpgsql as $$
begin
  new.voucher_desconto := case new.tipo_voucher
    when 'R$50' then 50
    when 'Gratuito estratégico' then coalesce(new.preco_lista, 97)
    else 0
  end;
  new.gratuito := (new.tipo_voucher = 'Gratuito estratégico');
  return new;
end;
$$;
drop trigger if exists trg_raiox_sync_voucher on public.raio_x;
create trigger trg_raiox_sync_voucher
  before insert or update of tipo_voucher on public.raio_x
  for each row execute function public.sync_raiox_voucher();

-- Trigger: nivel / saída recomendada / diagnóstico pago sugerido
-- batem com a fórmula da planilha v2.
create or replace function public.raiox_classificar()
returns trigger language plpgsql as $$
begin
  -- Nivel
  if new.score is null then
    new.nivel := 'Pendente';
  elsif new.score >= 70 then
    new.nivel := 'Alto';
  elsif new.score >= 40 then
    new.nivel := 'Médio';
  else
    new.nivel := 'Baixo';
  end if;

  -- Saída recomendada
  if new.score is null then
    new.saida_recomendada := null;
  elsif new.score >= 70 then
    new.saida_recomendada := 'Qualificado para revisão';
  elsif new.score >= 40 then
    new.saida_recomendada := 'Nutrição / Newsletter';
  else
    new.saida_recomendada := 'Baixa prioridade';
  end if;

  -- Diagnóstico pago sugerido
  if new.score is null then
    new.diagnostico_pago_sugerido := null;
  elsif new.score >= 70 or coalesce(new.perda_anual_estimada, 0) >= 150000 then
    new.diagnostico_pago_sugerido := 'Sim';
  else
    new.diagnostico_pago_sugerido := 'Talvez';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_raiox_classificar on public.raio_x;
create trigger trg_raiox_classificar
  before insert or update of score, perda_anual_estimada on public.raio_x
  for each row execute function public.raiox_classificar();

-- === 3. LEADS — probabilidade automática por etapa CRM ========
-- Regra de negócio da planilha v2 (fórmula Pipeline!AB5)
create or replace function public.lead_probabilidade_por_etapa(_stage text)
returns numeric language sql immutable as $$
  select case _stage
    when 'Base'             then 0.00
    when 'Prospecção'       then 0.10
    when 'Qualificado'      then 0.25
    when 'Raio-X Ofertado'  then 0.35
    when 'Raio-X Feito'     then 0.45
    when 'Call Marcada'     then 0.60
    when 'Diagnóstico Pago' then 0.75
    when 'Proposta'         then 0.85
    when 'Negociação'       then 0.95
    when 'Fechado'          then 1.00
    when 'Perdido'          then 0.00
    when 'Nutrição'         then 0.05
    else 0.00
  end;
$$;

create or replace function public.sync_lead_probabilidade()
returns trigger language plpgsql as $$
begin
  -- Só sobrescreve probabilidade se o usuário não setou manualmente
  -- (heurística: probabilidade atual == probabilidade default da etapa antiga)
  if tg_op = 'INSERT' then
    if new.probabilidade is null or new.probabilidade = 0 then
      new.probabilidade := public.lead_probabilidade_por_etapa(new.crm_stage);
    end if;
  elsif old.crm_stage is distinct from new.crm_stage then
    if new.probabilidade is not distinct from public.lead_probabilidade_por_etapa(old.crm_stage) then
      new.probabilidade := public.lead_probabilidade_por_etapa(new.crm_stage);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lead_prob on public.leads;
create trigger trg_lead_prob
  before insert or update on public.leads
  for each row execute function public.sync_lead_probabilidade();

-- === 4. CADÊNCIA — templates fixos de objetivos ===============
-- Quando um novo passo é criado sem objetivo, carimba o default.
create or replace function public.cadencia_objetivo_default(_passo text)
returns text language sql immutable as $$
  select case _passo
    when 'D0'  then 'Contexto / dor'
    when 'D3'  then 'Impacto / custo invisível'
    when 'D7'  then 'Autoridade / qualificação'
    when 'D11' then 'Convite certo (Raio-X, call ou diagnóstico)'
    when 'D16' then 'Porta aberta + newsletter'
    when 'D30' then 'Retomada suave'
    else null
  end;
$$;

create or replace function public.cadencia_default_fields()
returns trigger language plpgsql as $$
begin
  if new.objetivo is null or btrim(new.objetivo) = '' then
    new.objetivo := public.cadencia_objetivo_default(new.passo);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cadencia_defaults on public.cadencia;
create trigger trg_cadencia_defaults
  before insert on public.cadencia
  for each row execute function public.cadencia_default_fields();

-- === 5. ORG CONFIG — defaults de preço de Raio-X e cupons ====
alter table public.organizacao_config
  add column if not exists raiox_preco_default numeric(10,2) default 97,
  add column if not exists raiox_voucher_valor numeric(10,2) default 50;

-- === 6. VIEWS — ampliar v_leads_enriched =====================
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
  -- Semana da próxima ação (segunda-feira)
  case when l.data_proxima_acao is not null
       then l.data_proxima_acao - extract(isodow from l.data_proxima_acao)::int + 1
       else null end as semana_proxima_acao,
  -- Raio-X status mais recente
  rx.status_oferta as raiox_status,
  rx.nivel         as raiox_nivel,
  rx.score         as raiox_score,
  rx.data_pagamento as raiox_data_pagamento,
  -- Número de tentativas de ligação
  (select count(*) from public.ligacoes lg where lg.lead_id = l.id) as total_ligacoes,
  -- Responsável
  p.display_name as responsavel_nome,
  p.email        as responsavel_email
from public.leads l
left join public.profiles p on p.id = l.responsavel_id
left join lateral (
  select status_oferta, nivel, score, data_pagamento
  from public.raio_x rxi
  where rxi.lead_id = l.id
  order by rxi.created_at desc
  limit 1
) rx on true;

-- === 7. VIEWS — ampliar v_kpis_globais =======================
create or replace view public.v_kpis_globais as
select
  l.organizacao_id,
  -- Principais
  count(*) filter (where l.funnel_stage='pipeline'
                   and l.crm_stage not in ('Fechado','Perdido','Nutrição')) as leads_ativos,
  count(*) filter (where l.crm_stage='Qualificado')       as qualificados,
  count(*) filter (where l.crm_stage='Raio-X Ofertado')   as raiox_ofertado,
  count(*) filter (where l.crm_stage='Raio-X Feito')      as raiox_feito,
  count(*) filter (where l.crm_stage='Call Marcada')      as call_marcada,
  count(*) filter (where l.crm_stage='Diagnóstico Pago')  as diagnostico_pago,
  count(*) filter (where l.crm_stage='Proposta')          as propostas_abertas,
  count(*) filter (where l.crm_stage='Negociação')        as em_negociacao,
  count(*) filter (where l.crm_stage='Fechado')           as fechados,
  count(*) filter (where l.crm_stage='Perdido')           as perdidos,
  count(*) filter (where l.crm_stage='Nutrição')          as em_nutricao,
  -- Ações
  count(*) filter (where l.data_proxima_acao < current_date
                   and l.crm_stage not in ('Fechado','Perdido')) as acoes_vencidas,
  count(*) filter (where l.data_proxima_acao = current_date
                   and l.crm_stage not in ('Fechado','Perdido')) as acoes_hoje,
  count(*) filter (where l.data_proxima_acao is null
                   and l.crm_stage not in ('Fechado','Perdido')
                   and l.responsavel_id is not null)             as sem_proxima_acao,
  -- Financeiro
  coalesce(sum(l.receita_ponderada) filter (where l.crm_stage not in ('Fechado','Perdido')), 0) as pipeline_ponderado,
  coalesce(sum(l.valor_potencial)   filter (where l.crm_stage not in ('Fechado','Perdido')), 0) as pipeline_bruto,
  coalesce(sum(l.valor_potencial)   filter (where l.crm_stage = 'Fechado'), 0)                  as receita_fechada,
  coalesce(avg(l.valor_potencial)   filter (where l.crm_stage = 'Fechado'), 0)                  as ticket_medio,
  -- Taxa de conversão (fechados / leads ativos totais)
  case when count(*) filter (where l.funnel_stage='pipeline') > 0
       then round((count(*) filter (where l.crm_stage='Fechado'))::numeric
                  / (count(*) filter (where l.funnel_stage='pipeline'))::numeric * 100, 1)
       else 0
  end as taxa_fechamento_pct
from public.leads l
group by l.organizacao_id;

-- === 8. VIEW — KPI POR CANAL =================================
create or replace view public.v_kpis_por_canal as
select
  l.organizacao_id,
  l.canal_principal,
  count(*)                                      as leads,
  -- Respostas em qualquer passo de cadência
  (select count(distinct c.lead_id)
   from public.cadencia c
   join public.leads ll on ll.id = c.lead_id
   where ll.organizacao_id = l.organizacao_id
     and ll.canal_principal is not distinct from l.canal_principal
     and c.status = 'respondido')                as respondidos,
  -- Raio-X ofertados e pagos
  (select count(*) from public.raio_x rx
   join public.leads ll on ll.id = rx.lead_id
   where ll.organizacao_id = l.organizacao_id
     and ll.canal_principal is not distinct from l.canal_principal
     and rx.status_oferta in ('Ofertado','Pago','Concluído')) as raiox_ofertado,
  (select count(*) from public.raio_x rx
   join public.leads ll on ll.id = rx.lead_id
   where ll.organizacao_id = l.organizacao_id
     and ll.canal_principal is not distinct from l.canal_principal
     and rx.status_oferta in ('Pago','Concluído')) as raiox_pagos,
  -- Calls marcadas (estágio CRM)
  count(*) filter (where l.crm_stage = 'Call Marcada') as calls_marcadas,
  count(*) filter (where l.crm_stage = 'Proposta')     as propostas,
  count(*) filter (where l.crm_stage = 'Fechado')      as fechados,
  -- Receita fechada por canal
  coalesce(sum(l.valor_potencial) filter (where l.crm_stage = 'Fechado'), 0) as receita_canal
from public.leads l
group by l.organizacao_id, l.canal_principal;

-- === 9. VIEW — v_kpis_por_responsavel (ampliada) =============
create or replace view public.v_kpis_por_responsavel as
select
  m.organizacao_id,
  p.id,
  p.display_name,
  p.email,
  m.role,
  count(l.*) filter (where l.funnel_stage='pipeline'
                     and l.crm_stage not in ('Fechado','Perdido','Nutrição')) as leads_ativos,
  count(l.*) filter (where l.crm_stage='Qualificado')       as qualificados,
  count(l.*) filter (where l.crm_stage='Raio-X Ofertado')   as raiox_ofertado,
  count(l.*) filter (where l.crm_stage='Raio-X Feito')      as raiox_feito,
  count(l.*) filter (where l.crm_stage='Call Marcada')      as call_marcada,
  count(l.*) filter (where l.crm_stage='Diagnóstico Pago')  as diagnostico_pago,
  count(l.*) filter (where l.crm_stage='Proposta')          as propostas,
  count(l.*) filter (where l.crm_stage='Negociação')        as em_negociacao,
  count(l.*) filter (where l.crm_stage='Fechado')           as fechados,
  count(l.*) filter (where l.crm_stage='Nutrição')          as em_nutricao,
  -- Raio-X pagos (via join com raio_x)
  (select count(distinct rx.lead_id) from public.raio_x rx
   join public.leads ll on ll.id = rx.lead_id
   where ll.responsavel_id = p.id
     and ll.organizacao_id = m.organizacao_id
     and rx.status_oferta in ('Pago','Concluído')) as raiox_pagos,
  -- Calls registradas
  (select count(*) from public.ligacoes lg
   where lg.responsavel_id = p.id
     and lg.organizacao_id = m.organizacao_id) as calls_total,
  -- Ações
  count(l.*) filter (where l.data_proxima_acao = current_date
                     and l.crm_stage not in ('Fechado','Perdido')) as acoes_hoje,
  count(l.*) filter (where l.data_proxima_acao < current_date
                     and l.crm_stage not in ('Fechado','Perdido')) as acoes_vencidas,
  -- Newsletter ativos
  (select count(*) from public.newsletter n
   where n.responsavel_id = p.id
     and n.organizacao_id = m.organizacao_id
     and n.status = 'Ativo') as newsletter_ativos,
  -- Financeiro
  coalesce(sum(l.receita_ponderada) filter (where l.crm_stage not in ('Fechado','Perdido')), 0) as pipeline_ponderado,
  coalesce(sum(l.valor_potencial)   filter (where l.crm_stage = 'Fechado'), 0)                  as receita_fechada
from public.membros_organizacao m
join public.profiles p on p.id = m.profile_id
left join public.leads l
  on l.responsavel_id = p.id
 and l.organizacao_id = m.organizacao_id
where m.ativo = true
group by m.organizacao_id, p.id, p.display_name, p.email, m.role;

-- === 10. GRANTS ==============================================
grant select on public.v_leads_enriched         to authenticated;
grant select on public.v_kpis_globais           to authenticated;
grant select on public.v_kpis_por_canal         to authenticated;
grant select on public.v_kpis_por_responsavel   to authenticated;

-- ============================================================
-- Fim da migration v2
-- ============================================================
