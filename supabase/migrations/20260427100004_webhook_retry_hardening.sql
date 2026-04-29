-- Hardening do retry/DLQ de webhook_events.
--
-- 1) Adiciona coluna `error_message` para diagnóstico (HTTP status, timeout, etc.)
-- 2) Adiciona índice parcial pra consulta de pending+devido (executar agora)
-- 3) Schedula pg_cron pra disparar /api/cron/webhook-retry todo minuto
--    — só agenda se a env var APP_URL e CRON_SECRET estiverem configuradas
--    no Vault. Caso não estejam, pula sem erro (idempotente).
--
-- Idempotente.

alter table public.webhook_events
  add column if not exists error_message text;

create index if not exists idx_webhook_events_pending_due
  on public.webhook_events (next_attempt_at)
  where status = 'pending';

-- Schedule pg_cron — assume que cron.sql original já criou Vault secret
-- 'CRON_SECRET' e 'APP_URL'. Se não, este do$$ é no-op.
do $$
declare
  _cron_secret text;
  _app_url text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  begin
    select decrypted_secret into _cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET';
    select decrypted_secret into _app_url     from vault.decrypted_secrets where name = 'APP_URL';
  exception when others then
    return; -- vault não configurado, sai limpo
  end;
  if _cron_secret is null or _app_url is null then return; end if;

  -- Remove schedule antigo se existir
  perform cron.unschedule('webhook_retry')
    where exists (select 1 from cron.job where jobname = 'webhook_retry');

  -- Roda todo minuto
  perform cron.schedule(
    'webhook_retry',
    '* * * * *',
    format($job$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', %L),
      body := '{}'::jsonb
    )$job$, _app_url || '/api/cron/webhook-retry', _cron_secret)
  );
end $$;
