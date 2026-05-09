-- =============================================================================
-- Indicações / Advocacy
--
-- Implementa o lado direito do funil borboleta: depois que um lead vira
-- "Fechado", o sistema pede automaticamente uma indicação ao cliente. Cada
-- indicação vira um lead novo na base com origem rastreada.
--
-- Tabelas:
--   - pedidos_indicacao  → registra QUANDO o vendedor pediu (mesmo sem retorno)
--   - indicacoes         → quem indicou quem, status, conversão, recompensa
--
-- Coluna nova:
--   - leads.indicacao_id → liga lead à indicação que o originou
--
-- Triggers:
--   - Lead vira "Fechado" → cria pedido pendente (pos_fechamento)
--   - Lead criado por indicação vira "Fechado" → atualiza indicacoes.status
--
-- Views:
--   - v_advocacy_kpis       → K-factor, % indicação, receita gerada
--   - v_top_embaixadores    → ranking de quem mais gera receita via indicação
--   - v_pedidos_pendentes   → backlog de pedidos não-respondidos (alimenta /hoje)
--
-- RLS: padrão multi-tenant (orgs_do_usuario)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela: pedidos_indicacao
-- -----------------------------------------------------------------------------
create table if not exists public.pedidos_indicacao (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  solicitado_por  uuid references public.profiles(id) on delete set null,

  momento text not null check (momento in (
    'pos_fechamento',
    'pos_raio_x',
    'pos_resultado',
    'renovacao',
    'outro'
  )),
  canal text check (canal in ('call', 'whatsapp', 'email', 'pessoalmente', 'outro')),

  status text not null default 'pendente' check (status in (
    'pendente',
    'respondido',
    'negado',
    'ignorado',
    'agendado'
  )),
  qtd_indicacoes_recebidas int not null default 0 check (qtd_indicacoes_recebidas >= 0),

  data_pedido    timestamptz not null default now(),
  data_resposta  timestamptz,
  observacoes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_pedidos_indicacao_org on public.pedidos_indicacao(organizacao_id);
create index idx_pedidos_indicacao_lead on public.pedidos_indicacao(lead_id);
create index idx_pedidos_indicacao_status on public.pedidos_indicacao(organizacao_id, status)
  where status = 'pendente';

-- 1 pedido pendente por (lead, momento) — evita duplicar pedido pra mesmo cliente
create unique index uniq_pedido_lead_momento_pendente
  on public.pedidos_indicacao(lead_id, momento)
  where status = 'pendente';

comment on table public.pedidos_indicacao is
  'Registra quando um vendedor pediu indicação a um cliente. Pode estar pendente, respondido (com N indicações), negado, ignorado ou agendado pra outra hora.';

-- -----------------------------------------------------------------------------
-- 2. Tabela: indicacoes
-- -----------------------------------------------------------------------------
create table if not exists public.indicacoes (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,

  -- Quem indicou (cliente embaixador). NULL se for embaixador externo (ex-cliente, parceiro).
  embaixador_lead_id      bigint references public.leads(id) on delete set null,
  embaixador_externo_nome text,
  -- Garante que pelo menos um dos dois está preenchido
  constraint chk_embaixador_obrigatorio check (
    embaixador_lead_id is not null or
    (embaixador_externo_nome is not null and length(trim(embaixador_externo_nome)) > 0)
  ),

  pedido_id      bigint references public.pedidos_indicacao(id) on delete set null,
  solicitado_por uuid references public.profiles(id) on delete set null,

  -- Dados do indicado (texto livre antes de virar lead)
  indicado_nome      text not null check (length(trim(indicado_nome)) > 0),
  indicado_empresa   text,
  indicado_cargo     text,
  indicado_email     text,
  indicado_whatsapp  text,
  indicado_linkedin  text,
  contexto           text,

  -- Quando vira lead, vinculamos
  lead_convertido_id bigint references public.leads(id) on delete set null,

  status text not null default 'recebida' check (status in (
    'recebida',
    'contactado',
    'virou_lead',
    'fechado',
    'perdido',
    'descartado'
  )),

  data_recebida   timestamptz not null default now(),
  data_contactado timestamptz,
  data_convertido timestamptz,
  data_fechado    timestamptz,
  data_perdido    timestamptz,

  -- Recompensa (catalogado agora, UX de pagar fica pra fase 2)
  recompensa_tipo  text check (recompensa_tipo in ('desconto_renovacao', 'credito', 'produto', 'dinheiro', 'nenhum')),
  recompensa_valor numeric(12,2) check (recompensa_valor is null or recompensa_valor >= 0),
  recompensa_paga  boolean not null default false,
  recompensa_paga_em timestamptz,

  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_indicacoes_org              on public.indicacoes(organizacao_id);
create index idx_indicacoes_embaixador       on public.indicacoes(embaixador_lead_id) where embaixador_lead_id is not null;
create index idx_indicacoes_lead_convertido  on public.indicacoes(lead_convertido_id) where lead_convertido_id is not null;
create index idx_indicacoes_status           on public.indicacoes(organizacao_id, status);
create index idx_indicacoes_pedido           on public.indicacoes(pedido_id) where pedido_id is not null;

comment on table public.indicacoes is
  'Indicações de pessoas/empresas dadas por clientes embaixadores. Cada row vira (potencialmente) um lead novo na base com origem rastreada.';

-- -----------------------------------------------------------------------------
-- 3. Coluna nova: leads.indicacao_id
-- -----------------------------------------------------------------------------
alter table public.leads
  add column if not exists indicacao_id bigint references public.indicacoes(id) on delete set null;

comment on column public.leads.indicacao_id is
  'Liga este lead à indicação que o originou. NULL para leads que não vieram de indicação.';

create index if not exists idx_leads_indicacao on public.leads(indicacao_id) where indicacao_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Trigger: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pedidos_indicacao_updated on public.pedidos_indicacao;
create trigger trg_pedidos_indicacao_updated
  before update on public.pedidos_indicacao
  for each row execute function public.set_updated_at();

drop trigger if exists trg_indicacoes_updated on public.indicacoes;
create trigger trg_indicacoes_updated
  before update on public.indicacoes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Trigger: lead vira "Fechado" → cria pedido_indicacao pendente
--    Só dispara em transições novas (OLD.crm_stage <> NEW.crm_stage)
--    Pra evitar criar pedido em backfills, só age em UPDATE (não em INSERT).
-- -----------------------------------------------------------------------------
create or replace function public.trg_pedido_apos_fechamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.crm_stage = 'Fechado' and (OLD.crm_stage is distinct from 'Fechado') then
    insert into public.pedidos_indicacao (
      organizacao_id, lead_id, solicitado_por, momento
    )
    values (
      NEW.organizacao_id, NEW.id, NEW.responsavel_id, 'pos_fechamento'
    )
    on conflict do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_lead_fechado_pede_indicacao on public.leads;
create trigger trg_lead_fechado_pede_indicacao
  after update of crm_stage on public.leads
  for each row execute function public.trg_pedido_apos_fechamento();

-- -----------------------------------------------------------------------------
-- 6. Trigger: lead-convertido-de-indicação vira "Fechado" → indicacoes.status='fechado'
-- -----------------------------------------------------------------------------
create or replace function public.trg_atualizar_indicacao_quando_lead_fecha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.crm_stage = 'Fechado' and (OLD.crm_stage is distinct from 'Fechado') then
    update public.indicacoes
       set status = 'fechado',
           data_fechado = now()
     where lead_convertido_id = NEW.id
       and status not in ('fechado', 'descartado');
  elsif NEW.crm_stage = 'Perdido' and (OLD.crm_stage is distinct from 'Perdido') then
    update public.indicacoes
       set status = 'perdido',
           data_perdido = now()
     where lead_convertido_id = NEW.id
       and status not in ('fechado', 'descartado', 'perdido');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_lead_fecha_atualiza_indicacao on public.leads;
create trigger trg_lead_fecha_atualiza_indicacao
  after update of crm_stage on public.leads
  for each row execute function public.trg_atualizar_indicacao_quando_lead_fecha();

-- -----------------------------------------------------------------------------
-- 7. RLS — padrão multi-tenant
-- -----------------------------------------------------------------------------
alter table public.pedidos_indicacao enable row level security;
alter table public.indicacoes        enable row level security;

-- pedidos_indicacao: qualquer membro da org lê; insert/update por membros (vendedores também)
create policy pedidos_indicacao_select on public.pedidos_indicacao
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy pedidos_indicacao_insert on public.pedidos_indicacao
  for insert to authenticated
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy pedidos_indicacao_update on public.pedidos_indicacao
  for update to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy pedidos_indicacao_delete_gestor on public.pedidos_indicacao
  for delete to authenticated
  using (public.is_gestor_in_org(organizacao_id));

-- indicacoes: idem (qualquer vendedor pode registrar/atualizar; só gestor apaga)
create policy indicacoes_select on public.indicacoes
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy indicacoes_insert on public.indicacoes
  for insert to authenticated
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy indicacoes_update on public.indicacoes
  for update to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

create policy indicacoes_delete_gestor on public.indicacoes
  for delete to authenticated
  using (public.is_gestor_in_org(organizacao_id));

-- -----------------------------------------------------------------------------
-- 8. Views: KPIs e listagens enriquecidas
-- -----------------------------------------------------------------------------

-- View: pedidos pendentes com info do lead pra alimentar /hoje e /indicacoes
drop view if exists public.v_pedidos_pendentes;
create view public.v_pedidos_pendentes
with (security_invoker = true) as
select
  p.id                  as pedido_id,
  p.organizacao_id,
  p.lead_id,
  p.solicitado_por,
  p.momento,
  p.canal,
  p.status,
  p.data_pedido,
  p.observacoes,
  l.empresa             as lead_empresa,
  l.nome                as lead_nome,
  l.responsavel_id      as lead_responsavel_id,
  l.crm_stage           as lead_crm_stage,
  pr.display_name       as solicitado_por_nome,
  (current_date - p.data_pedido::date) as dias_pendente
from public.pedidos_indicacao p
join public.leads l on l.id = p.lead_id
left join public.profiles pr on pr.id = p.solicitado_por
where p.status = 'pendente';

comment on view public.v_pedidos_pendentes is
  'Pedidos de indicação pendentes com dados do lead/embaixador. Alimenta /hoje (card de pedido) e aba /indicacoes (tab Pendentes).';

-- View: KPIs de advocacy por organização
drop view if exists public.v_advocacy_kpis;
create view public.v_advocacy_kpis
with (security_invoker = true) as
with fechados as (
  select id, organizacao_id, valor_potencial
  from public.leads
  where crm_stage = 'Fechado'
),
pedidos_respondidos as (
  select lead_id, organizacao_id,
         extract(epoch from (data_resposta - data_pedido))/86400.0 as dias_p_responder
  from public.pedidos_indicacao
  where momento = 'pos_fechamento' and status = 'respondido'
),
indicacoes_que_fecharam as (
  select i.organizacao_id, i.embaixador_lead_id,
         coalesce(l.valor_potencial, 0) as valor_lead_indicado
  from public.indicacoes i
  join public.leads l on l.id = i.lead_convertido_id
  where i.status = 'fechado'
),
indicacoes_que_viraram_lead as (
  select organizacao_id, count(*) as qtd
  from public.indicacoes
  where status in ('virou_lead', 'fechado')
  group by organizacao_id
)
select
  o.id as organizacao_id,
  count(distinct f.id)                                                    as clientes_fechados,
  coalesce(ivl.qtd, 0)                                                    as indicacoes_viraram_lead,
  count(distinct ic.embaixador_lead_id)                                   as clientes_que_indicaram,
  case
    when count(distinct f.id) = 0 then 0
    else round(coalesce(ivl.qtd, 0)::numeric / count(distinct f.id), 2)
  end                                                                     as k_factor,
  round(avg(pr.dias_p_responder)::numeric, 1)                             as dias_media_p_responder,
  coalesce(sum(ic.valor_lead_indicado), 0)                                as receita_via_indicacao
from public.organizacoes o
left join fechados f                          on f.organizacao_id = o.id
left join pedidos_respondidos pr              on pr.organizacao_id = o.id
left join indicacoes_que_fecharam ic           on ic.organizacao_id = o.id
left join indicacoes_que_viraram_lead ivl     on ivl.organizacao_id = o.id
group by o.id, ivl.qtd;

comment on view public.v_advocacy_kpis is
  'KPIs do funil borboleta por organização: K-factor, receita gerada via indicação, tempo médio pra responder pedido.';

-- View: ranking de embaixadores
drop view if exists public.v_top_embaixadores;
create view public.v_top_embaixadores
with (security_invoker = true) as
select
  i.organizacao_id,
  i.embaixador_lead_id,
  emb.empresa                                          as embaixador_empresa,
  emb.nome                                             as embaixador_nome,
  emb.responsavel_id                                   as embaixador_responsavel_id,
  count(*)                                             as qtd_indicacoes,
  count(*) filter (where i.status in ('virou_lead', 'fechado')) as qtd_viraram_lead,
  count(*) filter (where i.status = 'fechado')         as qtd_fecharam,
  coalesce(sum(coalesce(l.valor_potencial, 0)) filter (where i.status = 'fechado'), 0) as receita_gerada,
  case
    when count(*) = 0 then 0
    else round(100.0 * count(*) filter (where i.status = 'fechado') / count(*), 1)
  end                                                  as taxa_conversao_pct,
  max(i.created_at)                                    as ultima_indicacao_em
from public.indicacoes i
join public.leads emb on emb.id = i.embaixador_lead_id
left join public.leads l on l.id = i.lead_convertido_id
where i.embaixador_lead_id is not null
group by i.organizacao_id, i.embaixador_lead_id, emb.empresa, emb.nome, emb.responsavel_id;

comment on view public.v_top_embaixadores is
  'Ranking de clientes embaixadores: quantas indicações deram, quantas fecharam, quanta receita geraram.';

-- View: indicações enriquecidas com dados do embaixador e do lead convertido
drop view if exists public.v_indicacoes_enriquecidas;
create view public.v_indicacoes_enriquecidas
with (security_invoker = true) as
select
  i.*,
  emb.empresa     as embaixador_empresa,
  emb.nome        as embaixador_nome,
  conv.empresa    as lead_convertido_empresa,
  conv.crm_stage  as lead_convertido_crm_stage,
  conv.valor_potencial as lead_convertido_valor,
  pr.display_name as solicitado_por_nome
from public.indicacoes i
left join public.leads emb on emb.id = i.embaixador_lead_id
left join public.leads conv on conv.id = i.lead_convertido_id
left join public.profiles pr on pr.id = i.solicitado_por;

comment on view public.v_indicacoes_enriquecidas is
  'Indicações com dados do embaixador, lead convertido e vendedor solicitante. Usada nas listagens de /indicacoes.';
