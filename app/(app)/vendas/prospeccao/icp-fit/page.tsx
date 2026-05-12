import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Target, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import VendasTabs from "../../vendas-tabs";
import IcpFitClient from "./icp-fit-client";

export const dynamic = "force-dynamic";

/**
 * /vendas/prospeccao/icp-fit — ranking de empresas com maior similaridade
 * com o centroide ICP da org (clientes fechados).
 */
export default async function IcpFitPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();

  const supabase = createClient();

  const [centroideRes, totalEmpresasRes, totalEmbeddingsRes, totalClientesRes] = await Promise.all([
    supabase.from("org_icp_centroide").select("*").eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("prospeccao_empresa").select("id", { count: "exact", head: true }),
    supabase.from("prospeccao_empresa").select("id", { count: "exact", head: true }).not("embedding", "is", null),
    supabase.from("leads").select("id", { count: "exact", head: true })
      .eq("organizacao_id", orgId).eq("crm_stage", "Fechado"),
  ]);

  const centroide = centroideRes.data as any | null;
  const totalEmpresas = totalEmpresasRes.count ?? 0;
  const totalEmbeddings = totalEmbeddingsRes.count ?? 0;
  const totalClientesFechados = totalClientesRes.count ?? 0;

  // Top empresas
  let topEmpresas: any[] = [];
  if (centroide) {
    const { data } = await supabase.rpc("top_empresas_icp_fit", {
      _org_id: orgId,
      _limit: 30,
      _excluir_ja_lead: true,
    });
    topEmpresas = data ?? [];
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <VendasTabs />
      <Link href="/vendas/prospeccao" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-3 h-3" /> Voltar
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" aria-hidden="true" />
          ICP Fit Score
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Score 0–100 de similaridade entre cada empresa da base local e o
          "centroide" dos seus clientes fechados. Usa embeddings de texto (OpenAI)
          + pgvector. Quanto maior, mais parecida com quem já fechou contrato.
        </p>
      </header>

      <IcpFitClient
        isGestor={role === "gestor"}
        centroide={centroide}
        totalEmpresas={totalEmpresas}
        totalEmbeddings={totalEmbeddings}
        totalClientesFechados={totalClientesFechados}
        topEmpresas={topEmpresas}
      />
    </div>
  );
}
