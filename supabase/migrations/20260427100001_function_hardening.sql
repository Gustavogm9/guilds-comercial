-- Hardening da camada SQL conforme Supabase Database Linter:
--
-- 1) Funções triggers/utils sem search_path explícito ficam vulneráveis a
--    "schema poisoning" (atacante cria objeto com mesmo nome em schema mais
--    cedo no search_path do invocador). Mitigação: fixar search_path = public.
--
-- 2) Funções SECURITY DEFINER de governança (is_gestor_in_org, orgs_do_usuario)
--    estavam executáveis pelo role anon (via grant herdado de PUBLIC). Embora
--    elas retornem vazio para anon (auth.uid() é null), boa higiene exige
--    revogar e manter execute apenas para authenticated, que precisa para RLS.
--
-- Idempotente.

-- 1) search_path = public nas funções triggers/utils
alter function public.cadencia_default_fields()              set search_path = public;
alter function public.cadencia_objetivo_default(text)        set search_path = public;
alter function public.lead_probabilidade_por_etapa(text)     set search_path = public;
alter function public.lead_score_fechamento(bigint)          set search_path = public;
alter function public.raiox_classificar()                    set search_path = public;
alter function public.set_updated_at()                       set search_path = public;
alter function public.sync_lead_probabilidade()              set search_path = public;
alter function public.sync_raiox_voucher()                   set search_path = public;
alter function public.touch_updated_at()                     set search_path = public;

-- 2) Revogar execute do role anon nas funções SECURITY DEFINER de governança.
-- O grant default ao role PUBLIC propaga para anon — precisamos revogar de
-- ambos e re-conceder explicitamente para authenticated.
revoke execute on function public.is_gestor_in_org(uuid) from public;
revoke execute on function public.is_gestor_in_org(uuid) from anon;
grant   execute on function public.is_gestor_in_org(uuid) to authenticated;

revoke execute on function public.orgs_do_usuario()      from public;
revoke execute on function public.orgs_do_usuario()      from anon;
grant   execute on function public.orgs_do_usuario()      to authenticated;
