-- Proposal operations: versions, feedback and manager-configurable skill chains.

alter table public.propostas
  add column if not exists versao_atual int not null default 1,
  add column if not exists html_proposta text,
  add column if not exists input_vars jsonb not null default '{}'::jsonb,
  add column if not exists ultimo_pedido_melhoria text;

create table if not exists public.proposta_versoes (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  proposta_id bigint not null references public.propostas(id) on delete cascade,
  lead_id bigint references public.leads(id) on delete set null,
  versao int not null,
  texto_proposta text not null,
  html_proposta text,
  input_vars jsonb not null default '{}'::jsonb,
  pedido_melhoria text,
  ai_invocation_id bigint references public.ai_invocations(id) on delete set null,
  criado_por uuid references public.profiles(id) on delete set null,
  status text not null default 'gerada' check (status in ('gerada','validada','enviada','descartada')),
  created_at timestamptz not null default now(),
  unique (proposta_id, versao)
);

create index if not exists idx_proposta_versoes_org_date
  on public.proposta_versoes (organizacao_id, created_at desc);
create index if not exists idx_proposta_versoes_proposta
  on public.proposta_versoes (proposta_id, versao desc);

create table if not exists public.proposta_feedback (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  proposta_id bigint not null references public.propostas(id) on delete cascade,
  versao_id bigint references public.proposta_versoes(id) on delete set null,
  tipo text not null check (tipo in ('correcao','melhoria','aprovacao','rejeicao')),
  conteudo text not null,
  resolvido boolean not null default false,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_proposta_feedback_org_date
  on public.proposta_feedback (organizacao_id, created_at desc);
create index if not exists idx_proposta_feedback_proposta
  on public.proposta_feedback (proposta_id, created_at desc);

create table if not exists public.proposta_skill_configs (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  formato text not null default 'proposta_comercial'
    check (formato in ('proposta_comercial','escopo_tecnico','email_executivo','whatsapp_resumo')),
  skill_chain text not null,
  modelo_referencia text,
  ativo boolean not null default true,
  padrao boolean not null default false,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proposta_skill_configs_org
  on public.proposta_skill_configs (organizacao_id, ativo, formato);

alter table public.proposta_versoes enable row level security;
alter table public.proposta_feedback enable row level security;
alter table public.proposta_skill_configs enable row level security;

drop policy if exists proposta_versoes_org on public.proposta_versoes;
drop policy if exists proposta_feedback_org on public.proposta_feedback;
drop policy if exists proposta_skill_configs_org on public.proposta_skill_configs;

create policy proposta_versoes_org on public.proposta_versoes
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy proposta_feedback_org on public.proposta_feedback
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy proposta_skill_configs_org on public.proposta_skill_configs
  for all using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));
