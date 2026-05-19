-- =============================================================================
-- Cadencia configuravel: execucao por fluxo
--
-- A tela de fluxos ja permitia gestor editar passos/dias/canais, mas a tabela
-- cadencia ainda aceitava somente D0/D3/D7/D11/D16/D30 e os iniciadores usavam
-- a lista fixa em codigo. Esta migration deixa a execucao guardar um snapshot
-- do fluxo publicado usado no momento em que a cadencia foi iniciada.
-- =============================================================================

alter table public.cadencia
  add column if not exists fluxo_id bigint references public.cadencia_fluxo(id) on delete set null,
  add column if not exists fluxo_passo_id bigint references public.cadencia_fluxo_passo(id) on delete set null,
  add column if not exists ordem int,
  add column if not exists offset_dias int,
  add column if not exists assunto_template text,
  add column if not exists corpo_template text,
  add column if not exists condicao_para_executar text,
  add column if not exists pular_se_respondeu boolean,
  add column if not exists pular_se_clicou_link boolean;

-- Libera nomes de passo customizados. O legado continua usando D0/D3/etc.
alter table public.cadencia drop constraint if exists cadencia_passo_check;

-- Fluxos podem ter mais de um passo no mesmo offset, entao passo nao pode ser
-- chave unica. A ordem do snapshot passa a ser o identificador estavel.
alter table public.cadencia drop constraint if exists cadencia_lead_id_passo_key;

update public.cadencia
set
  ordem = case passo
    when 'D0' then 1
    when 'D3' then 2
    when 'D7' then 3
    when 'D11' then 4
    when 'D16' then 5
    when 'D30' then 6
    else ordem
  end,
  offset_dias = case passo
    when 'D0' then 0
    when 'D3' then 3
    when 'D7' then 7
    when 'D11' then 11
    when 'D16' then 16
    when 'D30' then 30
    else offset_dias
  end
where ordem is null or offset_dias is null;

create unique index if not exists uniq_cadencia_lead_ordem
  on public.cadencia(lead_id, ordem)
  where ordem is not null;

create index if not exists idx_cadencia_fluxo
  on public.cadencia(fluxo_id);

create index if not exists idx_cadencia_fluxo_passo
  on public.cadencia(fluxo_passo_id);

-- Atualiza a view para expor condicoes adicionadas depois da primeira migration
-- de fluxos.
create or replace view public.v_cadencia_fluxo_completo as
select
  f.*,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'ordem', p.ordem,
      'offset_dias', p.offset_dias,
      'canal', p.canal,
      'nome_passo', p.nome_passo,
      'assunto', p.assunto,
      'corpo', p.corpo,
      'pular_se_respondeu', p.pular_se_respondeu,
      'pular_se_clicou_link', p.pular_se_clicou_link,
      'condicao_para_executar', p.condicao_para_executar,
      'ramo_alternativo_passo_id', p.ramo_alternativo_passo_id
    ) order by p.ordem), '[]'::jsonb)
    from public.cadencia_fluxo_passo p where p.fluxo_id = f.id
  ) as passos,
  (select count(*) from public.cadencia_fluxo_passo p where p.fluxo_id = f.id)::int as total_passos
from public.cadencia_fluxo f;

grant select on public.v_cadencia_fluxo_completo to authenticated;

-- Completa o default seed antigo (que tinha D0/D3/D7/D11) para o playbook
-- atual D0/D3/D7/D11/D16/D30, sem mexer em fluxos customizados.
insert into public.cadencia_fluxo_passo (
  fluxo_id, ordem, offset_dias, canal, nome_passo, assunto, corpo,
  pular_se_respondeu, pular_se_clicou_link, condicao_para_executar
)
select
  f.id, 5, 16, 'email', 'D16 - Porta aberta',
  'Sem pressa, {{nome}}',
  'Olá {{nome}}, sem stress se agora não é o momento.\n\nMantenho a porta aberta. Quando {{dor}} virar prioridade na {{empresa}}, me chama.',
  true, false, 'sempre'
from public.cadencia_fluxo f
where f.default_template = true
  and f.nome = 'Cold outbound padrão'
  and not exists (
    select 1 from public.cadencia_fluxo_passo p
    where p.fluxo_id = f.id and p.ordem = 5
  );

