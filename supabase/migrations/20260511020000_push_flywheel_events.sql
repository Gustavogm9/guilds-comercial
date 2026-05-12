-- =============================================================================
-- Push notifications pros 5 eventos críticos do flywheel
--
-- 1. nps_detrator_recebido  → trigger on insert nps_responses (score <= 6)
-- 2. indicacao_via_portal   → trigger on insert indicacoes (origem='embaixador_portal')
-- 3. health_risco_critico   → cron diário detecta transição saudavel→em_risco
-- 4. renovacao_iminente     → cron diário detecta data_renovacao <= today+7
-- 5. expansao_atrasada      → cron diário detecta expansão com proxima_acao vencida
--
-- Modelo: push_outbox (similar a email_outbox). Triggers/crons inserem linhas.
-- Endpoint Next.js /api/cron/push-outbox processa pendentes a cada 10 min
-- usando lib/push.ts (web-push).
-- =============================================================================

-- 1. Expandir check constraint pra novos eventos
alter table public.notification_preferences
  drop constraint if exists notif_prefs_eventos_valid;
alter table public.notification_preferences
  add constraint notif_prefs_eventos_valid check (
    eventos <@ array[
      'cadencia_vencendo', 'resumo_diario', 'lead_fechado_proposta', 'lead_reabriu',
      'nps_detrator_recebido', 'indicacao_via_portal',
      'health_risco_critico', 'renovacao_iminente', 'expansao_atrasada'
    ]::text[]
  );

-- 2. Push outbox — fila a processar
create table if not exists public.push_outbox (
  id              bigserial primary key,
  organizacao_id  uuid references public.organizacoes(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  evento          text not null check (evento in (
    'nps_detrator_recebido', 'indicacao_via_portal',
    'health_risco_critico', 'renovacao_iminente', 'expansao_atrasada',
    'cadencia_vencendo', 'resumo_diario', 'lead_fechado_proposta', 'lead_reabriu'
  )),
  title           text not null,
  body            text not null,
  url             text,
  tag             text,
  payload         jsonb default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'abandoned', 'skipped')),
  attempts        int not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists idx_push_outbox_pending on public.push_outbox(scheduled_for)
  where status = 'pending';
create index if not exists idx_push_outbox_org on public.push_outbox(organizacao_id);

alter table public.push_outbox enable row level security;
-- Sem policies = só service role acessa

comment on table public.push_outbox is
  'Fila de push notifications a enviar. Cron /api/cron/push-outbox processa a cada 10 min via lib/push.ts (web-push).';

-- =============================================================================
-- Trigger 1: NPS detrator recebido
-- =============================================================================
create or replace function public.trg_push_nps_detrator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_responsavel uuid;
  v_lead_label  text;
begin
  -- Só age quando score chega (insert ou update setando score)
  if NEW.score is null or NEW.score > 6 then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.score is not distinct from NEW.score then return NEW; end if;

  select coalesce(l.empresa, l.nome, 'Lead #' || l.id::text), l.responsavel_id
    into v_lead_label, v_responsavel
  from public.leads l
  where l.id = NEW.lead_id;

  if v_responsavel is null then return NEW; end if;

  insert into public.push_outbox (
    organizacao_id, profile_id, evento, title, body, url, tag, payload
  ) values (
    NEW.organizacao_id,
    v_responsavel,
    'nps_detrator_recebido',
    'NPS detrator: ' || v_lead_label,
    'Score ' || NEW.score::text || '/10. Ação rápida hoje ajuda a salvar o cliente.',
    '/comunicacao/pos-venda?tab=nps',
    'nps-detrator-' || NEW.lead_id::text,
    jsonb_build_object('lead_id', NEW.lead_id, 'score', NEW.score)
  );

  return NEW;
end;
$$;

drop trigger if exists trg_push_nps_detrator on public.nps_responses;
create trigger trg_push_nps_detrator
  after insert or update of score on public.nps_responses
  for each row execute function public.trg_push_nps_detrator();

