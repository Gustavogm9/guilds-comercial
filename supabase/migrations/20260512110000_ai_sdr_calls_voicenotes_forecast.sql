-- =============================================================================
-- IA: AI SDR copilot + análise de chamadas + voice notes + forecast
--
-- 4 tabelas + colunas pra suportar:
--   1. lead_ai_mensagem: rascunhos de email/whatsapp gerados por IA
--   2. ligacao_transcricao: transcrição + análise IA (Whisper + GPT)
--   3. lead_voice_nota: gravações curtas do vendedor → resumo IA
--   4. forecast_ai_snapshot: snapshots periódicos do forecast com previsão IA
-- =============================================================================

-- 1. AI SDR: rascunhos de mensagem
create table if not exists public.lead_ai_mensagem (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  criado_por      uuid references public.profiles(id) on delete set null,
  canal           text not null check (canal in ('email', 'whatsapp', 'linkedin')),
  objetivo        text not null check (objetivo in (
    'abertura', 'follow_up_apos_silencio', 'reengajar_detrator',
    'pedido_indicacao', 'reativacao_perdido', 'expansao'
  )),
  assunto         text,
  corpo           text not null,
  contexto_usado  jsonb default '{}'::jsonb,
  modelo_ia       text,
  custo_tokens    int default 0,
  copiado         boolean not null default false,
  enviado         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_msg_lead on public.lead_ai_mensagem(lead_id, created_at desc);
alter table public.lead_ai_mensagem enable row level security;
drop policy if exists ai_msg_all on public.lead_ai_mensagem;
create policy ai_msg_all on public.lead_ai_mensagem
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

comment on table public.lead_ai_mensagem is
  'Rascunhos de mensagem gerados por IA (AI SDR copilot). Vendedor edita e envia.';

-- 2. Transcrição + análise de chamadas
create table if not exists public.ligacao_transcricao (
  id              bigserial primary key,
  ligacao_id      bigint not null references public.ligacoes(id) on delete cascade,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  audio_url       text,
  duracao_seg     int,
  transcricao     text,
  -- Análise IA (Gong-like)
  resumo          text,
  pontos_chave    jsonb default '[]'::jsonb,   -- ["objeção preço", "interessado em demo", "decisor não está"]
  objecoes        text[] default '{}',
  proximas_acoes  text[] default '{}',
  sentimento      text check (sentimento is null or sentimento in ('positivo', 'neutro', 'negativo')),
  nivel_interesse text check (nivel_interesse is null or nivel_interesse in ('quente', 'morno', 'frio')),
  status          text not null default 'pendente' check (status in ('pendente', 'transcrevendo', 'analisando', 'concluido', 'erro')),
  erro_mensagem   text,
  custo_usd       numeric(8,4) default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_transcricao_lig on public.ligacao_transcricao(ligacao_id);
create index if not exists idx_transcricao_pending on public.ligacao_transcricao(status, created_at) where status in ('pendente', 'transcrevendo', 'analisando');

drop trigger if exists trg_transcricao_updated on public.ligacao_transcricao;
create trigger trg_transcricao_updated
  before update on public.ligacao_transcricao
  for each row execute function public.set_updated_at();

alter table public.ligacao_transcricao enable row level security;
drop policy if exists transcricao_all on public.ligacao_transcricao;
create policy transcricao_all on public.ligacao_transcricao
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

comment on table public.ligacao_transcricao is
  'Transcrição (Whisper) + análise (GPT) de gravações de chamadas. Substitui Gong.';

-- 3. Voice notes do vendedor (registro rápido por voz)
create table if not exists public.lead_voice_nota (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  lead_id         bigint not null references public.leads(id) on delete cascade,
  criado_por      uuid references public.profiles(id) on delete set null,
  audio_url       text not null,
  duracao_seg     int,
  transcricao     text,
  resumo          text,
  acoes_extraidas text[] default '{}',
  status          text not null default 'pendente' check (status in ('pendente', 'processando', 'concluido', 'erro')),
  custo_usd       numeric(8,4) default 0,
  created_at      timestamptz not null default now(),
  processado_em   timestamptz
);

create index if not exists idx_voice_lead on public.lead_voice_nota(lead_id, created_at desc);
create index if not exists idx_voice_pending on public.lead_voice_nota(status, created_at) where status in ('pendente', 'processando');

alter table public.lead_voice_nota enable row level security;
drop policy if exists voice_all on public.lead_voice_nota;
create policy voice_all on public.lead_voice_nota
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()))
  with check (organizacao_id in (select public.orgs_do_usuario()));

comment on table public.lead_voice_nota is
  'Notas de voz do vendedor. Whisper transcreve + GPT extrai ações automaticamente.';

-- 4. Forecast AI: snapshots semanais com previsão
create table if not exists public.forecast_ai_snapshot (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  semana          date not null,        -- domingo da semana
  pipeline_total  numeric(14,2) not null default 0,
  pipeline_ponderado numeric(14,2) not null default 0,
  -- Previsão IA
  forecast_baixo  numeric(14,2),        -- p25 (worst case)
  forecast_provavel numeric(14,2),      -- p50
  forecast_alto   numeric(14,2),        -- p75
  confianca       numeric(3,2),         -- 0-1
  fatores         jsonb default '{}'::jsonb,
  modelo_usado    text,
  created_at      timestamptz not null default now(),
  unique (organizacao_id, semana)
);

create index if not exists idx_forecast_ai_org on public.forecast_ai_snapshot(organizacao_id, semana desc);

alter table public.forecast_ai_snapshot enable row level security;
drop policy if exists forecast_ai_select on public.forecast_ai_snapshot;
create policy forecast_ai_select on public.forecast_ai_snapshot
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

comment on table public.forecast_ai_snapshot is
  'Snapshots semanais do forecast com previsão IA. Cron semanal calcula.';
