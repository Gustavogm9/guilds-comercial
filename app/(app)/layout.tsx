import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarOrgsDoUsuario } from "@/lib/supabase/org";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";
import NovoLeadFab from "@/components/novo-lead-fab";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      redirect("/onboarding");
    } else {
      redirect("/login");
    }
  }

  if (!profile.home_organizacao_id) {
    redirect("/onboarding");
  }
  const [orgs, orgId, role] = await Promise.all([
    listarOrgsDoUsuario(),
    getCurrentOrgId(),
    getCurrentRole(),
  ]);
  const isGestor = role === "gestor";
  const activeOrg = orgs.find(o => o.id === orgId) ?? null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={profile}
        userId={profile.id}
        isGestor={isGestor}
        orgs={orgs.map(o => ({ id: o.id, nome: o.nome, role: o.role }))}
        activeOrgId={orgId}
      />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-guild-600 grid place-items-center text-white font-bold text-sm">G</div>
            <div className="font-semibold text-sm leading-tight">
              {activeOrg?.nome ?? "Guilds"}
            </div>
          </div>
          <div className="text-xs text-slate-500">{profile.display_name}</div>
        </div>
        {children}
        <MobileNav />
      </main>
      <NovoLeadFab />
    </div>
  );
}
