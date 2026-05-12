-- =============================================================================
-- Prospecção: notas, tags, bookmarks + triggers de webhook
--
-- Adiciona camada "user-level" sobre o cache global de empresas:
--   - prospeccao_empresa_meta_org: 1 row por (empresa, org) — notas, tags,
--     bookmark pessoal do vendedor, marcado como "evitar prospecção"
--   - prospeccao_empresa_bookmark: 1 row por (empresa, profile) — favoritos
--     individuais do vendedor
--
-- Triggers de webhook:
--   - prospeccao.empresa_enriquecida: dispara quando insert/update em
--     prospeccao_empresa
--   - prospeccao.empresa_situacao_mudou: dispara quando alerta tipo
--     'situacao_mudou' é inserido
--   - prospeccao.bulk_concluido: dispara quando bulk job termina
-- =============================================================================

-- =============================================================================
-- 1. Meta por org (tags + notas + flags)
-- =============================================================================
create table if not exists public.prospeccao_empresa_meta_org (
  id              bigserial primary key,
  empresa_id      bigint not null references public.prospeccao_empresa(id) on delete cascade,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  tags            text[] not null default '{}',
  notas_internas  text,
  evitar          boolean not null default false,    -- "não prospectar" (ex: cliente nosso, concorrente)
  evitar_motivo   text,
  prioridade_icp  text check (prioridade_icp is null or prioridade_icp in ('alta','media','baixa')),
  atualizado_por  uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empresa_id, organizacao_id)
);

create index if not exists idx_meta_org on public.prospeccao_empresa_meta_org(organizacao_id);
create index if not exists idx_meta_tags on public.prospeccao_empresa_meta_org using gin (tags);
create index if not exists idx_meta_evitar on public.prospeccao_empresa_meta_org(organizacao_id) where evitar = true;

drop trigger if exists trg_meta_org_updated on public.prospeccao_empresa_meta_org;
create trigger trg_meta_org_updated
  before update on public.prospeccao_empresa_meta_org
  for each row execute function public.set_updated_at();

alter table public.prospeccao_empresa_meta_org enable row level security;
drop policy if exists meta_org_all on public.prospeccao_empresa_meta_org;
create policy meta_org_all on public.prospeccao_empresa_meta_org
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

comment on table public.prospeccao_empresa_meta_org is
  'Camada por-org sobre cache global de empresas. Tags, notas, "evitar prospectar", prioridade ICP.';

-- =============================================================================
-- 2. Bookmarks individuais
-- =============================================================================
create table if not exists public.prospeccao_empresa_bookmark (
  id              bigserial primary key,
  empresa_id      bigint not null references public.prospeccao_empresa(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  nota_pessoal    text,
  created_at      timestamptz not null default now(),
  unique (empresa_id, profile_id)
);

create index if not exists idx_bookmark_profile on public.prospeccao_empresa_bookmark(profile_id);
create index if not exists idx_bookmark_empresa on public.prospeccao_empresa_bookmark(empresa_id);

alter table public.prospeccao_empresa_bookmark enable row level security;
drop policy if exists bookmark_all on public.prospeccao_empresa_bookmark;
create policy bookmark_all on public.prospeccao_empresa_bookmark
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

comment on table public.prospeccao_empresa_bookmark is
  'Favoritos pessoais por vendedor. Aparece em /vendas/prospeccao/favoritos.';

-- =============================================================================
-- 3. View enriquecida: empresa + meta da org + bookmark do user + lead vinculado
-- =============================================================================
create or replace view public.v_prospeccao_empresa_completa as
select
  e.*,
  -- CNPJ formatado
  substr(e.cnpj, 1, 2) || '.' || substr(e.cnpj, 3, 3) || '.' || substr(e.cnpj, 6, 3)
    || '/' || substr(e.cnpj, 9, 4) || '-' || substr(e.cnpj, 13, 2) as cnpj_formatado,
  -- Total sócios
  (select count(*) from public.prospeccao_socio s where s.empresa_id = e.id)::int as total_socios,
  -- Sócios (JSONB)
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'nome', s.nome, 'qualificacao', s.qualificacao,
      'linkedin_url', s.linkedin_url, 'cargo_atual', s.cargo_atual,
      'email', s.email, 'data_entrada', s.data_entrada
    ) order by s.id), '[]'::jsonb)
    from public.prospeccao_socio s where s.empresa_id = e.id
  ) as socios,
  -- Anos de operação
  case
    when e.data_inicio_atividade is not null
    then extract(year from age(current_date, e.data_inicio_atividade))::int
    else null
  end as anos_operacao,
  -- Alertas não vistos
  (
    select count(*) from public.prospeccao_alerta_mudanca a
    where a.empresa_id = e.id and a.visto = false
  )::int as alertas_pendentes