insert into public.cadencia_fluxo_passo (
  fluxo_id, ordem, offset_dias, canal, nome_passo, assunto, corpo,
  pular_se_respondeu, pular_se_clicou_link, condicao_para_executar
)
select
  f.id, 6, 30, 'email', 'D30 - Retomada',
  '{{nome}}, mudou alguma coisa nas últimas semanas?',
  '{{nome}}, voltando depois de um tempo.\n\nFaz sentido a gente conversar agora sobre {{dor}}? Mudou alguma coisa na {{empresa}}?',
  true, false, 'sempre'
from public.cadencia_fluxo f
where f.default_template = true
  and f.nome = 'Cold outbound padrão'
  and not exists (
    select 1 from public.cadencia_fluxo_passo p
    where p.fluxo_id = f.id and p.ordem = 6
  );

-- Atualiza submissões de landing page para materializar todos os passos do
-- fluxo escolhido, em vez de criar apenas D0.
create or replace function public.submeter_lp(
  _slug text,
  _dados jsonb,
  _user_agent text default null,
  _referer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lp record;
  v_lead_id bigint;
  v_nome text;
  v_email text;
  v_whatsapp text;
  v_empresa text;
  v_proxima_passo text;
  v_proxima_objetivo text;
  v_proxima_data date;
begin
  select * into v_lp from public.landing_page where slug = _slug and ativa = true;
  if v_lp is null then
    return jsonb_build_object('ok', false, 'erro', 'Página não encontrada.');
  end if;

  v_nome := nullif(trim(_dados->>'nome'), '');
  v_email := nullif(lower(trim(_dados->>'email')), '');
  v_whatsapp := nullif(trim(_dados->>'whatsapp'), '');
  v_empresa := nullif(trim(_dados->>'empresa'), '');

  if v_email is null and v_whatsapp is null then
    return jsonb_build_object('ok', false, 'erro', 'Email ou WhatsApp obrigatório.');
  end if;

  insert into public.leads (
    organizacao_id, nome, empresa, email, whatsapp,
    segmento, fonte, funnel_stage, crm_stage, temperatura, prioridade,
    responsavel_id, observacoes, custom_fields,
    origem_prospeccao
  ) values (
    v_lp.organizacao_id, v_nome, v_empresa, v_email, v_whatsapp,
    v_lp.segmento_default,
    'landing_page',
    'base_bruta', 'Base', 'Morno', 'B',
    v_lp.responsavel_id,
    'Veio pela LP: ' || _slug,
    _dados,
    jsonb_build_object('tipo', 'landing_page', 'lp_id', v_lp.id, 'lp_slug', _slug)
  )
  returning id into v_lead_id;

  update public.landing_page set submissions = submissions + 1 where id = v_lp.id;

  if v_lp.fluxo_cadencia_id is not null then
    insert into public.cadencia (
      organizacao_id, lead_id, passo, canal, objetivo, data_prevista, status,
      fluxo_id, fluxo_passo_id, ordem, offset_dias, assunto_template, corpo_template,
      condicao_para_executar, pular_se_respondeu, pular_se_clicou_link
    )
    select
      v_lp.organizacao_id,
      v_lead_id,
      coalesce(
        case p.offset_dias
          when 0 then 'D0'
          when 3 then 'D3'
          when 7 then 'D7'
          when 11 then 'D11'
          when 16 then 'D16'
          when 30 then 'D30'
          else null
        end,
        'P' || p.ordem::text
      ),
      case p.canal
        when 'email' then 'Email'
        when 'whatsapp' then 'WhatsApp'
        when 'call' then 'Ligação'
        when 'linkedin' then 'LinkedIn'
        when 'sms' then 'SMS'
        else 'Tarefa'
      end,
      p.nome_passo,
      current_date + p.offset_dias,
      'pendente',
      v_lp.fluxo_cadencia_id,
      p.id,
      p.ordem,
      p.offset_dias,
      p.assunto,
      p.corpo,
      coalesce(p.condicao_para_executar, 'sempre'),
      coalesce(p.pular_se_respondeu, true),
      coalesce(p.pular_se_clicou_link, false)
    from public.cadencia_fluxo_passo p
    where p.fluxo_id = v_lp.fluxo_cadencia_id
    order by p.ordem
    on conflict do nothing;

    select c.passo, c.objetivo, c.data_prevista
      into v_proxima_passo, v_proxima_objetivo, v_proxima_data
    from public.cadencia c
    where c.lead_id = v_lead_id
      and c.organizacao_id = v_lp.organizacao_id
      and c.status = 'pendente'
    order by c.data_prevista nulls last, c.ordem nulls last
    limit 1;

    update public.leads
    set
      data_primeiro_contato = current_date,
      proxima_acao = case
        when v_proxima_passo is null then null
        else coalesce(v_proxima_objetivo, 'Enviar ' || v_proxima_passo)
      end,
      data_proxima_acao = v_proxima_data
    where id = v_lead_id and organizacao_id = v_lp.organizacao_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'agradecimento_titulo', v_lp.agradecimento_titulo,
    'agradecimento_texto', v_lp.agradecimento_texto
  );
