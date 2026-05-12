-- =============================================================================
-- Webhooks: dispara quando recompensa de indicação é paga
--
-- Use case: empresa com programa de fidelidade externo (TaqueiroPay, Salesforce,
-- ERP próprio) quer callback quando o vendedor marca recompensa como paga.
--
-- Event type: 'indicacao.recompensa_paga'
-- Payload:
--   {
--     "indicacao_id": 123,
--     "embaixador_lead_id": 45,
--     "embaixador_nome": "...",
--     "embaixador_email": "...",
--     "indicado_nome": "...",
--     "indicado_empresa": "...",
--     "recompensa_tipo": "dinheiro|credito|desconto_renovacao|produto",
--     "recompensa_valor": 250.00,
--     "recompensa_paga_em": "2026-05-11T...",
--     "organizacao_id": "..."
--   }
--
-- Cada webhook registrado em public.webhooks que inclua esse event_type
-- recebe uma linha em webhook_events (status='pending'), processada pelo
-- worker de webhooks existente.
-- =============================================================================

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
begin
  -- Só age quando recompensa_paga transita pra true
  if not (NEW.recompensa_paga = true and (OLD.recompensa_paga is distinct from true)) then
    return NEW;
  end if;

  -- Busca dados do embaixador (lead)
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

  -- Enfileira pra cada webhook da org que assina esse event_type
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

drop trigger if exists trg_indicacao_webhook_recompensa_paga on public.indicacoes;
create trigger trg_indicacao_webhook_recompensa_paga
  after update of recompensa_paga on public.indicacoes
  for each row execute function public.trg_webhook_recompensa_paga();

comment on function public.trg_webhook_recompensa_paga() is
  'Enfileira webhook_events do tipo indicacao.recompensa_paga quando vendedor marca a recompensa como paga. Worker existente processa.';
