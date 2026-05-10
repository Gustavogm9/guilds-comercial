-- =============================================================================
-- App config table (substitui ALTER DATABASE SET app.*)
--
-- A Mgmt API não tem permissão de superuser pra ALTER DATABASE SET.
-- Ao invés disso, usamos uma tabela de chave-valor pra config global do app.
--
-- Crons leem via SELECT (qualquer role) e endpoints de admin podem atualizar
-- via SQL diretamente (com service role).
-- =============================================================================

create table if not exists public.app_config (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- RLS: ninguém autenticado lê (valores podem ser sensíveis tipo cron_secret)
alter table public.app_config enable row level security;
-- Sem policies = só service role acessa via supabase-js. pg_cron acessa
-- direto sem RLS porque roda como postgres role.

-- Recria o cron email-outbox lendo dessa tabela
do $$
begin
  perform cron.unschedule('email-outbox-process');
exception when others then null;
end $$;

select cron.schedule(
  'email-outbox-process',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := coalesce(
      (select value from public.app_config where key = 'cron_email_url'),
      'https://crm.guilds.com.br/api/cron/email-outbox'
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', coalesce((select value from public.app_config where key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);
