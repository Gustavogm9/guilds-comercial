-- ============================================================
-- Sprint 9-A: Timeline 360° + WhatsApp Intelligence
-- ============================================================

-- 1. lead_timeline: hub central de histórico unificado
create table if not exists public.lead_timeline (
  id              bigserial primary key,
  organizacao_id  uuid    not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint  not null references public.leads(id) on delete cascade,
  tipo            text    not null check (tipo in (
    'nota','stage_change','proposta_gerada','proposta_status',
    'ligacao','cadencia','whatsapp_importado','whatsapp_direto',
    'grupo_whatsapp','documento','reuniao','indicacao','motor_prospeccao','sistema'
  )),
  titulo          text,
  conteudo        text,             -- corpo/detalhe da interação
  resumo_ia       text,             -- gerado por IA (lazy, pós-import)
  metadata        jsonb   not null default '{}',
  ref_id          bigint,           -- FK opcional (ligacoes.id, propostas.id, etc.)
  ref_tabela      text,             -- 'ligacoes' | 'propostas' | 'cadencia' | ...
  criado_por      uuid    references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_lt_lead on public.lead_timeline (lead_id, created_at desc);
create index if not exists idx_lt_org  on public.lead_timeline (organizacao_id, created_at desc);
create index if not exists idx_lt_tipo on public.lead_timeline (tipo, created_at desc);
alter table public.lead_timeline enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='lead_timeline' and policyname='lt_org') then
    execute 'create policy lt_org on public.lead_timeline for all to authenticated using (organizacao_id in (select public.orgs_do_usuario())) with check (organizacao_id in (select public.orgs_do_usuario()))';
  end if;
end $$;

-- 2. whatsapp_conversas: conversas importadas (.txt) ou conectadas via API
create table if not exists public.whatsapp_conversas (
  id              bigserial primary key,
  organizacao_id  uuid    not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint  references public.leads(id) on delete set null,
  contato_nome    text,
  contato_tel     text,
  arquivo_nome    text,
  total_msgs      int     not null default 0,
  primeira_msg    timestamptz,
  ultima_msg      timestamptz,
  resumo_ia       text,             -- resumo IA em bullet points
  sentimento      text    check (sentimento in ('positivo','neutro','negativo')),
  pontos_chave    jsonb   not null default '[]',  -- ["interesse em X", "objeção Y"]
  nivel_interesse int     check (nivel_interesse between 1 and 10),
  canal           text    not null default 'importado',  -- 'importado' | 'zapi' | 'evolution'
  created_at      timestamptz not null default now()
);
create index if not exists idx_wc_lead on public.whatsapp_conversas (lead_id, created_at desc);
alter table public.whatsapp_conversas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='whatsapp_conversas' and policyname='wc_org') then
    execute 'create policy wc_org on public.whatsapp_conversas for all to authenticated using (organizacao_id in (select public.orgs_do_usuario())) with check (organizacao_id in (select public.orgs_do_usuario()))';
  end if;
end $$;

-- 3. whatsapp_mensagens: mensagens individuais (para busca e análise IA)
create table if not exists public.whatsapp_mensagens (
  id              bigserial primary key,
  conversa_id     bigint  not null references public.whatsapp_conversas(id) on delete cascade,
  organizacao_id  uuid    not null,
  lead_id         bigint,
  remetente       text    not null,
  eh_vendedor     boolean not null default false,
  conteudo        text,
  tipo_midia      text    check (tipo_midia in ('imagem','audio','video','documento','figurinha')),
  enviada_em      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_wm_conversa on public.whatsapp_mensagens (conversa_id, enviada_em);
alter table public.whatsapp_mensagens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='whatsapp_mensagens' and policyname='wm_org') then
    execute 'create policy wm_org on public.whatsapp_mensagens for all to authenticated using (organizacao_id in (select public.orgs_do_usuario())) with check (organizacao_id in (select public.orgs_do_usuario()))';
  end if;
end $$;

-- 4. whatsapp_grupos: grupos associados ao lead com controle de status
create table if not exists public.whatsapp_grupos (
  id              bigserial primary key,
  organizacao_id  uuid    not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint  references public.leads(id) on delete set null,
  nome            text    not null,
  link_convite    text,
  status          text    not null default 'ativo'
                  check (status in ('ativo','silenciado','saiu','arquivado')),
  membro_desde    date,
  membros_count   int,
  descricao       text,
  observacoes     text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_wg_lead on public.whatsapp_grupos (lead_id);
alter table public.whatsapp_grupos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='whatsapp_grupos' and policyname='wg_org') then
    execute 'create policy wg_org on public.whatsapp_grupos for all to authenticated using (organizacao_id in (select public.orgs_do_usuario())) with check (organizacao_id in (select public.orgs_do_usuario()))';
  end if;
end $$;

