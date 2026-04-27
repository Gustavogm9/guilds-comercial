import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { Users, Target, TrendingUp, AlertCircle, DollarSign, Trophy, CheckCircle2, Circle, Rocket } from "lucide-react";

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
        <h1 className="text-2xl font-semibold tracking-tight">Time comercial</h1>
        <p className="text-sm text-slate-500">KPIs globais e ranking semanal por vendedor.</p>
      </header>

      {/* KPIs globais */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <KPI title="Leads ativos" v={g.leads_ativos ?? 0} icon={<Users className="w-4 h-4"/>}/>
        <KPI title="Propostas" v={g.propostas ?? 0} icon={<Target className="w-4 h-4"/>} tone="warning"/>
        <KPI title="Pipeline ponderado" v={(g.pipeline_ponderado_aberto ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} icon={<TrendingUp className="w-4 h-4"/>}/>
        <KPI title="Receita fechada" v={(g.receita_fechada ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} icon={<DollarSign className="w-4 h-4"/>} tone="success"/>
      </section>

      {(g.acoes_vencidas ?? 0) > 0 && (
        <div className="card p-3 mb-4 bg-red-50 border-red-200 flex items-center gap-2 text-sm text-urgent-500">
          <AlertCircle className="w-4 h-4"/>
          <span><strong>{g.acoes_vencidas}</strong> ações vencidas no time. Cobrar nos 1:1.</span>
        </div>
      )}

      <ActivationChecklist ativacao={ativacao} />

      {/* Meta semanal */}
      {metaSemana && (
        <section className="mb-4">
          <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 mb-2">Meta da semana</h2>
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
        <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 mb-2 flex items-center gap-1">
          <Trophy className="w-3.5 h-3.5"/> Ranking — últimos 7 dias
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Vendedor</th>
                  <th className="text-right px-3 py-2 font-medium">Ativos</th>
                  <th className="text-right px-3 py-2 font-medium">Qualif.</th>
                  <th className="text-right px-3 py-2 font-medium">Raio-X</th>
                  <th className="text-right px-3 py-2 font-medium">Propostas</th>
                  <th className="text-right px-3 py-2 font-medium">Fechados</th>
                  <th className="text-right px-3 py-2 font-medium">Ligs (7d)</th>
                  <th className="text-right px-3 py-2 font-medium">Atend %</th>
                  <th className="text-right px-3 py-2 font-medium">Hoje</th>
                  <th className="text-right px-3 py-2 font-medium">Vencidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12 text-slate-400">Sem dados ainda.</td></tr>
                )}
                {lista.map(k => {
                  const lig = ligacoesPorResp.get(k.id) ?? { total: 0, atenderam: 0, qualif: 0 };
                  const taxa = lig.total > 0 ? Math.round((lig.atenderam / lig.total) * 100) : 0;
                  return (
                    <tr key={k.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/vendedor/${k.id}`} className="hover:text-guild-700">
                          {k.display_name}
                        </Link>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">{k.role}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{k.leads_ativos}</td>
                      <td className="px-3 py-2 text-right">{k.qualificados}</td>
                      <td className="px-3 py-2 text-right">{k.raiox_feito}</td>
                      <td className="px-3 py-2 text-right">{k.propostas}</td>
                      <td className="px-3 py-2 text-right text-emerald-700 font-medium">{k.fechados}</td>
                      <td className="px-3 py-2 text-right">{lig.total}</td>
                      <td className="px-3 py-2 text-right">
                        {lig.total === 0 ? "—" : <span className={taxa < 30 ? "text-urgent-500" : "text-emerald-700"}>{taxa}%</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/hoje?todos=1`} className="text-amber-700 hover:underline">{k.acoes_hoje}</Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {k.acoes_vencidas > 0
                          ? <span className="text-urgent-500 font-medium">{k.acoes_vencidas}</span>
                          : <span className="text-slate-400">0</span>}
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
          <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 flex items-center gap-1">
            <Rocket className="w-3.5 h-3.5" /> Ativacao da conta
          </h2>
          <div className="text-lg font-semibold mt-1">{doneCount}/{items.length} marcos concluidos</div>
        </div>
        <div className="w-full md:w-64">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-guild-600 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-500 mt-1 text-right">{pct}%</div>
        </div>
      </div>
      <div className="grid md:grid-cols-5 gap-2 mt-4">
        {items.map((item) => (
          <div key={item.label} className={item.done ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"}>
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
    neutral: "bg-slate-100 text-slate-600",
    success: "bg-emerald-50 text-success-500",
    warning: "bg-amber-50 text-warning-500",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider">{title}</div>
        <div className="text-xl font-semibold leading-tight truncate">{v}</div>
      </div>
    </div>
  );
}

function Meta({ label, meta, feito }: { label: string; meta: number; feito: number | null }) {
  const pct = feito === null ? null : Math.min(100, Math.round((feito / meta) * 100));
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-base font-semibold leading-tight">
        {feito ?? "—"} <span className="text-xs text-slate-400">/ {meta}</span>
      </div>
      {pct !== null && (
        <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-400"}`}
               style={{ width: `${pct}%` }}/>
        </div>
      )}
    </div>
  );
}
