-- =============================================================================
-- Sistema de créditos do lead (recompensa tipo='credito' agora desconta de algo)
--
-- Problema: antes, marcar uma indicação com recompensa_tipo='credito' como paga
-- não fazia nada além de virar boolean. Não havia conta-corrente.
--
-- Solução: tabela `lead_credito_movimentos` (livro contábil append-only).
--   - tipo 'credito': entrada (recompensa por indicação fechada)
--   - tipo 'debito': saída (consumo em renovação/expansão)
-- View `v_lead_saldo` agrega o saldo corrente.
--
-- Integração:
--   1. Trigger em indicacoes: ao virar recompensa_paga=true com tipo='credito',
--      insere movimento de crédito automaticamente.
--   2. Função consumir_credito(lead_id, valor, referencia_tipo, referencia_id)
--      retorna saldo restante; falha se saldo insuficiente.
--
-- RLS: usuário lê movimentos das orgs em que está; só gestor/sistema escreve.
-- =============================================================================

create table if not exists public.lead_credito_movimentos (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  tipo            text not null check (tipo in ('credito', 'debito')),
  valor           numeric(12,2) not null check (valor > 0),
  origem          text not null check (origem in (
    'indicacao_fechada',     -- gerado automaticamente por trigger
    'ajuste_manual',         -- gestor adicionou/removeu manualmente
    'consumo_renovacao',     -- consumido em renovação
    'consumo_expansao',      -- consumido em expansão (upsell)
    'consumo_outro',
    'extorno'                -- reverter movimento errado
  )),
  referencia_indicacao_id bigint references public.indicacoes(id) on delete set null,
  referencia_expansao_id  bigint references public.expansoes(id) on delete set null,
  descricao       text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null
);

create index if not exists idx_lead_credito_org_lead
  on public.lead_credito_movimentos(organizacao_id, lead_id, created_at desc);
create index if not exists idx_lead_credito_indicacao
  on public.lead_credito_movimentos(referencia_indicacao_id)
  where referencia_indicacao_id is not null;

comment on table public.lead_credito_movimentos is
  'Livro contábil append-only de créditos por lead. Crédito por recompensa de indicação, débito por consumo em renovação/expansão.';

-- RLS
alter table public.lead_credito_movimentos enable row level security;

drop policy if exists lead_credito_select on public.lead_credito_movimentos;
create policy lead_credito_select on public.lead_credito_movimentos
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

drop policy if exists lead_credito_insert_gestor on public.lead_credito_movimentos;
create policy lead_credito_insert_gestor on public.lead_credito_movimentos
  for insert to authenticated
  with check (
    organizacao_id in (select public.orgs_do_usuario())
    and public.is_gestor_in_org(organizacao_id)
  );

-- Sem update/delete: livro append-only. Erros corrigem com tipo='extorno'.

-- =============================================================================
-- View: saldo atual por lead
-- =============================================================================
create or replace view public.v_lead_saldo as
select
  lead_id,
  organizacao_id,
  coalesce(sum(case when tipo = 'credito' then valor else -valor end), 0)::numeric(12,2) as saldo,
  count(*) filter (where tipo = 'credito')::int as total_creditos,
  count(*) filter (where tipo = 'debito')::int as total_debitos,
  max(created_at) as ultimo_movimento_em
from public.lead_credito_movimentos
group by lead_id, organizacao_id;

grant select on public.v_lead_saldo to authenticated;

comment on view public.v_lead_saldo is
  'Saldo corrente de crédito por lead. Soma de créditos - débitos.';

-- =============================================================================
-- Trigger: quando indicação paga com tipo='credito', registra movimento
-- =============================================================================
create or replace function public.trg_credito_de_recompensa_paga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só age na transição paga=false→true
  if not (NEW.recompensa_paga = true and (OLD.recompensa_paga is distinct from true)) then
    return NEW;
  end if;
  -- Só age se tipo='credito'
  if NEW.recompensa_tipo <> 'credito' then return NEW; end if;
  -- Só age se há valor e embaixador interno (lead)
  if NEW.recompensa_valor is null or NEW.recompensa_valor <= 0 then return NEW; end if;
  if NEW.embaixador_lead_id is null then return NEW; end if;

  -- Idempotência: não duplica se já existe movimento ligado a essa indicação
  if exists (
    select 1 from public.lead_credito_movimentos
    where referencia_indicacao_id = NEW.id
      and tipo = 'credito'
      and origem = 'indicacao_fechada'
  ) then
    return NEW;
  end if;

  insert into public.lead_credito_movimentos (
    organizacao_id, lead_id, tipo, valor, origem,
    referencia_indicacao_id, descricao
  ) values (
    NEW.organizacao_id,
    NEW.embaixador_lead_id,
    'credito',
    NEW.recompensa_valor,
    'indicacao_fechada',
    NEW.id,
    coalesce('Recompensa pela indicação de ' || NEW.indicado_nome, 'Recompensa por indicação')
  );

  return NEW;
end;
$$;

drop trigger if exists trg_indicacao_credito on public.indicacoes;
create trigger trg_indicacao_credito
  after update of recompensa_paga on public.indicacoes
  for each row execute function public.trg_credito_de_recompensa_paga();

-- =============================================================================
-- Função: consumir crédito (saldo guard)
-- =============================================================================
create or replace function public.consumir_credito_lead(
  _lead_id bigint,
  _valor numeric,
  _origem text,
  _descricao text default null,
  _referencia_expansao_id bigint default null
)
returns numeric -- saldo restante
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_saldo    numeric;
  v_novo     numeric;
begin
  if _valor is null or _valor <= 0 then
    raise exception 'Valor inválido.';
  end if;
  if _origem not in ('consumo_renovacao', 'consumo_expansao', 'consumo_outro') then
    raise exception 'Origem inválida pra débito.';
  end if;

  select organizacao_id into v_org from public.leads where id = _lead_id;
  if v_org is null then raise exception 'Lead não encontrado.'; end if;

  if not public.is_gestor_in_org(v_org) then
    raise exception 'Apenas gestores podem consumir crédito.';
  end if;

  select coalesce(saldo, 0) into v_saldo from public.v_lead_saldo where lead_id = _lead_id;
  v_saldo := coalesce(v_saldo, 0);

  if v_saldo < _valor then
    raise exception 'Saldo insuficiente. Atual: %, tentando consumir: %', v_saldo, _valor;
  end if;

  insert into public.lead_credito_movimentos (
    organizacao_id, lead_id, tipo, valor, origem,
    referencia_expansao_id, descricao, created_by
  ) values (
    v_org, _lead_id, 'debito', _valor, _origem,
    _referencia_expansao_id, _descricao, (select auth.uid())
  );

  v_novo := v_saldo - _valor;
  return v_novo;
end;
$$;

grant execute on function public.consumir_credito_lead(bigint, numeric, text, text, bigint) to authenticated;

comment on function public.consumir_credito_lead(bigint, numeric, text, text, bigint) is
  'Registra débito no livro de crédito. Falha se saldo insuficiente. Retorna saldo restante.';
