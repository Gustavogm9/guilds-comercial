-- =============================================================================
-- Landing pages por campanha
--
-- Gestor cria LP simples (título, sub, form de captura) com slug único.
-- URL pública: /lp/{slug}
-- Formulários submetidos viram leads automaticamente na base bruta com origem
-- rastreada (lp_submission).
-- =============================================================================

create table if not exists public.landing_page (
  id              bigserial primary key,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  slug            text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  titulo          text not null check (length(trim(titulo)) > 0 and length(titulo) <= 120),
  subtitulo       text,
  -- Conteúdo configurável (sections JSONB)
  conteudo        jsonb not null default '{}'::jsonb,
  -- Form fields a coletar
  campos          jsonb not null default '["nome","email","whatsapp"]'::jsonb,
  -- CTA
  cta_texto       text not null default 'Enviar',
  agradecimento_titulo text default 'Recebido!',
  agradecimento_texto text default 'Em breve entraremos em contato.',
  -- Branding
  logo_url        text,
  cor_primaria    text check (cor_primaria is null or cor_primaria ~* '^#[0-9a-f]{6}$'),
  -- Captura: como o lead entra
  fluxo_cadencia_id bigint references public.cadencia_fluxo(id) on delete set null,
  segmento_default text,
  tag_default     text,
  responsavel_id  uuid references public.profiles(id) on delete set null,
  -- Estado
  ativa           boolean not null default true,
  -- Stats
  views           int not null default 0,
  submissions     int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organizacao_id, slug)
);

-- Slug é unique global (URL pública)
create unique index if not exists uniq_lp_slug_ativo on public.landing_page(slug) where ativa = true;

drop trigger if exists trg_lp_updated on public.landing_page;
create trigger trg_lp_updated
  before update on public.landing_page
  for each row execute function public.set_updated_at();

alter table public.landing_page enable row level security;
drop policy if exists lp_select on public.landing_page;
create policy lp_select on public.landing_page
  for select to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()));
drop policy if exists lp_write on public.landing_page;
create policy lp_write on public.landing_page
  for all to authenticated
  using (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id))
  with check (organizacao_id in (select public.orgs_do_usuario()) and public.is_gestor_in_org(organizacao_id));

-- =============================================================================
-- Função pública: buscar LP pelo slug (acesso anônimo)
-- =============================================================================
create or replace function public.buscar_lp_publica(_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lp record;
begin
  if _slug is null or length(_slug) < 3 then return null; end if;
  select * into v_lp from public.landing_page where slug = _slug and ativa = true;
  if v_lp is null then return null; end if;

  -- Incrementa view count (assíncrono, best-effort)
  update public.landing_page set views = views + 1 where id = v_lp.id;

  return jsonb_build_object(
    'id', v_lp.id,
    'titulo', v_lp.titulo,
    'subtitulo', v_lp.subtitulo,
    'conteudo', v_lp.conteudo,
    'campos', v_lp.campos,
    'cta_texto', v_lp.cta_texto,
    'agradecimento_titulo', v_lp.agradecimento_titulo,
    'agradecimento_texto', v_lp.agradecimento_texto,
    'logo_url', v_lp.logo_url,
    'cor_primaria', v_lp.cor_primaria,
    'organizacao_id', v_lp.organizacao_id
  );
end;
$$;

revoke all on function public.buscar_lp_publica(text) from public;
grant execute on function public.buscar_lp_publica(text) to anon, authenticated;

-- =============================================================================
-- Função pública: submeter formulário LP (cria lead anônimo)
-- =============================================================================
create or replace function public.submeter_lp(
  _slug text,
  _dados jsonb,
  _user_agent text default null,
  _referer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lp record;
  v_lead_id bigint;
  v_nome text;
  v_email text;
  v_whatsapp text;
  v_empresa text;
begin
  select * into v_lp from public.landing_page where slug = _slug and ativa = true;
  if v_lp is null then
    return jsonb_build_object('ok', false, 'erro', 'Página não encontrada.');
  end if;

  v_nome := nullif(trim(_dados->>'nome'), '');
  v_email := nullif(lower(trim(_dados->>'email')), '');
  v_whatsapp := nullif(trim(_dados->>'whatsapp'), '');
  v_empresa := nullif(trim(_dados->>'empresa'), '');

  -- Pelo menos email OU whatsapp
  if v_email is null and v_whatsapp is null then
    return jsonb_build_object('ok', false, 'erro', 'Email ou WhatsApp obrigatório.');
  end if;

  insert into public.leads (
    organizacao_id, nome, empresa, email, whatsapp,
    segmento, fonte, funnel_stage, crm_stage, temperatura, prioridade,
    responsavel_id, observacoes, custom_fields,
    origem_prospeccao
  ) values (
    v_lp.organizacao_id, v_nome, v_empresa, v_email, v_whatsapp,
    v_lp.segmento_default,
    'landing_page',
    'base_bruta', 'Base', 'Morno', 'B',
    v_lp.responsavel_id,
    'Veio pela LP: ' || _slug,
    _dados,
    jsonb_build_object('tipo', 'landing_page', 'lp_id', v_lp.id, 'lp_slug', _slug)
  )
  returning id into v_lead_id;

  -- Incrementa submission count
  update public.landing_page set submissions = submissions + 1 where id = v_lp.id;

  -- Inicia cadência se LP tiver
  if v_lp.fluxo_cadencia_id is not null then
    insert into public.cadencia (organizacao_id, lead_id, passo, canal, status, data_prevista)
    select v_lp.organizacao_id, v_lead_id, 'D0',
      (select canal from public.cadencia_fluxo_passo where fluxo_id = v_lp.fluxo_cadencia_id order by ordem limit 1),
      'pendente', current_date
    on conflict do nothing;
  end if;

  -- Push notification pro responsável
  -- (best-effort: trigger lead INSERT já dispara push pro responsável)

  return jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'agradecimento_titulo', v_lp.agradecimento_titulo, 'agradecimento_texto', v_lp.agradecimento_texto);
end;
$$;

revoke all on function public.submeter_lp(text, jsonb, text, text) from public;
grant execute on function public.submeter_lp(text, jsonb, text, text) to anon, authenticated;

comment on function public.submeter_lp is
  'Endpoint público: recebe submissão de form da LP, cria lead na base bruta + inicia cadência D0 opcional.';
