import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import WelcomeWizard from "@/components/welcome-wizard";
import type { Role } from "@/lib/types";

/**
 * Página de boas-vindas para colaboradores recém-convidados.
 *
 * Acesso:
 *   - Usuários autenticados SEM organização → redirect para /hoje (devem fazer onboarding)
 *   - Usuários com org → renderiza o wizard com o role correto
 *
 * O wizard usa localStorage "guilds-welcome-done-{userId}" para não reaparecer.
 * Se já completou, o WelcomeWizard redireciona imediatamente para /hoje.
 */

export const dynamic = "force-dynamic";

export default async function BoasVindasPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/onboarding"); // sem org → fazer onboarding de fundador

  const role = (await getCurrentRole()) as Role;

  // Gestor-fundador não precisa deste wizard — tem o onboarding completo
  // Redireciona para /hoje exceto se for role comercial/sdr (convidados típicos)
  // O wizard também aceita gestor (para gestores que foram convidados por outro gestor)

  return (
    <WelcomeWizard
      userId={me.id}
      role={role === "gestor" || role === "comercial" || role === "sdr" ? role : "comercial"}
    />
  );
}
