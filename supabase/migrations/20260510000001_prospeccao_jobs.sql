-- ============================================================
-- Sprint 4: Motor de Prospecção — Jobs e rastreabilidade
-- ============================================================

-- Tabela de jobs de prospecção (histórico de buscas e enriquecimentos)
create table if not exists public.prospeccao_jobs (
  id             bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  criado_por     uuid references public.profiles(id) on delete set null,
  tipo           text not null check (tipo in ('busca','enriquecimento','qualificacao','ativacao')),
  status         text not null default 'pendente'
                 check (status in ('pendente','processando','concluido','erro')),
  input          jsonb not null default '{}',
  output         jsonb,
  leads_criados  int not null default 0,
  custo_usd      numeric(10,6),
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index if not exists idx_prospeccao_jobs_org
  on public.prospeccao_jobs (organizacao_id, created_at desc);

alter table public.prospeccao_jobs enable row level security;

create policy prospeccao_jobs_org on public.prospeccao_jobs
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

-- Coluna de rastreabilidade de origem na tabela de leads
alter table public.leads
  add column if not exists origem_prospeccao jsonb;
-- Exemplo: { "job_id": 42, "fonte": "firecrawl", "url_origem": "https://empresa.com" }
