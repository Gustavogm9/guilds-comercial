-- Adiciona suporte a idioma em ai_prompts.
--
-- Cada (org, feature) pode ter múltiplas versões em idiomas diferentes (1 ativa
-- por idioma). Dispatcher seleciona prompt cujo idioma bate com o idioma_padrao
-- da org; se não houver, fallback pra pt-BR (default).
--
-- Idempotente.

alter table public.ai_prompts
  add column if not exists idioma text not null default 'pt-BR';

-- Constraint de formato (xx-XX) — deferred caso default seja diferente em rows existentes
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_prompts_idioma_format') then
    alter table public.ai_prompts
      add constraint ai_prompts_idioma_format
      check (idioma ~ '^[a-z]{2}-[A-Z]{2}$');
  end if;
end $$;

-- Índice para lookup rápido (org, feature, idioma, ativo)
create index if not exists idx_ai_prompts_org_feat_idioma_ativo
  on public.ai_prompts (organizacao_id, feature_codigo, idioma, ativo)
  where ativo = true;

-- Backfill: prompts globais existentes ficam como pt-BR (default já cobre,
-- mas garantimos consistência)
update public.ai_prompts
set idioma = 'pt-BR'
where idioma is null or idioma = '';
