-- Migration para habilitar pg_cron e agendar o Daily Digest

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- O pg_cron chama o pg_net para fazer o POST no nosso Next.js App
-- Agenda para rodar todo dia às 08:00 (UTC)
SELECT cron.schedule(
    'daily-digest-cron', 
    '0 8 * * *', 
    $$
    SELECT net.http_post(
        url := 'https://guilds-comercial.vercel.app/api/v1/cron/daily-digest',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer SEU_CRON_SECRET"}'::jsonb,
        body := '{}'::jsonb
    );
    $$
);