-- 5. Triggers automáticos

create or replace function public.on_ligacao_timeline()
returns trigger language plpgsql security definer as $$
begin
  insert into public.lead_timeline
    (organizacao_id, lead_id, tipo, titulo, conteudo, metadata, ref_id, ref_tabela, criado_por)
  values (
    new.organizacao_id, new.lead_id, 'ligacao',
    coalesce(new.resultado, 'Ligação registrada'), new.observacoes,
    jsonb_build_object('tom', new.tom_interacao, 'canal', new.canal, 'duracao', new.duracao_segundos),
    new.id, 'ligacoes', new.responsavel_id
  );
  return new;
end;
$$;
drop trigger if exists tg_ligacao_timeline on public.ligacoes;
create trigger tg_ligacao_timeline after insert on public.ligacoes
  for each row execute function public.on_ligacao_timeline();

create or replace function public.on_lead_stage_timeline()
returns trigger language plpgsql security definer as $$
begin
  if old.crm_stage is not distinct from new.crm_stage then return new; end if;
  insert into public.lead_timeline (organizacao_id, lead_id, tipo, titulo, metadata)
  values (
    new.organizacao_id, new.id, 'stage_change',
    format('%s → %s', coalesce(old.crm_stage,'Base'), coalesce(new.crm_stage,'Base')),
    jsonb_build_object('de', old.crm_stage, 'para', new.crm_stage)
  );
  return new;
end;
$$;
drop trigger if exists tg_lead_stage_timeline on public.leads;
create trigger tg_lead_stage_timeline after update of crm_stage on public.leads
  for each row execute function public.on_lead_stage_timeline();

create or replace function public.on_proposta_insert_timeline()
returns trigger language plpgsql security definer as $$
begin
  insert into public.lead_timeline
    (organizacao_id, lead_id, tipo, titulo, metadata, ref_id, ref_tabela, criado_por)
  values (
    new.organizacao_id, new.lead_id, 'proposta_gerada',
    format('Proposta gerada (%s)', coalesce(new.variacao,'padrão')),
    jsonb_build_object('variacao', new.variacao, 'valor', new.valor_total, 'status', new.status),
    new.id, 'propostas', new.criado_por
  );
  return new;
end;
$$;
drop trigger if exists tg_proposta_insert_timeline on public.propostas;
create trigger tg_proposta_insert_timeline after insert on public.propostas
  for each row execute function public.on_proposta_insert_timeline();

create or replace function public.on_proposta_status_timeline()
returns trigger language plpgsql security definer as $$
begin
  if old.status is not distinct from new.status then return new; end if;
  insert into public.lead_timeline (organizacao_id, lead_id, tipo, titulo, metadata, ref_id, ref_tabela)
  values (
    new.organizacao_id, new.lead_id, 'proposta_status',
    format('Proposta %s', new.status),
    jsonb_build_object('status_anterior', old.status, 'status_novo', new.status, 'valor', new.valor_total),
    new.id, 'propostas'
  );
  return new;
end;
$$;
drop trigger if exists tg_proposta_status_timeline on public.propostas;
create trigger tg_proposta_status_timeline after update of status on public.propostas
  for each row execute function public.on_proposta_status_timeline();

create or replace function public.on_cadencia_timeline()
returns trigger language plpgsql security definer as $$
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status not in ('feito','ignorado') then return new; end if;
  insert into public.lead_timeline (organizacao_id, lead_id, tipo, titulo, metadata, ref_id, ref_tabela)
  values (
    new.organizacao_id, new.lead_id, 'cadencia',
    format('Cadência %s — %s (%s)', new.passo, coalesce(new.canal,''), new.status),
    jsonb_build_object('passo', new.passo, 'canal', new.canal, 'objetivo', new.objetivo, 'status', new.status),
    new.id, 'cadencia'
  );
  return new;
end;
$$;
drop trigger if exists tg_cadencia_timeline on public.cadencia;
create trigger tg_cadencia_timeline after update of status on public.cadencia
  for each row execute function public.on_cadencia_timeline();

-- Migração de lead_evento → lead_timeline
insert into public.lead_timeline (organizacao_id, lead_id, tipo, titulo, metadata, created_at)
select le.organizacao_id, le.lead_id,
  case le.tipo when 'etapa_alterada' then 'stage_change' when 'ligacao_registrada' then 'ligacao' when 'cadencia_executada' then 'cadencia' else 'sistema' end,
  case le.tipo when 'etapa_alterada' then format('%s → %s', (le.payload->>'de'), (le.payload->>'para')) else le.tipo end,
  coalesce(le.payload, '{}'), le.created_at
from public.lead_evento le
where not exists (
  select 1 from public.lead_timeline lt
  where lt.lead_id = le.lead_id and lt.created_at = le.created_at and lt.organizacao_id = le.organizacao_id
);
