-- =============================================================================
-- Flywheel polish — schema additions (Bloco B)
--
-- 1. health_score_snapshots — histórico diário do score por cliente. Cron
--    diário tira foto. Permite gráfico de tendência (subindo/caindo).
--
-- 2. nps_snapshots — não precisa, já temos histórico em nps_responses
--    (1 row por resposta, com respondido_em). Vamos agregar via view.
--
-- 3. expansoes — cron mensal sugere expansões automáticas pra clientes
--    saudáveis sem expansão recente.
--
-- 4. View v_health_breakdown — drill-down dos 4 componentes do score
--    (recência/NPS/onboarding/indicação) com explicação textual.
--
-- 5. View v_nps_historico_por_lead — agrega NPS de um cliente ao longo do
--    tempo pra mostrar curva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Snapshots diários do health score
-- -----------------------------------------------------------------------------
create table if not exists public.health_score_snapshots (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  snapshot_date   date not null,
  health_score    int not null,
  pts_recencia    int not null,
  pts_nps         int not null,
  pts_onboarding  int not null,
  pts_indicacao   int not null,
  categoria       text not null,
  created_at      timestamptz not null default now(),
  unique (lead_id, snapshot_date)
);

create index idx_health_snapshots_lead_date on public.health_score_snapshots(lead_id, snapshot_date desc);
create index idx_health_snapshots_org_date on public.health_score_snapshots(organizacao_id, snapshot_date desc);

comment on table public.health_score_snapshots is
  'Foto diária do health score por cliente. Cron tira snapshot todo dia 03:00 (logo depois do refresh do cache). Permite gráfico de tendência 30/60/90d.';

alter table public.health_score_snapshots enable row level security;
create policy health_snapshots_select on public.health_score_snapshots
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

-- Função: tira snapshot do estado atual
create or replace function public.snapshot_health_scores()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.health_score_snapshots (
    organizacao_id, lead_id, snapshot_date, health_score,
    pts_recencia, pts_nps, pts_onboarding, pts_indicacao, categoria
  )
  select
    organizacao_id, lead_id, current_date, health_score,
    pts_recencia, pts_nps, pts_onboarding, pts_indicacao, categoria
  from public.health_score_cache
  on conflict (lead_id, snapshot_date) do update set
    health_score = excluded.health_score,
    pts_recencia = excluded.pts_recencia,
    pts_nps = excluded.pts_nps,
    pts_onboarding = excluded.pts_onboarding,
    pts_indicacao = excluded.pts_indicacao,
    categoria = excluded.categoria;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Cron diário 03:30 (logo depois do health-score-refresh às 03:00)
do $$
begin
  perform cron.unschedule('health-score-snapshot');
exception when others then null;
end $$;
select cron.schedule(
  'health-score-snapshot',
  '30 3 * * *',
  $$ select public.snapshot_health_scores(); $$
);

-- View: tendência por lead (30/60/90 dias)
drop view if exists public.v_health_tendencia;
create view public.v_health_tendencia
with (security_invoker = true) as
with snapshots_recentes as (
  select
    lead_id,
    organizacao_id,
    snapshot_date,
    health_score,
    categoria,
    row_number() over (partition by lead_id order by snapshot_date desc) as rn
  from public.health_score_snapshots
  where snapshot_date >= (current_date - interval '90 days')
)
select
  s_atual.lead_id,
  s_atual.organizacao_id,
  s_atual.health_score as score_atual,
  s_atual.categoria as categoria_atual,
  s_30d.health_score as score_30d_atras,
  s_60d.health_score as score_60d_atras,
  s_90d.health_score as score_90d_atras,
  case
    when s_30d.health_score is null then 'novo'
    when s_atual.health_score - s_30d.health_score >= 10 then 'subindo_forte'
    when s_atual.health_score - s_30d.health_score >= 3 then 'subindo'
    when s_atual.health_score - s_30d.health_score <= -10 then 'caindo_forte'
    when s_atual.health_score - s_30d.health_score <= -3 then 'caindo'
    else 'estavel'
  end as tendencia_30d
from snapshots_recentes s_atual
left join lateral (
  select health_score from public.health_score_snapshots
  where lead_id = s_atual.lead_id
    and snapshot_date <= (current_date - interval '30 days')
  order by snapshot_date desc limit 1
) s_30d on true
left join lateral (
  select health_score from public.health_score_snapshots
  where lead_id = s_atual.lead_id
    and snapshot_date <= (current_date - interval '60 days')
  order by snapshot_date desc limit 1
) s_60d on true
left join lateral (
  select health_score from public.health_score_snapshots
  where lead_id = s_atual.lead_id
    and snapshot_date <= (current_date - interval '90 days')
  order by snapshot_date desc limit 1
) s_90d on true
where s_atual.rn = 1;

