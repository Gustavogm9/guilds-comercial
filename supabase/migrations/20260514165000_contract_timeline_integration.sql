-- Integrates contract workflow with lead timeline, audit, health recency and operating visibility.

create or replace function public.on_contrato_insert_timeline()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.lead_id is null then
    return new;
  end if;

  insert into public.lead_timeline
    (organizacao_id, lead_id, tipo, titulo, conteudo, metadata, ref_id, ref_tabela, criado_por)
  values (
    new.organizacao_id,
    new.lead_id,
    'documento',
    case
      when new.modo = 'briefing_juridico' then 'Briefing juridico gerado'
      when new.modo = 'revisao_juridica' then 'Revisao juridica gerada'
      else 'Contrato gerado'
    end,
    left(coalesce(new.briefing_juridico, new.texto_contrato, ''), 800),
    jsonb_build_object(
      'contrato_id', new.id,
      'proposta_id', new.proposta_id,
      'modo', new.modo,
      'status', new.status,
      'versao_atual', new.versao_atual,
      'template_docx_nome', new.template_docx_nome
    ),
    new.id,
    'contratos',
    new.criado_por
  );

  insert into public.lead_evento
    (organizacao_id, lead_id, ator_id, tipo, payload)
  values (
    new.organizacao_id,
    new.lead_id,
    new.criado_por,
    'contrato_gerado',
    jsonb_build_object(
      'contrato_id', new.id,
      'proposta_id', new.proposta_id,
      'modo', new.modo,
      'status', new.status,
      'versao_atual', new.versao_atual
    )
  );

  return new;
end;
$$;

drop trigger if exists tg_contrato_insert_timeline on public.contratos;
create trigger tg_contrato_insert_timeline
after insert on public.contratos
for each row execute function public.on_contrato_insert_timeline();

create or replace function public.on_contrato_status_timeline()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.lead_id is null or old.status is not distinct from new.status then
    return new;
  end if;

  insert into public.lead_timeline
    (organizacao_id, lead_id, tipo, titulo, metadata, ref_id, ref_tabela)
  values (
    new.organizacao_id,
    new.lead_id,
    'documento',
    format('Contrato: %s -> %s', old.status, new.status),
    jsonb_build_object(
      'contrato_id', new.id,
      'proposta_id', new.proposta_id,
      'status_anterior', old.status,
      'status_novo', new.status,
      'data_envio', new.data_envio,
      'data_assinatura', new.data_assinatura,
      'versao_atual', new.versao_atual
    ),
    new.id,
    'contratos'
  );

  insert into public.lead_evento
    (organizacao_id, lead_id, tipo, payload)
  values (
    new.organizacao_id,
    new.lead_id,
    'contrato_status_alterado',
    jsonb_build_object(
      'contrato_id', new.id,
      'proposta_id', new.proposta_id,
      'de', old.status,
      'para', new.status,
      'data_envio', new.data_envio,
      'data_assinatura', new.data_assinatura,
      'versao_atual', new.versao_atual
    )
  );

  return new;
end;
$$;

drop trigger if exists tg_contrato_status_timeline on public.contratos;
create trigger tg_contrato_status_timeline
after update of status on public.contratos
for each row execute function public.on_contrato_status_timeline();

create or replace function public.on_contrato_feedback_timeline()
returns trigger
language plpgsql
security definer
as $$
declare
  v_lead_id bigint;
begin
  select c.lead_id
    into v_lead_id
    from public.contratos c
   where c.id = new.contrato_id
     and c.organizacao_id = new.organizacao_id;

  if v_lead_id is null then
    return new;
  end if;

  insert into public.lead_timeline
    (organizacao_id, lead_id, tipo, titulo, conteudo, metadata, ref_id, ref_tabela, criado_por)
  values (
    new.organizacao_id,
    v_lead_id,
    'documento',
    case
      when new.tipo = 'aprovacao' then 'Contrato aprovado'
      when new.tipo = 'rejeicao' then 'Contrato rejeitado'
      when new.tipo = 'juridico' then 'Nota juridica no contrato'
      else 'Feedback no contrato'
    end,
    new.conteudo,
    jsonb_build_object(
      'contrato_id', new.contrato_id,
      'versao_id', new.versao_id,
      'tipo', new.tipo,
      'resolvido', new.resolvido
    ),
    new.contrato_id,
    'contratos',
    new.criado_por
  );

  insert into public.lead_evento
    (organizacao_id, lead_id, ator_id, tipo, payload)
  values (
    new.organizacao_id,
    v_lead_id,
    new.criado_por,
    'contrato_feedback',
    jsonb_build_object(
      'contrato_id', new.contrato_id,
      'versao_id', new.versao_id,
      'tipo', new.tipo,
      'resolvido', new.resolvido,
      'conteudo', left(new.conteudo, 500)
    )
  );

  return new;
end;
$$;

drop trigger if exists tg_contrato_feedback_timeline on public.contrato_feedback;
create trigger tg_contrato_feedback_timeline
after insert on public.contrato_feedback
for each row execute function public.on_contrato_feedback_timeline();
