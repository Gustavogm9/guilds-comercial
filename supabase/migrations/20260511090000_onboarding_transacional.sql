-- =============================================================================
-- Onboarding transacional
--
-- Problema: a server action `finalizarOnboarding` em app/onboarding/actions.ts
-- fazia 8+ mutações sequenciais (profile, org, membro, config, templates,
-- features, lead demo, convites, evento). Se a 5ª falhasse, ficava estado
-- meio-criado (org sem features, ou membro sem config, etc).
--
-- Solução: RPC PL/pgSQL `onboarding_finalize` que executa tudo numa única
-- transação implícita (PL/pgSQL é transacional). Emails de welcome/convite
-- continuam fora (side effects de I/O externo — TS dispara após sucesso).
--
-- Entradas obrigatórias e validações:
--   _user_id              uuid (auth.uid())
--   _email                text
--   _nome                 text
--   _empresa_nome         text
--   _slug                 text (gerado em JS via slugify + suffix se colisão)
--   _pais                 text (default 'BR')
--   _idioma               text (default 'pt-BR', whitelist)
--   _moeda                text (default 'BRL', whitelist)
--   _segmento, _dor, _cargo_foco text (opcionais, slice em JS)
--   _razao_social, _cnpj, _tax_id text (opcionais)
--   _gerar_demo           boolean (cria lead demo)
--   _habilitar_ia         boolean (copia ai_features globais → org)
--   _cadencia_templates   jsonb (array passado do JS — vem de getTemplatesByLocale)
--   _convites             jsonb (array {email, role})
--
-- Retorna: jsonb { organizacao_id, convites_criados, lead_demo_id }
-- =============================================================================

create or replace function public.onboarding_finalize(
  _user_id        uuid,
  _email          text,
  _nome           text,
  _empresa_nome   text,
  _slug           text,
  _pais           text default 'BR',
  _idioma         text default 'pt-BR',
  _moeda          text default 'BRL',
  _segmento       text default null,
  _dor            text default null,
  _cargo_foco     text default null,
  _razao_social   text default null,
  _cnpj           text default null,
  _tax_id         text default null,
  _gerar_demo     boolean default false,
  _habilitar_ia   boolean default true,
  _cadencia_templates jsonb default '[]'::jsonb,
  _convites       jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_lead_demo_id bigint;
  v_convites_criados int := 0;
  v_convite record;
  v_token text;
  v_hoje date := current_date;
begin
  -- Validações
  if _user_id is null then raise exception 'user_id obrigatório.'; end if;
  if _email is null or _email = '' then raise exception 'email obrigatório.'; end if;
  if _empresa_nome is null or _empresa_nome = '' then raise exception 'empresa_nome obrigatório.'; end if;
  if _slug is null or _slug = '' then raise exception 'slug obrigatório.'; end if;
  if _pais !~ '^[A-Z]{2}$' then raise exception 'país inválido (ISO 3166-1 alpha-2).'; end if;
  if _idioma not in ('pt-BR','en-US') then _idioma := 'pt-BR'; end if;
  if _moeda not in ('BRL','USD','EUR','GBP') then _moeda := 'BRL'; end if;

  -- 1. Profile (upsert: pode já existir do trigger handle_new_user)
  insert into public.profiles (id, email, display_name, role)
  values (_user_id, _email, _nome, 'gestor')
  on conflict (id) do update
    set display_name = coalesce(excluded.display_name, public.profiles.display_name),
        email = coalesce(excluded.email, public.profiles.email);

  -- 2. Organização
  insert into public.organizacoes (
    nome, slug, owner_id, razao_social, cnpj, tax_id,
    pais, idioma_padrao, moeda_padrao
  ) values (
    _empresa_nome, _slug, _user_id, _razao_social, _cnpj, _tax_id,
    _pais, _idioma, _moeda
  )
  returning id into v_org_id;

  -- 3. Membro
  insert into public.membros_organizacao (organizacao_id, profile_id, role, ativo)
  values (v_org_id, _user_id, 'gestor', true);

  -- 4. Home org no profile
  update public.profiles set home_organizacao_id = v_org_id where id = _user_id;

  -- 5. Configuração default
  insert into public.organizacao_config (
    organizacao_id, distribuicao_automatica, distribuicao_estrategia
  ) values (v_org_id, false, 'manual');

  -- 6. Templates de cadência (vindos do TS, locale-aware)
  if _cadencia_templates is not null and jsonb_array_length(_cadencia_templates) > 0 then
    insert into public.cadencia_templates (organizacao_id, passo, canal, objetivo, assunto, corpo)
    select
      v_org_id,
      (tpl->>'passo')::text,
      (tpl->>'canal')::text,
      (tpl->>'objetivo')::text,
      (tpl->>'assunto')::text,
      (tpl->>'corpo')::text
    from jsonb_array_elements(_cadencia_templates) as tpl;
  end if;

  -- 7. AI features globais → org (copia se houver)
  insert into public.ai_features (
    organizacao_id, codigo, nome, descricao, etapa_fluxo,
    provider_codigo, modelo, temperature, max_tokens,
    limite_dia_org, limite_dia_usuario, papel_minimo, ativo
  )
  select
    v_org_id, codigo, nome, descricao, etapa_fluxo,
    provider_codigo, modelo, temperature, max_tokens,
    limite_dia_org, limite_dia_usuario, papel_minimo,
    _habilitar_ia
  from public.ai_features
  where organizacao_id is null;

  -- 8. Lead demo opcional
  if _gerar_demo then
    insert into public.leads (
      organizacao_id, nome, empresa, cargo, funnel_stage, crm_stage,
      temperatura, dor_principal, segmento, valor_potencial,
      responsavel_id, data_primeiro_contato, proxima_acao, data_proxima_acao
    ) values (
      v_org_id, 'Carlos Silva', 'Empresa Exemplo LTDA',
      coalesce(nullif(_cargo_foco, ''), 'Socio Diretor'),
      'pipeline', 'Prospecção', 'Morno',
      _dor, _segmento, 5000,
      _user_id, v_hoje, 'Enviar D0', v_hoje
    )
    returning id into v_lead_demo_id;
  end if;

  -- 9. Convites
  if _convites is not null and jsonb_array_length(_convites) > 0 then
    for v_convite in
      select (c->>'email')::text as email, (c->>'role')::text as role
      from jsonb_array_elements(_convites) as c
      where (c->>'email') is not null
    loop
      insert into public.convites (organizacao_id, email, role, convidado_por)
      values (v_org_id, v_convite.email, coalesce(v_convite.role, 'comercial'), _user_id)
      on conflict do nothing;
      v_convites_criados := v_convites_criados + 1;
    end loop;
  end if;

  -- 10. Evento de auditoria
  insert into public.organizacao_evento (organizacao_id, ator_id, tipo, payload)
  values (
    v_org_id, _user_id, 'onboarding_concluido',
    jsonb_build_object(
      'segmento', _segmento,
      'cargo_foco', _cargo_foco,
      'gerar_demo', _gerar_demo,
      'convites', v_convites_criados,
      'ia_habilitada', _habilitar_ia
    )
  );

  return jsonb_build_object(
    'organizacao_id', v_org_id,
    'lead_demo_id', v_lead_demo_id,
    'convites_criados', v_convites_criados
  );
end;
$$;

grant execute on function public.onboarding_finalize(
  uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text,
  boolean, boolean, jsonb, jsonb
) to authenticated;

comment on function public.onboarding_finalize is
  'Onboarding transacional: cria profile, org, membro, config, templates, AI features, lead demo, convites e evento de auditoria numa única transação. Emails de welcome/convite continuam fora.';
