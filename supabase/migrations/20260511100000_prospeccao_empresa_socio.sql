-- =============================================================================
-- Sprint Prospecção: persistência estruturada de empresas + sócios (QSA)
--
-- Antes: a consulta de CNPJ via BrasilAPI retornava razão social, QSA, capital,
-- situação, CNAE, etc. — mas o frontend só usava 4-5 campos. QSA dos sócios
-- aparecia na UI e era DESCARTADO. Sem persistência local = sem busca por
-- filtros estruturados, sem detectar mudanças, sem reutilizar entre vendedores.
--
-- Solução:
--   - public.prospeccao_empresa: cache local por CNPJ + Firecrawl + Tavily.
--     Full-text em razao_social/nome_fantasia/descricao (busca BR fluente).
--     Indexes em (porte, situacao, uf, cnae, capital_social) pra filtros estruturados.
--   - public.prospeccao_socio: 1 row por sócio listado no QSA. Liga em empresa.
--     LinkedIn URL pode ser preenchido depois (Tavily lookup).
--
-- RLS: dados compartilhados entre orgs (CNPJ é público). Lookup por
-- qualquer authenticated. Escrita também livre — é cache global, idempotente.
-- =============================================================================

create table if not exists public.prospeccao_empresa (
  id              bigserial primary key,
  cnpj            text unique not null check (cnpj ~ '^\d{14}$'),
  razao_social    text,
  nome_fantasia   text,
  cnae_codigo     text,
  cnae_descricao  text,
  cnae_normalizado text,        -- ex: "Tecnologia", "Saúde" (categoria humana)
  porte           text,         -- "Micro", "Pequena", "Médio/Grande"
  capital_social  numeric(14,2),
  situacao        text,         -- "ATIVA", "BAIXADA", "SUSPENSA", "INAPTA", "NULA"
  data_inicio_atividade date,
  data_situacao_cadastral date,
  natureza_juridica text,

  -- Endereço
  logradouro      text,
  numero          text,
  complemento     text,
  bairro          text,
  cidade          text,
  uf              text,
  cep             text,
  pais            text default 'BR',

  -- Contato (Receita Federal — geralmente desatualizado, mas serve de baseline)
  telefone_rfb    text,
  email_rfb       text,

  -- Web enrichment (Firecrawl)
  site            text,
  linkedin_url    text,
  email_enriquecido text,
  whatsapp_enriquecido text,
  descricao_negocio text,        -- summary do que a empresa faz, do Firecrawl

  -- Inteligência derivada
  segmento_inferido text,        -- match com hipóteses ICP

  -- Auditoria + tracking de mudanças
  fonte_principal text not null default 'brasilapi' check (fonte_principal in ('brasilapi', 'firecrawl', 'tavily', 'manual', 'csv_import')),
  raw_brasilapi   jsonb,         -- payload completo pra debug
  raw_firecrawl   jsonb,
  ultima_consulta_em timestamptz not null default now(),
  consultas_count int not null default 1,
  -- Hash do conteudo importante pra detectar mudanças
  fingerprint     text,          -- md5(razao||capital||situacao||socios_concat)

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices
create index if not exists idx_prospeccao_empresa_cnpj on public.prospeccao_empresa(cnpj);
create index if not exists idx_prospeccao_empresa_situacao on public.prospeccao_empresa(situacao);
create index if not exists idx_prospeccao_empresa_porte_uf on public.prospeccao_empresa(porte, uf);
create index if not exists idx_prospeccao_empresa_cnae on public.prospeccao_empresa(cnae_codigo);
create index if not exists idx_prospeccao_empresa_cnae_norm on public.prospeccao_empresa(cnae_normalizado);
create index if not exists idx_prospeccao_empresa_capital on public.prospeccao_empresa(capital_social);
create index if not exists idx_prospeccao_empresa_atualizado on public.prospeccao_empresa(updated_at desc);

-- Full-text search (português)
create index if not exists idx_prospeccao_empresa_fts
  on public.prospeccao_empresa
  using gin (to_tsvector('portuguese',
    coalesce(razao_social,'') || ' ' ||
    coalesce(nome_fantasia,'') || ' ' ||
    coalesce(descricao_negocio,'') || ' ' ||
    coalesce(cnae_descricao,'')
  ));

-- Trigger updated_at
drop trigger if exists trg_prospeccao_empresa_updated on public.prospeccao_empresa;
create trigger trg_prospeccao_empresa_updated
  before update on public.prospeccao_empresa
  for each row execute function public.set_updated_at();

-- RLS: dados públicos (CNPJ é público) — todos authenticated lêem e escrevem
alter table public.prospeccao_empresa enable row level security;

drop policy if exists prospeccao_empresa_select on public.prospeccao_empresa;
create policy prospeccao_empresa_select on public.prospeccao_empresa
  for select to authenticated using (true);

drop policy if exists prospeccao_empresa_upsert on public.prospeccao_empresa;
create policy prospeccao_empresa_upsert on public.prospeccao_empresa
  for insert to authenticated with check (true);

drop policy if exists prospeccao_empresa_update on public.prospeccao_empresa;
create policy prospeccao_empresa_update on public.prospeccao_empresa
  for update to authenticated using (true) with check (true);

comment on table public.prospeccao_empresa is
  'Cache local de empresas consultadas (CNPJ + enriquecimento web). Compartilhado entre orgs — dados públicos.';

-- =============================================================================
-- prospeccao_socio: QSA estruturado
-- =============================================================================
create table if not exists public.prospeccao_socio (
  id              bigserial primary key,
  empresa_id      bigint not null references public.prospeccao_empresa(id) on delete cascade,
  nome            text not null,
  cpf_cnpj        text,                -- mascarado quando vem da BrasilAPI
  qualificacao    text,                -- "Sócio-Administrador", "Diretor", etc.
  data_entrada    date,
  pais_origem     text,

  -- Enriquecimento (preenche depois via Tavily search)
  linkedin_url    text,
  email           text,
  cargo_atual     text,                -- pode diferir de qualificação (ex: CTO)

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_prospeccao_socio_empresa on public.prospeccao_socio(empresa_id);
create index if not exists idx_prospeccao_socio_nome
  on public.prospeccao_socio using gin (to_tsvector('portuguese', coalesce(nome,'')));

drop trigger if exists trg_prospeccao_socio_updated on public.prospeccao_socio;
create trigger trg_prospeccao_socio_updated
  before update on public.prospeccao_socio
  for each row execute function public.set_updated_at();

alter table public.prospeccao_socio enable row level security;
drop policy if exists prospeccao_socio_all on public.prospeccao_socio;
create policy prospeccao_socio_all on public.prospeccao_socio
  for all to authenticated using (true) with check (true);

comment on table public.prospeccao_socio is
  'Sócios (QSA) das empresas em prospeccao_empresa. LinkedIn/cargo enriquecidos via Tavily depois.';

-- =============================================================================
-- View: empresa + sócios concatenados pra UI rápida
-- =============================================================================
create or replace view public.v_prospeccao_empresa as
select
  e.*,
  -- Total de sócios cadastrados
  (select count(*) from public.prospeccao_socio s where s.empresa_id = e.id)::int as total_socios,
  -- Sócios como JSONB pra UI sem N+1
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'nome', s.nome,
      'qualificacao', s.qualificacao,
      'linkedin_url', s.linkedin_url,
      'cargo_atual', s.cargo_atual,
      'email', s.email
    ) order by s.id), '[]'::jsonb)
    from public.prospeccao_socio s where s.empresa_id = e.id
  ) as socios,
  -- CNPJ formatado (12.345.678/0001-90)
  substr(e.cnpj, 1, 2) || '.' || substr(e.cnpj, 3, 3) || '.' || substr(e.cnpj, 6, 3) || '/' || substr(e.cnpj, 9, 4) || '-' || substr(e.cnpj, 13, 2) as cnpj_formatado
