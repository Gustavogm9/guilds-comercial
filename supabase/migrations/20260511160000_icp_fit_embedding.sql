-- =============================================================================
-- ICP fit score via embeddings (pgvector)
--
-- Modelo: text-embedding-3-small (OpenAI, 1536 dim) ou
-- text-embedding-3-large (3072 dim). Vou padronizar em 1536 — barato + bom.
--
-- 1. prospeccao_empresa ganha coluna `embedding vector(1536)`
-- 2. org_icp_centroide: 1 row por org com vetor centroide dos clientes
--    fechados (média dos embeddings dos leads "Fechado")
-- 3. View calcula score = (1 - cosine_distance) × 100
-- 4. Server actions geram embeddings via OpenAI quando solicitado
--
-- pgvector cosine: <=> retorna distance (0=igual, 2=oposto), então
-- similarity = 1 - distance/2. Pra UI: 0 (péssimo) a 100 (perfeito).
-- =============================================================================

create extension if not exists vector;

-- =============================================================================
-- 1. Embedding na empresa
-- =============================================================================
alter table public.prospeccao_empresa
  add column if not exists embedding vector(1536);

alter table public.prospeccao_empresa
  add column if not exists embedding_texto_hash text;  -- md5 do texto gerado pra detectar reuso

-- Index pra busca rápida (ivfflat ou hnsw). HNSW é mais rápido pra reads,
-- ivfflat usa menos memória. Pra <100k empresas, ivfflat com lists=100 é OK.
create index if not exists idx_prospeccao_empresa_embedding
  on public.prospeccao_empresa
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- =============================================================================
-- 2. Centroide ICP por org
-- =============================================================================
create table if not exists public.org_icp_centroide (
  organizacao_id  uuid primary key references public.organizacoes(id) on delete cascade,
  centroide       vector(1536) not null,
  -- Texto agregado usado pra debug + cluster summary
  amostra_textos  text[] not null default '{}',
  total_clientes  int not null default 0,
  atualizado_em   timestamptz not null default now()
);

alter table public.org_icp_centroide enable row level security;
drop policy if exists org_icp_centroide_select on public.org_icp_centroide;
create policy org_icp_centroide_select on public.org_icp_centroide
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

comment on table public.org_icp_centroide is
  'Centroide do embedding dos clientes fechados de cada org. Recalculado mensalmente.';

-- =============================================================================
-- 3. Função: calcular ICP fit score (0-100) pra uma empresa em uma org
-- =============================================================================
create or replace function public.icp_fit_score(_empresa_id bigint, _org_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select centroide from public.org_icp_centroide where organizacao_id = _org_id
  ),
  e as (
    select embedding from public.prospeccao_empresa where id = _empresa_id
  )
  select case
    when c.centroide is null or e.embedding is null then null
    else round(((1 - (c.centroide <=> e.embedding) / 2) * 100)::numeric, 1)
  end as score
  from c, e;
$$;

grant execute on function public.icp_fit_score(bigint, uuid) to authenticated;

-- =============================================================================
-- 4. Função: top-N empresas com melhor fit ICP pra uma org
-- =============================================================================
create or replace function public.top_empresas_icp_fit(
  _org_id uuid,
  _limit int default 20,
  _excluir_ja_lead boolean default true
)
returns table (
  empresa_id bigint,
  cnpj text,
  razao_social text,
  nome_fantasia text,
  porte text,
  cidade text,
  uf text,
  cnae_normalizado text,
  fit_score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_centroide vector(1536);
begin
  select centroide into v_centroide
  from public.org_icp_centroide
  where organizacao_id = _org_id;

  if v_centroide is null then return; end if;

  return query
  select
    e.id, e.cnpj, e.razao_social, e.nome_fantasia,
    e.porte, e.cidade, e.uf, e.cnae_normalizado,
    round(((1 - (v_centroide <=> e.embedding) / 2) * 100)::numeric, 1) as fit_score
  from public.prospeccao_empresa e
  left join public.prospeccao_empresa_meta_org m
    on m.empresa_id = e.id and m.organizacao_id = _org_id
  where e.embedding is not null
    and e.situacao = 'ATIVA'
    and (m.evitar is null or m.evitar = false)
    and (
      not _excluir_ja_lead
      or not exists (
        select 1 from public.leads l
        where l.organizacao_id = _org_id
          and (l.origem_prospeccao->>'cnpj' = e.cnpj or l.observacoes ilike '%' || e.cnpj || '%')
      )
    )
  order by e.embedding <=> v_centroide
  limit _limit;
end;
$$;

grant execute on function public.top_empresas_icp_fit(uuid, int, boolean) to authenticated;

-- =============================================================================
-- View: empresa + ICP fit pra org corrente
-- (calculado lazy, só quando solicitado)
-- =============================================================================
-- Não criamos view com fit_score por org no SQL porque depende de _org_id
-- runtime. Frontend chama icp_fit_score() ou top_empresas_icp_fit() conforme.
