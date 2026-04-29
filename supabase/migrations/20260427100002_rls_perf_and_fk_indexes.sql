-- Migration #3 — RLS performance + índices em FKs
--
-- 1) auth_rls_initplan: substitui `auth.uid()` direto por `(select auth.uid())`
--    em policies que usam o helper. Postgres trata como subquery escalar
--    avaliada uma vez por query em vez de uma vez por linha. Para
--    `v_leads_enriched` com 45 leads o ganho é pequeno; com volume de produção
--    será notável. Doc: supabase.com/docs/guides/database/postgres/row-level-security#auth-functions
--
-- 2) Cria índices nas 14 FKs sem cobertura. Destaque crítico:
--    `responsavel_id` em ligacoes/raio_x/newsletter (queries frequentes
--    filtrando por vendedor faziam seq scan).
--
-- Idempotente.

-- ============================================================
-- 1) RLS auth_rls_initplan fix
-- ============================================================

drop policy if exists profiles_select_own_or_sameorg on public.profiles;
create policy profiles_select_own_or_sameorg on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.membros_organizacao m1
      join public.membros_organizacao m2 on m1.organizacao_id = m2.organizacao_id
      where m1.profile_id = (select auth.uid())
        and m1.ativo = true
        and m2.profile_id = profiles.id
        and m2.ativo = true
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists org_insert_self on public.organizacoes;
create policy org_insert_self on public.organizacoes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Acesso as chaves da sua propria organizacao" on public.api_keys;
create policy "Acesso as chaves da sua propria organizacao" on public.api_keys
  for all to authenticated
  using (
    organizacao_id in (
      select m.organizacao_id
      from public.membros_organizacao m
      where m.profile_id = (select auth.uid())
        and m.role = 'gestor'::text
    )
  );

drop policy if exists "Acesso aos webhooks da organizacao" on public.webhooks;
create policy "Acesso aos webhooks da organizacao" on public.webhooks
  for all to authenticated
  using (
    organizacao_id in (
      select m.organizacao_id
      from public.membros_organizacao m
      where m.profile_id = (select auth.uid())
        and m.role = 'gestor'::text
    )
  );

drop policy if exists "Leitura dos eventos do webhook" on public.webhook_events;
create policy "Leitura dos eventos do webhook" on public.webhook_events
  for select to authenticated
  using (
    organizacao_id in (
      select m.organizacao_id
      from public.membros_organizacao m
      where m.profile_id = (select auth.uid())
        and m.role = 'gestor'::text
    )
  );

-- ============================================================
-- 2) Índices nas 14 FKs sem cobertura
-- ============================================================
create index if not exists idx_api_keys_org              on public.api_keys           (organizacao_id);
create index if not exists idx_convites_convidado_por    on public.convites           (convidado_por);
create index if not exists idx_lead_evento_ator          on public.lead_evento        (ator_id);
create index if not exists idx_ligacoes_responsavel      on public.ligacoes           (responsavel_id);
create index if not exists idx_meta_individual_profile   on public.meta_individual    (profile_id);
create index if not exists idx_newsletter_responsavel    on public.newsletter         (responsavel_id);
create index if not exists idx_organizacao_evento_ator   on public.organizacao_evento (ator_id);
create index if not exists idx_organizacoes_owner        on public.organizacoes       (owner_id);
create index if not exists idx_profiles_home_org         on public.profiles           (home_organizacao_id);
create index if not exists idx_raiox_responsavel         on public.raio_x             (responsavel_id);
create index if not exists idx_vendedor_segmento_profile on public.vendedor_segmento  (profile_id);
create index if not exists idx_webhook_events_org        on public.webhook_events     (organizacao_id);
create index if not exists idx_webhook_events_webhook    on public.webhook_events     (webhook_id);
create index if not exists idx_webhooks_org              on public.webhooks           (organizacao_id);
