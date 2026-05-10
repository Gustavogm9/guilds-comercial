-- =============================================================================
-- Email outbox + cron processor
--
-- Infra genérica de envio de emails transacionais. Triggers SQL inserem
-- rows na outbox; cron pg_cron chama endpoint Next.js /api/cron/email-outbox
-- a cada 5 min que processa pendentes via Brevo.
--
-- Usado por:
--   - Item 3: indicação chega via portal → notificar vendedor responsável
--   - Item 1: NPS solicitado (D+7) → email pro cliente
--   - Futuro: qualquer trigger que precise notificar via email
--
-- Tabela:
--   email_outbox — fila de emails a enviar
--
-- Triggers:
--   trg_indicacao_portal_email — insere outbox quando indicacao.origem=
--   'embaixador_portal' e há vendedor responsável pelo embaixador
-- =============================================================================

create table if not exists public.email_outbox (
  id              bigserial primary key,
  organizacao_id  uuid references public.organizacoes(id) on delete cascade,
  kind            text not null check (length(kind) <= 64),
  to_email        text not null check (to_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  to_name         text,
  subject         text not null check (length(subject) > 0 and length(subject) <= 200),
  -- Payload livre — endpoint cron escolhe template baseado em kind
  payload         jsonb not null default '{}'::jsonb,
  -- Estado
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'abandoned')),
  attempts        int not null default 0,
  last_error      text,
  -- Auditoria
  created_at      timestamptz not null default now(),
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  -- Locale pra escolher template traduzido
  locale          text not null default 'pt-BR' check (locale in ('pt-BR', 'en-US'))
);

create index idx_email_outbox_pending on public.email_outbox(scheduled_for)
  where status = 'pending';
create index idx_email_outbox_org on public.email_outbox(organizacao_id);

comment on table public.email_outbox is
  'Fila de emails transacionais a enviar. Cron /api/cron/email-outbox processa pendentes a cada 5 min via Brevo.';

-- RLS — só service role lê/escreve. Endpoint cron usa service client.
alter table public.email_outbox enable row level security;
-- (Sem policies = só service role acessa)

-- -----------------------------------------------------------------------------
-- Trigger: indicação criada via portal → enfileira email pro vendedor
-- -----------------------------------------------------------------------------
create or replace function public.trg_email_indicacao_portal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_responsavel_email text;
  v_responsavel_nome  text;
  v_embaixador_empresa text;
  v_embaixador_nome    text;
  v_org_locale text;
  v_org_nome   text;
begin
  -- Só age em indicações vindas do portal embaixador
  if NEW.origem <> 'embaixador_portal' then return NEW; end if;

  -- Busca dados pra montar email
  select p.email, p.display_name, l.empresa, l.nome
    into v_responsavel_email, v_responsavel_nome, v_embaixador_empresa, v_embaixador_nome
  from public.leads l
  left join public.profiles p on p.id = l.responsavel_id
  where l.id = NEW.embaixador_lead_id;

  -- Sem responsável ou sem email → não envia (vendedor verá em /indicacoes mesmo assim)
  if v_responsavel_email is null then return NEW; end if;

  select coalesce(idioma_padrao, 'pt-BR'), nome
    into v_org_locale, v_org_nome
  from public.organizacoes
  where id = NEW.organizacao_id;

  v_org_locale := coalesce(v_org_locale, 'pt-BR');
  if v_org_locale not in ('pt-BR', 'en-US') then v_org_locale := 'pt-BR'; end if;

  insert into public.email_outbox (
    organizacao_id, kind, to_email, to_name, subject, payload, locale
  ) values (
    NEW.organizacao_id,
    'indicacao_portal_recebida',
    v_responsavel_email,
    v_responsavel_nome,
    case
      when v_org_locale = 'en-US' then 'Nova indicação recebida via portal'  -- override abaixo se en-US
      else 'Nova indicação recebida via portal'
    end,
    jsonb_build_object(
      'indicacao_id', NEW.id,
      'embaixador_lead_id', NEW.embaixador_lead_id,
      'embaixador_empresa', v_embaixador_empresa,
      'embaixador_nome', v_embaixador_nome,
      'indicado_nome', NEW.indicado_nome,
      'indicado_empresa', NEW.indicado_empresa,
      'indicado_cargo', NEW.indicado_cargo,
      'indicado_email', NEW.indicado_email,
      'indicado_whatsapp', NEW.indicado_whatsapp,
      'contexto', NEW.contexto,
      'org_nome', v_org_nome,
      'responsavel_nome', v_responsavel_nome
    ),
    v_org_locale
  );

  return NEW;
end;
$$;

drop trigger if exists trg_indicacao_portal_email on public.indicacoes;
create trigger trg_indicacao_portal_email
  after insert on public.indicacoes
  for each row execute function public.trg_email_indicacao_portal();

-- -----------------------------------------------------------------------------
-- pg_cron: chama o endpoint a cada 5 min
--
-- pg_net chama o endpoint via HTTP POST. URL depende do APP_URL configurado.
-- A função .http_post é assíncrona — não bloqueia o cron.
--
-- Idempotência: se já existe job, dropa e recria.
-- -----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('email-outbox-process');
exception when others then null;
end $$;

-- O endpoint escolhe APP_URL e CRON_SECRET de env vars no Next.js
-- (não vamos hardcode aqui). pg_net.http_post é a forma de chamar HTTP do banco.
-- Aviso: em alguns setups Supabase é necessário SET search_path explicito.
select cron.schedule(
  'email-outbox-process',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := coalesce(
      current_setting('app.cron_email_url', true),
      'https://crm.guilds.com.br/api/cron/email-outbox'
    ),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', coalesce(current_setting('app.cron_secret', true), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
