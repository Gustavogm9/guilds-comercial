import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import NewsletterRowActions from "@/components/newsletter-row-actions";
import { Mail, Users, Calendar, AlertCircle } from "lucide-react";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type NewsletterRow = {
  id: number;
  lead_id: number;
  optin: boolean;
  data_entrada: string;
  ultima_edicao_enviada: string | null;
  proxima_edicao_sugerida: string | null;
  status: "Ativo" | "Pausado" | "Remover";
  cta_provavel: string | null;
  observacoes: string | null;
  leads: { empresa: string | null; nome: string | null; email: string | null; segmento: string | null } | null;
};

export default async function NewsletterPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const t = getT(await getServerLocale());

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const tab = searchParams.tab ?? "ativos";

  let q = supabase
    .from("newsletter")
    .select("*, leads ( empresa, nome, email, segmento )")
    .eq("organizacao_id", orgId)
    .order("data_entrada", { ascending: false });

  if (tab === "ativos")    q = q.eq("status", "Ativo");
  if (tab === "pausados")  q = q.eq("status", "Pausado");
  if (tab === "remover")   q = q.eq("status", "Remover");

  const [{ data: rows }, { data: stats }] = await Promise.all([
    q,
    supabase.from("newsletter").select("status,proxima_edicao_sugerida").eq("organizacao_id", orgId),
  ]);

  const list = (rows ?? []) as unknown as NewsletterRow[];
  const all = (stats ?? []) as { status: string; proxima_edicao_sugerida: string | null }[];

  const hoje = new Date().toISOString().slice(0, 10);
  const kpis = {
    ativos:    all.filter(r => r.status === "Ativo").length,
    pausados:  all.filter(r => r.status === "Pausado").length,
    remover:   all.filter(r => r.status === "Remover").length,
    devidos:   all.filter(r => r.status === "Ativo" && r.proxima_edicao_sugerida && r.proxima_edicao_sugerida <= hoje).length,
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.newsletter_titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("paginas.newsletter_sub")}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <KPI title="Ativos" v={kpis.ativos} icon={<Users className="w-4 h-4"/>} tone="success"/>
        <KPI title="Devidos hoje" v={kpis.devidos} icon={<AlertCircle className="w-4 h-4"/>} tone={kpis.devidos > 0 ? "warning" : "neutral"}/>
        <KPI title="Pausados" v={kpis.pausados} icon={<Calendar className="w-4 h-4"/>} tone="neutral"/>
        <KPI title="A remover" v={kpis.remover} icon={<Mail className="w-4 h-4"/>} tone="neutral"/>
      </div>

      <div className="flex items-center gap-1 border-b border-border mb-4">
        {[
          { k: "ativos", l: "Ativos" },
          { k: "pausados", l: "Pausados" },
          { k: "remover", l: "Remover" },
        ].map(t => (
          <Link key={t.k} href={`/newsletter?tab=${t.k}`}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
              tab === t.k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>{t.l}</Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Lead</th>
                <th className="text-left px-3 py-2 font-semibold">Email</th>
                <th className="text-left px-3 py-2 font-semibold">Entrou</th>
                <th className="text-left px-3 py-2 font-semibold">Última edição</th>
                <th className="text-left px-3 py-2 font-semibold">Próxima sugerida</th>
                <th className="text-left px-3 py-2 font-semibold">CTA provável</th>
                <th className="text-right px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground/70">Nenhum inscrito nesta caixa.</td></tr>
              )}
              {list.map(n => {
                const devido = n.proxima_edicao_sugerida && n.proxima_edicao_sugerida <= hoje;
                return (
                  <tr key={n.id} className={`hover:bg-secondary/60 dark:hover:bg-white/[0.03] ${devido && n.status === "Ativo" ? "bg-warning-500/10" : ""}`}>
                    <td className="px-3 py-2">
                      <Link href={`/pipeline/${n.lead_id}`} className="font-medium hover:text-primary">
                        {n.leads?.empresa || n.leads?.nome || "(?)"}
                      </Link>
                      <div className="text-[10px] text-muted-foreground">{n.leads?.segmento ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{n.leads?.email ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{fmt(n.data_entrada)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{n.ultima_edicao_enviada ? fmt(n.ultima_edicao_enviada) : "—"}</td>
                    <td className={`px-3 py-2 text-xs tabular-nums ${devido ? "text-warning-500 font-medium" : "text-muted-foreground"}`}>
                      {n.proxima_edicao_sugerida ? fmt(n.proxima_edicao_sugerida) : "—"}
                      {devido && n.status === "Ativo" && <span className="ml-1">⏰</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{n.cta_provavel ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <NewsletterRowActions id={n.id} leadId={n.lead_id} status={n.status}/>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPI({ title, v, icon, tone }: { title: string; v: number; icon: React.ReactNode; tone: "neutral" | "success" | "warning" }) {
  const tones = {
    neutral: "bg-secondary dark:bg-white/[0.05] text-muted-foreground",
    success: "bg-success-500/10 text-success-500",
    warning: "bg-warning-500/10 text-warning-500",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">{title}</div>
        <div className="text-2xl font-semibold leading-tight tabular-nums">{v}</div>
      </div>
    </div>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
