-- ============================================================
-- Sprint 10-A: Portfolio & ICP Lab — Fundações
-- ============================================================

-- 1. Variações/planos por produto (Starter, Pro, Enterprise, etc.)
create table if not exists public.produto_variacoes (
  id              bigserial primary key,
  organizacao_id  uuid    not null references public.organizacoes(id) on delete cascade,
  produto_id      bigint  not null references public.produtos(id) on delete cascade,
  nome            text    not null,
  descricao       text,
  valor           numeric,
  recorrente      boolean not null default false,
  ativo           boolean not null default true,
  ordem           int     not null default 0,
  created_at      timestamptz not null default now()
);
alter table public.produto_variacoes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='produto_variacoes' and policyname='pv_org') then
    execute 'create policy pv_org on public.produto_variacoes for all to authenticated using (organizacao_id in (select public.orgs_do_usuario())) with check (organizacao_id in (select public.orgs_do_usuario()))';
  end if;
end $$;
create index if not exists idx_pv_produto on public.produto_variacoes (produto_id);

-- 2. Equipe dedicada por produto (quem vende o quê)
create table if not exists public.produto_responsaveis (
  produto_id  bigint  not null references public.produtos(id) on delete cascade,
  profile_id  uuid    not null references public.profiles(id) on delete cascade,
  papel       text    not null default 'comercial'
              check (papel in ('comercial', 'tecnico', 'gestor', 'suporte')),
  created_at  timestamptz not null default now(),
  primary key (produto_id, profile_id)
);
create index if not exists idx_pr_produto on public.produto_responsaveis (produto_id);
create index if not exists idx_pr_profile on public.produto_responsaveis (profile_id);
-- RLS via join com produtos (mesma org)

-- 3. Lead × Produto N:N (multi-produto por lead)
create table if not exists public.lead_produtos (
  lead_id     bigint  not null references public.leads(id) on delete cascade,
  produto_id  bigint  not null references public.produtos(id) on delete cascade,
  status      text    not null default 'interesse'
              check (status in ('interesse', 'negociando', 'fechado', 'perdido')),
  added_at    timestamptz not null default now(),
  primary key (lead_id, produto_id)
);
create index if not exists idx_lp_produto on public.lead_produtos (produto_id, status);
create index if not exists idx_lp_lead   on public.lead_produtos (lead_id);
-- RLS via leads (mesma org) — herda permissão via FK

-- 4. Score de fit por produto nos leads (look-alike, calculado pelo motor)
alter table public.leads
  add column if not exists produto_scores jsonb not null default '{}';
-- Ex: {"1": 0.87, "3": 0.62} — chave = produto_id (text), valor = score 0-1

-- 5. Projetos próprios: portfolio de work interno da empresa
--    Flag is_proprio nos portfolio_cases existentes
alter table public.portfolio_cases
  add column if not exists is_proprio      boolean not null default false,
  add column if not exists tecnologias     text[]  not null default '{}',
  add column if not exists data_conclusao  date,
  add column if not exists lead_id         bigint  references public.leads(id) on delete set null;
-- Obs: lead_id = cliente que gerou o case (when is_proprio=false)

-- 6. Proposta com múltiplos itens (backward compat — produto_id continua existindo)
create table if not exists public.proposta_itens (
  id              bigserial primary key,
  proposta_id     bigint  not null references public.propostas(id) on delete cascade,
  organizacao_id  uuid    not null,
  produto_id      bigint  references public.produtos(id) on delete set null,
  variacao_id     bigint  references public.produto_variacoes(id) on delete set null,
  descricao       text,
  quantidade      int     not null default 1,
  valor_unitario  numeric,
  valor_total     numeric generated always as (quantidade * coalesce(valor_unitario, 0)) stored,
  created_at      timestamptz not null default now()
);
create index if not exists idx_pi_proposta on public.proposta_itens (proposta_id);
alter table public.proposta_itens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='proposta_itens' and policyname='pi_org') then
    execute 'create policy pi_org on public.proposta_itens for all to authenticated using (organizacao_id in (select public.orgs_do_usuario())) with check (organizacao_id in (select public.orgs_do_usuario()))';
  end if;
end $$;

-- 7. Trigger: ao vincular lead_produtos, registra na lead_timeline
create or replace function public.on_lead_produto_add()
returns trigger language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_nome   text;
begin
  select organizacao_id into v_org_id from public.leads where id = new.lead_id;
  select nome into v_nome from public.produtos where id = new.produto_id;
  insert into public.lead_timeline
    (organizacao_id, lead_id, tipo, titulo, metadata, ref_id, ref_tabela)
  values (
    v_org_id, new.lead_id, 'sistema',
    format('Produto vinculado: %s', coalesce(v_nome, 'desconhecido')),
    jsonb_build_object('produto_id', new.produto_id, 'status', new.status),
    new.produto_id, 'produtos'
  );
  return new;
end;
$$;
drop trigger if exists tg_lead_produto_timeline on public.lead_produtos;
create trigger tg_lead_produto_timeline after insert on public.lead_produtos
  for each row execute function public.on_lead_produto_add();

-- 8. View: métricas por produto
create or replace view public.v_metricas_produto as
select
  p.id,
  p.organizacao_id,
  p.nome,
  p.categoria,
  p.recorrente,
  count(distinct lp.lead_id)                                       as total_leads,
  count(distinct lp.lead_id) filter (where lp.status = 'negociando') as em_negociacao,
  count(distinct lp.lead_id) filter (where lp.status = 'fechado')    as fechados,
  count(distinct lp.lead_id) filter (where lp.status = 'perdido')    as perdidos,
  round(
    100.0 * count(distinct lp.lead_id) filter (where lp.status = 'fechado') /
    nullif(count(distinct lp.lead_id) filter (where lp.status in ('fechado','perdido')), 0)
  , 1)                                                              as taxa_conversao_pct,
  avg(pr2.valor_total) filter (where pr2.status = 'aceita')         as ticket_medio,
  count(distinct pc.id)                                             as total_cases,
  count(distinct prp.profile_id)                                    as total_responsaveis
from public.produtos p
left join public.lead_produtos lp        on lp.produto_id = p.id
left join public.propostas     pr2       on pr2.produto_id = p.id
left join public.portfolio_cases pc      on pc.produto_id  = p.id
left join public.produto_responsaveis prp on prp.produto_id = p.id
group by p.id, p.organizacao_id, p.nome, p.categoria, p.recorrente;
