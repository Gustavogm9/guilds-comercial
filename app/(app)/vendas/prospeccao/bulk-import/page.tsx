import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, ArrowLeft } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import VendasTabs from "../../vendas-tabs";
import BulkImportClient from "./bulk-import-client";

export const dynamic = "force-dynamic";

/**
 * /vendas/prospeccao/bulk-import — gestor sobe CSV de CNPJs.
 *
 * Apenas gestor (rate-limit + custo de BrasilAPI). Histórico das últimas
 * 10 importações com progresso.
 */
export default async function BulkImportPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/vendas/prospeccao");

  const supabase = createClient();
  const { data: jobs } = await supabase
    .from("prospeccao_bulk_jobs")
    .select("id, status, total, processados, enriquecidos, duplicados, erros, ativar_como_lead, iniciar_cadencia, created_at, finished_at, ultimo_erro")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <VendasTabs />
      <header className="mb-6">
        <Link href="/vendas/prospeccao/base-de-empresas" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3 h-3" /> Voltar pra base de empresas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" aria-hidden="true" />
          Import em massa
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cole CNPJs (1 por linha) ou faça upload de CSV. Worker enriquece via BrasilAPI
          com rate-limit (~3/s) e adiciona à base de empresas. Opcionalmente cria leads
          na base bruta. Apenas gestores podem importar.
        </p>
      </header>

      <BulkImportClient jobs={(jobs ?? []) as any[]} />
    </div>
  );
}
