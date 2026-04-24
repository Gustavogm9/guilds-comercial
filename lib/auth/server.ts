/**
 * Utilitário de autenticação server-side.
 * Provê `requireActiveOrg` que retorna a sessão com orgId e role,
 * ou redireciona para /login se não autenticado.
 */
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";

export interface ActiveOrgSession {
  userId: string;
  organizacaoId: string;
  role: string;
}

/**
 * Garante que o usuário está autenticado e vinculado a uma organização ativa.
 * Se não, redireciona para /login.
 */
export async function requireActiveOrg(): Promise<ActiveOrgSession> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    redirect("/onboarding");
  }

  const role = (await getCurrentRole()) ?? "comercial";

  return {
    userId: profile.id,
    organizacaoId: orgId,
    role,
  };
}
