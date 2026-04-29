-- Web Push Notifications: subscriptions e preferências por usuário.
--
-- Modelo:
--   - 1 usuário pode ter N subscriptions (1 por device/browser)
--   - 1 usuário tem 1 row em notification_preferences (eventos opt-in + janela)
--   - Cleanup automático: pg_cron remove subscriptions com last_seen_at >180d
--
-- RLS: cada user vê e escreve só as próprias entries. Service role (server)
-- pode tudo via supabaseAdmin.
--
-- Idempotente.

-- ============================================================
-- web_push_subscriptions — uma row por device/browser do user
-- ============================================================
create table if not exists public.web_push_subscriptions (
  id            bigint generated always as identity primary key,
  profile_id    uuid       not null references public.profiles(id) on delete cascade,
  endpoint      text       not null,
  p256dh        text       not null,
  auth          text       not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (profile_id, endpoint)
);

create index if not exists idx_web_push_subs_profile
  on public.web_push_subscriptions (profile_id);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists web_push_subs_select_own on public.web_push_subscriptions;
create policy web_push_subs_select_own on public.web_push_subscriptions
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists web_push_subs_insert_own on public.web_push_subscriptions;
create policy web_push_subs_insert_own on public.web_push_subscriptions
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists web_push_subs_delete_own on public.web_push_subscriptions;
create policy web_push_subs_delete_own on public.web_push_subscriptions
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- ============================================================
-- notification_preferences — 1 row por user, opt-in granular
-- ============================================================
create table if not exists public.notification_preferences (
  profile_id      uuid       primary key references public.profiles(id) on delete cascade,
  ativo           boolean    not null default true,
  -- Eventos opt-in. Default: todos os 4 do PRD.
  eventos         text[]     not null default '{cadencia_vencendo,resumo_diario,lead_fechado_proposta,lead_reabriu}'::text[],
  janela_inicio   time       not null default '08:00:00',
  janela_fim      time       not null default '20:00:00',
  fuso_horario    text       not null default 'America/Sao_Paulo',
  updated_at      timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists notif_prefs_select_own on public.notification_preferences;
create policy notif_prefs_select_own on public.notification_preferences
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists notif_prefs_upsert_own on public.notification_preferences;
create policy notif_prefs_upsert_own on public.notification_preferences
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists notif_prefs_update_own on public.notification_preferences;
create policy notif_prefs_update_own on public.notification_preferences
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Validações leves
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notif_prefs_eventos_valid') then
    alter table public.notification_preferences
      add constraint notif_prefs_eventos_valid
      check (eventos <@ array['cadencia_vencendo','resumo_diario','lead_fechado_proposta','lead_reabriu']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notif_prefs_janela_valida') then
    alter table public.notification_preferences
      add constraint notif_prefs_janela_valida
      check (janela_inicio < janela_fim);
  end if;
end $$;

-- Auto-touch updated_at
drop trigger if exists trg_notif_prefs_updated_at on public.notification_preferences;
create trigger trg_notif_prefs_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ============================================================
-- Cleanup cron: remove subscriptions com >180d sem ping
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('web_push_subscriptions_cleanup')
      where exists (select 1 from cron.job where jobname = 'web_push_subscriptions_cleanup');
    perform cron.schedule(
      'web_push_subscriptions_cleanup',
      '0 4 * * 0',  -- domingo 04:00 UTC
      $cleanup$delete from public.web_push_subscriptions where last_seen_at < now() - interval '180 days'$cleanup$
    );
  end if;
end $$;
