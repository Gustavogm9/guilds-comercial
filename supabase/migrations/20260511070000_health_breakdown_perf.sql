-- =============================================================================
-- Performance do health_breakdown — single-RPC pra orgs grandes
--
-- Problema: modal de breakdown faz 3 queries paralelas (breakdown, tendencia,
-- nps_historico). Em orgs com 100k+ clientes, cada uma faz network roundtrip
-- + parsing JSON. Pra um single-lead lookup, podemos consolidar em 1 RPC.
--
-- Bônus: índice standalone em lead_id (a pkey é (organizacao_id, lead_id),
-- não acelera lookups por lead_id puro).
-- =============================================================================

-- 1. Índice extra pra lookups por lead_id (sem orgId)
create index if not exists idx_health_cache_lead_id
  on public.health_score_cache(lead_id);

-- 2. Combined RPC: retorna tudo do modal em 1 call
create or replace function public.health_breakdown_completo(_lead_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_breakdown jsonb;
  v_tendencia jsonb;
  v_nps_hist jsonb;
begin
  -- RLS: verifica que o user tem acesso a essa org via lead
  select organizacao_id into v_org_id from public.leads where id = _lead_id;
  if v_org_id is null then return null; end if;
  if v_org_id not in (select public.orgs_do_usuario()) then
    return null;
  end if;

  -- Breakdown principal
  select to_jsonb(b.*) into v_breakdown
  from public.v_health_breakdown b
  where b.lead_id = _lead_id
  limit 1;

  -- Tendência (pode ser null se sem snapshots)
  select to_jsonb(t.*) into v_tendencia
  from public.v_health_tendencia t
  where t.lead_id = _lead_id
  limit 1;

  -- Histórico NPS (pode ser null se sem respostas)
  select to_jsonb(h.*) into v_nps_hist
  from public.v_nps_historico_lead h
  where h.lead_id = _lead_id
  limit 1;

  return jsonb_build_object(
    'breakdown', v_breakdown,
    'tendencia', v_tendencia,
    'nps_historico', v_nps_hist
  );
end;
$$;

grant execute on function public.health_breakdown_completo(bigint) to authenticated;

comment on function public.health_breakdown_completo(bigint) is
  'Single-call pro modal de health breakdown. Retorna breakdown + tendencia + histórico NPS em 1 round-trip. RLS-aware.';
