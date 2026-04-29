-- Rate limiter persistente para a API pública.
--
-- Substitui o Map() in-memory em lib/api-auth.ts (que zera quando o serverless
-- reinicia). Conta requests por (org, janela de 1 minuto) com upsert atômico.
--
-- Janela de 1 minuto, default 1000 req/min — alinhado com PLANS.starter.
-- Cleanup automático: pg_cron apaga rows > 1h.
--
-- Idempotente.

create table if not exists public.api_rate_counters (
  organizacao_id  uuid        not null references public.organizacoes(id) on delete cascade,
  window_start    timestamptz not null,
  count           integer     not null default 0,
  primary key (organizacao_id, window_start)
);

-- Index pra cleanup eficiente
create index if not exists idx_api_rate_counters_window
  on public.api_rate_counters (window_start);

-- RLS: só service role escreve/lê (gerenciado pela camada de api-auth).
-- Sem policies = ninguém via PostgREST consegue mexer.
alter table public.api_rate_counters enable row level security;

-- Função atômica: consome 1 token. Retorna true se aceito, false se passou do limite.
-- Usa UPSERT na PK (org, window_start) para garantir atomicidade sob concorrência.
create or replace function public.consume_rate_token(
  _org uuid,
  _max_per_min integer default 1000
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _window timestamptz := date_trunc('minute', now());
  _new_count integer;
begin
  insert into public.api_rate_counters (organizacao_id, window_start, count)
  values (_org, _window, 1)
  on conflict (organizacao_id, window_start)
  do update set count = api_rate_counters.count + 1
  returning count into _new_count;

  return _new_count <= _max_per_min;
end;
$$;

-- Permissões: só authenticated/service_role (a função é SECURITY DEFINER, então
-- roda com privs do owner; só precisa que possa ser invocada).
revoke execute on function public.consume_rate_token(uuid, integer) from public;
revoke execute on function public.consume_rate_token(uuid, integer) from anon;
grant   execute on function public.consume_rate_token(uuid, integer) to authenticated, service_role;

-- Cleanup automático via pg_cron (já habilitado na migration v5)
-- Remove counters de janelas > 1h.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('api_rate_counters_cleanup')
      where exists (select 1 from cron.job where jobname = 'api_rate_counters_cleanup');
    perform cron.schedule(
      'api_rate_counters_cleanup',
      '*/15 * * * *',  -- a cada 15 min
      $cleanup$delete from public.api_rate_counters where window_start < now() - interval '1 hour'$cleanup$
    );
  end if;
end $$;
