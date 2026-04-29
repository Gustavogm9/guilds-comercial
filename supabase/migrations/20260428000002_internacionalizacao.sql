-- Internacionalização: torna o sistema usável por empresas fora do Brasil.
--
-- - Adiciona `pais` (ISO 3166-1 alpha-2, default 'BR') em organizacoes
-- - Adiciona `tax_id` (genérico — CNPJ/EIN/VAT/RUT/etc.) que substitui
--   semanticamente o `cnpj` para empresas não-BR
-- - Adiciona `idioma_padrao` (default 'pt-BR') e `moeda_padrao` (default 'BRL')
-- - Backfill: orgs existentes ficam com cnpj copiado pra tax_id e pais='BR'
-- - Constraint de formato de CNPJ vira condicional: só valida quando pais='BR'
-- - regime_tributario continua nullable (só BR usa)
--
-- Idempotente. Sem efeito em dados existentes além do backfill.

alter table public.organizacoes
  add column if not exists pais          text   not null default 'BR',
  add column if not exists tax_id        text,
  add column if not exists idioma_padrao text   not null default 'pt-BR',
  add column if not exists moeda_padrao  text   not null default 'BRL';

-- Backfill: copia CNPJ existente pra tax_id (sem perder)
update public.organizacoes
set tax_id = cnpj
where tax_id is null and cnpj is not null;

-- Validação leve de país (ISO alpha-2 — 2 letras maiúsculas)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizacoes_pais_format') then
    alter table public.organizacoes
      add constraint organizacoes_pais_format
      check (pais ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizacoes_idioma_format') then
    alter table public.organizacoes
      add constraint organizacoes_idioma_format
      check (idioma_padrao ~ '^[a-z]{2}-[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizacoes_moeda_format') then
    alter table public.organizacoes
      add constraint organizacoes_moeda_format
      check (moeda_padrao ~ '^[A-Z]{3}$');
  end if;
end $$;

-- Substitui constraint de CNPJ: agora só valida se pais='BR'.
-- Empresa estrangeira pode ter cnpj NULL OU usar tax_id livre.
alter table public.organizacoes
  drop constraint if exists organizacoes_cnpj_format;

alter table public.organizacoes
  add constraint organizacoes_cnpj_format
  check (
    pais <> 'BR'
    or cnpj is null
    or cnpj ~ '^\d{14}$'
  );

-- Mesmo regime_tributario só faz sentido pra BR — adiciona check condicional.
-- Se pais != BR, regime_tributario deve ser null (evita confusão).
alter table public.organizacoes
  drop constraint if exists organizacoes_regime_check;

alter table public.organizacoes
  add constraint organizacoes_regime_check
  check (
    (pais = 'BR' and (regime_tributario is null or regime_tributario in ('simples_nacional','lucro_presumido','lucro_real','mei','isento')))
    or (pais <> 'BR' and regime_tributario is null)
  );

-- Índice em tax_id pra busca rápida em multi-tenant
create index if not exists idx_organizacoes_tax_id
  on public.organizacoes (tax_id) where tax_id is not null;
