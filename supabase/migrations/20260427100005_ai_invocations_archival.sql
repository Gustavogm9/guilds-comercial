-- Archival de ai_invocations.
--
-- Problema: ai_invocations cresce linearmente com uso de IA. Em ritmo de
-- ~200 invocações/org/dia × 10 orgs = 2k/dia = ~720k/ano com `output_texto`
-- e `input_vars` ocupando muito espaço. v_ai_uso_30d só lê últimos 30d, mas
-- a tabela toda mantém histórico.
--
-- Solução: tabela `ai_invocations_archive` com schema reduzido (sem texto
-- completo, só métricas) + função que move rows > 90d para archive +
-- pg_cron semanal.
--
-- Idempotente.

create table if not exists public.ai_invocations_archive (
  id              bigint primary key,
  organizacao_id  uuid        not null,
  feature_codigo  text        not null,
  prompt_versao   integer,
  provider_codigo text,
  modelo          text,
  ator_id         uuid,
  lead_id         bigint,
  -- input_vars e output_texto / output_json descartados (economia ~95% de espaço)
  tokens_input    integer,
  tokens_output   integer,
  custo_estimado  numeric,
  latencia_ms     integer,
  status          text        not null,
  erro_msg        text,
  created_at      timestamptz not null,
  archived_at     timestamptz not null default now()
);

create index if not exists idx_ai_invocations_archive_org_feat_created
  on public.ai_invocations_archive (organizacao_id, feature_codigo, created_at desc);

alter table public.ai_invocations_archive enable row level security;
-- Sem policies — leitura/escrita só via service_role (relatórios futuros).

-- Função que move >90d para archive e remove da original
create or replace function public.archive_old_ai_invocations(_older_than_days integer default 90)
returns table (moved bigint, kept bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  _cutoff timestamptz := now() - make_interval(days => _older_than_days);
  _moved bigint;
begin
  with moved_rows as (
    delete from public.ai_invocations
    where created_at < _cutoff
    returning id, organizacao_id, feature_codigo, prompt_versao, provider_codigo,
              modelo, ator_id, lead_id, tokens_input, tokens_output,
              custo_estimado, latencia_ms, status, erro_msg, created_at
  )
  insert into public.ai_invocations_archive (
    id, organizacao_id, feature_codigo, prompt_versao, provider_codigo, modelo,
    ator_id, lead_id, tokens_input, tokens_output, custo_estimado, latencia_ms,
    status, erro_msg, created_at
  )
  select * from moved_rows
  on conflict (id) do nothing;

  get diagnostics _moved = row_count;

  return query select _moved, (select count(*) from public.ai_invocations);
end;
$$;

revoke execute on function public.archive_old_ai_invocations(integer) from public;
revoke execute on function public.archive_old_ai_invocations(integer) from anon;
grant   execute on function public.archive_old_ai_invocations(integer) to service_role;

-- Cron semanal — domingo 03:00 UTC
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ai_invocations_archive')
      where exists (select 1 from cron.job where jobname = 'ai_invocations_archive');
    perform cron.schedule(
      'ai_invocations_archive',
      '0 3 * * 0',
      $job$select public.archive_old_ai_invocations(90)$job$
    );
  end if;
end $$;