comment on view public.v_health_tendencia is
  'Por lead: score atual + scores de 30/60/90 dias atrás + categoria de tendência (subindo_forte/subindo/estavel/caindo/caindo_forte/novo).';

-- View: agregação de NPS por lead pra histórico/gráfico
drop view if exists public.v_nps_historico_lead;
create view public.v_nps_historico_lead
with (security_invoker = true) as
select
  lead_id,
  organizacao_id,
  count(*) as total_respostas,
  count(*) filter (where score is not null) as respondidas,
  round(avg(score)::numeric, 1) as score_medio,
  max(score) as score_max,
  min(score) as score_min,
  (array_agg(jsonb_build_object('score', score, 'data', respondido_em, 'comentario', comentario, 'categoria', categoria) order by respondido_em desc nulls last))[1:10] as ultimas_10
from public.nps_responses
where score is not null
group by lead_id, organizacao_id;

comment on view public.v_nps_historico_lead is
  'Histórico agregado de NPS por lead: contadores + JSON com últimas 10 respostas (score, data, comentário, categoria).';

-- View: drill-down do health (componentes + explicação)
drop view if exists public.v_health_breakdown;
create view public.v_health_breakdown
with (security_invoker = true) as
select
  hsc.organizacao_id,
  hsc.lead_id,
  hsc.lead_empresa,
  hsc.lead_nome,
  hsc.lead_responsavel_id,
  hsc.health_score,
  hsc.categoria,
  hsc.dias_sem_interacao,
  -- 4 componentes (cada um 0-100, peso descrito)
  jsonb_build_array(
    jsonb_build_object(
      'componente', 'recencia',
      'label', 'Recência de contato',
      'pontos', hsc.pts_recencia,
      'peso', 30,
      'descricao', case
        when hsc.dias_sem_interacao <= 14 then 'Contato recente, ótimo'
        when hsc.dias_sem_interacao <= 30 then 'Já tem 2-4 semanas sem contato'
        when hsc.dias_sem_interacao <= 60 then 'Mais de 1 mês sem contato'
        when hsc.dias_sem_interacao <= 90 then 'Mais de 2 meses sem contato'
        else 'Mais de 3 meses sem contato — risco alto'
      end,
      'acao_sugerida', case
        when hsc.pts_recencia >= 80 then null
        when hsc.pts_recencia >= 50 then 'Marcar uma call de check-in'
        else 'Ligar HOJE'
      end
    ),
    jsonb_build_object(
      'componente', 'nps',
      'label', 'Último NPS',
      'pontos', hsc.pts_nps,
      'peso', 30,
      'descricao', case
        when hsc.ultimo_nps_score is null then 'Sem NPS coletado ainda'
        when hsc.ultimo_nps_score >= 9 then 'Promotor (NPS ' || hsc.ultimo_nps_score || ')'
        when hsc.ultimo_nps_score >= 7 then 'Neutro (NPS ' || hsc.ultimo_nps_score || ')'
        else 'Detrator (NPS ' || hsc.ultimo_nps_score || ')'
      end,
      'acao_sugerida', case
        when hsc.ultimo_nps_score is null then 'Solicitar NPS — automação D+7 do fechamento'
        when hsc.ultimo_nps_score <= 6 then 'Call de feedback urgente'
        else null
      end
    ),
    jsonb_build_object(
      'componente', 'onboarding',
      'label', 'Onboarding',
      'pontos', hsc.pts_onboarding,
      'peso', 20,
      'descricao', case
        when hsc.pts_onboarding = 50 then 'Sem checklist configurado'
        when hsc.pts_onboarding >= 80 then 'Onboarding 80%+ completo'
        when hsc.pts_onboarding >= 50 then 'Onboarding parcial (' || hsc.pts_onboarding || '%)'
        else 'Onboarding parado em ' || hsc.pts_onboarding || '%'
      end,
      'acao_sugerida', case
        when hsc.pts_onboarding < 50 then 'Cobrar items pendentes do checklist'
        else null
      end
    ),
    jsonb_build_object(
      'componente', 'indicacao',
      'label', 'Indicações dadas',
      'pontos', hsc.pts_indicacao,
      'peso', 20,
      'descricao', case
        when hsc.indicacoes_dadas = 0 then 'Nunca indicou ninguém'
        when hsc.indicacoes_dadas >= 3 then 'Embaixador ativo (' || hsc.indicacoes_dadas || ' indicações)'
        else hsc.indicacoes_dadas || ' indicação(ões)'
      end,
      'acao_sugerida', case
        when hsc.indicacoes_dadas = 0 then 'Pedir primeira indicação (timing pós-NPS alto)'
        else null
      end
    )
  ) as componentes,
  -- Próxima ação composta (a mais urgente entre os 4)
  case
    when hsc.categoria = 'em_risco' then
      case
        when hsc.dias_sem_interacao > 60 then 'LIGAR AGORA — cliente sumiu há ' || hsc.dias_sem_interacao || ' dias'
        when hsc.ultimo_nps_score is not null and hsc.ultimo_nps_score <= 6 then 'Call urgente — cliente é detrator (NPS ' || hsc.ultimo_nps_score || ')'
        when hsc.pts_onboarding < 50 then 'Resgatar onboarding parado'
        else 'Recuperar relacionamento'
      end
    when hsc.categoria = 'atencao' then
      case
        when hsc.dias_sem_interacao > 30 then 'Marcar call de check-in'
        when hsc.ultimo_nps_score is null then 'Coletar NPS'
        else 'Manter cadência atual'
      end
    else 'Saudável — pedir indicação'
  end as proxima_acao_recomendada