-- =============================================================================
-- Trigger 2: indicação via portal embaixador
-- =============================================================================
create or replace function public.trg_push_indicacao_portal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_responsavel uuid;
  v_embaixador  text;
begin
  if NEW.origem <> 'embaixador_portal' then return NEW; end if;
  if NEW.embaixador_lead_id is null then return NEW; end if;

  select coalesce(l.empresa, l.nome, 'cliente'), l.responsavel_id
    into v_embaixador, v_responsavel
  from public.leads l
  where l.id = NEW.embaixador_lead_id;

  if v_responsavel is null then return NEW; end if;

  insert into public.push_outbox (
    organizacao_id, profile_id, evento, title, body, url, tag, payload
  ) values (
    NEW.organizacao_id,
    v_responsavel,
    'indicacao_via_portal',
    'Nova indicação de ' || v_embaixador,
    coalesce(NEW.indicado_nome, 'Indicado') || (case when NEW.indicado_empresa is not null then ' (' || NEW.indicado_empresa || ')' else '' end),
    '/growth/indicacoes',
    'indicacao-' || NEW.id::text,
    jsonb_build_object('indicacao_id', NEW.id, 'embaixador_lead_id', NEW.embaixador_lead_id)
  );

  return NEW;
end;
$$;

drop trigger if exists trg_push_indicacao_portal on public.indicacoes;
create trigger trg_push_indicacao_portal
  after insert on public.indicacoes
  for each row execute function public.trg_push_indicacao_portal();

