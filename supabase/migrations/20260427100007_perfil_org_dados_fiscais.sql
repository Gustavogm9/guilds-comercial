-- Expansão de profiles e organizacoes para suportar:
-- - Configurações de perfil pós-onboarding (telefone, avatar, timezone)
-- - Dados fiscais B2B brasileiro: razão social, CNPJ, IE, regime tributário,
--   endereço completo, telefone — necessário para emitir nota fiscal
--
-- Todos os campos são nullable (idempotente, não quebra rows existentes).
-- Validações de formato ficam em check constraints leves (não exaustivas —
-- validação cheia ocorre na app).
--
-- Idempotente.

-- ====================================================
-- profiles
-- ====================================================
alter table public.profiles
  add column if not exists telefone   text,
  add column if not exists avatar_url text,
  add column if not exists timezone   text default 'America/Sao_Paulo';

-- ====================================================
-- organizacoes
-- ====================================================
alter table public.organizacoes
  add column if not exists razao_social        text,
  add column if not exists cnpj                text,
  add column if not exists inscricao_estadual  text,
  add column if not exists regime_tributario   text,
  add column if not exists telefone            text,
  add column if not exists site                text,
  add column if not exists endereco            jsonb default '{}'::jsonb,
  add column if not exists logo_url            text,
  add column if not exists timezone            text default 'America/Sao_Paulo';

-- Validações leves
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizacoes_cnpj_format') then
    alter table public.organizacoes
      add constraint organizacoes_cnpj_format
      check (cnpj is null or cnpj ~ '^\d{14}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizacoes_regime_check') then
    alter table public.organizacoes
      add constraint organizacoes_regime_check
      check (regime_tributario is null or regime_tributario in ('simples_nacional','lucro_presumido','lucro_real','mei','isento'));
  end if;
end $$;

-- Índice parcial pra busca por CNPJ
create index if not exists idx_organizacoes_cnpj on public.organizacoes (cnpj) where cnpj is not null;
