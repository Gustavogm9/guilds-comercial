-- =============================================================================
-- Expansões (P4 do flywheel)
--
-- Sub-funil de oportunidades em clientes já fechados: upsell, cross-sell,
-- expansão de seats, renovação. Cada cliente fechado pode ter N expansões
-- simultâneas, cada uma com seu próprio funil simplificado.
--
-- Decisão de design (vs. RFC original):
--   - RFC sugeria coluna `oportunidade_expansao` em leads. Rejeitado: cliente
--     pode ter múltiplas expansões em paralelo.
--   - RFC sugeria sub-pipeline dentro de `leads`. Rejeitado: confunde com lead
--     novo (relatórios duplos contam errado).
--   - Solução: tabela própria `expansoes` referenciando lead original.
--
-- Funil de expansão (5 estágios):
--   identificada → qualificada → proposta → negociacao → fechada/perdida
--
-- Triggers automáticos:
--   - Expansão fechada → grava lead_evento `expansao_fechada` no cliente
--   - Expansão perdida → grava lead_evento `expansao_perdida` no cliente
--
-- Cron mensal (a configurar via pg_cron depois):
--   - Cliente Fechado há >= 90d, com health_score >= 70, sem expansão ativa
--     e sem expansão criada nos últimos 30d → cria expansao 'identificada'
--     com origem='sistema_milestone' (sugere upsell)
--
-- Views:
--   - v_expansoes_ativas    → expansões abertas com dados do cliente
--   - v_expansoes_resumo    → KPIs por org (total, taxa conversão, NRR)
--   - v_expansoes_por_cliente → 1 row por lead com totais de expansão
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela: expansoes
-- -----------------------------------------------------------------------------
create table if not exists public.expansoes (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  cliente_lead_id bigint not null references public.leads(id) on delete cascade,
  responsavel_id  uuid references public.profiles(id) on delete set null,

  tipo text not null check (tipo in (
    'upsell',           -- cliente passa pra plano maior
    'cross_sell',       -- novo produto/serviço pra mesmo cliente
    'expansao_seats',   -- mais usuários no mesmo plano
    'renovacao',        -- ciclo anual/mensal recorrente
    'recompra',         -- one-shot que se repete
    'outro'
  )),

  titulo      text not null check (length(trim(titulo)) > 0 and length(titulo) <= 200),
  descricao   text,

  valor_potencial         numeric(12,2) not null default 0 check (valor_potencial >= 0),
  valor_recorrente_mensal numeric(12,2) default 0 check (valor_recorrente_mensal is null or valor_recorrente_mensal >= 0),

  estagio text not null default 'identificada' check (estagio in (
    'identificada',
    'qualificada',
    'proposta',
    'negociacao',
    'fechada',
    'perdida'
  )),
  motivo_perda text,

  origem text not null default 'vendedor' check (origem in (
    'vendedor',                -- vendedor anotou
    'cliente',                 -- cliente puxou (entrou pedindo)
    'sistema_inatividade',     -- cron sugeriu (cliente >= 90d sem nova venda)
    'sistema_milestone',       -- cron sugeriu por milestone (ex: 6 meses)
    'sistema_renovacao'        -- cron criou pra ciclo de renovação
  )),

  data_identificada timestamptz not null default now(),
  data_proxima_acao date,
  proxima_acao      text,
  data_fechada      timestamptz,
  data_perdida      timestamptz,

  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_expansoes_org              on public.expansoes(organizacao_id);
create index idx_expansoes_cliente          on public.expansoes(cliente_lead_id);
create index idx_expansoes_estagio_ativa    on public.expansoes(organizacao_id, estagio)
  where estagio not in ('fechada', 'perdida');
create index idx_expansoes_responsavel      on public.expansoes(responsavel_id) where responsavel_id is not null;
create index idx_expansoes_proxima_acao     on public.expansoes(data_proxima_acao) where estagio not in ('fechada', 'perdida');

comment on table public.expansoes is
  'Oportunidades de expansão em clientes Fechados (upsell, cross-sell, seats, renovação). Cada cliente pode ter N simultâneas. Funil simplificado: identificada → qualificada → proposta → negociacao → fechada/perdida.';

-- -----------------------------------------------------------------------------
-- 2. Trigger: updated_at
-- -----------------------------------------------------------------------------
drop trigger if exists trg_expansoes_updated on public.expansoes;
create trigger trg_expansoes_updated
  before update on public.expansoes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Trigger: expansão fechada/perdida → lead_evento + datas
-- -----------------------------------------------------------------------------
create or replace function public.trg_expansao_estagio_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.estagio = OLD.estagio then return NEW; end if;

  -- Atualiza data fechada/perdida
  if NEW.estagio = 'fechada' and OLD.estagio is distinct from 'fechada' then
    NEW.data_fechada := now();
  elsif NEW.estagio = 'perdida' and OLD.estagio is distinct from 'perdida' then
    NEW.data_perdida := now();
  end if;

  -- Audit no lead original
  if NEW.estagio in ('fechada', 'perdida') then
    insert into public.lead_evento (organizacao_id, lead_id, ator_id, tipo, payload)
    values (
      NEW.organizacao_id,
      NEW.cliente_lead_id,
      NEW.responsavel_id,
      case when NEW.estagio = 'fechada' then 'expansao_fechada' else 'expansao_perdida' end,
      jsonb_build_object(
        'expansao_id', NEW.id,
        'tipo', NEW.tipo,
        'titulo', NEW.titulo,
        'valor_potencial', NEW.valor_potencial,
        'valor_recorrente_mensal', NEW.valor_recorrente_mensal,
        'motivo_perda', NEW.motivo_perda
      )
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_expansao_estagio on public.expansoes;
create trigger trg_expansao_estagio
  before update of estagio on public.expansoes
  for each row execute function public.trg_expansao_estagio_change();

-- -----------------------------------------------------------------------------
-- 4. RLS — padrão multi-tenant (qualquer membro da org lê e escreve;
--    só gestor apaga)
-- -----------------------------------------------------------------------------
alter table public.expansoes enable row level security;

create policy expansoes_select on public.expansoes
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
create policy expansoes_insert on public.expansoes
  for insert to authenticated
  with check (organizacao_id in (select public.orgs_do_usuario()));
create policy expansoes_update on public.expansoes
  for update to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));
