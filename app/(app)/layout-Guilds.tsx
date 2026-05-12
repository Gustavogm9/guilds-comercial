import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarOrgsDoUsuario } from "@/lib/supabase/org";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";
import NovoLeadFab from "@/components/novo-lead-fab";
import TrialBanner from "@/components/trial-banner";
import AiCreditsBadge from "@/components/ai-credits-badge";
import AgentCopilotWidget from "@/components/ai/agent-copilot-widget";
import { ImpersonationBanner } from "@/components/impersonation-banner";

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
  const isImpersonating = (profile as any)._is_impersonated === true;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={profile}
        userId={profile.id}
        isGestor={isGestor}
        orgs={orgs.map(o => ({ id: o.id, nome: o.nome, role: o.role }))}
        activeOrgId={orgId}
        aiCreditsSlot={
          // Suspense desacopla o badge do render do shell — sidebar aparece
          // imediatamente, badge streama quando a query (cacheada 60s) volta.
          <Suspense fallback={<AiCreditsBadgeSkeleton />}>
            <AiCreditsBadge orgId={orgId} />
          </Suspense>
        }
      />
      <main className="flex-1 min-w-0 pb-24 md:pb-0 relative z-0">
        {/* HEADER MOBILE — Linear/Stripe-feel: bg-card sólido com border soft */}
        <div className="md:hidden bg-card/90 backdrop-blur-xl border-b border-border dark:bg-[hsl(220_5%_5%)]/90 dark:border-white/[0.06] px-4 py-2.5 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-md bg-primary grid place-items-center text-primary-foreground font-semibold text-[13px] shrink-0"
              style={{ boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.18)" }}
            >
              G
            </div>
            <div
              className="font-medium text-sm leading-tight truncate text-foreground"
              style={{ letterSpacing: "-0.13px" }}
            >
              {activeOrg?.nome ?? "Guilds"}
            </div>
          </div>
          <div className="text-xs text-muted-foreground truncate ml-2">{profile.display_name}</div>
        </div>
        {isImpersonating && <ImpersonationBanner targetName={profile.display_name} />}
        {isGestor && activeOrg && (
          <TrialBanner trialEndsAt={activeOrg.trial_ends_at} billingStatus={activeOrg.billing_status} />
        )}
        {children}
        <MobileNav />
      </main>
      <NovoLeadFab />
      <AgentCopilotWidget />
    </div>
  );
}

function AiCreditsBadgeSkeleton() {
  return (
    <div className="px-2.5 py-2 space-y-1.5 animate-pulse">
      <div className="h-2.5 w-20 rounded bg-secondary dark:bg-white/[0.05]" />
      <div className="h-3 w-32 rounded bg-secondary/70 dark:bg-white/[0.03]" />
      <div className="h-1 w-full rounded-full bg-secondary dark:bg-white/[0.05]" />
    </div>
  );
}
