-- Fix de vazamento de dados entre orgs em multi-tenant.
--
-- Problema: por default, views no Postgres rodam com SECURITY DEFINER
-- (privilégios do owner = postgres), o que faz com que RLS das tabelas-base
-- seja IGNORADA quando a query passa por uma view. Como toda a UI lê dados
-- via views agregadas (v_leads_enriched, v_lead_score, v_kpis_*, etc.), um
-- usuário authenticated podia ver leads, scores e métricas de qualquer org.
--
-- Fix: marcar todas as 14 views como security_invoker = on. A view passa a
-- executar com os privs do invocador → RLS das tabelas-base é aplicada
-- corretamente.
--
-- Idempotente. Pode ser re-executada sem efeito colateral.
alter view public.v_ativacao_org         set (security_invoker = on);
alter view public.v_motivos_perda        set (security_invoker = on);
alter view public.v_forecast_mes         set (security_invoker = on);
alter view public.v_ai_uso_30d           set (security_invoker = on);
alter view public.v_cohort_entrada       set (security_invoker = on);
alter view public.v_funil_conversao      set (security_invoker = on);
alter view public.v_kpis_por_canal       set (security_invoker = on);
alter view public.v_kpis_globais         set (security_invoker = on);
alter view public.v_kpis_por_responsavel set (security_invoker = on);
alter view public.v_valor_por_etapa      set (security_invoker = on);
alter view public.v_top_oportunidades    set (security_invoker = on);
alter view public.v_leads_enriched       set (security_invoker = on);
alter view public.v_lead_score           set (security_invoker = on);
alter view public.v_tempo_por_etapa      set (security_invoker = on);