create policy expansoes_delete_gestor on public.expansoes
  for delete to authenticated
  using (public.is_gestor_in_org(organizacao_id));

-- -----------------------------------------------------------------------------
-- 5. Views
-- -----------------------------------------------------------------------------

-- View: expansões ativas com info do cliente
drop view if exists public.v_expansoes_ativas;
create view public.v_expansoes_ativas
with (security_invoker = true) as
select
  e.id,
  e.organizacao_id,
  e.cliente_lead_id,
  e.responsavel_id,
  e.tipo,
  e.titulo,
  e.descricao,
  e.valor_potencial,
  e.valor_recorrente_mensal,
  e.estagio,
  e.origem,
  e.data_identificada,
  e.data_proxima_acao,
  e.proxima_acao,
  e.observacoes,
  e.created_at,
  e.updated_at,
  l.empresa             as cliente_empresa,
  l.nome                as cliente_nome,
  l.crm_stage           as cliente_crm_stage,
  pr.display_name       as responsavel_nome,
  -- Dias na expansão
  (current_date - e.data_identificada::date)              as dias_aberta,
  -- Dias até próxima ação (negativo = atrasada)
  case when e.data_proxima_acao is null then null
       else (e.data_proxima_acao - current_date)::int
  end                                                     as dias_ate_acao
from public.expansoes e
join public.leads l on l.id = e.cliente_lead_id
left join public.profiles pr on pr.id = e.responsavel_id
where e.estagio not in ('fechada', 'perdida');

