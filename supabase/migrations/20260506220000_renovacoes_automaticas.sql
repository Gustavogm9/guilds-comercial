-- =============================================================================
-- Renovações automáticas (P5 do flywheel)
--
-- Reutiliza a tabela `expansoes` (tipo='renovacao'). Esta migration adiciona:
--
-- 1. Colunas em `leads`:
--      data_renovacao         DATE — quando o contrato vence
--      ciclo_renovacao_meses  INT  — 1, 3, 6, 12, 24 (default NULL = não-recurring)
--      valor_renovacao        NUMERIC(12,2) — valor previsto da renovação
--                              (default = valor_potencial do lead)
--
-- 2. Função `criar_expansoes_renovacao_pendentes()`:
--    Detecta leads com `data_renovacao` em até 90 dias E sem expansão tipo
--    'renovacao' ativa pra esse lead. Cria expansão automática com:
--      - origem = 'sistema_renovacao'
--      - estagio = 'identificada'
--      - data_proxima_acao = hoje + 7d (responsável entra em contato)
--      - titulo = "Renovação contrato — {{empresa}}"
--      - valor_potencial = leads.valor_renovacao OR leads.valor_potencial
--    Retorna # de expansões criadas.
--
-- 3. Função `processar_renovacoes_concluidas()`:
--    Quando uma expansão tipo='renovacao' fecha (estagio='fechada'), avança
--    leads.data_renovacao em ciclo_renovacao_meses (default 12). Mantém o
--    cliente no ciclo automático sem precisar intervenção manual.
--
-- 4. Trigger AFTER UPDATE em expansoes pra rodar #3.
--
-- 5. pg_cron job: roda criar_expansoes_renovacao_pendentes() todo dia às 08:00 UTC.
--    Idempotente — se rodar 2x no mesmo dia, segunda vez é no-op (constraint dedup).
--
-- 6. View v_renovacoes_proximas: leads com renovação em <=90d com info de expansão
--    associada (alimenta /hoje e /funil).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas em `leads`
-- -----------------------------------------------------------------------------
alter table public.leads
  add column if not exists data_renovacao date,
  add column if not exists ciclo_renovacao_meses int check (ciclo_renovacao_meses is null or (ciclo_renovacao_meses > 0 and ciclo_renovacao_meses <= 60)),
  add column if not exists valor_renovacao numeric(12,2) check (valor_renovacao is null or valor_renovacao >= 0);

create index if not exists idx_leads_data_renovacao on public.leads(data_renovacao)
  where data_renovacao is not null;

comment on column public.leads.data_renovacao is
  'Data de vencimento do contrato. Cron mensal cria expansão tipo renovacao quando <= 90d.';
comment on column public.leads.ciclo_renovacao_meses is
  'Ciclo recorrente (1, 6, 12, 24…). Quando renovação fecha, data_renovacao avança automaticamente.';
comment on column public.leads.valor_renovacao is
  'Valor previsto da próxima renovação. Se NULL, usa valor_potencial.';

