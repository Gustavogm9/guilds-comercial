-- =============================================================================
-- Warm-start backfill da tendência de health score
--
-- Problema: a UI de drill-down do health mostra "novo" como tendência até o
-- cron snapshots rodar 30+ dias. Pra clientes que já são antigos isso é falso —
-- eles tinham um score histórico (provavelmente próximo do atual).
--
-- Solução: cria snapshots sintéticos em (hoje-30d, hoje-60d, hoje-90d) usando
-- o score ATUAL do cache. Resultado: tendência mostra "estavel" em vez de
-- "novo" — uma admissão honesta de "não temos histórico ainda, assumimos
-- estável" em vez de esconder o widget.
--
-- Backfill é idempotente: se já existe snapshot pra (lead_id, snapshot_date),
-- não duplica. Apenas adiciona linhas faltantes.
--
-- Snapshots futuros (via cron diário) vão sobrepor essa baseline conforme o
-- score real evoluir, e em 30 dias a tendência fica orgânica.
-- =============================================================================

create or replace function public.backfill_health_snapshots_warm_start()
returns table (
  snapshots_criados int,
  organizacoes_atingidas int,
  leads_atingidos int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_orgs  int := 0;
  v_leads int := 0;
  v_offset int;
begin
  -- Cria snapshots pra 90/60/30 dias atrás usando o cache atual
  for v_offset in select unnest(array[90, 60, 30]) loop
    with novas as (
      insert into public.health_score_snapshots (
        organizacao_id, lead_id, snapshot_date, health_score,
        pts_recencia, pts_nps, pts_onboarding, pts_indicacao, categoria
      )
      select
        c.organizacao_id,
        c.lead_id,
        (current_date - (v_offset || ' days')::interval)::date,
        c.health_score,
        c.pts_recencia,
        c.pts_nps,
        c.pts_onboarding,
        c.pts_indicacao,
        c.categoria
      from public.health_score_cache c
      where not exists (
        select 1 from public.health_score_snapshots s
        where s.lead_id = c.lead_id
          and s.snapshot_date = (current_date - (v_offset || ' days')::interval)::date
      )
      returning organizacao_id, lead_id
    )
    select count(*) into v_total from novas;
  end loop;

  select
    coalesce(sum(1), 0),
    count(distinct organizacao_id),
    count(distinct lead_id)
  into v_total, v_orgs, v_leads
  from public.health_score_snapshots
  where snapshot_date in (
    (current_date - interval '30 days')::date,
    (current_date - interval '60 days')::date,
    (current_date - interval '90 days')::date
  );

  return query select v_total, v_orgs, v_leads;
end;
$$;

comment on function public.backfill_health_snapshots_warm_start() is
  'One-shot OPCIONAL: cria snapshots sintéticos em (hoje-30d/60d/90d) usando o cache atual. Idempotente. NÃO é executado automaticamente — gestor decide se quer chamar via `select * from public.backfill_health_snapshots_warm_start();` no SQL editor. Tira a tendência do estado "novo" pra clientes que já são antigos.';
