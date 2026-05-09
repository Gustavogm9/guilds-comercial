-- ============================================================
-- Sprint 3: Templates de Cadência — Versionamento
-- Adiciona colunas de versão, status ativo, nome amigável,
-- segmento-alvo, autoria e timestamp de atualização.
-- ============================================================

-- Evita falha se já existirem (idempotente)
alter table public.cadencia_templates
  add column if not exists versao      int          not null default 1,
  add column if not exists ativo       boolean      not null default true,
  add column if not exists nome        text,
  add column if not exists segmento    text,
  add column if not exists criado_por  uuid         references public.profiles(id) on delete set null,
  add column if not exists updated_at  timestamptz  not null default now();

-- Índice composto para busca eficiente: org + passo + canal + ativo + versao DESC
create index if not exists idx_cadencia_templates_busca
  on public.cadencia_templates (organizacao_id, passo, canal, ativo, versao desc);

-- Trigger para atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apenas cria o trigger se ainda não existir nessa tabela
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'cadencia_templates_updated_at'
    and tgrelid = 'public.cadencia_templates'::regclass
  ) then
    create trigger cadencia_templates_updated_at
      before update on public.cadencia_templates
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

-- Popula nome amigável para templates existentes que ficaram sem nome
update public.cadencia_templates
set nome = passo || ' · ' || canal
where nome is null;
