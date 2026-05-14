-- Claim atomico para webhook_events.
--
-- Evita entrega duplicada quando cron/manual e retry rodam ao mesmo tempo:
-- a linha sai de pending para processing dentro do banco usando
-- FOR UPDATE SKIP LOCKED, e volta a ficar elegivel se ficar presa por 15 min.

alter table public.webhook_events
  add column if not exists processing_started_at timestamptz;

create index if not exists idx_webhook_events_processing_stale
  on public.webhook_events (processing_started_at)
  where status = 'processing';

create or replace function public.claim_webhook_events(
  _limit int default 50,
  _org uuid default null
)
returns table (
  id uuid,
  event_type text,
  payload jsonb,
  attempts integer,
  webhook_url text,
  webhook_secret text
)
language sql
security definer
set search_path = public
as $$
  with due as (
    select e.id
      from public.webhook_events e
      join public.webhooks w on w.id = e.webhook_id
     where w.active = true
       and (_org is null or e.organizacao_id = _org)
       and (
         (e.status = 'pending' and e.next_attempt_at <= now())
         or
         (e.status = 'processing' and e.processing_started_at < now() - interval '15 minutes')
       )
     order by e.next_attempt_at asc, e.created_at asc
     limit greatest(_limit, 0)
     for update of e skip locked
  )
  update public.webhook_events e
     set status = 'processing',
         processing_started_at = now()
    from due, public.webhooks w
   where e.id = due.id
     and w.id = e.webhook_id
  returning e.id, e.event_type, e.payload, e.attempts, w.url, w.secret;
$$;

revoke all on function public.claim_webhook_events(int, uuid) from public;
grant execute on function public.claim_webhook_events(int, uuid) to service_role;