from public.prospeccao_empresa e;

grant select on public.v_prospeccao_empresa to authenticated;

-- =============================================================================
-- Função: upsert empresa + sócios numa transação (chamada pelo /api/prospeccao/cnpj)
-- =============================================================================
create or replace function public.upsert_prospeccao_empresa(
  _cnpj text,
  _razao text default null,
  _nome_fantasia text default null,
  _cnae_codigo text default null,
  _cnae_descricao text default null,
  _cnae_normalizado text default null,
  _porte text default null,
  _capital numeric default null,
  _situacao text default null,
  _data_inicio date default null,
  _data_situacao date default null,
  _natureza text default null,
  _logradouro text default null,
  _numero text default null,
  _complemento text default null,
  _bairro text default null,
  _cidade text default null,
  _uf text default null,
  _cep text default null,
  _telefone_rfb text default null,
  _email_rfb text default null,
  _raw_brasilapi jsonb default null,
  _socios jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id bigint;
  v_fingerprint text;
begin
  if _cnpj is null or _cnpj !~ '^\d{14}$' then
    raise exception 'CNPJ inválido.';
  end if;

  -- Fingerprint pra detectar mudanças
  v_fingerprint := md5(coalesce(_razao,'') || coalesce(_capital::text,'') || coalesce(_situacao,'') || coalesce(_socios::text,''));

  insert into public.prospeccao_empresa (
    cnpj, razao_social, nome_fantasia, cnae_codigo, cnae_descricao,
    cnae_normalizado, porte, capital_social, situacao,
    data_inicio_atividade, data_situacao_cadastral, natureza_juridica,
    logradouro, numero, complemento, bairro, cidade, uf, cep,
    telefone_rfb, email_rfb, raw_brasilapi, fingerprint,
    fonte_principal, consultas_count, ultima_consulta_em
  ) values (
    _cnpj, _razao, _nome_fantasia, _cnae_codigo, _cnae_descricao,
    _cnae_normalizado, _porte, _capital, _situacao,
    _data_inicio, _data_situacao, _natureza,
    _logradouro, _numero, _complemento, _bairro, _cidade, _uf, _cep,
    _telefone_rfb, _email_rfb, _raw_brasilapi, v_fingerprint,
    'brasilapi', 1, now()
  )
  on conflict (cnpj) do update set
    razao_social = coalesce(excluded.razao_social, public.prospeccao_empresa.razao_social),
    nome_fantasia = coalesce(excluded.nome_fantasia, public.prospeccao_empresa.nome_fantasia),
    cnae_codigo = coalesce(excluded.cnae_codigo, public.prospeccao_empresa.cnae_codigo),
    cnae_descricao = coalesce(excluded.cnae_descricao, public.prospeccao_empresa.cnae_descricao),
    cnae_normalizado = coalesce(excluded.cnae_normalizado, public.prospeccao_empresa.cnae_normalizado),
    porte = coalesce(excluded.porte, public.prospeccao_empresa.porte),
    capital_social = coalesce(excluded.capital_social, public.prospeccao_empresa.capital_social),
    situacao = coalesce(excluded.situacao, public.prospeccao_empresa.situacao),
    data_inicio_atividade = coalesce(excluded.data_inicio_atividade, public.prospeccao_empresa.data_inicio_atividade),
    data_situacao_cadastral = coalesce(excluded.data_situacao_cadastral, public.prospeccao_empresa.data_situacao_cadastral),
    natureza_juridica = coalesce(excluded.natureza_juridica, public.prospeccao_empresa.natureza_juridica),
    logradouro = coalesce(excluded.logradouro, public.prospeccao_empresa.logradouro),
    numero = coalesce(excluded.numero, public.prospeccao_empresa.numero),
    complemento = coalesce(excluded.complemento, public.prospeccao_empresa.complemento),
    bairro = coalesce(excluded.bairro, public.prospeccao_empresa.bairro),
    cidade = coalesce(excluded.cidade, public.prospeccao_empresa.cidade),
    uf = coalesce(excluded.uf, public.prospeccao_empresa.uf),
    cep = coalesce(excluded.cep, public.prospeccao_empresa.cep),
    telefone_rfb = coalesce(excluded.telefone_rfb, public.prospeccao_empresa.telefone_rfb),
    email_rfb = coalesce(excluded.email_rfb, public.prospeccao_empresa.email_rfb),
    raw_brasilapi = coalesce(excluded.raw_brasilapi, public.prospeccao_empresa.raw_brasilapi),
    fingerprint = excluded.fingerprint,
    consultas_count = public.prospeccao_empresa.consultas_count + 1,
    ultima_consulta_em = now()
  returning id into v_empresa_id;

  -- Sócios: dropa + recria (lista da Receita é source-of-truth quando vem)
  if jsonb_array_length(_socios) > 0 then
    delete from public.prospeccao_socio where empresa_id = v_empresa_id;
    insert into public.prospeccao_socio (empresa_id, nome, qualificacao, data_entrada, pais_origem)
    select
      v_empresa_id,
      (s->>'nome')::text,
      (s->>'qualificacao')::text,
      nullif((s->>'data_entrada')::text, '')::date,
      (s->>'pais_origem')::text
    from jsonb_array_elements(_socios) as s
    where (s->>'nome') is not null;
  end if;

  return v_empresa_id;
end;
$$;

grant execute on function public.upsert_prospeccao_empresa(
  text, text, text, text, text, text, text, numeric, text, date, date, text,
  text, text, text, text, text, text, text, text, text, jsonb, jsonb
) to authenticated;

comment on function public.upsert_prospeccao_empresa is
  'Upsert idempotente: cria/atualiza empresa+sócios. Detecta mudança via fingerprint hash. Compartilhado entre orgs.';
