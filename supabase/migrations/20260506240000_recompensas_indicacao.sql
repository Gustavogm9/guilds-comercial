-- =============================================================================
-- Programa de recompensas (item 5 do polish do flywheel)
--
-- Catalogamos recompensa em `indicacoes` desde P1, mas sem regras automáticas
-- nem UX completa. Esta migration:
--
-- 1. Tabela `org_recompensa_config` — gestor configura regras por org:
--      - quanto dar quando indicação vira lead
--      - quanto dar quando indicação fecha
--      - tipo de recompensa default (credito, desconto, dinheiro...)
--
-- 2. Trigger `trg_calcular_recompensa_indicacao`:
--      - quando status muda pra 'virou_lead' OU 'fechado', preenche
--        recompensa_tipo + recompensa_valor automaticamente baseado na
--        config da org. Não marca como paga (pagamento é manual).
--
-- 3. View `v_recompensas_resumo`:
--      - total devido, pago, pendente por org
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela: org_recompensa_config (1:1 com organizacao)
-- -----------------------------------------------------------------------------
create table if not exists public.org_recompensa_config (
  organizacao_id  uuid primary key references public.organizacoes(id) on delete cascade,
  ativo           boolean not null default false,
  -- Recompensa por status
  valor_virou_lead   numeric(12,2) not null default 0 check (valor_virou_lead >= 0),
  valor_fechado      numeric(12,2) not null default 0 check (valor_fechado >= 0),
  -- Tipo padrão
  tipo_default text not null default 'credito' check (tipo_default in (
    'desconto_renovacao', 'credito', 'produto', 'dinheiro', 'nenhum'
  )),
  -- Mensagem informativa que aparece no portal embaixador (opcional)
  mensagem_recompensa text,
  -- Limite por embaixador por mês (anti-abuse + controle de budget)
  limite_mensal_por_embaixador int check (limite_mensal_por_embaixador is null or limite_mensal_por_embaixador >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.org_recompensa_config is
  'Configuração de programa de recompensas por organização. Quando ativo=true, trigger preenche recompensa_valor automaticamente em indicacoes que viram lead/fechado.';

drop trigger if exists trg_recompensa_config_updated on public.org_recompensa_config;
create trigger trg_recompensa_config_updated
  before update on public.org_recompensa_config
  for each row execute function public.set_updated_at();

-- RLS — só gestor configura, todos da org leem (pra mostrar no portal)
alter table public.org_recompensa_config enable row level security;

create policy reccfg_select on public.org_recompensa_config
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

create policy reccfg_write_gestor on public.org_recompensa_config
  for all to authenticated
  using (public.is_gestor_in_org(organizacao_id))
  with check (public.is_gestor_in_org(organizacao_id));

-- Acesso ANON pra portal /indicar/{token} mostrar o programa
-- (security_invoker=true em buscar_embaixador_por_token vai esbarrar em RLS;
--  por isso vou expor via função pública).

-- -----------------------------------------------------------------------------
-- 2. Trigger: calcula recompensa quando indicação muda pra virou_lead/fechado
-- -----------------------------------------------------------------------------
create or replace function public.trg_calcular_recompensa_indicacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_valor numeric(12,2);
begin
  -- Só age em transição de estado
  if NEW.status = OLD.status then return NEW; end if;
  -- Só calcula em virou_lead ou fechado
  if NEW.status not in ('virou_lead', 'fechado') then return NEW; end if;

  -- Pega config da org
  select * into v_cfg
  from public.org_recompensa_config
  where organizacao_id = NEW.organizacao_id;

  -- Sem config ou desativada = não preenche nada (vendedor decide manual)
  if v_cfg is null or v_cfg.ativo is not true then return NEW; end if;

  -- Calcula valor conforme status
  if NEW.status = 'virou_lead' then
    v_valor := v_cfg.valor_virou_lead;
  else
    -- 'fechado' substitui o valor de virou_lead se já tinha
    v_valor := v_cfg.valor_fechado;
  end if;

  -- Não sobrescreve se já tem valor maior (evita downgrade caso vá de
  -- 'fechado' pra 'virou_lead' por reversão manual)
  if NEW.recompensa_valor is not null and NEW.recompensa_valor >= v_valor then
    return NEW;
  end if;

  -- Preenche
  NEW.recompensa_tipo := coalesce(NEW.recompensa_tipo, v_cfg.tipo_default);
  NEW.recompensa_valor := v_valor;
  -- recompensa_paga continua false até alguém marcar manualmente

  return NEW;
end;
$$;

drop trigger if exists trg_indicacao_calcular_recompensa on public.indicacoes;
create trigger trg_indicacao_calcular_recompensa
  before update of status on public.indicacoes
  for each row execute function public.trg_calcular_recompensa_indicacao();

comment on function public.trg_calcular_recompensa_indicacao() is
  'Preenche automaticamente recompensa_tipo + recompensa_valor quando status de indicação muda pra virou_lead ou fechado, baseado em org_recompensa_config. Não marca como paga.';

-- -----------------------------------------------------------------------------
-- 3. View: v_recompensas_resumo (KPIs de pagamento)
-- -----------------------------------------------------------------------------
drop view if exists public.v_recompensas_resumo;
create view public.v_recompensas_resumo
with (security_invoker = true) as
select
  o.id as organizacao_id,
  count(*) filter (where i.recompensa_valor is not null and i.recompensa_valor > 0) as total_com_recompensa,
  count(*) filter (where i.recompensa_paga = true) as total_pagas,
  count(*) filter (where i.recompensa_valor is not null and i.recompensa_valor > 0 and i.recompensa_paga = false) as total_pendentes,
  coalesce(sum(i.recompensa_valor) filter (where i.recompensa_paga = true), 0) as total_valor_pago,
  coalesce(sum(i.recompensa_valor) filter (where i.recompensa_valor is not null and i.recompensa_valor > 0 and i.recompensa_paga = false), 0) as total_valor_pendente
from public.organizacoes o
left join public.indicacoes i on i.organizacao_id = o.id
group by o.id;

comment on view public.v_recompensas_resumo is
  'KPIs do programa de recompensas: # indicações com recompensa, pagas/pendentes, soma de valores.';

-- -----------------------------------------------------------------------------
-- 4. Função pública pra mostrar programa no portal embaixador
--    (estende buscar_embaixador_por_token sem refazê-la — função separada)
-- -----------------------------------------------------------------------------
create or replace function public.buscar_programa_recompensa_por_token(_token text)
returns table (
  programa_ativo boolean,
  valor_virou_lead numeric,
  valor_fechado numeric,
  tipo_default text,
  mensagem_recompensa text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if _token is null or length(_token) < 16 then return; end if;

  select t.organizacao_id into v_org_id
  from public.embaixador_tokens t
  where t.token = _token
    and t.ativo = true
    and (t.expires_at is null or t.expires_at > now())
  limit 1;

  if v_org_id is null then return; end if;

  return query
  select
    coalesce(c.ativo, false),
    coalesce(c.valor_virou_lead, 0::numeric),
    coalesce(c.valor_fechado, 0::numeric),
    coalesce(c.tipo_default, 'nenhum'::text),
    c.mensagem_recompensa
  from public.org_recompensa_config c
  where c.organizacao_id = v_org_id
  union all
  select false, 0::numeric, 0::numeric, 'nenhum'::text, null
  where not exists (select 1 from public.org_recompensa_config where organizacao_id = v_org_id)
  limit 1;
end;
$$;

revoke all on function public.buscar_programa_recompensa_por_token(text) from public;
grant execute on function public.buscar_programa_recompensa_por_token(text) to anon, authenticated;
