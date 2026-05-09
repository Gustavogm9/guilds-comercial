import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { BookOpen } from "lucide-react";
import PortfolioClient from "./portfolio-client";
import { listarProdutos, listarCases, listarHipoteses, listarPropostas } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  // Carrega tudo em paralelo
  const [produtos, cases, hipoteses, propostas] = await Promise.all([
    listarProdutos(),
    listarCases(),
    listarHipoteses(),
    listarPropostas(),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
          <BookOpen className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio & ICP Lab</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus produtos, cases e teste hipóteses de ICP para descobrir o melhor perfil de cliente.
          </p>
        </div>
      </div>

      <PortfolioClient
        produtos={produtos}
        cases={cases}
        hipoteses={hipoteses}
        propostas={propostas}
      />
    </div>
  );
}
