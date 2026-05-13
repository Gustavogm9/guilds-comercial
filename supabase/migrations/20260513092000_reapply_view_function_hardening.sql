-- Reaplica hardening apos migrations recentes recriarem objetos.
--
-- 20260512150000_v_leads_enriched_score recria v_leads_enriched e, sem repetir
-- security_invoker, a view volta ao default security_definer e pode bypassar RLS.
-- Algumas waves tambem recriaram set_updated_at() sem search_path explicito.

do $$
begin
  if to_regclass('public.v_leads_enriched') is not null then
    execute 'alter view public.v_leads_enriched set (security_invoker = on)';
  end if;

  if to_regprocedure('public.set_updated_at()') is not null then
    execute 'alter function public.set_updated_at() set search_path = public';
  end if;
end $$;
