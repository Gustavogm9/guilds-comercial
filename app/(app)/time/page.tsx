import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { Users, Target, TrendingUp, AlertCircle, DollarSign, Trophy, CheckCircle2, Circle, Rocket } from "lucide-react";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type KpiResp = {
  id: string;
  display_name: string;
  role: string;
  leads_ativos: number;
  qualificados: number;
  raiox_feito: number;
  propostas: number;
  fechados: number;
  acoes_hoje: number;
  acoes_vencidas: number;
};

type KpiGlobal = {
  leads_ativos: number;
  qualificados: number;
  raiox_feito: number;
  propostas: number;
  fechados: number;
  acoes_vencidas: number;
  pipeline_ponderado_aberto: number;
  receita_fechada: number;
};

type AtivacaoOrg = {
  membros_ativos: number | null;
  convites_pendentes: number | null;
  leads_total: number | null;
  leads_movidos: number | null;
  ia_sucesso_30d: number | null;
  api_keys_ativas: number | null;
  webhooks_ativos: number | null;
};

export default async function TimePage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  const t = getT(await getServerLocale());

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const supabaseAny = supabase as any;
  const sete_dias_atras = new Date();
  sete_dias_atras.setDate(sete_dias_atras.getDate() - 7);

  const [{ data: kpisGlobal }, { data: kpisResp }, { data: ligacoes7d }, { data: metaSemana }, { data: ativacaoData }] = await Promise.all([
    supabase.from("v_kpis_globais").select("*").eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("v_kpis_por_responsavel").select("*").eq("organizacao_id", orgId).order("display_name"),
    supabase.from("ligacoes")
      .select("responsavel_id, atendeu, resultado")
      .eq("organizacao_id", orgId)
      .gte("data_hora", sete_dias_atras.toISOString()),
    supabase.from("meta_semanal")
      .select("*")
      .eq("organizacao_id", orgId)
      .lte("inicio", new Date().toISOString().slice(0, 10))
      .gte("fim", new Date().toISOString().slice(0, 10))
      .maybeSingle(),
    supabaseAny.from("v_ativacao_org").select("*").eq("organizacao_id", orgId).maybeSingle(),
  ]);

  const g = (kpisGlobal ?? {}) as KpiGlobal;
  const lista = ((kpisResp ?? []) as KpiResp[]).filter(k => k.role !== "gestor" || k.leads_ativos > 0);
  const ligs = (ligacoes7d ?? []) as { responsavel_id: string | null; atendeu: boolean | null; resultado: string | null }[];
  const ativacao = (ativacaoData ?? {}) as AtivacaoOrg;

  // Agrupa ligações por responsável (últimos 7d)
  const ligacoesPorResp = new Map<string, { total: number; atenderam: number; qualif: number }>();
  ligs.forEach(l => {
    if (!l.responsavel_id) return;
    const cur = ligacoesPorResp.get(l.responsavel_id) ?? { total: 0, atenderam: 0, qualif: 0 };
    cur.total++;
    if (l.atendeu) cur.atenderam++;
    if (l.resultado === "Atendeu e qualificou") cur.qualif++;
    ligacoesPorResp.set(l.responsavel_id, cur);
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.time_titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("paginas.time_sub")}</p>
      </header>

      {/* KPIs globais */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <KPI title="Leads ativos" v={g.leads_ativos ?? 0} icon={<Users className="w-4 h-4"/>}/>
        <KPI title="Propostas" v={g.propostas ?? 0} icon={<Target className="w-4 h-4"/>} tone="warning"/>
        <KPI title="Pipeline ponderado" v={(g.pipeline_ponderado_aberto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} icon={<TrendingUp className="w-4 h-4"/>}/>
        <KPI title="Receita fechada" v={(g.receita_fechada ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} icon={<DollarSign className="w-4 h-4"/>} tone="success"/>
      </section>

      {(g.acoes_vencidas ?? 0) > 0 && (
        <div className="card p-3 mb-4 bg-destructive/10 border-destructive/25 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4"/>
          <span><strong className="tabular-nums">{g.acoes_vencidas}</strong> ações vencidas no time. Cobrar nos 1:1.</span>
        </div>
      )}

      <ActivationChecklist ativacao={ativacao} />

      {/* Meta semanal */}
      {metaSemana && (
        <section className="mb-4">
          <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">Meta da semana</h2>
          <div className="card p-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <Meta label="Leads novos"  meta={metaSemana.meta_leads}  feito={null}/>
            <Meta label="Respondidos"  meta={metaSemana.meta_resp}   feito={null}/>
            <Meta label="Raio-X"       meta={metaSemana.meta_raiox}  feito={g.raiox_feito ?? 0}/>
            <Meta label="Calls"        meta={metaSemana.meta_calls}  feito={null}/>
            <Meta label="Propostas"    meta={metaSemana.meta_props}  feito={g.propostas ?? 0}/>
            <Meta label="Fechamentos"  meta={metaSemana.meta_fech}   feito={g.fechados ?? 0}/>
          </div>
        </section>
      )}

      {/* Ranking por vendedor */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <Trophy className="w-3.5 h-3.5"/> Ranking — últimos 7 dias
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Vendedor</th>
                  <th className="text-right px-3 py-2 font-semibold">Ativos</th>
                  <th className="text-right px-3 py-2 font-semibold">Qualif.</th>
                  <th className="text-right px-3 py-2 font-semibold">Raio-X</th>
                  <th className="text-right px-3 py-2 font-semibold">Propostas</th>
                  <th className="text-right px-3 py-2 font-semibold">Fechados</th>
                  <th className="text-right px-3 py-2 font-semibold">Ligs (7d)</th>
                  <th className="text-right px-3 py-2 font-semibold">Atend %</th>
                  <th className="text-right px-3 py-2 font-semibold">Hoje</th>
                  <th className="text-right px-3 py-2 font-semibold">Vencidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12 text-muted-foreground/70">Sem dados ainda.</td></tr>
                )}
                {lista.map(k => {
                  const lig = ligacoesPorResp.get(k.id) ?? { total: 0, atenderam: 0, qualif: 0 };
                  const taxa = lig.total > 0 ? Math.round((lig.atenderam / lig.total) * 100) : 0;
                  return (
                    <tr key={k.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.03]">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/vendedor/${k.id}`} className="hover:text-primary">
                          {k.display_name}
                        </Link>
                        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{k.role}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{k.leads_ativos}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{k.qualificados}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{k.raiox_feito}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{k.propostas}</td>
                      <td className="px-3 py-2 text-right text-success-500 font-medium tabular-nums">{k.fechados}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{lig.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {lig.total === 0 ? "—" : <span className={taxa < 30 ? "text-destructive" : "text-success-500"}>{taxa}%</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Link href={`/hoje?todos=1`} className="text-warning-500 hover:underline">{k.acoes_hoje}</Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {k.acoes_vencidas > 0
                          ? <span className="text-destructive font-medium">{k.acoes_vencidas}</span>
                          : <span className="text-muted-foreground/70">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function ActivationChecklist({ ativacao }: { ativacao: AtivacaoOrg }) {
  const items = [
    { label: "Convidar pelo menos 1 pessoa", done: (ativacao.membros_ativos ?? 0) >= 2 || (ativacao.convites_pendentes ?? 0) > 0 },
    { label: "Adicionar 5 leads", done: (ativacao.leads_total ?? 0) >= 5 },
    { label: "Mover lead no pipeline", done: (ativacao.leads_movidos ?? 0) >= 1 },
    { label: "Usar IA em um lead", done: (ativacao.ia_sucesso_30d ?? 0) >= 1 },
    { label: "Configurar integracao", done: (ativacao.api_keys_ativas ?? 0) > 0 || (ativacao.webhooks_ativos ?? 0) > 0 },
  ];
  const doneCount = items.filter((item) => item.done).length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <section className="card p-4 mb-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground flex items-center gap-1">
            <Rocket className="w-3.5 h-3.5" /> Ativacao da conta
          </h2>
          <div className="text-lg font-semibold mt-1 tabular-nums">{doneCount}/{items.length} marcos concluidos</div>
        </div>
        <div className="w-full md:w-64">
          <div className="h-2 bg-secondary dark:bg-white/[0.05] rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1 text-right tabular-nums">{pct}%</div>
        </div>
      </div>
      <div className="grid md:grid-cols-5 gap-2 mt-4">
        {items.map((item) => (
          <div key={item.label} className={item.done ? "rounded-lg border border-success-500/25 bg-success-500/10 px-3 py-2 text-sm text-success-500" : "rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground"}>
            <div className="flex items-center gap-2">
              {item.done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              <span>{item.label}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KPI({ title, v, icon, tone = "neutral" }: { title: string; v: string | number; icon: React.ReactNode; tone?: "neutral" | "success" | "warning" }) {
  const tones = {
    neutral: "bg-secondary dark:bg-white/[0.05] text-muted-foreground",
    success: "bg-success-500/10 text-success-500",
    warning: "bg-warning-500/10 text-warning-500",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">{title}</div>
        <div className="text-xl font-semibold leading-tight truncate tabular-nums">{v}</div>
      </div>
    </div>
  );
}

function Meta({ label, meta, feito }: { label: string; meta: number; feito: number | null }) {
  const pct = feito === null ? null : Math.min(100, Math.round((feito / meta) * 100));
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-base font-semibold leading-tight tabular-nums">
        {feito ?? "—"} <span className="text-xs text-muted-foreground/70">/ {meta}</span>
      </div>
      {pct !== null && (
        <div className="h-1.5 bg-secondary dark:bg-white/[0.05] rounded-full mt-1 overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-success-500" : pct >= 60 ? "bg-warning-500" : "bg-destructive"}`}
               style={{ width: `${pct}%` }}/>
        </div>
      )}
    </div>
  );
}
