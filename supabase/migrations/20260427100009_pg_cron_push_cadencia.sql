-- Schedule pg_cron pra disparar /api/cron/push-cadencia a cada hora.
-- Idempotente. Sem-op se cron extension não disponível ou Vault não configurado.

do $$
declare
  _cron_secret text;
  _app_url text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  begin
    select decrypted_secret into _cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET';
    select decrypted_secret into _app_url     from vault.decrypted_secrets where name = 'APP_URL';
  exception when others then return;
  end;
  if _cron_secret is null or _app_url is null then return; end if;

  perform cron.unschedule('push_cadencia_hourly')
    where exists (select 1 from cron.job where jobname = 'push_cadencia_hourly');

  perform cron.schedule(
    'push_cadencia_hourly',
    '0 * * * *',  -- a cada hora cheia
    format($job$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', %L),
      body := '{}'::jsonb
    )$job$, _app_url || '/api/cron/push-cadencia', _cron_secret)
  );
end $$;