comment on view public.v_expansoes_ativas is
  'Expansões abertas (não fechadas/perdidas) com dados do cliente e responsável.';

-- View: resumo por org (KPIs de expansão)
drop view if exists public.v_expansoes_resumo;
create view public.v_expansoes_resumo
with (security_invoker = true) as
with todas as (
  select organizacao_id, estagio, valor_potencial, valor_recorrente_mensal,
         (data_fechada - data_identificada) as tempo_p_fechar
  from public.expansoes
)
select
  o.id as organizacao_id,
  count(*)                                                    as total_expansoes,
  count(*) filter (where estagio not in ('fechada', 'perdida')) as ativas,
  count(*) filter (where estagio = 'fechada')                   as fechadas,
  count(*) filter (where estagio = 'perdida')                   as perdidas,
  -- Taxa de conversão entre fechadas e (fechadas+perdidas)
  case
    when count(*) filter (where estagio in ('fechada', 'perdida')) = 0 then null
    else round(
      100.0 * count(*) filter (where estagio = 'fechada')
            / count(*) filter (where estagio in ('fechada', 'perdida')),
      1
    )
  end                                                         as taxa_conversao_pct,
  coalesce(sum(valor_potencial) filter (where estagio not in ('fechada', 'perdida')), 0) as pipeline_aberto,
  coalesce(sum(valor_potencial) filter (where estagio = 'fechada'), 0) as receita_expandida,
  coalesce(sum(valor_recorrente_mensal) filter (where estagio = 'fechada'), 0) * 12 as arr_expandido,
  -- Tempo médio em dias
  avg(extract(epoch from tempo_p_fechar)/86400.0) filter (where estagio = 'fechada') as dias_medio_fechar
from public.organizacoes o
left join todas on todas.organizacao_id = o.id
group by o.id;

comment on view public.v_expansoes_resumo is
  'KPIs de expansão por organização: pipeline aberto, receita expandida, ARR expandido, taxa conversão.';

-- View: 1 row por cliente com totais de expansão (alimenta detalhe do lead)
drop view if exists public.v_expansoes_por_cliente;
create view public.v_expansoes_por_cliente
with (security_invoker = true) as
select
  e.organizacao_id,
  e.cliente_lead_id,
  count(*)                                                    as total,
  count(*) filter (where estagio not in ('fechada', 'perdida')) as ativas,
  count(*) filter (where estagio = 'fechada')                   as fechadas,
  coalesce(sum(valor_potencial) filter (where estagio = 'fechada'), 0) as receita_total_expansao,
  coalesce(sum(valor_recorrente_mensal) filter (where estagio = 'fechada'), 0) as mrr_expandido,
  max(updated_at)                                             as ultima_atualizacao
from public.expansoes e
group by e.organizacao_id, e.cliente_lead_id;

comment on view public.v_expansoes_por_cliente is
  'Totais de expansão agregados por cliente. Alimenta /pipeline/[id] (mostrar quantas expansões esse cliente já gerou).';

-- View: expansões com próxima ação atrasada (alimenta /hoje)
drop view if exists public.v_expansoes_atrasadas;
create view public.v_expansoes_atrasadas
with (security_invoker = true) as
select
  e.id                                       as expansao_id,
  e.organizacao_id,
  e.cliente_lead_id,
  e.responsavel_id,
  e.tipo,
  e.titulo,
  e.estagio,
  e.proxima_acao,
  e.data_proxima_acao,
  e.valor_potencial,
  l.empresa                                  as cliente_empresa,
  l.nome                                     as cliente_nome,
  (current_date - e.data_proxima_acao)::int  as dias_atrasada
from public.expansoes e
join public.leads l on l.id = e.cliente_lead_id
where e.estagio not in ('fechada', 'perdida')
  and e.data_proxima_acao is not null
  and e.data_proxima_acao <= current_date;

comment on view public.v_expansoes_atrasadas is
  'Expansões abertas com próxima ação <= hoje. Alimenta /hoje pra cobrar follow-up.';
