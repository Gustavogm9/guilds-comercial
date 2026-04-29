-- Fix Privilege Escalation vulnerability on membros_organizacao
-- Removes the `profile_id = auth.uid()` which allowed any user to join any org.
-- Inserções vindas do onboarding e aceitação de convite agora usam a Service Role Key.

drop policy if exists membros_insert_gestor on public.membros_organizacao;
create policy membros_insert_gestor on public.membros_organizacao
  for insert to authenticated
  with check (public.is_gestor_in_org(organizacao_id));
