import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import type { LeadEnriched } from "@/lib/types";
import { STAGE_COLORS, ETAPAS_PIPELINE_VISIVEL } from "@/lib/lists";
import { ArrowLeft, Users, Target, TrendingUp, DollarSign, AlertCircle, PhoneCall, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

type KpiResp = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  leads_ativos: number;
  qualificados: number;
  raiox_feito: number;
  raiox_pagos: number;
  calls_total: number;
  propostas: number;
  fechados: number;
  newsletter_ativos: number;
  acoes_hoje: number;
  acoes_vencidas: number;
  pipeline_ponderado: number;
  receita_fechada: number;
};

export default async function VendedorPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { periodo?: "7d" | "30d" | "all" };
}) {
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();

  // acesso: gestor vê qualquer um; vendedor/sdr só vê ele mesmo
  if (role !== "gestor" && params.id !== me.id) redirect(`/vendedor/${me.id}`);

  const supabase = createClient();
  const periodo = searchParams.periodo ?? "30d";
  const cut = new Date();
  if (periodo === "7d") cut.setDate(cut.getDate() - 7);
  else if (periodo === "30d") cut.setDate(cut.getDate() - 30);
  else cut.setFullYear(cut.getFullYear() - 5);
  const cutIso = cut.toISOString();

  const [
    { data: kpi },
    membros,
    { data: leads },
    { data: ligacoes7d },
    { data: ligacoes },
  ] = await Promise.all([
    supabase.from("v_kpis_por_responsavel").select("*")
      .eq("organizacao_id", orgId).eq("id", params.id).maybeSingle(),
    listarMembrosDaOrg(orgId),
    supabase.from("v_leads_enriched").select("*")
      .eq("organizacao_id", orgId).eq("responsavel_id", params.id)
      .order("data_proxima_acao", { ascending: true, nullsFirst: false }),
    supabase.from("ligacoes")
      .select("id, atendeu, resultado, data_hora")
      .eq("organizacao_id", orgId).eq("responsavel_id", params.id)
      .gte("data_hora", new Date(Date.now() - 7 * 864e5).toISOString()),
    supabase.from("ligacoes")
      .select("id, atendeu, resultado, data_hora")
      .eq("organizacao_id", orgId).eq("responsavel_id", params.id)
      .gte("data_hora", cutIso),
  ]);

  if (!kpi) notFound();
  const k = kpi as KpiResp;

  const allLeads = (leads ?? []) as LeadEnriched[];
  const leadsPorEtapa = new Map<string, LeadEnriched[]>();
  allLeads.forEach(l => {
    const stage = l.crm_stage ?? "Prospecção";
    if (!leadsPorEtapa.has(stage)) leadsPorEtapa.set(stage, []);
    leadsPorEtapa.get(stage)!.push(l);
  });

  const ligsPeriodo = (ligacoes ?? []) as { atendeu: boolean | null; resultado: string | null; data_hora: string }[];
  const lig7d = (ligacoes7d ?? []) as { atendeu: boolean | null }[];
  const totalLig = ligsPeriodo.length;
  const atenderam = ligsPeriodo.filter(l => l.atendeu).length;
  const qualif = ligsPeriodo.filter(l => l.resultado === "Atendeu e qualificou").length;
  const agendaram = ligsPeriodo.filter(l => l.resultado === "Agendou call").length;
  const atendidasNaSemana = lig7d.filter(l => l.atendeu).length;

  const pipelineLeads = allLeads.filter(l => l.crm_stage && (ETAPAS_PIPELINE_VISIVEL as readonly string[]).includes(l.crm_stage) && l.crm_stage !== "Fechado");
  const vencidas = allLeads.filter(l => l.urgencia === "vencida");
  const hoje = allLeads.filter(l => l.urgencia === "hoje");

  const isGestor = role === "gestor";
  const membroAtual = membros.find(m => m.profile_id === params.id);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {isGestor && (
            <Link href="/time" className="btn-ghost text-muted-foreground hover:text-primary">
              <ArrowLeft className="w-4 h-4"/> Time
            </Link>
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{k.display_name}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="uppercase tracking-[0.12em] text-[10px] font-semibold">{k.role}</span>
              {k.email && <span> · {k.email}</span>}
              {membroAtual && !membroAtual.ativo && <span className="text-destructive"> · inativo</span>}
            </p>
          </div>
        </div>
        <form className="flex items-center gap-1 text-xs">
          {(["7d","30d","all"] as const).map(p => (
            <Link key={p} href={`/vendedor/${params.id}?periodo=${p}`}
              className={`px-2.5 py-1 rounded-md border ${periodo === p ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-secondary/60 dark:hover:bg-white/[0.04]"}`}>
              {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Tudo"}
            </Link>
          ))}
        </form>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPI title="Leads ativos" v={k.leads_ativos} icon={<Users className="w-4 h-4"/>}/>
        <KPI title="Propostas abertas" v={k.propostas} icon={<Target className="w-4 h-4"/>} tone="warning"/>
        <KPI title="Pipeline ponderado"
          v={Number(k.pipeline_ponderado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
          icon={<TrendingUp className="w-4 h-4"/>}/>
        <KPI title="Receita fechada"
          v={Number(k.receita_fechada || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
          icon={<DollarSign className="w-4 h-4"/>} tone="success"/>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Mini label="Qualificados" v={k.qualificados}/>
        <Mini label="Raio-X feito" v={k.raiox_feito}/>
        <Mini label="Raio-X pago" v={k.raiox_pagos ?? 0}/>
        <Mini label="Calls" v={k.calls_total ?? 0}/>
        <Mini label="Fechados" v={k.fechados} tone="success"/>
        <Mini label="Newsletter" v={k.newsletter_ativos ?? 0}/>
      </section>

      {/* Alertas */}
      {(vencidas.length > 0 || hoje.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {vencidas.length > 0 && (
            <div className="card p-4 bg-destructive/10 border-destructive/25 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5"/>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-destructive tabular-nums">{vencidas.length} ação(ões) vencida(s)</div>
                <div className="text-xs text-muted-foreground">Mais antigas: {vencidas.slice(0, 3).map(l => l.empresa ?? "—").join(", ")}{vencidas.length > 3 ? "…" : ""}</div>
              </div>
              <Link href="/hoje" className="btn-secondary text-xs">Ver Hoje</Link>
            </div>
          )}
          {hoje.length > 0 && (
            <div className="card p-4 bg-warning-500/10 border-warning-500/25 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning-500 mt-0.5"/>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-warning-500 tabular-nums">{hoje.length} ação(ões) para hoje</div>
                <div className="text-xs text-muted-foreground">Empresas: {hoje.slice(0, 3).map(l => l.empresa ?? "—").join(", ")}{hoje.length > 3 ? "…" : ""}</div>
              </div>
              <Link href="/hoje" className="btn-secondary text-xs">Ver Hoje</Link>
            </div>
          )}
        </section>
      )}

      {/* Ligações no período */}
      <section className="mb-6">
        <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <PhoneCall className="w-3.5 h-3.5"/> Ligações — {periodo === "7d" ? "7 dias" : periodo === "30d" ? "30 dias" : "histórico"}
        </h2>
        <div className="card p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <Stat label="Total" v={totalLig}/>
          <Stat label="Atenderam" v={atenderam} suf={totalLig > 0 ? `${Math.round((atenderam / totalLig) * 100)}%` : undefined}/>
          <Stat label="Qualificaram" v={qualif}/>
          <Stat label="Agendaram call" v={agendaram}/>
          <Stat label="Atend. 7 dias" v={atendidasNaSemana}/>
        </div>
      </section>

      {/* Funil */}
      <section className="mb-6">
        <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">Funil do vendedor</h2>
        <div className="card p-4">
          <div className="grid grid-cols-2 md:grid-cols-8 gap-2">
            {ETAPAS_PIPELINE_VISIVEL.map(stage => {
              const n = leadsPorEtapa.get(stage)?.length ?? 0;
              const c = STAGE_COLORS[stage];
              return (
                <div key={stage} className={`rounded-lg border ${c.border} ${c.bg} p-2.5`}>
                  <div className={`text-[10px] uppercase tracking-[0.12em] font-semibold ${c.text}`}>{stage}</div>
                  <div className="text-xl font-semibold text-foreground tabular-nums">{n}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Leads no pipeline */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
          Pipeline do vendedor ({pipelineLeads.length})
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Empresa</th>
                  <th className="text-left px-3 py-2 font-semibold">Etapa</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor</th>
                  <th className="text-right px-3 py-2 font-semibold">Prob.</th>
                  <th className="text-right px-3 py-2 font-semibold">Ponderado</th>
                  <th className="text-left px-3 py-2 font-semibold">Próxima ação</th>
                  <th className="text-left px-3 py-2 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pipelineLeads.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground/70">Sem leads no pipeline.</td></tr>
                )}
                {pipelineLeads.slice(0, 50).map(l => {
                  const c = STAGE_COLORS[l.crm_stage ?? "Prospecção"];
                  return (
                    <tr key={l.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
                      <td className="px-3 py-2">
                        <Link href={`/pipeline/${l.id}`} className="font-medium hover:text-primary">
                          {l.empresa || l.nome || "(sem nome)"}
                        </Link>
                        {l.nome && l.empresa && <div className="text-[11px] text-muted-foreground">{l.nome}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded border ${c.border} ${c.bg} ${c.text}`}>
                          {l.crm_stage}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-foreground/80 tabular-nums">
                        {l.valor_potencial > 0 ? l.valor_potencial.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                        {l.probabilidade > 0 ? `${Math.round(l.probabilidade * 100)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground font-medium tabular-nums">
                        {l.receita_ponderada > 0 ? l.receita_ponderada.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[160px]">{l.proxima_acao ?? "—"}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {l.data_proxima_acao ? (
                          <span className={
                            l.urgencia === "vencida" ? "text-destructive font-medium"
                            : l.urgencia === "hoje" ? "text-warning-500 font-medium"
                            : "text-muted-foreground"
                          }>
                            {new Date(l.data_proxima_acao).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {pipelineLeads.length > 50 && (
          <p className="text-xs text-muted-foreground mt-2 tabular-nums">Mostrando 50 de {pipelineLeads.length}. Use <Link href="/pipeline" className="text-primary hover:underline">Pipeline</Link> para ver tudo.</p>
        )}
      </section>
    </div>
  );
}

function KPI({ title, v, icon, tone = "neutral" }: { title: string; v: string | number; icon: React.ReactNode; tone?: "neutral" | "success" | "warning" }) {
  const tones = {
    neutral: "bg-secondary text-muted-foreground dark:bg-white/[0.05]",
    success: "bg-success/15 text-success-500",
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

function Mini({ label, v, tone = "neutral" }: { label: string; v: number; tone?: "neutral" | "success" }) {
  const c = tone === "success" ? "text-success-500" : "text-foreground";
  return (
    <div className="card p-3">
      <div className="label">{label}</div>
      <div className={`text-lg font-semibold leading-tight tabular-nums ${c}`}>{v ?? 0}</div>
    </div>
  );
}

function Stat({ label, v, suf }: { label: string; v: number; suf?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-lg font-semibold leading-tight tabular-nums">
        {v} {suf && <span className="text-xs text-muted-foreground">· {suf}</span>}
      </div>
    </div>
  );
}
