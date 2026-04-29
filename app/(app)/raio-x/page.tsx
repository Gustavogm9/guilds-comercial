import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import RaioXRowActions from "@/components/raiox-row-actions";
import { Activity, DollarSign, Award } from "lucide-react";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type RaioXJoin = {
  id: number;
  lead_id: number;
  data_oferta: string;
  preco_lista: number;
  voucher_desconto: number;
  gratuito: boolean;
  preco_final: number;
  pago: boolean;
  data_pagamento: string | null;
  score: number | null;
  perda_anual_estimada: number | null;
  nivel: "Alto" | "Médio" | "Baixo" | "Pendente";
  saida_recomendada: string | null;
  call_revisao: boolean;
  responsavel_id: string | null;
  observacoes: string | null;
  leads: { id: number; empresa: string | null; nome: string | null; segmento: string | null; cargo: string | null; whatsapp: string | null } | null;
};

export default async function RaioXPage({ searchParams }: { searchParams: { tab?: string; resp?: string } }) {
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const t = getT(await getServerLocale());

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  const tab = searchParams.tab ?? "ativos";
  const respFiltro = searchParams.resp ?? (isGestor ? "all" : me.id);

  let q = supabase
    .from("raio_x")
    .select("*, leads ( id, empresa, nome, segmento, cargo, whatsapp )")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false });

  if (respFiltro !== "all") q = q.eq("responsavel_id", respFiltro);
  if (tab === "ofertados") q = q.eq("pago", false);
  if (tab === "pagos")     q = q.eq("pago", true).is("score", null);
  if (tab === "concluidos") q = q.not("score", "is", null);

  const [{ data: raiox }, membros, { data: stats }] = await Promise.all([
    q,
    listarMembrosDaOrg(orgId),
    supabase.from("raio_x").select("preco_final, pago, score").eq("organizacao_id", orgId),
  ]);

  const list = (raiox ?? []) as unknown as RaioXJoin[];
  const profs = membros.map(m => ({ id: m.profile_id, display_name: m.display_name }));

  // KPIs
  const allRaiox = (stats ?? []) as { preco_final: number; pago: boolean; score: number | null }[];
  const ofertados = allRaiox.length;
  const pagos = allRaiox.filter(r => r.pago).length;
  const arrecadado = allRaiox.filter(r => r.pago).reduce((s, r) => s + (r.preco_final || 0), 0);
  const concluidos = allRaiox.filter(r => r.score !== null).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.raio_x_titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("paginas.raio_x_sub")}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <KPI title="Ofertados" v={ofertados} icon={<Activity className="w-4 h-4"/>} tone="neutral"/>
        <KPI title="Pagos" v={pagos} icon={<DollarSign className="w-4 h-4"/>} tone="success"/>
        <KPI title="Concluídos" v={concluidos} icon={<Award className="w-4 h-4"/>} tone="success"/>
        <KPI title="Arrecadado" v={arrecadado} fmt="brl" icon={<DollarSign className="w-4 h-4"/>} tone="neutral"/>
      </div>

      <div className="flex items-center gap-1 border-b border-border mb-4">
        {[
          { k: "ativos",     l: "Ativos" },
          { k: "ofertados",  l: "Aguardando pagamento" },
          { k: "pagos",      l: "Pagos sem resultado" },
          { k: "concluidos", l: "Concluídos" },
        ].map(t => (
          <Link key={t.k} href={`/raio-x?tab=${t.k}`}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
              tab === t.k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>{t.l}</Link>
        ))}
      </div>

      {isGestor && (
        <form className="mb-3 flex items-center gap-2">
          <input type="hidden" name="tab" value={tab}/>
          <select name="resp" defaultValue={respFiltro} className="input-base !text-xs w-40">
            <option value="all">Todo o time</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <button className="btn-secondary text-xs">Filtrar</button>
        </form>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Lead</th>
                <th className="text-left px-3 py-2 font-semibold">Ofertado</th>
                <th className="text-right px-3 py-2 font-semibold">Preço</th>
                <th className="text-center px-3 py-2 font-semibold">Pago?</th>
                <th className="text-center px-3 py-2 font-semibold">Score</th>
                <th className="text-left px-3 py-2 font-semibold">Nível</th>
                <th className="text-right px-3 py-2 font-semibold">Perda anual</th>
                <th className="text-right px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground/70">Nenhum Raio-X nesta caixa.</td></tr>
              )}
              {list.map(r => (
                <tr key={r.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <Link href={`/pipeline/${r.lead_id}`} className="font-medium hover:text-primary">
                      {r.leads?.empresa || r.leads?.nome || "(?)"}
                    </Link>
                    <div className="text-[10px] text-muted-foreground">{r.leads?.segmento ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{fmt(r.data_oferta)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">
                    {r.gratuito
                      ? <span className="text-success-500">Gratuito</span>
                      : (r.preco_final ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.pago
                      ? <span className="text-success-500 tabular-nums">✓ {r.data_pagamento ? fmt(r.data_pagamento) : ""}</span>
                      : <span className="text-muted-foreground/70">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs tabular-nums">{r.score ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.nivel === "Alto" && <span className="text-xs text-success-500 bg-success-500/15 border border-success-500/25 px-1.5 py-0.5 rounded">Alto</span>}
                    {r.nivel === "Médio" && <span className="text-xs text-warning-500 bg-warning-500/15 border border-warning-500/25 px-1.5 py-0.5 rounded">Médio</span>}
                    {r.nivel === "Baixo" && <span className="text-xs text-muted-foreground bg-secondary/60 dark:bg-white/[0.03] border border-border px-1.5 py-0.5 rounded">Baixo</span>}
                    {r.nivel === "Pendente" && <span className="text-xs text-muted-foreground/70">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">
                    {r.perda_anual_estimada
                      ? r.perda_anual_estimada.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RaioXRowActions
                      raioxId={r.id} leadId={r.lead_id}
                      jaPago={r.pago}
                      jaTemResultado={r.score !== null}
                      empresa={r.leads?.empresa ?? undefined}
                      nome={r.leads?.nome ?? undefined}
                      cargo={r.leads?.cargo ?? undefined}
                      segmento={r.leads?.segmento ?? undefined}
                      whatsapp={r.leads?.whatsapp ?? undefined}
                    />
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

function KPI({ title, v, fmt, icon, tone }: { title: string; v: number; fmt?: "brl"; icon: React.ReactNode; tone: "neutral" | "success" }) {
  const tones = {
    neutral: "bg-secondary dark:bg-white/[0.05] text-muted-foreground",
    success: "bg-success-500/10 text-success-500",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">{title}</div>
        <div className="text-2xl font-semibold leading-tight tabular-nums">
          {fmt === "brl" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : v}
        </div>
      </div>
    </div>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
