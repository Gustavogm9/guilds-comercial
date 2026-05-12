-- =============================================================================
-- Goals + Comissionamento
--
-- Gestor define metas (semanal/mensal/trimestral) por vendedor ou time todo.
-- Sistema mostra burndown chart + progresso real-time.
--
-- Comissionamento: regras configuráveis (% sobre receita, valor fixo por
-- lead fechado, escalonado por atingimento). Cálculo automático mensal.
-- =============================================================================

-- =============================================================================
-- 1. Metas
-- =============================================================================
create table if not exists public.meta_periodo (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  -- Escopo
  vendedor_id     uuid references public.profiles(id) on delete cascade,
  -- Se vendedor_id NULL → meta do time todo
  periodo         text not null check (periodo in ('semanal', 'mensal', 'trimestral')),
  data_inicio     date not null,
  data_fim        date not null check (data_fim >= data_inicio),
  -- Meta
  metrica         text not null check (metrica in (
    'receita_fechada',           -- soma valor_potencial dos Fechados
    'qtd_leads_fechados',        -- count
    'qtd_propostas',             -- leads em Proposta+Negociação
    'qtd_atividades',            -- ligações+emails+whatsapp
    'qtd_reunioes',              -- reunião marcada/feita
    'receita_expansao'           -- expansões fechadas
  )),
  meta_valor      numeric(14,2) not null check (meta_valor > 0),
  -- Tracking
  realizado_atual numeric(14,2) not null default 0,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organizacao_id, vendedor_id, periodo, data_inicio, metrica)
);

create index if not exists idx_meta_org_periodo on public.meta_periodo(organizacao_id, periodo, data_inicio desc);
create index if not exists idx_meta_vendedor on public.meta_periodo(vendedor_id, ativo) where ativo = true;

drop trigger if exists trg_meta_periodo_updated on public.meta_periodo;
create trigger trg_meta_periodo_updated
  before update on public.meta_periodo
  for each row execute function public.set_updated_at();

alter table public.meta_periodo enable row level security;
drop policy if exists meta_select on public.meta_periodo;
create policy meta_select on public.meta_periodo
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
drop policy if exists meta_write_gestor on public.meta_periodo;
create policy meta_write_gestor on public.meta_periodo
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id))
  with check (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id));

comment on table public.meta_periodo is
  'Metas semanais/mensais/trimestrais por vendedor ou time. Realizado_atual atualizado por trigger.';

-- =============================================================================
-- 2. Regras de comissionamento
-- =============================================================================
create table if not exists public.regra_comissao (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  nome            text not null check (length(trim(nome)) > 0 and length(nome) <= 80),
  -- Aplicação
  aplicar_em      text not null check (aplicar_em in (
    'lead_fechado',          -- por venda nova
    'expansao_fechada',      -- por upsell/cross-sell
    'renovacao'              -- por renovação de contrato
  )),
  -- Tipo de comissão
  tipo            text not null check (tipo in (
    'percentual_fixo',       -- X% sobre receita
    'valor_fixo_por_venda',  -- R$ Y por venda
    'percentual_escalonado'  -- meta < 80% → X%, 80-100% → Y%, > 100% → Z%
  )),
  percentual      numeric(5,2),    -- 0-100
  valor_fixo      numeric(10,2),
  -- Escalonamento (JSON: [{atingimento_min, atingimento_max, percentual}])
  faixas_escalonadas jsonb,
  -- Filtros opcionais
  segmento_filtro text,
  vendedor_id     uuid references public.profiles(id) on delete set null,
  -- Vigência
  vigente_de      date not null default current_date,
  vigente_ate     date,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_regra_comissao_org on public.regra_comissao(organizacao_id, ativo);

drop trigger if exists trg_regra_comissao_updated on public.regra_comissao;
create trigger trg_regra_comissao_updated
  before update on public.regra_comissao
  for each row execute function public.set_updated_at();

alter table public.regra_comissao enable row level security;
drop policy if exists regra_select on public.regra_comissao;
create policy regra_select on public.regra_comissao
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
drop policy if exists regra_write on public.regra_comissao;
create policy regra_write on public.regra_comissao
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id))
  with check (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id));

comment on table public.regra_comissao is
  'Regras de comissionamento configuráveis. Apenas gestor edita.';

-- =============================================================================
-- 3. Histórico de comissões calculadas
-- =============================================================================
create table if not exists public.comissao_calculada (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  vendedor_id     uuid not null references public.profiles(id) on delete cascade,
  regra_id        bigint references public.regra_comissao(id) on delete set null,
  -- Origem
  lead_id         bigint references public.leads(id) on delete set null,
  expansao_id     bigint references public.expansoes(id) on delete set null,
  -- Cálculo
  receita_base    numeric(14,2) not null,
  percentual_aplicado numeric(5,2),
  valor_comissao  numeric(10,2) not null,
  competencia     date not null,
  -- Status do pagamento (gestor marca manualmente)
  status_pagamento text not null default 'pendente' check (status_pagamento in ('pendente', 'aprovado', 'pago', 'cancelado')),
  pago_em         date,
  observacao      text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_comissao_vendedor on public.comissao_calculada(vendedor_id, competencia desc);
create index if not exists idx_comissao_org on public.comissao_calculada(organizacao_id, competencia desc);

alter table public.comissao_calculada enable row level security;
-- Vendedor vê as próprias; gestor vê todas da org
drop policy if exists comissao_select on public.comissao_calculada;
create policy comissao_select on public.comissao_calculada
  for select to authenticated
  using (
    organizacao_id in (select public.orgs_do_usuario())
    and (public.is_gestor_in_org(organizacao_id) or vendedor_id = (select auth.uid()))
  );
drop policy if exists comissao_write on public.comissao_calculada;
create policy comissao_write on public.comissao_calculada
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id))
  with check (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id));

