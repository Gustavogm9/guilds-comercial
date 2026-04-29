-- Cobrança por consumo de IA (overage acima do plano).
--
-- Modelo: cada feature tem preço próprio (preco_overage_centavos). Quando uma
-- invocação OK supera o limite mensal incluído no plano, ela vira "overage" e
-- entra na conta a ser cobrada do cliente no fim do mês.
--
-- Tracking: ai_usage_mensal (1 row por org/periodo/feature). Função
-- registrar_ai_usage() incrementa atomicamente e marca como overage se passou.
-- View v_ai_usage_atual mostra o consumo do período corrente.
--
-- Idempotente.

-- ============================================================
-- 1) Preço por feature (centavos por invocação extra)
-- ============================================================
alter table public.ai_features
  add column if not exists preco_overage_centavos integer;

-- Seed de defaults razoáveis baseados em custo + valor por feature.
-- Base R$0,30 (decidido pelo PM). Features longas/críticas custam mais;
-- features curtas/automáticas custam menos. Editável via /admin/ai depois.
update public.ai_features f
set preco_overage_centavos = case f.codigo
  when 'enriquecer_lead'        then 15
  when 'gerar_oferta_raiox'     then 30
  when 'gerar_documento_raiox'  then 80
  when 'gerar_mensagem_cadencia' then 20
  when 'extrair_ligacao'        then 40
  when 'next_best_action'       then 30
  when 'briefing_pre_call'      then 40
  when 'objection_handler'      then 30
  when 'gerar_proposta'         then 100
  when 'sugerir_motivo_perda'   then 10
  when 'detectar_risco'         then 30
  when 'resumo_diario'          then 40
  when 'digest_semanal'         then 80
  when 'reativar_nutricao'      then 30
  when 'forecast_ml'            then 30
  else 30
end
where preco_overage_centavos is null;

-- Garante NOT NULL após backfill
alter table public.ai_features
  alter column preco_overage_centavos set default 30,
  alter column preco_overage_centavos set not null;

-- ============================================================
-- 2) Limite mensal incluído por plano (em invocações totais, agregado)
-- ============================================================
-- Já temos `aiActionsMonth` em PLANS (lib/billing.ts):
--   trial/starter = 300, growth = 2000, scale = unlimited
-- A view v_ai_usage_atual aplica isso lendo organizacoes.plano.

-- ============================================================
-- 3) ai_usage_mensal — uma row por (org, periodo_mes, feature)
-- ============================================================
create table if not exists public.ai_usage_mensal (
  organizacao_id    uuid     not null references public.organizacoes(id) on delete cascade,
  periodo_inicio    date     not null,  -- 1º do mês UTC
  feature_codigo    text     not null,
  invocacoes        integer  not null default 0,
  invocacoes_overage integer not null default 0,
  valor_overage_centavos integer not null default 0,
  reportado_stripe_em timestamptz,  -- preenchido após chamada de usage report
  primary key (organizacao_id, periodo_inicio, feature_codigo)
);

create index if not exists idx_ai_usage_mensal_periodo
  on public.ai_usage_mensal (periodo_inicio, organizacao_id);

create index if not exists idx_ai_usage_mensal_pendente_stripe
  on public.ai_usage_mensal (periodo_inicio)
  where reportado_stripe_em is null and valor_overage_centavos > 0;

alter table public.ai_usage_mensal enable row level security;

-- Gestor da org pode ler o consumo da própria org (UI de billing)
drop policy if exists ai_usage_select_gestor on public.ai_usage_mensal;
create policy ai_usage_select_gestor on public.ai_usage_mensal
  for select to authenticated
  using (public.is_gestor_in_org(organizacao_id));

-- Escrita só via service role (RLS sem policy de insert/update bloqueia client)

-- ============================================================
-- 4) Função registrar_ai_usage(org, feature) — incremento atômico
-- ============================================================
-- Retorna json com {invocacoes, total_org, dentro_plano, valor_overage_centavos_acumulado}
-- Chamada pelo dispatcher após uma invocação bem-sucedida.
create or replace function public.registrar_ai_usage(
  _org uuid,
  _feature_codigo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _periodo date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  _preco integer;
  _plano text;
  _limite_mes integer;
  _total_org integer;
  _row record;
begin
  -- 1) Pega preço da feature (org override → global)
  select coalesce(f_org.preco_overage_centavos, f_global.preco_overage_centavos, 30)
  into _preco
  from (select 1) x
  left join public.ai_features f_org on f_org.codigo = _feature_codigo and f_org.organizacao_id = _org
  left join public.ai_features f_global on f_global.codigo = _feature_codigo and f_global.organizacao_id is null
  limit 1;

  -- 2) Pega plano da org pra aplicar limite mensal
  select plano into _plano from public.organizacoes where id = _org;
  _limite_mes := case _plano
    when 'starter'  then 300
    when 'growth'   then 2000
    when 'scale'    then 2147483647  -- unlimited (max int)
    else 300                          -- trial e default
  end;

  -- 3) Upsert no ai_usage_mensal e calcula se essa invocação é overage
  insert into public.ai_usage_mensal as u (organizacao_id, periodo_inicio, feature_codigo, invocacoes)
  values (_org, _periodo, _feature_codigo, 1)
  on conflict (organizacao_id, periodo_inicio, feature_codigo)
  do update set invocacoes = u.invocacoes + 1
  returning * into _row;

  -- 4) Calcula total da org no mes (todas as features somadas)
  select coalesce(sum(invocacoes), 0)::int into _total_org
  from public.ai_usage_mensal
  where organizacao_id = _org and periodo_inicio = _periodo;

  -- 5) Se total_org > limite, esta invocação é overage; incrementa contador + valor
  if _total_org > _limite_mes then
    update public.ai_usage_mensal
    set invocacoes_overage = invocacoes_overage + 1,
        valor_overage_centavos = valor_overage_centavos + _preco
    where organizacao_id = _org
      and periodo_inicio = _periodo
      and feature_codigo = _feature_codigo;
  end if;

  return jsonb_build_object(
    'invocacoes_feature', _row.invocacoes,
    'total_org_mes', _total_org,
    'limite_mes', _limite_mes,
    'dentro_plano', _total_org <= _limite_mes,
    'preco_overage_centavos', _preco
  );
end;
$$;

revoke execute on function public.registrar_ai_usage(uuid, text) from public;
revoke execute on function public.registrar_ai_usage(uuid, text) from anon;
grant   execute on function public.registrar_ai_usage(uuid, text) to authenticated, service_role;

-- ============================================================
-- 5) View v_ai_usage_atual — consumo do mês corrente da org
-- ============================================================
create or replace view public.v_ai_usage_atual
with (security_invoker = on)
as
select
  u.organizacao_id,
  date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as periodo_inicio,
  sum(u.invocacoes)::int as total_invocacoes,
  sum(u.invocacoes_overage)::int as total_overage,
  sum(u.valor_overage_centavos)::int as valor_overage_centavos,
  case o.plano
    when 'starter'  then 300
    when 'growth'   then 2000
    when 'scale'    then 2147483647
    else 300
  end as limite_mes,
  o.plano
from public.ai_usage_mensal u
join public.organizacoes o on o.id = u.organizacao_id
where u.periodo_inicio = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
group by u.organizacao_id, o.plano;

grant select on public.v_ai_usage_atual to authenticated;