-- =============================================================================
-- Função: enfileira pushes pros eventos diários do flywheel
-- (chamada por cron /api/cron/push-flywheel-diario às 09:00 UTC)
-- =============================================================================
create or replace function public.enfileirar_pushes_diarios_flywheel()
returns table (
  health_risco_enfileirados int,
  renovacoes_enfileiradas int,
  expansoes_enfileiradas int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_health int := 0;
  v_renov int := 0;
  v_expan int := 0;
begin
  -- 3. Health em risco crítico — apenas transições novas (clientes que entraram hoje no risco)
  --    Heurística: snapshot de ontem categoria != em_risco AND cache hoje = em_risco
  with novas_risco as (
    select c.organizacao_id, c.lead_id, c.lead_empresa, c.lead_nome, c.lead_responsavel_id, c.health_score
    from public.health_score_cache c
    left join public.health_score_snapshots s
      on s.lead_id = c.lead_id and s.snapshot_date = (current_date - interval '1 day')::date
    where c.categoria = 'em_risco'
      and c.lead_responsavel_id is not null
      and (s.categoria is null or s.categoria <> 'em_risco')
      and not exists (
        select 1 from public.push_outbox p
        where p.profile_id = c.lead_responsavel_id
          and p.evento = 'health_risco_critico'
          and p.tag = 'health-' || c.lead_id::text
          and p.created_at > now() - interval '7 days'
      )
  ),
  ins as (
    insert into public.push_outbox (organizacao_id, profile_id, evento, title, body, url, tag, payload)
    select
      n.organizacao_id, n.lead_responsavel_id, 'health_risco_critico',
      'Cliente em risco: ' || coalesce(n.lead_empresa, n.lead_nome, 'Lead #' || n.lead_id::text),
      'Score caiu pra ' || n.health_score::text || '. Ver breakdown e agir.',
      '/comunicacao/pos-venda?tab=saude',
      'health-' || n.lead_id::text,
      jsonb_build_object('lead_id', n.lead_id, 'health_score', n.health_score)
    from novas_risco n
    returning id
  )
  select count(*) into v_health from ins;

  -- 4. Renovações iminentes (<= 7 dias)
  with renov_proximas as (
    select l.organizacao_id, l.id as lead_id, coalesce(l.empresa, l.nome) as label,
           l.responsavel_id, l.data_renovacao,
           (l.data_renovacao - current_date)::int as dias
    from public.leads l
    where l.data_renovacao is not null
      and l.data_renovacao between current_date and current_date + interval '7 days'
      and l.responsavel_id is not null
      and not exists (
        select 1 from public.push_outbox p
        where p.profile_id = l.responsavel_id
          and p.evento = 'renovacao_iminente'
          and p.tag = 'renov-' || l.id::text
          and p.created_at > now() - interval '3 days'
      )
  ),
  ins as (
    insert into public.push_outbox (organizacao_id, profile_id, evento, title, body, url, tag, payload)
    select
      r.organizacao_id, r.responsavel_id, 'renovacao_iminente',
      'Renovação em ' || r.dias::text || 'd: ' || coalesce(r.label, 'cliente'),
      'Contrato vence em ' || to_char(r.data_renovacao, 'DD/MM') || '. Confirmar continuidade.',
      '/comunicacao/pos-venda?tab=renovacoes',
      'renov-' || r.lead_id::text,
      jsonb_build_object('lead_id', r.lead_id, 'data_renovacao', r.data_renovacao)
    from renov_proximas r
    returning id
  )
  select count(*) into v_renov from ins;

  -- 5. Expansões atrasadas (data_proxima_acao já passou)
  with expan_atrasadas as (
    select e.organizacao_id, e.id as expansao_id, e.titulo, e.responsavel_id,
           e.cliente_lead_id, e.data_proxima_acao,
           (current_date - e.data_proxima_acao)::int as dias_atraso
    from public.expansoes e
    where e.estagio in ('identificada','qualificada','proposta','negociacao')
      and e.data_proxima_acao is not null
      and e.data_proxima_acao < current_date
      and e.responsavel_id is not null
      and not exists (
        select 1 from public.push_outbox p
        where p.profile_id = e.responsavel_id
          and p.evento = 'expansao_atrasada'
          and p.tag = 'expan-' || e.id::text
          and p.created_at > now() - interval '3 days'
      )
  ),
  ins as (
    insert into public.push_outbox (organizacao_id, profile_id, evento, title, body, url, tag, payload)
    select
      ea.organizacao_id, ea.responsavel_id, 'expansao_atrasada',
      'Expansão atrasada ' || ea.dias_atraso::text || 'd: ' || ea.titulo,
      'Próxima ação vencida. Fechar ou marcar como perdida.',
      '/comunicacao/pos-venda?tab=expansoes',
      'expan-' || ea.expansao_id::text,
      jsonb_build_object('expansao_id', ea.expansao_id, 'lead_id', ea.cliente_lead_id)
    from expan_atrasadas ea
    returning id
  )
  select count(*) into v_expan from ins;

  return query select v_health, v_renov, v_expan;
end;
$$;

comment on function public.enfileirar_pushes_diarios_flywheel() is
  'Roda 1x ao dia (cron). Detecta transições críticas: health saudavel→em_risco, renovações ≤ 7d, expansões com ação vencida. Idempotente em 3-7d.';

-- =============================================================================
-- pg_cron: 1x ao dia 09:00 UTC chama o endpoint /api/cron/push-flywheel-diario
-- =============================================================================
do $$
begin
  perform cron.unschedule('push-flywheel-diario');
exception when others then null;
end $$;

select cron.schedule(
  'push-flywheel-diario',
  '0 9 * * *',
  $$
  select net.http_post(
    url := coalesce(
      (select value from public.app_config where key = 'cron_push_flywheel_url'),
      'https://crm.guilds.com.br/api/cron/push-flywheel-diario'
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', coalesce((select value from public.app_config where key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =============================================================================
-- pg_cron: a cada 10 min processa push_outbox via endpoint /api/cron/push-outbox
-- =============================================================================
do $$
begin
  perform cron.unschedule('push-outbox-process');
exception when others then null;
end $$;

select cron.schedule(
  'push-outbox-process',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := coalesce(
      (select value from public.app_config where key = 'cron_push_url'),
      'https://crm.guilds.com.br/api/cron/push-outbox'
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', coalesce((select value from public.app_config where key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
