-- =============================================================================
-- Hardening pós-auditoria
--
-- 1. publicar_template_draft: validar que draft tem ao menos 1 item antes de
--    publicar. Hoje gestor com pressa pode publicar template vazio.
-- 2. trg_webhook_recompensa_paga: também disparar em INSERT direto com
--    recompensa_paga=true (cenário de backfill ou API externa).
-- =============================================================================

-- 1. publicar_template_draft com validação
create or replace function public.publicar_template_draft(_template_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.onboarding_template%rowtype;
  v_count int;
begin
  if not public._gestor_pode_template(_template_id) then
    raise exception 'Sem permissão pra publicar este template.';
  end if;

  select * into v_draft from public.onboarding_template where id = _template_id;
  if not found then raise exception 'Template não encontrado.'; end if;
  if v_draft.status <> 'draft' then raise exception 'Apenas drafts podem ser publicados.'; end if;

  -- NOVO: bloqueia publicação de draft vazio
  select count(*) into v_count from public.onboarding_template_item where template_id = _template_id;
  if v_count = 0 then
    raise exception 'Rascunho sem itens. Adicione pelo menos 1 item antes de publicar.';
  end if;

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

-- 2. Webhook recompensa_paga: cobrir INSERT além de UPDATE
create or replace function public.trg_webhook_recompensa_paga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_embaixador_nome  text;
  v_embaixador_email text;
  v_payload          jsonb;
  v_hook record;
  v_disparar boolean := false;
begin
  -- INSERT com recompensa_paga=true → dispara direto
  -- UPDATE de false/null → true → dispara
  -- UPDATE não envolvendo recompensa_paga ou tirando paga → não dispara
  if TG_OP = 'INSERT' then
    v_disparar := NEW.recompensa_paga = true;
  elsif TG_OP = 'UPDATE' then
    v_disparar := NEW.recompensa_paga = true and (OLD.recompensa_paga is distinct from true);
  end if;

  if not v_disparar then return NEW; end if;

  if NEW.embaixador_lead_id is not null then
    select coalesce(l.nome, l.empresa), l.email
      into v_embaixador_nome, v_embaixador_email
    from public.leads l
    where l.id = NEW.embaixador_lead_id;
  end if;

  v_payload := jsonb_build_object(
    'indicacao_id', NEW.id,
    'embaixador_lead_id', NEW.embaixador_lead_id,
    'embaixador_nome', coalesce(v_embaixador_nome, NEW.embaixador_externo_nome),
    'embaixador_email', v_embaixador_email,
    'indicado_nome', NEW.indicado_nome,
    'indicado_empresa', NEW.indicado_empresa,
    'recompensa_tipo', NEW.recompensa_tipo,
    'recompensa_valor', NEW.recompensa_valor,
    'recompensa_paga_em', coalesce(NEW.recompensa_paga_em, now()),
    'organizacao_id', NEW.organizacao_id
  );

  for v_hook in
    select id from public.webhooks
    where organizacao_id = NEW.organizacao_id
      and active = true
      and 'indicacao.recompensa_paga' = any(events)
  loop
    insert into public.webhook_events (
      webhook_id, organizacao_id, event_type, payload, status, next_attempt_at
    ) values (
      v_hook.id, NEW.organizacao_id, 'indicacao.recompensa_paga', v_payload, 'pending', now()
    );
  end loop;

  return NEW;
end;
$$;

-- Recria trigger pra cobrir AFTER INSERT também
drop trigger if exists trg_indicacao_webhook_recompensa_paga on public.indicacoes;
create trigger trg_indicacao_webhook_recompensa_paga
  after insert or update of recompensa_paga on public.indicacoes
  for each row execute function public.trg_webhook_recompensa_paga();

-- Mesma extensão pro trigger de crédito (consistência)
create or replace function public.trg_credito_de_recompensa_paga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disparar boolean := false;
begin
  if TG_OP = 'INSERT' then
    v_disparar := NEW.recompensa_paga = true;
  elsif TG_OP = 'UPDATE' then
    v_disparar := NEW.recompensa_paga = true and (OLD.recompensa_paga is distinct from true);
  end if;
  if not v_disparar then return NEW; end if;

  if NEW.recompensa_tipo <> 'credito' then return NEW; end if;
  if NEW.recompensa_valor is null or NEW.recompensa_valor <= 0 then return NEW; end if;
  if NEW.embaixador_lead_id is null then return NEW; end if;

  -- Idempotência
  if exists (
    select 1 from public.lead_credito_movimentos
    where referencia_indicacao_id = NEW.id
      and tipo = 'credito'
      and origem = 'indicacao_fechada'
  ) then
    return NEW;
  end if;

  insert into public.lead_credito_movimentos (
    organizacao_id, lead_id, tipo, valor, origem,
    referencia_indicacao_id, descricao
  ) values (
    NEW.organizacao_id,
    NEW.embaixador_lead_id,
    'credito',
    NEW.recompensa_valor,
    'indicacao_fechada',
    NEW.id,
    coalesce('Recompensa pela indicação de ' || NEW.indicado_nome, 'Recompensa por indicação')
  );

  return NEW;
end;
$$;

drop trigger if exists trg_indicacao_credito on public.indicacoes;
create trigger trg_indicacao_credito
  after insert or update of recompensa_paga on public.indicacoes
  for each row execute function public.trg_credito_de_recompensa_paga();
