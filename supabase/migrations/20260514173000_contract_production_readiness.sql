-- Production readiness for contract operations: documents, Clicksign, SLA, metrics and renewal handoff.

alter table public.contratos
  add column if not exists documento_nome text,
  add column if not exists documento_mime text,
  add column if not exists documento_url text,
  add column if not exists documento_docx_url text,
  add column if not exists documento_pdf_url text,
  add column if not exists documento_html text,
  add column if not exists documento_preparado_at timestamptz,
  add column if not exists clicksign_envelope_id text,
  add column if not exists clicksign_document_id text,
  add column if not exists clicksign_signer_id text,
  add column if not exists clicksign_sign_url text,
  add column if not exists clicksign_status text,
  add column if not exists clicksign_payload jsonb not null default '{}'::jsonb,
  add column if not exists signatario_nome text,
  add column if not exists signatario_email text,
  add column if not exists signatario_telefone text,
  add column if not exists signatario_documento text,
  add column if not exists sla_revisao_due_at timestamptz,
  add column if not exists revisao_started_at timestamptz,
  add column if not exists revisao_completed_at timestamptz,
  add column if not exists assinatura_requested_at timestamptz,
  add column if not exists assinatura_completed_at timestamptz,
  add column if not exists juridico_responsavel_id uuid references public.profiles(id) on delete set null,
  add column if not exists vigencia_inicio date,
  add column if not exists vigencia_fim date,
  add column if not exists renovacao_configurada boolean not null default false;

alter table public.contrato_feedback
  add column if not exists campo text,
  add column if not exists anchor_text text,
  add column if not exists posicao jsonb not null default '{}'::jsonb;

create index if not exists idx_contratos_clicksign_envelope
  on public.contratos (clicksign_envelope_id)
  where clicksign_envelope_id is not null;

create index if not exists idx_contratos_status_sla
  on public.contratos (organizacao_id, status, sla_revisao_due_at);

create table if not exists public.contrato_clicksign_eventos (
  id bigserial primary key,
  organizacao_id uuid references public.organizacoes(id) on delete cascade,
  contrato_id bigint references public.contratos(id) on delete set null,
  envelope_id text,
  document_id text,
  event_name text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists idx_contrato_clicksign_eventos_org_date
  on public.contrato_clicksign_eventos (organizacao_id, received_at desc);

create index if not exists idx_contrato_clicksign_eventos_envelope
  on public.contrato_clicksign_eventos (envelope_id, received_at desc);

alter table public.contrato_clicksign_eventos enable row level security;

drop policy if exists contrato_clicksign_eventos_org on public.contrato_clicksign_eventos;
create policy contrato_clicksign_eventos_org on public.contrato_clicksign_eventos
  for select using (organizacao_id in (select public.orgs_do_usuario()));

create or replace view public.v_contratos_operacao as
select
  c.organizacao_id,
  count(*)::int as total,
  count(*) filter (where c.status = 'rascunho')::int as rascunho,
  count(*) filter (where c.status = 'em_revisao')::int as em_revisao,
  count(*) filter (where c.status = 'aguardando_assinatura')::int as aguardando_assinatura,
  count(*) filter (where c.status = 'assinado')::int as assinados,
  count(*) filter (where c.status = 'cancelado')::int as cancelados,
  count(*) filter (where c.status in ('rascunho','em_revisao') and c.sla_revisao_due_at < now())::int as revisao_atrasada,
  count(*) filter (where c.clicksign_envelope_id is not null)::int as enviados_clicksign,
  round(avg(extract(epoch from (coalesce(c.revisao_completed_at, c.assinatura_requested_at, c.updated_at) - c.revisao_started_at)) / 3600)
    filter (where c.revisao_started_at is not null), 1) as horas_media_revisao,
  round(avg(extract(epoch from (c.assinatura_completed_at - c.assinatura_requested_at)) / 3600)
    filter (where c.assinatura_completed_at is not null and c.assinatura_requested_at is not null), 1) as horas_media_assinatura
from public.contratos c
group by c.organizacao_id;

create or replace function public.trg_contrato_status_operacao()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'em_revisao' and old.status is distinct from new.status then
    new.revisao_started_at = coalesce(new.revisao_started_at, now());
    new.sla_revisao_due_at = coalesce(new.sla_revisao_due_at, now() + interval '2 days');
  end if;

  if new.status = 'aguardando_assinatura' and old.status is distinct from new.status then
    new.revisao_completed_at = coalesce(new.revisao_completed_at, now());
    new.assinatura_requested_at = coalesce(new.assinatura_requested_at, now());
    new.data_envio = coalesce(new.data_envio, current_date);
  end if;

  if new.status = 'assinado' and old.status is distinct from new.status then
    new.assinatura_completed_at = coalesce(new.assinatura_completed_at, now());
    new.data_assinatura = coalesce(new.data_assinatura, current_date);
  end if;

  return new;
end;
$$;

drop trigger if exists tg_contrato_status_operacao on public.contratos;
create trigger tg_contrato_status_operacao
before update of status on public.contratos
for each row execute function public.trg_contrato_status_operacao();
