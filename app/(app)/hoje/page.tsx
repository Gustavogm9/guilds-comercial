import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { URGENCIA_LABELS, STAGE_COLORS } from "@/lib/lists";
import QuickActions from "@/components/quick-actions";
import type { LeadEnriched, TopOportunidade } from "@/lib/types";
import { AlertTriangle, Sparkles, Clock, ChevronRight, MessageSquare, Zap, TrendingUp } from "lucide-react";
import BriefingPreCall from "@/components/briefing-pre-call";
import ReativarNutricaoBtn from "@/components/reativar-nutricao-btn";

export const dynamic = "force-dynamic";

export default async function HojePage({ searchParams }: { searchParams: { todos?: string } }) {
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Sem organização ativa</h1>
          <p className="text-sm text-slate-500">Peça ao gestor para te convidar para uma organização.</p>
        </div>
      </div>
    );
  }
  const role = await getCurrentRole();
  const isGestor = role === "gestor";
  const verTodos = searchParams.todos === "1";

  let q = supabase
    .from("v_leads_enriched")
    .select("*")
    .eq("organizacao_id", orgId)
    .in("crm_stage", ["Prospecção","Qualificado","Raio-X Ofertado","Raio-X Feito","Call Marcada","Diagnóstico Pago","Proposta"])
    .order("data_proxima_acao", { ascending: true, nullsFirst: false });

  if (!isGestor || !verTodos) q = q.eq("responsavel_id", me.id);

  // Top oportunidades — ranking por valor_esperado (score × valor) do mesmo escopo
  let qTop = supabase
    .from("v_top_oportunidades")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("valor_esperado", { ascending: false })
    .limit(5);
  if (!isGestor || !verTodos) qTop = qTop.eq("responsavel_id", me.id);

  const [{ data: leads }, { data: topData }] = await Promise.all([q, qTop]);
  const all = (leads ?? []) as LeadEnriched[];
  const top = (topData ?? []) as TopOportunidade[];

  const vencidas = all.filter(l => l.urgencia === "vencida");
  const hoje     = all.filter(l => l.urgencia === "hoje");
  const amanha   = all.filter(l => l.urgencia === "amanha");
  const semana   = all.filter(l => l.urgencia === "esta_semana");
  const semAcao  = all.filter(l => l.urgencia === "sem_acao");

  // KPIs do dia
  const kpis = {
    pendentes: vencidas.length + hoje.length,
    vencidas:  vencidas.length,
    hoje:      hoje.length,
    propostas: all.filter(l => l.crm_stage === "Proposta").length,
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bom dia, {me.display_name.split(" ")[0]}</h1>
          <p className="text-sm text-slate-500">{new Date().toLocaleDateString("pt-BR", { dateStyle: "full" })}</p>
        </div>
        {isGestor && (
          <Link href={verTodos ? "/hoje" : "/hoje?todos=1"} className="btn-ghost text-xs">
            {verTodos ? "Ver só meus" : "Ver de todo o time"}
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
        <KPI title="Pendentes" value={kpis.pendentes} tone="urgent" icon={<AlertTriangle className="w-4 h-4"/>} />
        <KPI title="Vencidas" value={kpis.vencidas} tone={kpis.vencidas > 0 ? "urgent" : "neutral"} icon={<Clock className="w-4 h-4"/>} />
        <KPI title="Hoje" value={kpis.hoje} tone="warning" icon={<Sparkles className="w-4 h-4"/>} />
        <KPI title="Propostas em aberto" value={kpis.propostas} tone="neutral" icon={<MessageSquare className="w-4 h-4"/>} />
      </div>

      <Section title="Vencidas — atacar primeiro" tone="urgent" leads={vencidas} />
      <Section title="Hoje" tone="warning" leads={hoje} />

      {/* Top oportunidades */}
      {top.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm uppercase tracking-wider font-semibold mb-2 text-indigo-600 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Top oportunidades
            <span className="text-slate-400 font-normal">(por potencial de fechamento)</span>
          </h2>
          <ul className="space-y-1.5">
            {top.map(l => <TopRow key={l.id} l={l} />)}
          </ul>
        </section>
      )}

      <Section title="Amanhã" leads={amanha} />
      <Section title="Esta semana" leads={semana} />
      {semAcao.length > 0 && (
        <Section title="Sem próxima ação definida — definir agora" leads={semAcao} />
      )}

      {all.length === 0 && (
        <div className="card p-12 text-center text-slate-500">
          Nada na sua agenda agora. <Link href="/pipeline" className="text-guild-700 underline">Abrir pipeline</Link>.
        </div>
      )}
    </div>
  );
}

