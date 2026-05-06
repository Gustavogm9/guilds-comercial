import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import NovoLeadModal from "@/components/novo-lead-modal";
import BaseRowActions from "@/components/base-row-actions";
import type { LeadEnriched } from "@/lib/types";
import { Inbox, CheckCircle2, Search, Upload } from "lucide-react";
import { getServerLocale, getT, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function BasePage(
  props: {
    searchParams: Promise<{ tab?: "bruta" | "qualificada" | "todos"; q?: string; resp?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const locale = await getServerLocale();
  const t = getT(locale);

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  // Bug 3: validação estrita de tab (whitelist)
  const tab: "bruta" | "qualificada" | "todos" =
    searchParams.tab === "qualificada" ? "qualificada" : searchParams.tab === "todos" ? "todos" : "bruta";
  const q = searchParams.q?.trim() ?? "";
  // Bug 1: força respFiltro = me.id pra não-gestores mesmo com ?resp= na URL
  const respFiltro = isGestor ? (searchParams.resp ?? "all") : me.id;

  let query = supabase
    .from("v_leads_enriched")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    // Robustez 11: paginação leve — primeiros 200 leads (resto por busca/filtro)
    .limit(200);

  if (tab !== "todos") {
    query = query.eq("funnel_stage", tab === "bruta" ? "base_bruta" : "base_qualificada");
  }

  if (respFiltro !== "all") query = query.eq("responsavel_id", respFiltro);
  if (q) {
    // Bug 2: sanitiza chars que quebram parser PostgREST .or()
    const limpo = q.replace(/[,()]/g, " ").replace(/\*/g, "_").trim();
    if (limpo.length >= 2) {
      query = query.or(`empresa.ilike.%${limpo}%,nome.ilike.%${limpo}%,email.ilike.%${limpo}%`);
    }
  }

  const [{ data: leads }, membros, { count: countBruta }, { count: countQual }, { count: countTodos }] =
    await Promise.all([
      query,
      listarMembrosDaOrg(orgId),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId).eq("funnel_stage", "base_bruta"),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId).eq("funnel_stage", "base_qualificada"),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId),
    ]);

  const all = (leads ?? []) as LeadEnriched[];
  const profs = membros.map(m => ({ id: m.profile_id, display_name: m.display_name }));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.base_titulo")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("paginas.base_sub")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/base/importar" className="btn-secondary text-xs inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5"/> {t("base.btn_importar_csv")}
          </Link>
          <NovoLeadModal profiles={profs} />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border dark:border-white/[0.06] mb-4">
        <Tab href={`/base?tab=bruta`} active={tab === "bruta"}
             icon={<Inbox className="w-3.5 h-3.5"/>} label={t("base.tab_bruta")} count={countBruta ?? 0} />
        <Tab href={`/base?tab=qualificada`} active={tab === "qualificada"}
             icon={<CheckCircle2 className="w-3.5 h-3.5"/>} label={t("base.tab_qualificada")} count={countQual ?? 0} />
        <Tab href={`/base?tab=todos`} active={tab === "todos"}
             icon={<Search className="w-3.5 h-3.5"/>} label={"Todos"} count={countTodos ?? 0} />
      </div>

      {/* Filtros */}
      <form className="flex items-center gap-2 mb-3 flex-wrap" role="search">
        <input type="hidden" name="tab" value={tab} />
        <div className="relative">
          <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("base.filtro_buscar_placeholder")}
            aria-label={t("base.filtro_buscar_placeholder")}
            className="input-base !pl-7 text-xs w-72"
          />
        </div>
        {isGestor && (
          <select name="resp" defaultValue={respFiltro} className="input-base !text-xs w-40" aria-label={t("base.tabela_resp")}>
            <option value="all">{t("base.filtro_todo_time")}</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        )}
        <button type="submit" className="btn-secondary text-xs">{t("base.filtro_filtrar")}</button>
      </form>

      {/* Lista */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 dark:bg-white/[0.02] text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b border-border dark:border-white/[0.06]">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">{t("base.tabela_empresa")}</th>
                <th className="text-left px-3 py-2.5 font-semibold">{t("base.tabela_contato")}</th>
                <th className="text-left px-3 py-2.5 font-semibold">{t("base.tabela_segmento")}</th>
                <th className="text-left px-3 py-2.5 font-semibold">{t("base.tabela_fonte")}</th>
                <th className="text-left px-3 py-2.5 font-semibold">{t("base.tabela_resp")}</th>
                <th className="text-left px-3 py-2.5 font-semibold">{t("base.tabela_entrou")}</th>
                <th className="text-right px-3 py-2.5 font-semibold">{t("base.tabela_acoes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 dark:divide-white/[0.05]">
              {all.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground/70 italic">
                    {tab === "bruta" ? t("base.tabela_vazio_bruta") : t("base.tabela_vazio_qualificada")}
                  </td>
                </tr>
              )}
              {all.map(l => (
                <tr key={l.id} className="hover:bg-secondary/40 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-2">
                    <Link
                      href={`/pipeline/${l.id}`}
                      className="font-medium text-foreground hover:text-primary transition-colors block"
                      style={{ letterSpacing: "-0.13px" }}
                    >
                      {l.empresa || t("base.tabela_sem_empresa")}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {l.is_demo && (
                        <span className="text-[10px] uppercase bg-warning-500/15 text-warning-500 border border-warning-500/25 px-1.5 py-0.5 rounded font-semibold">
                          {t("base.tabela_demo")}
                        </span>
                      )}
                      {tab === "todos" && (
                        <span className="text-[10px] uppercase bg-secondary text-muted-foreground border border-border px-1.5 py-0.5 rounded font-semibold">
                          {l.funnel_stage === "pipeline" ? "Pipeline" :
                           l.funnel_stage === "base_bruta" ? "Base Bruta" :
                           l.funnel_stage === "base_qualificada" ? "Qualificada" :
                           l.funnel_stage === "arquivado" ? "Arquivado" : l.funnel_stage}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {l.nome ?? "—"}
                    {l.cargo && <span className="text-muted-foreground/60"> · {l.cargo}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.segmento ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.fonte ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.responsavel_nome ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{fmt(l.data_entrada, locale)}</td>
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
    <Link
      href={href}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
      style={{ letterSpacing: "-0.13px" }}
    >
      {icon} {label}
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums ${
          active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

function fmt(d: string, locale: Locale) {
  return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}
