-- =============================================================================
-- Portal embaixador upgrade (Bloco F do polish — itens #5, #16)
--
-- 1. Função pública listar_indicacoes_por_token: embaixador vê suas próprias
--    indicações com status (recebida/contactado/virou_lead/fechado/perdido).
-- 2. organizacoes adiciona cor + logo opcionais (alguns clientes premium
--    querem branding no portal).
-- =============================================================================

-- Cores de marca (opcional, default usa Guilds)
alter table public.organizacoes
  add column if not exists portal_cor_primaria text check (portal_cor_primaria is null or portal_cor_primaria ~* '^#[0-9a-f]{6}$');
-- logo_url já existe (de outras migrations)

comment on column public.organizacoes.portal_cor_primaria is
  'Cor primária custom pro portal embaixador / NPS. Hex format #rrggbb. Default = primária Guilds.';

-- Função pública: lista indicações de um token
create or replace function public.listar_indicacoes_por_token(_token text)
returns table (
  indicado_nome text,
  indicado_empresa text,
  status text,
  data_recebida timestamptz,
  data_fechado timestamptz,
  data_perdido timestamptz,
  recompensa_paga boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id bigint;
begin
  if _token is null or length(_token) < 16 then return; end if;

  select t.lead_id into v_lead_id
  from public.embaixador_tokens t
  where t.token = _token
    and t.ativo = true
    and (t.expires_at is null or t.expires_at > now())
  limit 1;

  if v_lead_id is null then return; end if;

  return query
  select
    i.indicado_nome,
    -- Empresa só aparece se status >= virou_lead (anti-leak de prospects ainda não-trabalhados)
    case when i.status in ('virou_lead', 'fechado', 'perdido') then i.indicado_empresa else null end,
    i.status,
    i.data_recebida,
    i.data_fechado,
    i.data_perdido,
    -- Mascara recompensa por privacidade (só boolean: paga ou não)
    i.recompensa_paga
  from public.indicacoes i
  where i.embaixador_lead_id = v_lead_id
  order by i.data_recebida desc
  limit 50;
end;
$$;

revoke all on function public.listar_indicacoes_por_token(text) from public;
grant execute on function public.listar_indicacoes_por_token(text) to anon, authenticated;

comment on function public.listar_indicacoes_por_token(text) is
  'Endpoint público: embaixador vê suas próprias indicações via token. Empresa só revelada se status >= virou_lead pra evitar leak de prospects.';

-- Função pública: dados de branding da org pelo token
create or replace function public.buscar_branding_por_token(_token text)
returns table (
  organizacao_nome text,
  logo_url text,
  cor_primaria text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if _token is null or length(_token) < 16 then return; end if;

  -- Tenta primeiro como token de embaixador, depois NPS
  select t.organizacao_id into v_org_id
  from public.embaixador_tokens t
  where t.token = _token and t.ativo = true and (t.expires_at is null or t.expires_at > now())
  limit 1;

  if v_org_id is null then
    select n.organizacao_id into v_org_id
    from public.nps_responses n where n.token = _token
    limit 1;
  end if;

  if v_org_id is null then return; end if;

  return query
  select o.nome, o.logo_url, o.portal_cor_primaria
  from public.organizacoes o
  where o.id = v_org_id;
end;
$$;

revoke all on function public.buscar_branding_por_token(text) from public;
grant execute on function public.buscar_branding_por_token(text) to anon, authenticated;
