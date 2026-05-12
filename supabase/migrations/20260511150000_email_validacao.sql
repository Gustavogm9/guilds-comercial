-- =============================================================================
-- Email validation: cache compartilhado de validações
--
-- Antes de mandar email via Brevo, valida:
--   1. Syntax — regex local
--   2. MX record do domínio — DNS lookup (Node dns/promises)
--   3. Cache de bounce histórico — se Brevo retornou bounce permanente,
--      bloqueia futuras tentativas pro mesmo email
--
-- Cache global (não por org) — email "ana@empresa.com" tem o mesmo status
-- pra qualquer org. Reduz chamadas DNS redundantes.
--
-- Status:
--   - valid           → syntax + MX ok, sem bounce conhecido
--   - invalid_syntax  → regex falhou
--   - no_mx           → domínio não tem MX record (provavelmente fake)
--   - bounce_temp     → bounce temporário (4xx) — retry depois
--   - bounce_perm     → bounce permanente (5xx) — bloqueia
--   - role_based      → email genérico (contato@, info@) — alerta mas envia
--   - role_disposable → tempmail/yopmail/etc — bloqueia
-- =============================================================================

create table if not exists public.email_validacao (
  email           text primary key check (length(email) <= 320),
  status          text not null check (status in (
    'valid', 'invalid_syntax', 'no_mx',
    'bounce_temp', 'bounce_perm',
    'role_based', 'role_disposable'
  )),
  motivo          text,
  ultimo_check    timestamptz not null default now(),
  check_count     int not null default 1,
  -- Bounce tracking
  bounces_total   int not null default 0,
  ultimo_bounce_em timestamptz,
  ultimo_bounce_msg text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_email_validacao_status on public.email_validacao(status);
create index if not exists idx_email_validacao_check on public.email_validacao(ultimo_check desc);

alter table public.email_validacao enable row level security;
-- Cache global — qualquer authenticated lê/escreve (sem PII além do próprio email)
drop policy if exists email_validacao_all on public.email_validacao;
create policy email_validacao_all on public.email_validacao
  for all to authenticated using (true) with check (true);

comment on table public.email_validacao is
  'Cache global de status de email. Reduz DNS lookups + bloqueia envios pra emails com bounce permanente histórico.';

-- =============================================================================
-- RPC pra registrar bounce do Brevo webhook
-- =============================================================================
create or replace function public.registrar_bounce_email(
  _email text,
  _permanente boolean,
  _motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_validacao (email, status, motivo, bounces_total, ultimo_bounce_em, ultimo_bounce_msg)
  values (
    lower(trim(_email)),
    case when _permanente then 'bounce_perm' else 'bounce_temp' end,
    _motivo,
    1, now(), _motivo
  )
  on conflict (email) do update set
    status = case
      when _permanente then 'bounce_perm'
      when public.email_validacao.status = 'bounce_perm' then 'bounce_perm'  -- mantém perm
      else 'bounce_temp'
    end,
    bounces_total = public.email_validacao.bounces_total + 1,
    ultimo_bounce_em = now(),
    ultimo_bounce_msg = _motivo,
    motivo = coalesce(_motivo, public.email_validacao.motivo);
end;
$$;

grant execute on function public.registrar_bounce_email(text, boolean, text) to authenticated, anon;

-- =============================================================================
-- Domínios disposable conhecidos (semeia lista mínima — pode expandir)
-- =============================================================================
create table if not exists public.email_dominio_disposable (
  dominio text primary key,
  fonte text default 'manual',
  created_at timestamptz not null default now()
);

insert into public.email_dominio_disposable (dominio) values
  ('mailinator.com'), ('10minutemail.com'), ('tempmail.com'), ('yopmail.com'),
  ('throwaway.email'), ('guerrillamail.com'), ('trashmail.com'), ('temp-mail.org'),
  ('getnada.com'), ('sharklasers.com'), ('dispostable.com'), ('maildrop.cc')
on conflict (dominio) do nothing;

alter table public.email_dominio_disposable enable row level security;
drop policy if exists email_disposable_read on public.email_dominio_disposable;
create policy email_disposable_read on public.email_dominio_disposable
  for select to authenticated using (true);
