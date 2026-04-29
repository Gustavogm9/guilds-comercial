-- A/B testing de prompts — gestor cria experimento entre 2 versões de prompt,
-- dispatcher escolhe variant aleatória respeitando traffic_split, e mede
-- qual variant gera mais sucesso (taxa de aceite, taxa de resposta, conversão).
--
-- Métrica principal: "taxa_aceite" (vendedor clicou em "usar/copiar" o output).
-- Métricas secundárias futuras: "taxa_resposta_lead" (depende WhatsApp webhook),
-- "taxa_conversao" (lead avançou etapa em N dias).
--
-- Idempotente.

create table if not exists public.ai_prompt_experiments (
  id              bigint generated always as identity primary key,
  organizacao_id  uuid     not null references public.organizacoes(id) on delete cascade,
  feature_codigo  text     not null,
  variant_a_prompt_id bigint not null references public.ai_prompts(id) on delete cascade,
  variant_b_prompt_id bigint not null references public.ai_prompts(id) on delete cascade,
  traffic_split   integer  not null default 50 check (traffic_split between 0 and 100),
  status          text     not null default 'rodando' check (status in ('rodando','pausado','encerrado')),
  metrica_vitoria text     not null default 'taxa_aceite' check (metrica_vitoria in ('taxa_aceite','taxa_resposta_lead','taxa_conversao')),
  amostra_minima  integer  not null default 30,
  winner_variant  text     check (winner_variant is null or winner_variant in ('a','b','empate')),
  observacoes     text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  created_at      timestamptz not null default now(),
  unique (organizacao_id, feature_codigo, status) deferrable initially deferred
);

-- só 1 experimento "rodando" por (org, feature) — UNIQUE acima cobre, mas
-- o índice parcial garante quando status muda
drop index if exists idx_ai_prompt_exp_unico_rodando;
create unique index idx_ai_prompt_exp_unico_rodando
  on public.ai_prompt_experiments (organizacao_id, feature_codigo)
  where status = 'rodando';

create index if not exists idx_ai_prompt_exp_org
  on public.ai_prompt_experiments (organizacao_id, status);

alter table public.ai_prompt_experiments enable row level security;

drop policy if exists ai_prompt_exp_select_org on public.ai_prompt_experiments;
create policy ai_prompt_exp_select_org on public.ai_prompt_experiments
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

drop policy if exists ai_prompt_exp_write_gestor on public.ai_prompt_experiments;
create policy ai_prompt_exp_write_gestor on public.ai_prompt_experiments
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

-- ============================================================
-- ai_experiment_events — log de cada invocação participante
-- ============================================================
create table if not exists public.ai_experiment_events (
  id              bigint generated always as identity primary key,
  experiment_id   bigint   not null references public.ai_prompt_experiments(id) on delete cascade,
  invocation_id   bigint   not null references public.ai_invocations(id) on delete cascade,
  variant         text     not null check (variant in ('a','b')),
  evento_sucesso  text     check (evento_sucesso is null or evento_sucesso in ('aceito','recusado','copiado','convertido')),
  created_at      timestamptz not null default now(),
  unique (experiment_id, invocation_id)
);

create index if not exists idx_ai_exp_events_exp_variant
  on public.ai_experiment_events (experiment_id, variant);

alter table public.ai_experiment_events enable row level security;

drop policy if exists ai_exp_events_select_org on public.ai_experiment_events;
create policy ai_exp_events_select_org on public.ai_experiment_events
  for select to authenticated
  using (
    experiment_id in (
      select id from public.ai_prompt_experiments
      where organizacao_id in (select public.orgs_do_usuario())
    )
  );

-- ============================================================
-- View v_ai_experimento_resultado — taxa de sucesso por variant
-- ============================================================
create or replace view public.v_ai_experimento_resultado
with (security_invoker = on)
as
select
  e.experiment_id,
  e.variant,
  count(*)::int as total,
  count(*) filter (where e.evento_sucesso in ('aceito','copiado','convertido'))::int as sucessos,
  case when count(*) > 0
    then round(100.0 * count(*) filter (where e.evento_sucesso in ('aceito','copiado','convertido')) / count(*)::numeric, 1)
    else 0
  end as taxa_sucesso_pct
from public.ai_experiment_events e
group by e.experiment_id, e.variant;

grant select on public.v_ai_experimento_resultado to authenticated;

-- ============================================================
-- Função: pega experimento ativo + escolhe variant
-- ============================================================
-- Retorna { experiment_id, variant, prompt_id } ou NULL se não há experimento.
-- Determinístico por hash de invocação (não, na verdade vamos usar random
-- aqui pra simplificar; em produção mais maduro usaríamos hash do user_id pra
-- consistência).
create or replace function public.escolher_prompt_experimento(
  _org uuid,
  _feature_codigo text
) returns table (experiment_id bigint, variant text, prompt_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  _exp record;
  _aleatorio integer;
  _variant text;
  _pid bigint;
begin
  -- Busca experimento rodando
  select * into _exp from public.ai_prompt_experiments
  where organizacao_id = _org and feature_codigo = _feature_codigo and status = 'rodando'
  limit 1;

  if _exp is null then return; end if;

  -- Sorteia
  _aleatorio := (random() * 100)::int;
  if _aleatorio < _exp.traffic_split then
    _variant := 'a';
    _pid := _exp.variant_a_prompt_id;
  else
    _variant := 'b';
    _pid := _exp.variant_b_prompt_id;
  end if;

  experiment_id := _exp.id;
  variant := _variant;
  prompt_id := _pid;
  return next;
end;
$$;

revoke execute on function public.escolher_prompt_experimento(uuid, text) from public;
revoke execute on function public.escolher_prompt_experimento(uuid, text) from anon;
grant   execute on function public.escolher_prompt_experimento(uuid, text) to authenticated, service_role;

-- ============================================================
-- Função registrar_evento_experimento(invocation_id, evento)
-- ============================================================
-- Atualiza o evento_sucesso de uma invocação que faz parte de experimento.
create or replace function public.registrar_evento_experimento(
  _invocation_id bigint,
  _evento text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_experiment_events
  set evento_sucesso = _evento
  where invocation_id = _invocation_id;
  return found;
end;
$$;

revoke execute on function public.registrar_evento_experimento(bigint, text) from public;
revoke execute on function public.registrar_evento_experimento(bigint, text) from anon;
grant   execute on function public.registrar_evento_experimento(bigint, text) to authenticated, service_role;
