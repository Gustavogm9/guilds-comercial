-- ============================================================
-- AGENDAMENTO DA EDGE FUNCTION daily-digest
-- ------------------------------------------------------------
-- Roda toda manhã às 07:00 (BRT) = 10:00 UTC
-- Pré-requisitos: extensão pg_cron ativa no projeto Supabase.
-- ============================================================

-- Ativar extensões (idempotente)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- IMPORTANTE: substitua os valores abaixo no painel Supabase ANTES de criar:
--   <PROJECT_REF>          → ref do seu projeto (ex.: abc123xyz)
--   <SUPABASE_ANON_KEY>    → opcional; usamos service_role no cabeçalho
-- Recomendamos usar Vault para guardar a service role key:
--   select vault.create_secret('SERVICE_ROLE_KEY','<sua chave>');

-- Remove agendamento antigo (idempotente)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-digest-7am-brt') then
    perform cron.unschedule('daily-digest-7am-brt');
  end if;
end $$;

-- Agenda novo (todo dia útil às 10:00 UTC = 7:00 BRT)
select cron.schedule(
  'daily-digest-7am-brt',
  '0 10 * * 1-5',  -- min hora dia mês dia-da-semana (seg-sex)
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.functions.supabase.co/daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SERVICE_ROLE_KEY' limit 1)
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Para testar manualmente:
--   select cron.schedule('test-once','* * * * *','select net.http_post(...)');
--   select cron.unschedule('test-once');

-- Para verificar execuções:
--   select jobname, status, return_message, start_time
--   from cron.job_run_details
--   order by start_time desc limit 10;