-- -----------------------------------------------------------------------------
-- 2. Função: criar_expansoes_renovacao_pendentes
-- -----------------------------------------------------------------------------
create or replace function public.criar_expansoes_renovacao_pendentes(
  _janela_dias int default 90
)
returns table (
  organizacao_id   uuid,
  expansoes_criadas int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  novas int := 0;
  org_id uuid;
  org_count_map jsonb := '{}'::jsonb;
begin
  for rec in
    select
      l.id              as lead_id,
      l.organizacao_id,
      l.empresa,
      l.responsavel_id,
      l.data_renovacao,
      coalesce(l.valor_renovacao, l.valor_potencial, 0) as valor_previsto
    from public.leads l
    where l.crm_stage = 'Fechado'
      and l.data_renovacao is not null
      and l.data_renovacao <= (current_date + _janela_dias * interval '1 day')::date
      and l.data_renovacao >= current_date - interval '7 days'  -- janela de tolerância pra renovações vencidas há até 7d
      -- Não duplica: cliente sem expansão tipo='renovacao' ATIVA cobrindo essa janela
      and not exists (
        select 1 from public.expansoes e
        where e.cliente_lead_id = l.id
          and e.tipo = 'renovacao'
          and e.estagio not in ('fechada', 'perdida')
          and e.created_at >= (current_date - interval '120 days')
      )
  loop
    insert into public.expansoes (
      organizacao_id,
      cliente_lead_id,
      responsavel_id,
      tipo,
      titulo,
      descricao,
      valor_potencial,
      origem,
      data_proxima_acao,
      proxima_acao
    ) values (
      rec.organizacao_id,
      rec.lead_id,
      rec.responsavel_id,
      'renovacao',
      'Renovação — ' || coalesce(rec.empresa, 'lead #' || rec.lead_id),
      'Renovação automática gerada pelo sistema. Vencimento em ' ||
        to_char(rec.data_renovacao, 'DD/MM/YYYY') ||
        ' (' || (rec.data_renovacao - current_date)::text || ' dias).',
      rec.valor_previsto,
      'sistema_renovacao',
      least(rec.data_renovacao - interval '7 days', current_date + interval '7 days')::date,
      'Entrar em contato pra confirmar renovação'
    );
    novas := novas + 1;

    -- Aglomera por org pro retorno
    org_count_map := jsonb_set(
      org_count_map,
      array[rec.organizacao_id::text],
      to_jsonb(coalesce((org_count_map -> rec.organizacao_id::text)::int, 0) + 1)
    );

    -- Audit no lead
    insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
    values (
      rec.organizacao_id,
      rec.lead_id,
      null,
      'renovacao_agendada',
      jsonb_build_object(
        'data_renovacao', rec.data_renovacao,
        'valor_previsto', rec.valor_previsto,
        'origem', 'sistema_renovacao'
      )
    );
  end loop;

  -- Retorno: 1 row por org com expansões criadas
  return query
  select (k.key)::uuid, (k.value)::int
  from jsonb_each_text(org_count_map) as k;
end;
$$;

comment on function public.criar_expansoes_renovacao_pendentes(int) is
  'Cron diário: cria expansão tipo=renovacao para clientes com data_renovacao <= 90 dias e sem expansão ativa cobrindo essa janela.';

-- -----------------------------------------------------------------------------
-- 3. Trigger: renovação fechada → avança data_renovacao no lead
-- -----------------------------------------------------------------------------
create or replace function public.trg_avancar_data_renovacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ciclo int;
  v_atual date;
begin
  -- Só age em renovações que ACABARAM de fechar
  if NEW.tipo <> 'renovacao' then return NEW; end if;
  if NEW.estagio <> 'fechada' or OLD.estagio = 'fechada' then return NEW; end if;

  -- Pega ciclo do lead (default 12 meses se não setado)
  select ciclo_renovacao_meses, data_renovacao
    into v_ciclo, v_atual
    from public.leads
    where id = NEW.cliente_lead_id;

  v_ciclo := coalesce(v_ciclo, 12);
  v_atual := coalesce(v_atual, current_date);

  -- Avança data_renovacao em N meses
  update public.leads
     set data_renovacao = (v_atual + (v_ciclo || ' months')::interval)::date
   where id = NEW.cliente_lead_id;

  -- Audit
  insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
  values (
    NEW.organizacao_id,
    NEW.cliente_lead_id,
    NEW.responsavel_id,
    'renovacao_fechada',
    jsonb_build_object(
      'expansao_id', NEW.id,
      'valor_renovado', NEW.valor_potencial,
      'proxima_renovacao', (v_atual + (v_ciclo || ' months')::interval)::date,
      'ciclo_meses', v_ciclo
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_expansao_renovacao_avanca on public.expansoes;
create trigger trg_expansao_renovacao_avanca
  after update of estagio on public.expansoes
  for each row execute function public.trg_avancar_data_renovacao();

-- -----------------------------------------------------------------------------
-- 4. View: v_renovacoes_proximas
-- -----------------------------------------------------------------------------
drop view if exists public.v_renovacoes_proximas;
create view public.v_renovacoes_proximas
with (security_invoker = true) as
select
  l.id                          as lead_id,
  l.organizacao_id,
  l.empresa                     as cliente_empresa,
  l.nome                        as cliente_nome,
  l.responsavel_id,
  l.data_renovacao,
  l.ciclo_renovacao_meses,
  coalesce(l.valor_renovacao, l.valor_potencial, 0) as valor_previsto,
  (l.data_renovacao - current_date)::int as dias_ate_renovacao,
  case
    when (l.data_renovacao - current_date) < 0 then 'vencida'
    when (l.data_renovacao - current_date) <= 7 then 'critica'
    when (l.data_renovacao - current_date) <= 30 then 'urgente'
    when (l.data_renovacao - current_date) <= 60 then 'proxima'
    when (l.data_renovacao - current_date) <= 90 then 'futura'
    else 'distante'
  end                            as urgencia,
  -- Se já tem expansão ativa cobrindo essa renovação
  exists (
    select 1 from public.expansoes e
    where e.cliente_lead_id = l.id
      and e.tipo = 'renovacao'
      and e.estagio not in ('fechada', 'perdida')
      and e.created_at >= (current_date - interval '120 days')
  )                              as tem_expansao_ativa,
  pr.display_name                as responsavel_nome
from public.leads l
left join public.profiles pr on pr.id = l.responsavel_id
where l.crm_stage = 'Fechado'
  and l.data_renovacao is not null;

comment on view public.v_renovacoes_proximas is
  'Clientes Fechados com data_renovacao setada. Inclui dias até renovação, urgência categórica e flag se já tem expansão ativa cobrindo.';

-- View resumo: KPIs de renovação por org
drop view if exists public.v_renovacoes_resumo;
create view public.v_renovacoes_resumo
with (security_invoker = true) as
with renov_fechadas_12m as (
  -- Renovações fechadas nos últimos 12 meses (do total de fechadas-ou-perdidas no mesmo período)
  select organizacao_id, estagio, valor_potencial
  from public.expansoes
  where tipo = 'renovacao'
    and updated_at >= (current_date - interval '12 months')
    and estagio in ('fechada', 'perdida')
)
select
  o.id as organizacao_id,
  count(*) filter (where l.data_renovacao is not null and l.crm_stage = 'Fechado')              as total_clientes_recorrentes,
  count(*) filter (where l.data_renovacao is not null and l.data_renovacao <= (current_date + interval '90 days') and l.data_renovacao >= current_date and l.crm_stage = 'Fechado')   as renovacoes_proximas_90d,
  count(*) filter (where l.data_renovacao is not null and l.data_renovacao <= (current_date + interval '30 days') and l.data_renovacao >= current_date and l.crm_stage = 'Fechado')   as renovacoes_proximas_30d,
  count(*) filter (where l.data_renovacao is not null and l.data_renovacao < current_date and l.crm_stage = 'Fechado')                                            as renovacoes_vencidas,
  case
    when (select count(*) from renov_fechadas_12m where organizacao_id = o.id) = 0 then null
    else round(
      100.0 * (select count(*) from renov_fechadas_12m where organizacao_id = o.id and estagio = 'fechada')
            / (select count(*) from renov_fechadas_12m where organizacao_id = o.id),
      1
    )
  end                                                                                 as taxa_renovacao_pct,
  coalesce(sum(coalesce(l.valor_renovacao, l.valor_potencial, 0))
    filter (where l.data_renovacao is not null and l.data_renovacao <= (current_date + interval '90 days') and l.data_renovacao >= current_date and l.crm_stage = 'Fechado'),
    0)                                                                                as arr_em_renovacao_90d
from public.organizacoes o
left join public.leads l on l.organizacao_id = o.id
group by o.id;

comment on view public.v_renovacoes_resumo is
  'KPIs de renovação por org: # clientes recorrentes, renovações próximas (30/90d), vencidas, taxa de renovação 12m, ARR em renovação.';

-- -----------------------------------------------------------------------------
-- 5. pg_cron job — diário às 08:00 UTC
-- -----------------------------------------------------------------------------
-- Remove job antigo se existir (idempotência da migration)
do $$
begin
  perform cron.unschedule('renovacoes-diarias');
exception when others then null;
end $$;

select cron.schedule(
  'renovacoes-diarias',
  '0 8 * * *',
  $$ select public.criar_expansoes_renovacao_pendentes(90); $$
);
