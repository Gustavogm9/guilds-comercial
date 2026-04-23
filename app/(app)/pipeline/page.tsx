import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import KanbanBoard from "@/components/kanban-board";
import type { LeadEnriched } from "@/lib/types";
import { ETAPAS_PIPELINE_VISIVEL } from "@/lib/lists";
import { Plus, Filter } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: { resp?: string } }) {
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";
  const respFiltro = searchParams.resp ?? (isGestor ? "all" : me.id);

  let q = supabase
    .from("v_leads_enriched")
    .select("*")
    .eq("organizacao_id", orgId)
    .in("crm_stage", [...ETAPAS_PIPELINE_VISIVEL])
    .order("data_proxima_acao", { ascending: true, nullsFirst: false });

  if (respFiltro !== "all") q = q.eq("responsavel_id", respFiltro);

  const [{ data: leads }, membros] = await Promise.all([
    q,
    listarMembrosDaOrg(orgId),
  ]);

  return (
    <div className="py-4">
      <header className="px-4 md:px-8 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-slate-500">Arraste os cards entre colunas para mover de etapa.</p>
        </div>
        <div className="flex items-center gap-2">
          {isGestor && (
            <form className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400"/>
              <select name="resp" defaultValue={respFiltro}
                className="input-base !py-1.5 !text-xs w-36">
                <option value="all">Todo o time</option>
                {membros.map(m => (
                  <option key={m.profile_id} value={m.profile_id}>{m.display_name}</option>
                ))}
              </select>
              <button type="submit" className="btn-secondary text-xs">Filtrar</button>
            </form>
          )}
          <Link href="/base" className="btn-primary text-xs"><Plus className="w-3.5 h-3.5"/> Novo lead</Link>
        </div>
      </header>

      <KanbanBoard leads={(leads ?? []) as LeadEnriched[]} />
    </div>
  );
}
