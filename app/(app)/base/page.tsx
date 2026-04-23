import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import NovoLeadModal from "@/components/novo-lead-modal";
import BaseRowActions from "@/components/base-row-actions";
import type { LeadEnriched } from "@/lib/types";
import { Inbox, CheckCircle2, Search, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BasePage({ searchParams }: {
  searchParams: { tab?: "bruta" | "qualificada"; q?: string; resp?: string };
}) {
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  const tab = searchParams.tab ?? "bruta";
  const q = searchParams.q?.trim() ?? "";
  const respFiltro = searchParams.resp ?? (isGestor ? "all" : me.id);

  let query = supabase
    .from("v_leads_enriched")
    .select("*")
    .eq("organizacao_id", orgId)
    .eq("funnel_stage", tab === "bruta" ? "base_bruta" : "base_qualificada")
    .order("created_at", { ascending: false });

  if (respFiltro !== "all") query = query.eq("responsavel_id", respFiltro);
  if (q) query = query.or(`empresa.ilike.%${q}%,nome.ilike.%${q}%,email.ilike.%${q}%`);

  const [{ data: leads }, membros, { count: countBruta }, { count: countQual }] =
    await Promise.all([
      query,
      listarMembrosDaOrg(orgId),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId).eq("funnel_stage", "base_bruta"),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId).eq("funnel_stage", "base_qualificada"),
    ]);

  const all = (leads ?? []) as LeadEnriched[];
  const profs = membros.map(m => ({ id: m.profile_id, display_name: m.display_name }));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Base de leads</h1>
          <p className="text-sm text-slate-500">
            Triagem antes do pipeline. Bruta → Qualificada → Pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/base/importar" className="btn-secondary text-xs inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5"/> Importar CSV
          </Link>
          <NovoLeadModal profiles={profs} />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        <Tab href={`/base?tab=bruta`} active={tab === "bruta"}
             icon={<Inbox className="w-3.5 h-3.5"/>} label="Bruta" count={countBruta ?? 0} />
        <Tab href={`/base?tab=qualificada`} active={tab === "qualificada"}
             icon={<CheckCircle2 className="w-3.5 h-3.5"/>} label="Qualificada" count={countQual ?? 0} />
      </div>

      {/* Filtros */}
      <form className="flex items-center gap-2 mb-3 flex-wrap">
        <input type="hidden" name="tab" value={tab}/>
        <div className="relative">
          <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400"/>
          <input name="q" defaultValue={q}
            placeholder="Buscar empresa, nome ou email"
            className="input-base !pl-7 text-xs w-72"/>
        </div>
        {isGestor && (
          <select name="resp" defaultValue={respFiltro}
            className="input-base !text-xs w-40">
            <option value="all">Todo o time</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        )}
        <button type="submit" className="btn-secondary text-xs">Filtrar</button>
      </form>

      {/* Lista */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Empresa</th>
                <th className="text-left px-3 py-2 font-medium">Contato</th>
                <th className="text-left px-3 py-2 font-medium">Segmento</th>
                <th className="text-left px-3 py-2 font-medium">Fonte</th>
                <th className="text-left px-3 py-2 font-medium">Resp.</th>
                <th className="text-left px-3 py-2 font-medium">Entrou</th>
                <th className="text-right px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {all.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                  Nenhum lead nesta caixa. {tab === "bruta" && "Use 'Novo lead' acima."}
                </td></tr>
              )}
              {all.map(l => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/pipeline/${l.id}`} className="font-medium hover:text-guild-700">
                      {l.empresa || "(sem empresa)"}
                    </Link>
                    {l.is_demo && <span className="ml-1 text-[10px] uppercase bg-amber-50 text-warning-500 px-1 rounded">demo</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {l.nome ?? "—"}
                    {l.cargo && <span className="text-slate-400"> · {l.cargo}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{l.segmento ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{l.fonte ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{l.responsavel_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{fmt(l.data_entrada)}</td>
                  <td className="px-3 py-2 text-right">
                    <BaseRowActions lead={l} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Tab({ href, active, icon, label, count }: {
  href: string; active: boolean; icon: React.ReactNode; label: string; count: number;
}) {
  return (
    <Link href={href}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
        active ? "border-guild-600 text-guild-700" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}>
      {icon} {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${active ? "bg-guild-50 text-guild-700" : "bg-slate-100 text-slate-500"}`}>
        {count}
      </span>
    </Link>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
