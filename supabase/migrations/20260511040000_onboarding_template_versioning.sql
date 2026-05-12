-- =============================================================================
-- Versionamento / draft de onboarding_template
--
-- Problema: gestor edita template, leads novos pegam mudança imediatamente,
-- leads antigos ficam com versão antiga. Sem controle de quando publicar.
--
-- Solução:
--   1. Coluna `status` ('draft' | 'publicado' | 'arquivado')
--   2. Coluna `versao` (int) e `parent_template_id` (auto-ref) pra lineage
--   3. Função clonar_template_como_draft: copia template + items, incrementa
--      versao, marca como draft. Editor mexe à vontade no draft.
--   4. Função publicar_template_draft: troca status pra publicado, arquiva
--      parent (versão anterior), opcionalmente set default_template.
--
-- Leads existentes seguem com sua versão (já é assim — items são copiados
-- no momento de criação do checklist, não referenciam template).
--
-- Compat: rows existentes ganham status='publicado' e versao=1.
-- =============================================================================

-- 1. Colunas novas
alter table public.onboarding_template
  add column if not exists status text not null default 'publicado'
    check (status in ('draft', 'publicado', 'arquivado'));

alter table public.onboarding_template
  add column if not exists versao int not null default 1 check (versao > 0);

alter table public.onboarding_template
  add column if not exists parent_template_id bigint
    references public.onboarding_template(id) on delete set null;

alter table public.onboarding_template
  add column if not exists publicado_em timestamptz;

-- Backfill: tudo que existia é publicado v1
update public.onboarding_template
   set status = 'publicado', versao = coalesce(versao, 1)
 where status is null;

create index if not exists idx_onboarding_template_status
  on public.onboarding_template(organizacao_id, status);

comment on column public.onboarding_template.status is
  'draft (sendo editado) | publicado (em uso pra novos leads) | arquivado (versão anterior, retida pra histórico).';
comment on column public.onboarding_template.versao is
  'Incrementa a cada publicação. Pra exibir "v2 publicada em ..." na UI.';
comment on column public.onboarding_template.parent_template_id is
  'Aponta pra versão anterior. Permite reconstruir histórico de mudanças.';

-- 2. Helper RLS — verifica que o user é gestor da org dona do template
create or replace function public._gestor_pode_template(_template_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.onboarding_template t
    where t.id = _template_id
      and public.is_gestor_in_org(t.organizacao_id)
  );
$$;

-- 3. Função: clonar como rascunho
create or replace function public.clonar_template_como_draft(_template_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo_id bigint;
  v_origem  public.onboarding_template%rowtype;
begin
  if not public._gestor_pode_template(_template_id) then
    raise exception 'Sem permissão pra clonar este template.';
  end if;

  select * into v_origem from public.onboarding_template where id = _template_id;
  if not found then raise exception 'Template não encontrado.'; end if;

  -- Bloqueia clones em série (1 draft por linhagem)
  if exists (
    select 1 from public.onboarding_template
    where parent_template_id = _template_id and status = 'draft'
  ) then
    raise exception 'Já existe um rascunho aberto a partir desta versão. Publique ou descarte primeiro.';
  end if;

  insert into public.onboarding_template (
    organizacao_id, nome, descricao, ativo, default_template,
    status, versao, parent_template_id
  ) values (
    v_origem.organizacao_id,
    v_origem.nome,
    v_origem.descricao,
    v_origem.ativo,
    false,         -- draft nunca é default
    'draft',
    v_origem.versao + 1,
    v_origem.id
  )
  returning id into v_novo_id;

  -- Copia os items do template origem
  insert into public.onboarding_template_item (
    template_id, ordem, titulo, descricao, due_offset_dias, obrigatorio, responsavel_papel
  )
  select v_novo_id, ordem, titulo, descricao, due_offset_dias, obrigatorio, responsavel_papel
  from public.onboarding_template_item
  where template_id = _template_id
  order by ordem;

  return v_novo_id;
end;
$$;

comment on function public.clonar_template_como_draft(bigint) is
  'Cria nova versão como draft a partir de um template publicado. Items são copiados. Apenas 1 draft por lineage por vez.';

-- 4. Função: publicar draft
create or replace function public.publicar_template_draft(_template_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.onboarding_template%rowtype;
begin
  if not public._gestor_pode_template(_template_id) then
    raise exception 'Sem permissão pra publicar este template.';
  end if;

  select * into v_draft from public.onboarding_template where id = _template_id;
  if not found then raise exception 'Template não encontrado.'; end if;
  if v_draft.status <> 'draft' then raise exception 'Apenas drafts podem ser publicados.'; end if;

  -- Marca o draft como publicado
  update public.onboarding_template
     set status = 'publicado',
         publicado_em = now(),
         updated_at = now()
   where id = _template_id;

  -- Arquiva a versão anterior (se houver)
  if v_draft.parent_template_id is not null then
    update public.onboarding_template
       set status = 'arquivado',
           ativo = false,
           default_template = case when default_template then false else default_template end,
           updated_at = now()
     where id = v_draft.parent_template_id;

    -- Se a versão anterior era default, transfere pro novo
    if exists (
      select 1 from public.onboarding_template
      where id = v_draft.parent_template_id and default_template = true
    ) then
      update public.onboarding_template
         set default_template = true
       where id = _template_id;
    end if;
  end if;
end;
$$;

comment on function public.publicar_template_draft(bigint) is
  'Publica um draft: muda status pra publicado, arquiva versão anterior. Mantém default_template se a anterior tinha.';

-- 5. Função: descartar draft
create or replace function public.descartar_template_draft(_template_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public._gestor_pode_template(_template_id) then
    raise exception 'Sem permissão.';
  end if;

  select status into v_status from public.onboarding_template where id = _template_id;
  if v_status is null then raise exception 'Template não encontrado.'; end if;
  if v_status <> 'draft' then raise exception 'Apenas drafts podem ser descartados.'; end if;

  -- Deleta items do draft + draft
  delete from public.onboarding_template_item where template_id = _template_id;
  delete from public.onboarding_template where id = _template_id;
end;
$$;

comment on function public.descartar_template_draft(bigint) is
  'Apaga um draft completamente. Não afeta versão publicada anterior.';

grant execute on function public.clonar_template_como_draft(bigint) to authenticated;
grant execute on function public.publicar_template_draft(bigint) to authenticated;
grant execute on function public.descartar_template_draft(bigint) to authenticated;
