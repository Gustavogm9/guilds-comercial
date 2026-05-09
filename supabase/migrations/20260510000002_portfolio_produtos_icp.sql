-- ============================================================
-- Sprint 6: Portfolio, Produtos, Propostas e ICP Experimental
-- Motor de Prospecção — Multi-hipótese ICP
-- ============================================================

-- 1. Produtos/Serviços da empresa
create table if not exists public.produtos (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  nome            text not null,
  descricao       text,
  categoria       text,
  segmentos_alvo  text[] default '{}',
  cargos_alvo     text[] default '{}',
  valor_base      numeric(12,2),
  valor_max       numeric(12,2),
  recorrente      boolean not null default false,
  ativo           boolean not null default true,
  ordem           int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_produtos_org on public.produtos (organizacao_id, ativo);
alter table public.produtos enable row level security;
create policy if not exists produtos_org on public.produtos
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- 2. Portfolio / Cases da empresa
create table if not exists public.portfolio_cases (
  id               bigserial primary key,
  organizacao_id   uuid not null references public.organizacoes(id) on delete cascade,
  produto_id       bigint references public.produtos(id) on delete set null,
  titulo           text not null,
  cliente_nome     text,
  cliente_segmento text,
  resultado        text,
  resultado_metricas jsonb default '{}',
  depoimento       text,
  link_externo     text,
  imagens          text[] default '{}',
  publico          boolean not null default false,
  destaque         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_portfolio_cases_org on public.portfolio_cases (organizacao_id, destaque desc);
alter table public.portfolio_cases enable row level security;
create policy if not exists portfolio_cases_org on public.portfolio_cases
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- 3. Propostas enviadas (histórico auditável)
create table if not exists public.propostas (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint references public.leads(id) on delete cascade,
  produto_id      bigint references public.produtos(id) on delete set null,
  criado_por      uuid references public.profiles(id) on delete set null,
  variacao        text check (variacao in ('conservadora','recomendada','premium')),
  valor_total     numeric(12,2),
  valor_setup     numeric(12,2),
  valor_mensal    numeric(12,2),
  status          text not null default 'enviada'
                  check (status in ('rascunho','enviada','visualizada','aceita','recusada','expirada')),
  texto_proposta  text,
  link_proposta   text,
  motivo_recusa   text,
  data_envio      date,
  data_resposta   date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_propostas_org  on public.propostas (organizacao_id, created_at desc);
create index if not exists idx_propostas_lead on public.propostas (lead_id);
alter table public.propostas enable row level security;
create policy if not exists propostas_org on public.propostas
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- 4. Hipóteses ICP (multi-perfil experimental — busca PMF)
create table if not exists public.icp_hipoteses (
  id                   bigserial primary key,
  organizacao_id       uuid not null references public.organizacoes(id) on delete cascade,
  nome                 text not null,
  descricao            text,
  produto_id           bigint references public.produtos(id) on delete set null,
  segmentos            text[] default '{}',
  cidades              text[] default '{}',
  cargos               text[] default '{}',
  canal_preferido      text,
  cor                  text default '#6366f1',
  status               text not null default 'ativa'
                       check (status in ('ativa','pausada','descartada','validada')),
  -- Métricas incrementadas conforme leads avançam
  leads_prospectados   int not null default 0,
  leads_em_proposta    int not null default 0,
  leads_fechados       int not null default 0,
  receita_gerada       numeric(12,2) not null default 0,
  taxa_conversao       numeric(5,2),
  ticket_medio         numeric(12,2),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_icp_hipoteses_org on public.icp_hipoteses (organizacao_id, status);
alter table public.icp_hipoteses enable row level security;
create policy if not exists icp_hipoteses_org on public.icp_hipoteses
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- 5. Colunas de rastreabilidade em leads
alter table public.leads
  add column if not exists produto_id  bigint references public.produtos(id) on delete set null,
  add column if not exists hipotese_id bigint references public.icp_hipoteses(id) on delete set null;

-- 6. Triggers updated_at nas novas tabelas
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'produtos_updated_at' and tgrelid = 'public.produtos'::regclass) then
    create trigger produtos_updated_at before update on public.produtos for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'propostas_updated_at' and tgrelid = 'public.propostas'::regclass) then
    create trigger propostas_updated_at before update on public.propostas for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'portfolio_cases_updated_at' and tgrelid = 'public.portfolio_cases'::regclass) then
    create trigger portfolio_cases_updated_at before update on public.portfolio_cases for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'icp_hipoteses_updated_at' and tgrelid = 'public.icp_hipoteses'::regclass) then
    create trigger icp_hipoteses_updated_at before update on public.icp_hipoteses for each row execute function public.set_updated_at();
  end if;
end;
$$;
