-- Product foundations: trial/billing metadata and organization activation events.

alter table public.organizacoes
  add column if not exists plano text not null default 'trial',
  add column if not exists billing_status text not null default 'trialing',
  add column if not exists trial_started_at timestamptz not null default now(),
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days'),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table public.organizacoes
  drop constraint if exists organizacoes_billing_status_check;

alter table public.organizacoes
  add constraint organizacoes_billing_status_check
  check (billing_status in ('trialing', 'active', 'past_due', 'canceled'));

alter table public.organizacoes
  drop constraint if exists organizacoes_plano_check;

alter table public.organizacoes
  add constraint organizacoes_plano_check
  check (plano in ('trial', 'starter', 'growth', 'scale'));

create table if not exists public.organizacao_evento (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  ator_id uuid references auth.users(id) on delete set null,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_organizacao_evento_org_created
  on public.organizacao_evento(organizacao_id, created_at desc);

alter table public.organizacao_evento enable row level security;

drop policy if exists organizacao_evento_org on public.organizacao_evento;
create policy organizacao_evento_org on public.organizacao_evento
  for all
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create or replace view public.v_ativacao_org as
select
  o.id as organizacao_id,
  count(distinct m.profile_id) filter (where m.ativo) as membros_ativos,
  count(distinct c.id) filter (where c.aceito_em is null and c.expira_em > now()) as convites_pendentes,
  count(distinct l.id) as leads_total,
  count(distinct l.id) filter (where l.crm_stage not in ('Base', 'Prospecção')) as leads_movidos,
  count(distinct ai.id) filter (where ai.status = 'sucesso') as ia_sucesso_30d,
  count(distinct ak.id) filter (where ak.ativo) as api_keys_ativas,
  count(distinct w.id) filter (where w.ativo) as webhooks_ativos
from public.organizacoes o
left join public.membros_organizacao m on m.organizacao_id = o.id
left join public.convites c on c.organizacao_id = o.id
left join public.leads l on l.organizacao_id = o.id
left join public.ai_invocations ai
  on ai.organizacao_id = o.id
  and ai.created_at >= now() - interval '30 days'
left join public.api_keys ak on ak.organizacao_id = o.id
left join public.webhooks w on w.organizacao_id = o.id
group by o.id;