end;
$$;

revoke all on function public.submeter_lp(text, jsonb, text, text) from public;
grant execute on function public.submeter_lp(text, jsonb, text, text) to anon, authenticated;

-- Garante que novas organizações já nasçam com um fluxo editável/default.
create or replace function public.ensure_default_cadencia_fluxo(_org_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fluxo_id bigint;
begin
  select id into v_fluxo_id
  from public.cadencia_fluxo
  where organizacao_id = _org_id
    and default_template = true
    and status = 'publicado'
  order by created_at
  limit 1;

  if v_fluxo_id is not null then
    return v_fluxo_id;
  end if;

  insert into public.cadencia_fluxo (
    organizacao_id, nome, descricao, trigger, default_template, ativo, status, publicado_em
  ) values (
    _org_id,
    'Cold outbound padrão',
    'Sequência padrão D0/D3/D7/D11/D16/D30, editável em Configurações > Cadência > Fluxos.',
    'manual', true, true, 'publicado', now()
  ) returning id into v_fluxo_id;

  insert into public.cadencia_fluxo_passo (
    fluxo_id, ordem, offset_dias, canal, nome_passo, assunto, corpo,
    pular_se_respondeu, pular_se_clicou_link, condicao_para_executar
  ) values
    (v_fluxo_id, 1, 0,  'email',    'D0 - Abertura',       'Posso te ajudar com {{dor}}?', 'Olá {{nome}},\n\nVi que vocês da {{empresa}} estão trabalhando com {{segmento}}. Tenho uma ideia que pode encurtar caminhos com {{dor}}.\n\nTopa uma conversa de 15min essa semana?', true, false, 'sempre'),
    (v_fluxo_id, 2, 3,  'whatsapp', 'D3 - Reforço',        null, 'Oi {{nome}}, passando para deixar visível meu contato. Posso compartilhar um case que aplicaria à {{empresa}}?', true, false, 'sempre'),
    (v_fluxo_id, 3, 7,  'email',    'D7 - Case + valor',   'Resultado real com {{segmento}}', 'Olá {{nome}},\n\nTenho um exemplo concreto de empresa do mesmo perfil que reduziu perdas ligadas a {{dor}}.\n\nQuer ver?', true, false, 'sempre'),
    (v_fluxo_id, 4, 11, 'call',     'D11 - Ligação leve',  null, 'Ligar para apresentar brevemente e pedir 5min na agenda.', true, false, 'sempre'),
    (v_fluxo_id, 5, 16, 'email',    'D16 - Porta aberta',  'Sem pressa, {{nome}}', 'Olá {{nome}}, sem stress se agora não é o momento.\n\nMantenho a porta aberta. Quando {{dor}} virar prioridade na {{empresa}}, me chama.', true, false, 'sempre'),
    (v_fluxo_id, 6, 30, 'email',    'D30 - Retomada',      '{{nome}}, mudou alguma coisa nas últimas semanas?', '{{nome}}, voltando depois de um tempo.\n\nFaz sentido a gente conversar agora sobre {{dor}}? Mudou alguma coisa na {{empresa}}?', true, false, 'sempre');

  return v_fluxo_id;
end;
$$;

create or replace function public.trg_organizacao_cadencia_fluxo_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_cadencia_fluxo(new.id);
  return new;
end;
$$;

drop trigger if exists trg_organizacao_cadencia_fluxo_default on public.organizacoes;
create trigger trg_organizacao_cadencia_fluxo_default
  after insert on public.organizacoes
  for each row execute function public.trg_organizacao_cadencia_fluxo_default();

do $$
declare
  v_org record;
begin
  for v_org in
    select o.id
    from public.organizacoes o
    where not exists (
      select 1 from public.cadencia_fluxo f where f.organizacao_id = o.id
    )
  loop
    perform public.ensure_default_cadencia_fluxo(v_org.id);
  end loop;
end $$;