from public.health_score_cache hsc;

comment on view public.v_health_breakdown is
  'Drill-down do health score com 4 componentes (recência/NPS/onboarding/indicação) + ação sugerida por componente + próxima ação composta urgente. Cada componente vem com label, pontos, peso e descrição textual humana.';

-- -----------------------------------------------------------------------------
-- 2. Cron mensal: sugere expansões automáticas
-- -----------------------------------------------------------------------------
create or replace function public.sugerir_expansoes_automaticas()
returns table (
  organizacao_id uuid,
  expansoes_criadas int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_count int := 0;
  org_count_map jsonb := '{}'::jsonb;
begin
  -- Critérios: cliente saudável + Fechado há >= 90d + sem expansão ativa
  -- + sem expansão criada nos últimos 60d (anti-flood)
  for rec in
    select
      hsc.organizacao_id,
      hsc.lead_id,
      hsc.lead_empresa,
      l.responsavel_id,
      l.valor_potencial,
      l.data_fechamento
    from public.health_score_cache hsc
    join public.leads l on l.id = hsc.lead_id
    where hsc.categoria = 'saudavel'
      and l.data_fechamento <= (current_date - interval '90 days')
      and not exists (
        select 1 from public.expansoes e
        where e.cliente_lead_id = hsc.lead_id
          and (
            e.estagio not in ('fechada', 'perdida')
            or e.created_at >= (current_date - interval '60 days')
          )
      )
  loop
    insert into public.expansoes (
      organizacao_id, cliente_lead_id, responsavel_id,
      tipo, titulo, descricao, valor_potencial, origem,
      data_proxima_acao, proxima_acao
    ) values (
      rec.organizacao_id, rec.lead_id, rec.responsavel_id,
      'upsell',
      'Sugestão: explorar upsell — ' || coalesce(rec.lead_empresa, 'Lead #' || rec.lead_id),
      'Cliente saudável, fechado há ' ||
        (current_date - rec.data_fechamento::date)::text ||
        ' dias. Bom momento pra explorar oportunidades de expansão (upsell, cross-sell ou seats).',
      coalesce(rec.valor_potencial * 0.3, 0),
      'sistema_milestone',
      (current_date + interval '7 days')::date,
      'Conversar com cliente pra mapear oportunidades de expansão'
    );
    v_count := v_count + 1;

    org_count_map := jsonb_set(
      org_count_map,
      array[rec.organizacao_id::text],
      to_jsonb(coalesce((org_count_map -> rec.organizacao_id::text)::int, 0) + 1)
    );

    insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
    values (rec.organizacao_id, rec.lead_id, null, 'expansao_sugerida_sistema',
      jsonb_build_object('motivo', 'cliente saudável + 90d+ fechado'));
  end loop;

  return query
  select (k.key)::uuid, (k.value)::int
  from jsonb_each_text(org_count_map) as k;
end;
$$;

comment on function public.sugerir_expansoes_automaticas() is
  'Cron mensal: cria expansão tipo=upsell origem=sistema_milestone pra clientes saudáveis fechados há >= 90 dias sem expansão ativa. Vendedor decide se trabalha ou descarta.';

-- Cron mensal — dia 1 de cada mês 09:00 UTC
do $$
begin
  perform cron.unschedule('expansao-sugestao-mensal');
exception when others then null;
end $$;
select cron.schedule(
  'expansao-sugestao-mensal',
  '0 9 1 * *',
  $$ select public.sugerir_expansoes_automaticas(); $$
);
