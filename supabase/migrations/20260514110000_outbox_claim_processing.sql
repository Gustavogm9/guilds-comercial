-- Claim atomico para outboxes processadas por cron/serverless.
-- Evita que duas execucoes simultaneas enviem o mesmo email/push.

alter table public.email_outbox
  drop constraint if exists email_outbox_status_check;
alter table public.email_outbox
  add constraint email_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'abandoned'));
alter table public.email_outbox
  add column if not exists processing_started_at timestamptz;

alter table public.push_outbox
  drop constraint if exists push_outbox_status_check;
alter table public.push_outbox
  add constraint push_outbox_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'abandoned', 'skipped'));
alter table public.push_outbox
  add column if not exists processing_started_at timestamptz;

create index if not exists idx_email_outbox_processing_stale
  on public.email_outbox(processing_started_at)
  where status = 'processing';

create index if not exists idx_push_outbox_processing_stale
  on public.push_outbox(processing_started_at)
  where status = 'processing';

create or replace function public.claim_email_outbox(_limit int default 50)
returns setof public.email_outbox
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.email_outbox
    where (
      status = 'pending'
      and scheduled_for <= now()
    ) or (
      status = 'processing'
      and processing_started_at < now() - interval '15 minutes'
    )
    order by created_at asc
    limit greatest(1, least(_limit, 100))
    for update skip locked
  ),
  claimed as (
    update public.email_outbox e
       set status = 'processing',
           processing_started_at = now()
      from picked
     where e.id = picked.id
     returning e.*
  )
  select * from claimed;
$$;

create or replace function public.claim_push_outbox(_limit int default 100)
returns setof public.push_outbox
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.push_outbox
    where (
      status = 'pending'
      and scheduled_for <= now()
    ) or (
      status = 'processing'
      and processing_started_at < now() - interval '15 minutes'
    )
    order by created_at asc
    limit greatest(1, least(_limit, 200))
    for update skip locked
  ),
  claimed as (
    update public.push_outbox p
       set status = 'processing',
           processing_started_at = now()
      from picked
     where p.id = picked.id
     returning p.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_email_outbox(int) from public;
revoke all on function public.claim_push_outbox(int) from public;
grant execute on function public.claim_email_outbox(int) to service_role;
grant execute on function public.claim_push_outbox(int) to service_role;
