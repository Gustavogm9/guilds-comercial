-- =============================================================================
-- Bulk import jobs (CSV de CNPJs)
--
-- Permite gestor colar/uploadar até 500 CNPJs por vez. Worker processa em
-- background (chamado via endpoint cron) consultando BrasilAPI com rate-limit
-- (~3 req/s, respeita free tier). Cada CNPJ alimenta prospeccao_empresa.
--
-- Estados:
--   - pendente  → upload acabou de chegar, aguardando worker
--   - processando → worker pegou
--   - concluido → todos os items processados
--   - erro     → falha catastrófica
-- =============================================================================

create table if not exists public.prospeccao_bulk_jobs (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  criado_por      uuid references public.profiles(id) on delete set null,

  -- Input: lista de CNPJs/empresas a processar
  itens           jsonb not null,            -- [{cnpj?, nome?, linha_original?}]
  total           int not null,
  processados     int not null default 0,
  enriquecidos    int not null default 0,
  duplicados      int not null default 0,
  erros           int not null default 0,
  -- Detalhes por item (apêndice durante processamento)
  resultados      jsonb not null default '[]'::jsonb,

  status          text not null default 'pendente' check (status in ('pendente','processando','concluido','erro','cancelado')),
  iniciar_cadencia boolean not null default false,
  ativar_como_lead boolean not null default true,  -- se false, só enriquece sem criar lead

  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  ultimo_erro     text
);

create index if not exists idx_prospeccao_bulk_status on public.prospeccao_bulk_jobs(status, created_at)
  where status in ('pendente','processando');
create index if not exists idx_prospeccao_bulk_org on public.prospeccao_bulk_jobs(organizacao_id, created_at desc);

alter table public.prospeccao_bulk_jobs enable row level security;

drop policy if exists prospeccao_bulk_select on public.prospeccao_bulk_jobs;
create policy prospeccao_bulk_select on public.prospeccao_bulk_jobs
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));

drop policy if exists prospeccao_bulk_insert on public.prospeccao_bulk_jobs;
create policy prospeccao_bulk_insert on public.prospeccao_bulk_jobs
  for insert to authenticated
  with check (
    organizacao_id in (select public.orgs_do_usuario())
    and public.is_gestor_in_org(organizacao_id)
  );

comment on table public.prospeccao_bulk_jobs is
  'Jobs de import bulk de CNPJs. Worker via endpoint cron processa com rate-limit. Apenas gestor cria.';

-- pg_cron: a cada 2 min processa um job pendente
do $$
begin
  perform cron.unschedule('prospeccao-bulk-process');
exception when others then null;
end $$;

select cron.schedule(
  'prospeccao-bulk-process',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := coalesce(
      (select value from public.app_config where key = 'cron_bulk_prospeccao_url'),
      'https://crm.guilds.com.br/api/cron/prospeccao-bulk'
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', coalesce((select value from public.app_config where key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);
