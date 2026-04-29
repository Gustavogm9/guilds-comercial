-- Fine-tuning por org via few-shot prompting + auto-evolução por nicho/cliente.
--
-- Não é fine-tuning real (não treina modelo). É indexação de exemplos bons
-- da própria org/nicho/cliente que viram few-shot examples injetados no
-- system prompt antes de cada chamada LLM.
--
-- Auto-evolução:
--   - Vendedor marca output como "perfeito" → exemplo manual (score 80)
--   - Output gerado por uma chamada de IA é "copiado/usado" pela UI → score sobe
--   - Lead avança etapa após receber output → score sobe
--   - Lead responde mensagem (depende WhatsApp webhook) → score sobe
--
-- Selector inteligente:
--   Para cada chamada de IA, busca top-N exemplos com mais relevância para
--   contexto do lead atual: mesmo segmento_lead > mesmo cargo > mesma faixa
--   ticket > qualquer exemplo da org > nada.

-- ============================================================
-- 1) Adicionar contexto fiscal/segmento na organizacoes (busca rápida)
-- ============================================================
alter table public.organizacoes
  add column if not exists segmento_padrao text,
  add column if not exists icp_dor_principal text,
  add column if not exists icp_cargo_alvo text;

-- ============================================================
-- 2) Tabela de exemplos few-shot
-- ============================================================
create table if not exists public.ai_fewshot_exemplos (
  id              bigint generated always as identity primary key,
  organizacao_id  uuid     not null references public.organizacoes(id) on delete cascade,
  feature_codigo  text     not null,
  -- contexto do exemplo (indexado pra similaridade)
  segmento_org    text,
  segmento_lead   text,
  cargo_decisor   text,
  ticket_range    text check (ticket_range is null or ticket_range in ('baixo','medio','alto')),
  -- conteúdo
  input_vars      jsonb    not null,
  output          text     not null,
  -- métricas
  score           numeric(5,2) not null default 50,  -- 0-100
  fonte           text     not null default 'manual'
                     check (fonte in ('manual','auto_clicado','auto_respondido','auto_convertido','auto_resposta_lead')),
  sucesso_signals jsonb    not null default '{}'::jsonb,
  -- referências
  lead_id         bigint   references public.leads(id) on delete set null,
  invocation_id   bigint   references public.ai_invocations(id) on delete set null,
  criado_por      uuid     references public.profiles(id) on delete set null,
  -- estado
  ativo           boolean  not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ai_fewshot_org_feat_score
  on public.ai_fewshot_exemplos (organizacao_id, feature_codigo, score desc) where ativo;

create index if not exists idx_ai_fewshot_segmento
  on public.ai_fewshot_exemplos (organizacao_id, feature_codigo, segmento_lead) where ativo;

create index if not exists idx_ai_fewshot_invocation
  on public.ai_fewshot_exemplos (invocation_id) where invocation_id is not null;

alter table public.ai_fewshot_exemplos enable row level security;

-- Vê exemplos da própria org
drop policy if exists ai_fewshot_select_org on public.ai_fewshot_exemplos;
create policy ai_fewshot_select_org on public.ai_fewshot_exemplos
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

-- Insere/atualiza/desativa só gestor
drop policy if exists ai_fewshot_write_gestor on public.ai_fewshot_exemplos;
create policy ai_fewshot_write_gestor on public.ai_fewshot_exemplos
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

drop trigger if exists trg_ai_fewshot_updated_at on public.ai_fewshot_exemplos;
create trigger trg_ai_fewshot_updated_at
  before update on public.ai_fewshot_exemplos
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3) Helper: classifica ticket_range a partir de valor_potencial
-- ============================================================
create or replace function public.classificar_ticket(_valor numeric)
returns text language sql immutable
set search_path = public
as $$
  select case
    when _valor is null or _valor < 10000 then 'baixo'
    when _valor < 50000 then 'medio'
    else 'alto'
  end;
$$;

-- ============================================================
-- 4) Selector inteligente: top-N exemplos para um contexto
-- ============================================================
create or replace function public.obter_fewshot_exemplos(
  _org uuid,
  _feature_codigo text,
  _lead_id bigint default null,
  _limite integer default 3
) returns table (
  id bigint,
  input_vars jsonb,
  output text,
  score numeric,
  match_score integer  -- qualidade do match de contexto (0-100)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _seg_lead text;
  _cargo text;
  _ticket text;
begin
  -- 1) Pega contexto do lead se fornecido
  if _lead_id is not null then
    select l.segmento, l.cargo, public.classificar_ticket(l.valor_potencial)
    into _seg_lead, _cargo, _ticket
    from public.leads l
    where l.id = _lead_id and l.organizacao_id = _org;
  end if;

  -- 2) Busca com ranking de similaridade (match_score):
  --    +40 segmento_lead bate
  --    +30 cargo_decisor bate
  --    +20 ticket_range bate
  --    +10 sempre (mesma org/feature)
  --    Total ordenado por (match_score + score) desc
  return query
  select
    e.id,
    e.input_vars,
    e.output,
    e.score,
    (
      10
      + case when _seg_lead is not null and lower(coalesce(e.segmento_lead,'')) = lower(_seg_lead) then 40 else 0 end
      + case when _cargo    is not null and lower(coalesce(e.cargo_decisor,'')) = lower(_cargo)    then 30 else 0 end
      + case when _ticket   is not null and coalesce(e.ticket_range,'') = _ticket then 20 else 0 end
    )::integer as match_score
  from public.ai_fewshot_exemplos e
  where e.organizacao_id = _org
    and e.feature_codigo = _feature_codigo
    and e.ativo
  order by match_score desc, e.score desc, e.created_at desc
  limit _limite;