function KPI({ title, value, tone = "neutral", icon }: {
  title: string; value: number; tone?: "urgent"|"warning"|"success"|"neutral"; icon?: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    urgent:  "bg-red-50 text-urgent-500",
    warning: "bg-amber-50 text-warning-500",
    success: "bg-emerald-50 text-success-500",
    neutral: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">{title}</div>
        <div className="text-2xl font-semibold leading-tight">{value}</div>
      </div>
    </div>
  );
}

function Section({ title, leads, tone = "neutral" }: { title: string; leads: LeadEnriched[]; tone?: string }) {
  if (leads.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className={`text-sm uppercase tracking-wider font-semibold mb-2 ${tone === "urgent" ? "text-urgent-500" : tone === "warning" ? "text-warning-500" : "text-slate-500"}`}>
        {title} <span className="text-slate-400 font-normal">({leads.length})</span>
      </h2>
      <ul className="space-y-2">
        {leads.map(l => <LeadRow key={l.id} l={l} />)}
      </ul>
    </section>
  );
}

function LeadRow({ l }: { l: LeadEnriched }) {
  const u = URGENCIA_LABELS[l.urgencia];
  const stageColor = l.crm_stage ? STAGE_COLORS[l.crm_stage] : null;
  return (
    <li className="card p-3 md:p-4 hover:shadow-md transition">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/pipeline/${l.id}`}
              className="font-medium hover:text-guild-700 truncate">
              {l.empresa || l.nome || "(sem nome)"}
            </Link>
            {l.crm_stage && stageColor && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
                {l.crm_stage}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${u.color}`}>{u.label}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {l.nome ? `${l.nome} · ` : ""}
            {l.cargo ? `${l.cargo} · ` : ""}
            {l.segmento ?? "—"}
            {l.proxima_acao && <span className="ml-2 text-slate-700">→ {l.proxima_acao}</span>}
            {l.data_proxima_acao && <span className="ml-2">({fmt(l.data_proxima_acao)})</span>}
            {l.dias_sem_tocar > 0 && <span className="ml-2">· {l.dias_sem_tocar}d sem tocar</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {l.crm_stage === "Nutrição" && (
            <ReativarNutricaoBtn leadId={l.id} empresa={l.empresa} nome={l.nome} segmento={l.segmento} motivo={l.motivo_perda} />
          )}
          <QuickActions lead={l} />
          <Link href={`/pipeline/${l.id}`} className="btn-ghost"><ChevronRight className="w-4 h-4"/></Link>
        </div>
      </div>
      {l.crm_stage === "Call Marcada" && (
        <BriefingPreCall leadId={l.id} empresa={l.empresa} nome={l.nome} segmento={l.segmento} dorPrincipal={l.dor_principal} observacoes={l.observacoes} />
      )}
    </li>
  );
}

function TopRow({ l }: { l: TopOportunidade }) {
  const scoreCor =
    l.score >= 70 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : l.score >= 45 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-rose-100 text-rose-700 border-rose-200";
  const stageColor = l.crm_stage ? STAGE_COLORS[l.crm_stage] : null;
  return (
    <li className="card p-3 hover:shadow-md transition bg-indigo-50/30 border-indigo-100">
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-11 h-11 rounded-lg border grid place-items-center font-bold ${scoreCor} shrink-0`}>
          {l.score}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/pipeline/${l.id}`} className="font-medium hover:text-guild-700 truncate">
              {l.empresa || l.nome || "(sem nome)"}
            </Link>
            {l.crm_stage && stageColor && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
                {l.crm_stage}
              </span>
            )}
            {l.percepcao_vendedor && (
              <span className="text-[10px] text-slate-500">
                <TrendingUp className="w-3 h-3 inline mr-0.5" />
                {l.percepcao_vendedor}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {l.proxima_acao ? <span>→ {l.proxima_acao}</span> : <span className="text-slate-400">sem próxima ação</span>}
            {l.data_proxima_acao && <span className="ml-2">({fmt(l.data_proxima_acao)})</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-500">Esperado</div>
          <div className="text-sm font-semibold text-indigo-700">
            {Number(l.valor_esperado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-slate-400">
            de {Number(l.valor_potencial || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
          </div>
        </div>
        <Link href={`/pipeline/${l.id}`} className="btn-ghost shrink-0"><ChevronRight className="w-4 h-4"/></Link>
      </div>
    </li>
  );
}

function fmt(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
