-- =============================================================================
-- Notifica embaixador via email quando indicação muda de status
--
-- Gaps da reauditoria:
--   - Indicação descartada não notifica embaixador (continuava "em conversa")
--   - Quando indicação vira cliente, embaixador não fica sabendo direto
--
-- Estratégia: trigger em UPDATE de indicacoes.status. Enfileira email outbox
-- pra embaixador (se tem email no lead vinculado). Endpoint cron já existente
-- (api/cron/email-outbox) processa via Brevo a cada 5 min.
--
-- Status que disparam email pro embaixador:
--   - fechado   → "Sua indicação virou cliente!" (celebra + reforça programa)
--   - perdido   → "Atualização sobre sua indicação" (transparente, neutro)
--   - descartado→ "Atualização sobre sua indicação" (mesmo template)
--
-- Outros status (recebida → contactado → virou_lead) NÃO disparam email
-- pra evitar spam. Embaixador acompanha tudo no portal.
-- =============================================================================

create or replace function public.trg_email_indicacao_status_embaixador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_embaixador_email text;
  v_embaixador_nome  text;
  v_org_locale       text;
  v_org_nome         text;
  v_kind             text;
  v_subject          text;
begin
  -- Só age em transições explícitas (ignora INSERT e UPDATEs sem mudança de status)
  if OLD.status is not distinct from NEW.status then
    return NEW;
  end if;

  -- Apenas terminais relevantes pro embaixador
  if NEW.status not in ('fechado', 'perdido', 'descartado') then
    return NEW;
  end if;

  -- Precisa de embaixador interno (lead) com email
  if NEW.embaixador_lead_id is null then
    return NEW;
  end if;

  select l.email, coalesce(l.nome, l.empresa)
    into v_embaixador_email, v_embaixador_nome
  from public.leads l
  where l.id = NEW.embaixador_lead_id;

  if v_embaixador_email is null or v_embaixador_email = '' then
    return NEW;
  end if;

  select coalesce(idioma_padrao, 'pt-BR'), nome
    into v_org_locale, v_org_nome
  from public.organizacoes
  where id = NEW.organizacao_id;

  v_org_locale := coalesce(v_org_locale, 'pt-BR');
  if v_org_locale not in ('pt-BR', 'en-US') then v_org_locale := 'pt-BR'; end if;

  if NEW.status = 'fechado' then
    v_kind := 'indicacao_embaixador_fechou';
    v_subject := case v_org_locale
      when 'en-US' then 'Your referral became a customer'
      else 'Sua indicação virou cliente'
    end;
  else
    v_kind := 'indicacao_embaixador_status';
    v_subject := case v_org_locale
      when 'en-US' then 'Update on your referral'
      else 'Atualização sobre sua indicação'
    end;
  end if;

  insert into public.email_outbox (
    organizacao_id, kind, to_email, to_name, subject, payload, locale
  ) values (
    NEW.organizacao_id,
    v_kind,
    v_embaixador_email,
    v_embaixador_nome,
    v_subject,
    jsonb_build_object(
      'indicacao_id', NEW.id,
      'embaixador_lead_id', NEW.embaixador_lead_id,
      'embaixador_nome', v_embaixador_nome,
      'indicado_nome', NEW.indicado_nome,
      'indicado_empresa', NEW.indicado_empresa,
      'status_anterior', OLD.status,
      'status_novo', NEW.status,
      'org_nome', v_org_nome,
      'recompensa_paga', NEW.recompensa_paga,
      'recompensa_valor', NEW.recompensa_valor
    ),
    v_org_locale
  );

  return NEW;
end;
$$;

drop trigger if exists trg_indicacao_status_email on public.indicacoes;
create trigger trg_indicacao_status_email
  after update of status on public.indicacoes
  for each row execute function public.trg_email_indicacao_status_embaixador();

comment on function public.trg_email_indicacao_status_embaixador() is
  'Enfileira email pro embaixador quando indicação muda pra estado terminal (fechado/perdido/descartado). Outras transições não notificam.';