end;
$$;

revoke execute on function public.obter_fewshot_exemplos(uuid, text, bigint, integer) from public;
revoke execute on function public.obter_fewshot_exemplos(uuid, text, bigint, integer) from anon;
grant   execute on function public.obter_fewshot_exemplos(uuid, text, bigint, integer) to authenticated, service_role;

-- ============================================================
-- 5) Função registrar_fewshot_de_invocacao() — auto-coleta
-- ============================================================
-- Promove uma invocação bem-sucedida a "exemplo" com score base.
-- Score base depende da fonte:
--   manual=80, auto_clicado=60, auto_respondido=70, auto_convertido=85, auto_resposta_lead=75
create or replace function public.registrar_fewshot_de_invocacao(
  _invocation_id bigint,
  _fonte text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  _inv record;
  _lead record;
  _score numeric;
  _seg_org text;
  _exemplo_id bigint;
begin
  -- Carrega invocação
  select * into _inv from public.ai_invocations where id = _invocation_id;
  if _inv is null or _inv.status != 'sucesso' or _inv.output_texto is null or _inv.output_texto = '' then
    return null;
  end if;

  -- Score base por fonte
  _score := case _fonte
    when 'manual'             then 80
    when 'auto_clicado'       then 60
    when 'auto_respondido'    then 70
    when 'auto_convertido'    then 85
    when 'auto_resposta_lead' then 75
    else 50
  end;

  -- Carrega lead (se houver) pra contexto
  if _inv.lead_id is not null then
    select * into _lead from public.leads where id = _inv.lead_id;
  end if;

  -- Pega segmento_padrao da org
  select segmento_padrao into _seg_org from public.organizacoes where id = _inv.organizacao_id;

  -- Insere
  insert into public.ai_fewshot_exemplos (
    organizacao_id, feature_codigo, segmento_org, segmento_lead,
    cargo_decisor, ticket_range, input_vars, output, score, fonte,
    lead_id, invocation_id, criado_por
  ) values (
    _inv.organizacao_id, _inv.feature_codigo, _seg_org, _lead.segmento,
    _lead.cargo, public.classificar_ticket(_lead.valor_potencial),
    _inv.input_vars, _inv.output_texto, _score, _fonte,
    _inv.lead_id, _inv.id, _inv.ator_id
  )
  on conflict do nothing
  returning id into _exemplo_id;

  return _exemplo_id;
end;
$$;

revoke execute on function public.registrar_fewshot_de_invocacao(bigint, text) from public;
revoke execute on function public.registrar_fewshot_de_invocacao(bigint, text) from anon;
grant   execute on function public.registrar_fewshot_de_invocacao(bigint, text) to authenticated, service_role;

-- ============================================================
-- 6) Trigger de auto-evolução: lead avança etapa → bump no score
-- ============================================================
-- Quando um lead muda pra Fechado ou avança etapa positivamente, sobe o score
-- dos exemplos vinculados a esse lead. Sinaliza "esses outputs ajudaram".
create or replace function public.fewshot_bump_score_on_progresso()
returns trigger language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só age em mudança de crm_stage para etapas "boas"
  if new.crm_stage is not null
     and new.crm_stage in ('Diagnóstico Pago','Proposta','Negociação','Fechado')
     and (old.crm_stage is null or old.crm_stage <> new.crm_stage)
  then
    update public.ai_fewshot_exemplos
    set score = least(score + case new.crm_stage
                          when 'Fechado'         then 15
                          when 'Negociação'      then 10
                          when 'Proposta'        then 8
                          when 'Diagnóstico Pago' then 5
                          else 0
                        end, 100),
        sucesso_signals = sucesso_signals || jsonb_build_object('avancou_'|| new.crm_stage, now())
    where lead_id = new.id and ativo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fewshot_bump_progresso on public.leads;
create trigger trg_fewshot_bump_progresso
  after update of crm_stage on public.leads
  for each row execute function public.fewshot_bump_score_on_progresso();
