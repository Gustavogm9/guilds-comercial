-- =============================================================================
-- NPS automático D+7 (item 1 do polish do flywheel)
--
-- O trigger trg_iniciar_pos_venda (P2) já cria row em nps_responses com
-- solicitado_em = now() + 7 days. Esta migration:
--
-- 1. Adiciona email_enviado_em + token (público, único, pra responder sem login)
-- 2. Função enfileirar_emails_nps_pendentes() que:
--      - busca NPS com solicitado_em <= now() E email_enviado_em IS NULL
--        E score IS NULL (não respondido)
--      - gera token único (gc_nps_<48hex>)
--      - insere row em email_outbox com kind='nps_pedido_d7'
--      - marca email_enviado_em = now()
-- 3. Função pública buscar_nps_por_token: portal /nps/{token} acessa sem login
-- 4. Função pública responder_nps_via_token: cliente responde direto
-- 5. Cron diário 10:00 UTC chama enfileirar (timezone BR-friendly)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Adiciona colunas em nps_responses
-- -----------------------------------------------------------------------------
alter table public.nps_responses
  add column if not exists email_enviado_em timestamptz,
  add column if not exists token text;

create unique index if not exists uniq_nps_token on public.nps_responses(token) where token is not null;
create index if not exists idx_nps_pending_email on public.nps_responses(solicitado_em)
  where email_enviado_em is null and score is null;

comment on column public.nps_responses.email_enviado_em is
  'Quando o email com pedido foi enviado (NULL = ainda não enviou). Idempotência do cron.';
comment on column public.nps_responses.token is
  'Token público (gc_nps_<hex>) usado em /nps/{token} pro cliente responder sem login.';

-- -----------------------------------------------------------------------------
-- 2. Função: enfileirar_emails_nps_pendentes
--
-- Roda no cron. Pega NPS prontos pra enviar email (D+7 atingido), gera
-- token, insere outbox row, marca email_enviado_em.
--
-- Anti-spam:
--   - 1 email por NPS (idempotência via email_enviado_em)
--   - Janela de 14 dias: se solicitado_em > 14d e ainda não respondido,
--     pula (cliente já não vai responder, evita poluir caixa)
-- -----------------------------------------------------------------------------
create or replace function public.enfileirar_emails_nps_pendentes()
returns table (
  organizacao_id uuid,
  enfileirados int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  novo_token text;
  org_count_map jsonb := '{}'::jsonb;
begin
  for rec in
    select
      n.id as nps_id,
      n.organizacao_id,
      n.lead_id,
      l.empresa as cliente_empresa,
      l.nome as cliente_nome,
      l.email as cliente_email,
      l.responsavel_id,
      coalesce(o.idioma_padrao, 'pt-BR') as locale,
      o.nome as org_nome
    from public.nps_responses n
    join public.leads l on l.id = n.lead_id
    join public.organizacoes o on o.id = n.organizacao_id
    where n.score is null
      and n.email_enviado_em is null
      and n.solicitado_em <= now()
      and n.solicitado_em >= (now() - interval '14 days')
      and l.email is not null
      and l.email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' is not true  -- email válido
  loop
    -- Gera token único
    novo_token := 'gc_nps_' || encode(gen_random_bytes(24), 'hex');

    -- Atualiza nps_responses (token + email_enviado_em)
    update public.nps_responses
       set token = novo_token,
           email_enviado_em = now()
     where id = rec.nps_id;

    -- Insere outbox
    insert into public.email_outbox (
      organizacao_id, kind, to_email, to_name, subject, payload, locale
    )
    values (
      rec.organizacao_id,
      'nps_pedido_d7',
      rec.cliente_email,
      coalesce(rec.cliente_nome, rec.cliente_empresa),
      case when rec.locale = 'en-US'
           then 'Quick question about your experience with ' || coalesce(rec.org_nome, 'us')
           else 'Como foi sua experiência com a ' || coalesce(rec.org_nome, 'gente') || '?'
      end,
      jsonb_build_object(
        'nps_id', rec.nps_id,
        'token', novo_token,
        'lead_id', rec.lead_id,
        'cliente_empresa', rec.cliente_empresa,
        'cliente_nome', rec.cliente_nome,
        'org_nome', rec.org_nome
      ),
      case when rec.locale = 'en-US' then 'en-US' else 'pt-BR' end
    );

    -- Aglomera por org
    org_count_map := jsonb_set(
      org_count_map,
      array[rec.organizacao_id::text],
      to_jsonb(coalesce((org_count_map -> rec.organizacao_id::text)::int, 0) + 1)
    );
  end loop;

  return query
  select (k.key)::uuid, (k.value)::int
  from jsonb_each_text(org_count_map) as k;
end;
$$;

comment on function public.enfileirar_emails_nps_pendentes() is
  'Cron diário: enfileira emails de NPS prontos pra enviar (D+7 atingido). Gera token, insere email_outbox, marca email_enviado_em. Pula NPS > 14d sem resposta.';

-- -----------------------------------------------------------------------------
-- 3. Função pública: buscar_nps_por_token (portal /nps/{token})
-- -----------------------------------------------------------------------------
create or replace function public.buscar_nps_por_token(_token text)
returns table (
  nps_id bigint,
  organizacao_id uuid,
  organizacao_nome text,
  cliente_empresa text,
  cliente_nome text,
  ja_respondido boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if _token is null or length(_token) < 16 then return; end if;

  return query
  select
    n.id,
    n.organizacao_id,
    o.nome,
    l.empresa,
    l.nome,
    (n.score is not null) as ja_respondido
  from public.nps_responses n
  join public.organizacoes o on o.id = n.organizacao_id
  join public.leads l on l.id = n.lead_id
  where n.token = _token
  limit 1;
end;
$$;

revoke all on function public.buscar_nps_por_token(text) from public;
grant execute on function public.buscar_nps_por_token(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Função pública: responder_nps_via_token
--
-- Cliente preenche o portal e essa função grava. Triggers do P2
-- (trg_nps_acao_automatica) automaticamente:
--   - score >= 9 → cria pedido_indicacao tipo='pos_resultado'
--   - score <= 6 → grava lead_evento detrator_alerta
--   - 7-8 → grava lead_evento neutro
-- -----------------------------------------------------------------------------
create or replace function public.responder_nps_via_token(
  _token text,
  _score int,
  _comentario text default null
)
returns table (ok boolean, erro text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nps record;
begin
  if _token is null or length(_token) < 16 then
    return query select false, 'Token inválido.'::text; return;
  end if;
  if _score is null or _score < 0 or _score > 10 then
    return query select false, 'Score deve estar entre 0 e 10.'::text; return;
  end if;

  select id, score into v_nps
  from public.nps_responses
  where token = _token
  limit 1;

  if v_nps is null then
    return query select false, 'Token inválido ou expirado.'::text; return;
  end if;
  if v_nps.score is not null then
    return query select false, 'Você já respondeu este NPS.'::text; return;
  end if;

  update public.nps_responses
     set score = _score,
         comentario = nullif(trim(coalesce(_comentario, '')), ''),
         respondido_em = now()
   where id = v_nps.id;

  return query select true, null::text;
end;
$$;

revoke all on function public.responder_nps_via_token(text, int, text) from public;
grant execute on function public.responder_nps_via_token(text, int, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Cron diário 10:00 UTC (07:00 BRT)
-- -----------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('nps-email-d7');
exception when others then null;
end $$;

select cron.schedule(
  'nps-email-d7',
  '0 10 * * *',
  $$ select public.enfileirar_emails_nps_pendentes(); $$
);