from public.prospeccao_empresa e;

grant select on public.v_prospeccao_empresa_completa to authenticated;

-- =============================================================================
-- 4. Cruzamento empresa ↔ leads da org
-- Retorna se um CNPJ já está virou lead na org (busca em leads.observacoes
-- e em leads.origem_prospeccao->>cnpj)
-- =============================================================================
create or replace function public.prospeccao_empresa_leads_da_org(_empresa_id bigint, _org_id uuid)
returns table (
  lead_id bigint,
  lead_empresa text,
  crm_stage text,
  funnel_stage text,
  responsavel_id uuid,
  responsavel_nome text,
  data_fechamento date
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.empresa, l.crm_stage, l.funnel_stage,
         l.responsavel_id, p.display_name, l.data_fechamento
  from public.leads l
  left join public.profiles p on p.id = l.responsavel_id
  join public.prospeccao_empresa e on e.id = _empresa_id
  where l.organizacao_id = _org_id
    and (
      l.origem_prospeccao->>'cnpj' = e.cnpj
      or l.observacoes ilike '%' || e.cnpj || '%'
      or (l.origem_prospeccao->>'prospeccao_empresa_id')::bigint = _empresa_id
    )
  order by l.created_at desc
  limit 5;
$$;

grant execute on function public.prospeccao_empresa_leads_da_org(bigint, uuid) to authenticated;

-- =============================================================================
-- 5. Empresas semelhantes (mesmo CNAE+porte+UF, exclui evitadas pela org)
-- =============================================================================
create or replace function public.prospeccao_empresas_semelhantes(
  _empresa_id bigint,
  _org_id uuid,
  _limit int default 10
)
returns table (
  id bigint,
  cnpj text,
  razao_social text,
  nome_fantasia text,
  porte text,
  capital_social numeric,
  cidade text,
  uf text,
  cnae_normalizado text,
  ja_e_lead boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cnae text;
  v_porte text;
  v_uf text;
begin
  select cnae_normalizado, porte, uf into v_cnae, v_porte, v_uf
  from public.prospeccao_empresa where id = _empresa_id;
  if v_cnae is null then return; end if;

  return query
  select
    e.id, e.cnpj, e.razao_social, e.nome_fantasia, e.porte,
    e.capital_social, e.cidade, e.uf, e.cnae_normalizado,
    exists(
      select 1 from public.leads l
      where l.organizacao_id = _org_id
        and (l.origem_prospeccao->>'cnpj' = e.cnpj or l.observacoes ilike '%' || e.cnpj || '%')
    ) as ja_e_lead
  from public.prospeccao_empresa e
  left join public.prospeccao_empresa_meta_org m
    on m.empresa_id = e.id and m.organizacao_id = _org_id
  where e.id <> _empresa_id
    and e.cnae_normalizado = v_cnae
    and e.situacao = 'ATIVA'
    and (v_porte is null or e.porte = v_porte)
    -- Mesmo estado primeiro; UF diferente é fallback
    and (v_uf is null or e.uf = v_uf or e.uf is null)
    -- Exclui evitadas pela org (já é cliente / concorrente / etc)
    and (m.evitar is null or m.evitar = false)
  order by
    case when e.uf = v_uf then 0 else 1 end,  -- mesmo UF primeiro
    e.capital_social desc nulls last
  limit _limit;
end;
$$;

grant execute on function public.prospeccao_empresas_semelhantes(bigint, uuid, int) to authenticated;

comment on function public.prospeccao_empresas_semelhantes is
  'Look-alike: empresas com mesmo CNAE+porte (+UF se possível), excluindo as "evitadas" pela org. Marca já_e_lead se virou lead da org.';

-- =============================================================================
-- 6. Triggers de webhook
-- =============================================================================

-- Helper: dispara webhook event pra TODOS os webhooks da org que assinam o evento
-- (similar ao trg_webhook_recompensa_paga mas genérico).
create or replace function public._enfileirar_webhook_prospeccao(
  _event_type text,
  _org_id uuid,
  _payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hook record;
begin
  for v_hook in
    select id from public.webhooks
    where organizacao_id = _org_id
      and active = true
      and _event_type = any(events)
  loop
    insert into public.webhook_events (
      webhook_id, organizacao_id, event_type, payload, status, next_attempt_at
    ) values (
      v_hook.id, _org_id, _event_type, _payload, 'pending', now()
    );
  end loop;
end;
$$;

-- 6a) prospeccao.empresa_enriquecida — dispara em INSERT na prospeccao_empresa
-- mas SÓ pra orgs que tem leads ligados (evita spam — cache é global, webhooks são por org)
create or replace function public.trg_webhook_empresa_enriquecida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_org_id uuid;
begin
  v_payload := jsonb_build_object(
    'empresa_id', NEW.id,
    'cnpj', NEW.cnpj,
    'razao_social', NEW.razao_social,
    'nome_fantasia', NEW.nome_fantasia,
    'cnae', NEW.cnae_normalizado,
    'porte', NEW.porte,
    'situacao', NEW.situacao,
    'enriquecido_em', NEW.updated_at
  );

  -- Acha orgs com leads ligados a essa empresa (via origem_prospeccao.cnpj
  -- OU via meta_org table)
  for v_org_id in
    select distinct organizacao_id from public.leads
    where origem_prospeccao->>'cnpj' = NEW.cnpj
       or observacoes ilike '%' || NEW.cnpj || '%'
    union
    select distinct organizacao_id from public.prospeccao_empresa_meta_org
    where empresa_id = NEW.id
  loop
    perform public._enfileirar_webhook_prospeccao('prospeccao.empresa_enriquecida', v_org_id, v_payload);
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_webhook_empresa_enriquecida on public.prospeccao_empresa;
create trigger trg_webhook_empresa_enriquecida
  after insert or update on public.prospeccao_empresa
  for each row execute function public.trg_webhook_empresa_enriquecida();

-- 6b) prospeccao.empresa_situacao_mudou — quando alerta tipo situacao_mudou cria
create or replace function public.trg_webhook_situacao_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa record;
  v_org_id uuid;
  v_payload jsonb;
begin
  if NEW.tipo <> 'situacao_mudou' then return NEW; end if;

  select * into v_empresa from public.prospeccao_empresa where id = NEW.empresa_id;
  if v_empresa is null then return NEW; end if;

  v_payload := jsonb_build_object(
    'empresa_id', v_empresa.id,
    'cnpj', v_empresa.cnpj,
    'razao_social', v_empresa.razao_social,
    'situacao_anterior', NEW.payload->>'situacao_anterior',
    'situacao_atual', NEW.payload->>'situacao_atual',
    'detectado_em', NEW.created_at
  );

  for v_org_id in
    select distinct organizacao_id from public.leads
    where origem_prospeccao->>'cnpj' = v_empresa.cnpj
       or observacoes ilike '%' || v_empresa.cnpj || '%'
  loop
    perform public._enfileirar_webhook_prospeccao('prospeccao.empresa_situacao_mudou', v_org_id, v_payload);
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_webhook_situacao_mudou on public.prospeccao_alerta_mudanca;
create trigger trg_webhook_situacao_mudou
  after insert on public.prospeccao_alerta_mudanca
  for each row execute function public.trg_webhook_situacao_mudou();

-- 6c) prospeccao.bulk_concluido — quando bulk job conclui
create or replace function public.trg_webhook_bulk_concluido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  -- Só dispara em transição pra "concluido"
  if NEW.status <> 'concluido' or OLD.status = 'concluido' then return NEW; end if;

  v_payload := jsonb_build_object(
    'job_id', NEW.id,
    'total', NEW.total,
    'enriquecidos', NEW.enriquecidos,
    'duplicados', NEW.duplicados,
    'erros', NEW.erros,
    'criado_em', NEW.created_at,
    'concluido_em', NEW.finished_at
  );

  perform public._enfileirar_webhook_prospeccao('prospeccao.bulk_concluido', NEW.organizacao_id, v_payload);
  return NEW;
end;
$$;

drop trigger if exists trg_webhook_bulk_concluido on public.prospeccao_bulk_jobs;
create trigger trg_webhook_bulk_concluido
  after update of status on public.prospeccao_bulk_jobs
  for each row execute function public.trg_webhook_bulk_concluido();
