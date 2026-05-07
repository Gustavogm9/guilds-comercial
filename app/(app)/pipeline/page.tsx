import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import KanbanBoard from "@/components/kanban-board";
import PipelineTable from "@/components/pipeline-table";
import PipelineToolbar from "@/components/pipeline-toolbar";
import type { LeadEnriched } from "@/lib/types";
import { ETAPAS_PIPELINE_VISIVEL } from "@/lib/lists";
import { Plus } from "lucide-react";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PipelinePage(
  props: {
    searchParams: Promise<{ resp?: string; q?: string; seg?: string; temp?: string; view?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const t = getT(await getServerLocale());

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  // Bug 5: força respFiltro = me.id pra não-gestores mesmo com ?resp=X na URL.
  // Antes: vendedor podia tentar `?resp=other_user` e ver 0 leads (RLS bloqueava
  // mas UX silenciosa parecia bug). Agora ignoramos o param.
  const respFiltro = isGestor ? (searchParams.resp ?? "all") : me.id;

  let q = supabase
    .from("v_leads_enriched")
    .select("*")
    .eq("organizacao_id", orgId)
    .in("crm_stage", [...ETAPAS_PIPELINE_VISIVEL])
    .order("data_proxima_acao", { ascending: true, nullsFirst: false });

  if (respFiltro !== "all") q = q.eq("responsavel_id", respFiltro);

  // FR-CRM-07 — Busca por empresa/nome/email
  if (searchParams.q?.trim()) {
    // Bug 4: sanitiza chars que quebram parser PostgREST .or() (vírgula, parênteses, asterisco).
    // O `.replace` aqui é defesa em profundidade — pipeline-toolbar já sanitiza
    // antes de mandar pra URL, mas alguém pode digitar manualmente.
    const limpo = searchParams.q.trim().replace(/[,()]/g, " ").replace(/\*/g, "_").trim();
    if (limpo.length >= 2) {
      const termo = `%${limpo}%`;
      q = q.or(`empresa.ilike.${termo},nome.ilike.${termo},email.ilike.${termo}`);
    }
  }

  // FR-CRM-05 — Filtros avançados
  if (searchParams.seg?.trim()) {
    q = q.eq("segmento", searchParams.seg.trim());
  }
  if (searchParams.temp?.trim()) {
    q = q.eq("temperatura", searchParams.temp.trim());
  }

  const [{ data: leads }, membros] = await Promise.all([
    q,
    listarMembrosDaOrg(orgId),
  ]);

  // Extrair segmentos únicos para o filtro
  const segmentos = [...new Set((leads ?? []).map((l: any) => l.segmento).filter(Boolean))].sort() as string[];
  const viewMode = searchParams.view === "list" ? "list" : "kanban";

  return (
    <div className="py-4">
      <header className="px-4 md:px-8 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.pipeline_titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("paginas.pipeline_sub")}</p>
        </div>
        <Link href="/base" className="btn-primary text-xs"><Plus className="w-3.5 h-3.5"/> {t("modais.novo_lead")}</Link>
      </header>

      {/* FR-CRM-05/07/08 — Toolbar com busca, filtros e export */}
      <div className="px-4 md:px-8 mb-4">
        <PipelineToolbar
          isGestor={isGestor}
          membros={membros}
          segmentos={segmentos}
          respFiltro={respFiltro}
          qFiltro={searchParams.q ?? ""}
          segFiltro={searchParams.seg ?? ""}
          tempFiltro={searchParams.temp ?? ""}
          viewMode={viewMode}
          leads={(leads ?? []) as LeadEnriched[]}
        />
      </div>

      {viewMode === "list" ? (
        <PipelineTable 
          leads={(leads ?? []) as LeadEnriched[]} 
          profiles={membros.map(m => ({ id: m.profile_id, display_name: m.display_name }))} 
        />
      ) : (
        <KanbanBoard leads={(leads ?? []) as LeadEnriched[]} />
      )}
    </div>
  );
}
