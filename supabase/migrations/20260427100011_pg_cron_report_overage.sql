-- Schedule pg_cron pra reportar overage do mês anterior ao Stripe.
-- Roda dia 1 às 03:00 UTC. Idempotente.

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

  perform cron.unschedule('report_ai_overage_monthly')
    where exists (select 1 from cron.job where jobname = 'report_ai_overage_monthly');

  perform cron.schedule(
    'report_ai_overage_monthly',
    '0 3 1 * *',  -- dia 1 às 03:00 UTC
    format($job$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', %L),
      body := '{}'::jsonb
    )$job$, _app_url || '/api/cron/report-ai-overage', _cron_secret)
  );
end $$;