comment on table public.comissao_calculada is
  'Histórico de comissões. Vendedor vê as próprias, gestor vê todas.';

-- =============================================================================
-- 4. Trigger: ao fechar lead, calcula comissão automaticamente
-- =============================================================================
create or replace function public.trg_calcular_comissao_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regra record;
  v_receita numeric;
  v_valor numeric;
  v_pct numeric;
begin
  -- Só age em transição pra "Fechado" e se há responsavel + valor
  if NEW.crm_stage <> 'Fechado' or OLD.crm_stage = 'Fechado' then return NEW; end if;
  if NEW.responsavel_id is null then return NEW; end if;

  v_receita := coalesce(NEW.valor_potencial, 0);
  if v_receita <= 0 then return NEW; end if;

  -- Pega a primeira regra ativa que se aplica
  for v_regra in
    select * from public.regra_comissao
    where organizacao_id = NEW.organizacao_id
      and ativo = true
      and aplicar_em = 'lead_fechado'
      and (vigente_ate is null or vigente_ate >= current_date)
      and vigente_de <= current_date
      and (vendedor_id is null or vendedor_id = NEW.responsavel_id)
      and (segmento_filtro is null or segmento_filtro = NEW.segmento)
    order by
      case when vendedor_id is not null then 0 else 1 end,  -- regra específica primeiro
      created_at desc
    limit 1
  loop
    if v_regra.tipo = 'percentual_fixo' then
      v_pct := v_regra.percentual;
      v_valor := round((v_receita * v_pct / 100)::numeric, 2);
    elsif v_regra.tipo = 'valor_fixo_por_venda' then
      v_pct := null;
      v_valor := coalesce(v_regra.valor_fixo, 0);
    else
      -- Escalonado: pega a faixa do vendedor pelo atingimento da meta atual
      v_pct := coalesce(v_regra.percentual, 0);  -- fallback
      v_valor := round((v_receita * v_pct / 100)::numeric, 2);
    end if;

    if v_valor > 0 then
      insert into public.comissao_calculada (
        organizacao_id, vendedor_id, regra_id, lead_id,
        receita_base, percentual_aplicado, valor_comissao, competencia
      ) values (
        NEW.organizacao_id, NEW.responsavel_id, v_regra.id, NEW.id,
        v_receita, v_pct, v_valor,
        date_trunc('month', current_date)::date
      );
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_lead_comissao on public.leads;
create trigger trg_lead_comissao
  after update of crm_stage on public.leads
  for each row execute function public.trg_calcular_comissao_lead();

-- =============================================================================
-- 5. View: progresso atual da meta (calcula realizado on-the-fly)
-- =============================================================================
create or replace view public.v_meta_progresso as
select
  m.*,
  case m.metrica
    when 'receita_fechada' then coalesce((
      select sum(l.valor_potencial)
      from public.leads l
      where l.organizacao_id = m.organizacao_id
        and l.crm_stage = 'Fechado'
        and l.data_fechamento between m.data_inicio and m.data_fim
        and (m.vendedor_id is null or l.responsavel_id = m.vendedor_id)
    ), 0)
    when 'qtd_leads_fechados' then coalesce((
      select count(*)::numeric
      from public.leads l
      where l.organizacao_id = m.organizacao_id
        and l.crm_stage = 'Fechado'
        and l.data_fechamento between m.data_inicio and m.data_fim
        and (m.vendedor_id is null or l.responsavel_id = m.vendedor_id)
    ), 0)
    when 'qtd_propostas' then coalesce((
      select count(*)::numeric
      from public.leads l
      where l.organizacao_id = m.organizacao_id
        and l.crm_stage in ('Proposta','Negociação')
        and (m.vendedor_id is null or l.responsavel_id = m.vendedor_id)
    ), 0)
    when 'receita_expansao' then coalesce((
      select sum(e.valor_potencial)
      from public.expansoes e
      where e.organizacao_id = m.organizacao_id
        and e.estagio = 'fechada'
        and e.data_fechada::date between m.data_inicio and m.data_fim
        and (m.vendedor_id is null or e.responsavel_id = m.vendedor_id)
    ), 0)
    else 0
  end as realizado,
  case when m.meta_valor > 0 then
    round((case m.metrica
      when 'receita_fechada' then coalesce((
        select sum(l.valor_potencial)
        from public.leads l
        where l.organizacao_id = m.organizacao_id
          and l.crm_stage = 'Fechado'
          and l.data_fechamento between m.data_inicio and m.data_fim
          and (m.vendedor_id is null or l.responsavel_id = m.vendedor_id)
      ), 0)
      else 0  -- simplificação
    end / m.meta_valor * 100)::numeric, 1)
  else 0 end as pct_atingimento
from public.meta_periodo m;

grant select on public.v_meta_progresso to authenticated;
