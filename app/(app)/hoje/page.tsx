import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { ETAPAS_PIPELINE_VISIVEL, STAGE_COLORS, getUrgenciaLabel } from "@/lib/lists";
import QuickActions from "@/components/quick-actions";
import ActivationChecklist from "@/components/activation-checklist";
import FollowupProposalAlert from "@/components/followup-proposal-alert";
import PedidosIndicacaoAlert, { type PedidoPendenteHoje } from "@/components/pedidos-indicacao-alert";
import NpsPendenteAlert, { type NpsPendenteHoje } from "@/components/nps-pendente-alert";
import HealthEmRiscoAlert, { type HealthEmRiscoHoje } from "@/components/health-em-risco-alert";
import ExpansoesAtrasadasAlert, { type ExpansaoAtrasadaHoje } from "@/components/expansoes-atrasadas-alert";
import RenovacoesProximasAlert, { type RenovacaoProximaHoje } from "@/components/renovacoes-proximas-alert";
import type { LeadEnriched, TopOportunidade, UrgenciaRenovacao } from "@/lib/types";
import { AlertTriangle, Sparkles, Clock, ChevronRight, MessageSquare, Zap, TrendingUp, Upload, UserPlus, Kanban, X } from "lucide-react";
import BriefingPreCall from "@/components/briefing-pre-call";
import { getServerLocale, getT, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Cockpit do dia — leads que precisam de ação hoje, agrupados por urgência.
 *
 * Fixes desta rodada:
 *   - Bug 2: Top oportunidades agora filtra por crm_stage IN ETAPAS_PIPELINE_VISIVEL
 *     (antes pegava também Fechado/Perdido/Nutrição).
 *   - Bug 3: Removido ReativarNutricaoBtn do LeadRow — era dead code (a query
 *     filtra fora Nutrição). O botão fica só no detalhe do lead.
 *   - Issue 18: KPI "Hoje" agora vira neutral quando 0 (consistente com Vencidas).
 *   - Issue 19: Top oportunidades movido pro topo (acima dos blocos temporais).
 *   - Issues 8-10: i18n via getUrgenciaLabel + t() pra stages e "dias sem tocar".
 *   - Issue 13: Currency lê de organizacoes.moeda_padrao em vez de hardcoded BRL.
 */
export default async function HojePage(props: { searchParams: Promise<{ todos?: string; welcome?: string }> }) {
  const searchParams = await props.searchParams;
  const isWelcome = searchParams.welcome === "1";
  const supabase = createClient();
  const locale = await getServerLocale();
  const t = getT(locale);
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="card p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">{t("hoje.sem_organizacao")}</h1>
          <p className="text-sm text-muted-foreground">{t("hoje.sem_organizacao_msg")}</p>
        </div>
      </div>
    );
  }
  const role = await getCurrentRole();
  const isGestor = role === "gestor";
  const verTodos = searchParams.todos === "1";

  // Issue 13: lê moeda da org (default BRL se não setada)
  const { data: orgRow } = await supabase
    .from("organizacoes")
    .select("moeda_padrao")
    .eq("id", orgId)
    .maybeSingle();
  const currency = ((orgRow as any)?.moeda_padrao as string) || "BRL";

  // Issue 2: usa ETAPAS_PIPELINE_VISIVEL como source of truth (mesmo que /pipeline)
  const etapasVisiveis = [...ETAPAS_PIPELINE_VISIVEL];

  let q = supabase
    .from("v_leads_enriched")
    .select("*")
    .eq("organizacao_id", orgId)
    .in("crm_stage", etapasVisiveis)
    .order("data_proxima_acao", { ascending: true, nullsFirst: false });

  if (!isGestor || !verTodos) q = q.eq("responsavel_id", me.id);

  // Top oportunidades — Bug 2: agora filtra também por crm_stage ativo
  let qTop = supabase
    .from("v_top_oportunidades")
    .select("*")
    .eq("organizacao_id", orgId)
    .in("crm_stage", etapasVisiveis)
    .order("valor_esperado", { ascending: false })
    .limit(5);
  if (!isGestor || !verTodos) qTop = qTop.eq("responsavel_id", me.id);

  // Pedidos de indicação pendentes (lado direito do funil borboleta).
  // Só do user autenticado (mesmo gestor — pedido é responsabilidade individual,
  // ele vê os do time só quando entra em /indicacoes).
  let qPedidos = supabase
    .from("v_pedidos_pendentes")
    .select("pedido_id, lead_id, lead_empresa, lead_nome, data_pedido, dias_pendente, lead_responsavel_id")
    .eq("organizacao_id", orgId)
    .order("data_pedido", { ascending: true })
    .limit(20);
  if (!isGestor || !verTodos) qPedidos = qPedidos.eq("lead_responsavel_id", me.id);

  // NPS pendentes (vendedor precisa registrar a resposta do cliente)
  let qNpsPendentes = supabase
    .from("v_nps_pendente_responder")
    .select("nps_id, lead_id, lead_empresa, lead_nome, solicitado_em, dias_pendente, lead_responsavel_id")
    .eq("organizacao_id", orgId)
    .order("solicitado_em", { ascending: true })
    .limit(20);
  if (!isGestor || !verTodos) qNpsPendentes = qNpsPendentes.eq("lead_responsavel_id", me.id);

  // Clientes em risco de churn (health_score < 40)
  let qHealthRisco = supabase
    .from("v_health_score")
    .select("lead_id, lead_empresa, lead_nome, health_score, dias_sem_interacao, lead_responsavel_id")
    .eq("organizacao_id", orgId)
    .eq("categoria", "em_risco")
    .order("health_score", { ascending: true })
    .limit(20);
  if (!isGestor || !verTodos) qHealthRisco = qHealthRisco.eq("lead_responsavel_id", me.id);

  // Expansões com próxima ação atrasada (lado direito do funil em ação)
  let qExpansoesAtrasadas = supabase
    .from("v_expansoes_atrasadas")
    .select("expansao_id, cliente_lead_id, cliente_empresa, cliente_nome, titulo, proxima_acao, dias_atrasada, valor_potencial, estagio, responsavel_id")
    .eq("organizacao_id", orgId)
    .order("dias_atrasada", { ascending: false })
    .limit(20);
  if (!isGestor || !verTodos) qExpansoesAtrasadas = qExpansoesAtrasadas.eq("responsavel_id", me.id);

  // Renovações urgentes (vencidas, críticas <=7d, urgentes <=30d). 30-90d ficam só em /pos-venda
  let qRenovacoes = supabase
    .from("v_renovacoes_proximas")
    .select("lead_id, cliente_empresa, cliente_nome, data_renovacao, dias_ate_renovacao, urgencia, valor_previsto, tem_expansao_ativa, responsavel_id")
    .eq("organizacao_id", orgId)
    .in("urgencia", ["vencida", "critica", "urgente"])
    .order("dias_ate_renovacao", { ascending: true })
    .limit(20);
  if (!isGestor || !verTodos) qRenovacoes = qRenovacoes.eq("responsavel_id", me.id);

  const [
    { data: leads },
    { data: topData },
    { data: pedidosData },
    { data: npsData },
    { data: healthData },
    { data: expansoesData },
    { data: renovacoesData },
  ] = await Promise.all([q, qTop, qPedidos, qNpsPendentes, qHealthRisco, qExpansoesAtrasadas, qRenovacoes]);
  const all = (leads ?? []) as LeadEnriched[];
  const top = (topData ?? []) as TopOportunidade[];
  const pedidosIndicacao = ((pedidosData ?? []) as Array<{
    pedido_id: number;
    lead_id: number;
    lead_empresa: string | null;
    lead_nome: string | null;
    data_pedido: string;
    dias_pendente: number;
  }>).map<PedidoPendenteHoje>((p) => ({
    pedido_id: p.pedido_id,
    lead_id: p.lead_id,
    lead_empresa: p.lead_empresa,
    lead_nome: p.lead_nome,
    data_pedido: p.data_pedido,
    dias_pendente: p.dias_pendente,
  }));
  const npsPendentes = ((npsData ?? []) as Array<{
    nps_id: number;
    lead_id: number;
    lead_empresa: string | null;
    lead_nome: string | null;
    solicitado_em: string;
    dias_pendente: number;
  }>).map<NpsPendenteHoje>((n) => ({
    nps_id: n.nps_id,
    lead_id: n.lead_id,
    lead_empresa: n.lead_empresa,
    lead_nome: n.lead_nome,
    solicitado_em: n.solicitado_em,
    dias_pendente: n.dias_pendente,
  }));
  const healthRisco = ((healthData ?? []) as Array<{
    lead_id: number;
    lead_empresa: string | null;
    lead_nome: string | null;
    health_score: number;
    dias_sem_interacao: number;
  }>).map<HealthEmRiscoHoje>((h) => ({
    lead_id: h.lead_id,
    lead_empresa: h.lead_empresa,
    lead_nome: h.lead_nome,
    health_score: h.health_score,
    dias_sem_interacao: h.dias_sem_interacao,
  }));
  const expansoesAtrasadas = ((expansoesData ?? []) as Array<{
    expansao_id: number;
    cliente_lead_id: number;
    cliente_empresa: string | null;
    cliente_nome: string | null;
    titulo: string;
    proxima_acao: string | null;
    dias_atrasada: number;
    valor_potencial: number;
    estagio: string;
  }>).map<ExpansaoAtrasadaHoje>((e) => ({
    expansao_id: e.expansao_id,
    cliente_lead_id: e.cliente_lead_id,
    cliente_empresa: e.cliente_empresa,
    cliente_nome: e.cliente_nome,
    titulo: e.titulo,
    proxima_acao: e.proxima_acao,
    dias_atrasada: e.dias_atrasada,
    valor_potencial: e.valor_potencial,
    estagio: e.estagio,
  }));
  const renovacoesProximas = ((renovacoesData ?? []) as Array<{
    lead_id: number;
    cliente_empresa: string | null;
    cliente_nome: string | null;
    data_renovacao: string;
    dias_ate_renovacao: number;
    urgencia: UrgenciaRenovacao;
    valor_previsto: number;
    tem_expansao_ativa: boolean;
  }>).map<RenovacaoProximaHoje>((r) => ({
    lead_id: r.lead_id,
    cliente_empresa: r.cliente_empresa,
    cliente_nome: r.cliente_nome,
    data_renovacao: r.data_renovacao,
    dias_ate_renovacao: r.dias_ate_renovacao,
    urgencia: r.urgencia,
    valor_previsto: r.valor_previsto,
    tem_expansao_ativa: r.tem_expansao_ativa,
  }));

  // --------------------------------------------------------
  // Dados de ativação por role — para o ActivationChecklist
  // Queries leves: COUNT + EXISTS. Falhas silenciosas (catch).
  // --------------------------------------------------------
  const [activationLeads, activationMembros, activationCadencia, activationLigacoes, activationRespostas] =
    await Promise.allSettled([
      // 1. Leads criados pelo usuário ou qualificados (proxy de "1º lead no pipeline")
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId).eq("responsavel_id", me.id),
      // 2. Membros convidados (gestor: enviou convites)
      supabase.from("convites").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId),
      // 3. Cadência iniciada (qualquer passo registrado)
      supabase.from("cadencia").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId),
      // 4. Ligações registradas pelo usuário
      supabase.from("ligacoes").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId).eq("responsavel_id", me.id),
      // 5. Passos de cadência respondidos
      supabase.from("cadencia").select("id", { count: "exact", head: true })
        .eq("organizacao_id", orgId).eq("status", "respondido"),
    ]);

  const countLeads = activationLeads.status === "fulfilled" ? (activationLeads.value.count ?? 0) : 0;
  const countMembros = activationMembros.status === "fulfilled" ? (activationMembros.value.count ?? 0) : 0;
  const countCadencia = activationCadencia.status === "fulfilled" ? (activationCadencia.value.count ?? 0) : 0;
  const countLigacoes = activationLigacoes.status === "fulfilled" ? (activationLigacoes.value.count ?? 0) : 0;
  const countRespostas = activationRespostas.status === "fulfilled" ? (activationRespostas.value.count ?? 0) : 0;

  // Leads qualificados (crm_stage avançou de Prospecção)
  const leadsQualificados = all.filter(
    l => l.responsavel_id === me.id &&
    !["Prospecção", "Base"].includes(l.crm_stage ?? "")
  ).length;

  // Monta marcos por role
  type Marco = { id: string; label: string; feito: boolean; href?: string; hrefLabel?: string };
  let marcos: Marco[] = [];

  if (role === "gestor") {
    marcos = [
      { id: "lead", label: "Adicionar o 1º lead ao pipeline", feito: countLeads > 0, href: "/base", hrefLabel: "Ir para a base →" },
      { id: "membro", label: "Convidar 1 membro do time", feito: countMembros > 1, href: "/equipe", hrefLabel: "Ir para equipe →" },
      { id: "cadencia", label: "Iniciar 1 cadência de outreach", feito: countCadencia > 0, href: "/cadencia", hrefLabel: "Ver cadência →" },
    ];
  } else if (role === "comercial") {
    marcos = [
      { id: "lead", label: "Registrar 1º lead como responsável", feito: countLeads > 0, href: "/base", hrefLabel: "Ir para a base →" },
      { id: "qualificado", label: "Qualificar 1 lead (mover no pipeline)", feito: leadsQualificados > 0, href: "/pipeline", hrefLabel: "Ver pipeline →" },
      { id: "ligacao", label: "Registrar 1ª ligação ou interação", feito: countLigacoes > 0, href: "/ligacoes", hrefLabel: "Registrar ligação →" },
    ];
  } else {
    // sdr
    marcos = [
      { id: "lead", label: "Prospectar 1º lead na base", feito: countLeads > 0, href: "/base", hrefLabel: "Ir para a base →" },
      { id: "qualificado", label: "Qualificar 1 lead com o comercial", feito: leadsQualificados > 0, href: "/pipeline", hrefLabel: "Ver pipeline →" },
      { id: "resposta", label: "Registrar 1ª resposta na cadência", feito: countRespostas > 0, href: "/cadencia", hrefLabel: "Ver cadência →" },
    ];
  }

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

  // Propostas paradas: crm_stage=Proposta, dias_sem_tocar >= 3, sem ação futura
  const hoje_str = new Date().toISOString().slice(0, 10);
  const propostasParadas = all.filter(l =>
    l.crm_stage === "Proposta" &&
    (l.dias_sem_tocar ?? 0) >= 3 &&
    (!l.data_proxima_acao || l.data_proxima_acao < hoje_str)
  ).map(l => ({
    id: l.id,
    empresa: l.empresa,
    nome: l.nome,
    dias_sem_tocar: l.dias_sem_tocar ?? 0,
    valor_potencial: l.valor_potencial ?? 0,
  }));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("hoje.bom_dia")} {me.display_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString(locale, { dateStyle: "full" })}</p>
        </div>
        {isGestor && (
          <Link href={verTodos ? "/hoje" : "/hoje?todos=1"} className="btn-ghost text-xs">
            {verTodos ? t("hoje.ver_so_meus") : t("hoje.ver_todos_time")}
          </Link>
        )}
      </div>

      {/* Checklist de ativação por role — some quando tudo concluído ou dispensado */}
      <ActivationChecklist role={role as "gestor" | "comercial" | "sdr"} marcos={marcos} userId={me.id} />

      {/* Alerta de propostas paradas há 3+ dias */}
      <FollowupProposalAlert
        leads={propostasParadas}
        userId={me.id}
        currency={currency}
        locale={locale}
      />

      {/* Pedidos de indicação pendentes — lado direito do funil borboleta */}
      <PedidosIndicacaoAlert pedidos={pedidosIndicacao} />

      {/* NPS pendente de coleta — fecha o ciclo do funil borboleta */}
      <NpsPendenteAlert npsList={npsPendentes} />

      {/* Clientes em risco de churn — alerta vermelho pra reativar antes do não-renew */}
      <HealthEmRiscoAlert leads={healthRisco} />

      {/* Expansões com próxima ação atrasada — pipeline pós-venda parado */}
      <ExpansoesAtrasadasAlert expansoes={expansoesAtrasadas} />

      {/* Renovações iminentes (vencida, ≤7d, ≤30d) — receita garantida no horizonte curto */}
      <RenovacoesProximasAlert renovacoes={renovacoesProximas} />

      {/* Banner de boas-vindas para colaboradores recém-convidados */}
      {isWelcome && (
        <div className="mb-6 p-4 rounded-xl bg-primary/8 border border-primary/20 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-9 h-9 rounded-lg bg-primary grid place-items-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground text-sm" style={{ letterSpacing: "-0.13px" }}>
              Seja bem-vindo(a) ao Guilds Comercial, {me.display_name.split(" ")[0]}! 🎉
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Você acaba de entrar como <span className="font-medium text-foreground capitalize">{role}</span>. Comece explorando
              {" "}<Link href="/hoje" className="text-primary hover:underline">seu cockpit diário</Link>,
              {" "}<Link href="/base" className="text-primary hover:underline">a base de leads</Link> ou
              {" "}<Link href="/pipeline" className="text-primary hover:underline">o pipeline</Link>.
            </p>
          </div>
          <Link href="/hoje" replace className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Fechar">
            <X className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
        <KPI title={t("hoje.kpi_pendentes")} value={kpis.pendentes} tone={kpis.pendentes > 0 ? "urgent" : "neutral"} icon={<AlertTriangle className="w-4 h-4"/>} />
        <KPI title={t("hoje.kpi_vencidas")} value={kpis.vencidas} tone={kpis.vencidas > 0 ? "urgent" : "neutral"} icon={<Clock className="w-4 h-4"/>} />
        {/* Issue 18: tone condicional — não fica âmbar se 0 */}
        <KPI title={t("hoje.kpi_hoje")} value={kpis.hoje} tone={kpis.hoje > 0 ? "warning" : "neutral"} icon={<Sparkles className="w-4 h-4"/>} />
        <KPI title={t("hoje.kpi_propostas_abertas")} value={kpis.propostas} tone="neutral" icon={<MessageSquare className="w-4 h-4"/>} />
      </div>

      {/* Issue 19: Top oportunidades MOVIDO PRO TOPO — prioridade independente de urgência */}
      {top.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold mb-2 text-primary flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> {t("hoje.section_top")}
            <span className="text-muted-foreground font-normal normal-case tracking-normal">{t("hoje.section_top_sub")}</span>
          </h2>
          <ul className="space-y-1.5">
            {top.map(l => <TopRow key={l.id} l={l} t={t} locale={locale} currency={currency} />)}
          </ul>
        </section>
      )}

      <Section title={t("hoje.section_vencidas")} tone="urgent" leads={vencidas} t={t} locale={locale} />
      <Section title={t("hoje.section_hoje")} tone="warning" leads={hoje} t={t} locale={locale} />
      <Section title={t("hoje.section_amanha")} leads={amanha} t={t} locale={locale} />
      <Section title={t("hoje.section_semana")} leads={semana} t={t} locale={locale} />
      {semAcao.length > 0 && (
        <Section title={t("hoje.section_sem_acao")} leads={semAcao} t={t} locale={locale} />
      )}

      {all.length === 0 && (
        <div className="card p-10 text-center space-y-6">
          {/* Ícone animado */}
          <div className="w-16 h-16 rounded-2xl bg-primary/10 grid place-items-center mx-auto">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground" style={{ letterSpacing: "-0.24px" }}>
              {t("hoje.vazio_titulo") || "Tudo pronto para começar"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {t("hoje.vazio_msg_novo") || "Seu pipeline está vazio. Adicione seus primeiros leads e comece a trabalhar as oportunidades."}
            </p>
          </div>
          {/* Ações primárias */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/base/importar" className="btn-primary text-sm inline-flex items-center gap-2">
              <Upload className="w-4 h-4" /> Importar lista (CSV)
            </Link>
            <Link href="/base" className="btn-secondary text-sm inline-flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Cadastrar lead
            </Link>
            <Link href="/pipeline" className="btn-ghost text-sm inline-flex items-center gap-2">
              <Kanban className="w-4 h-4" /> Ver pipeline
            </Link>
          </div>
          {/* Dica contextual */}
          <p className="text-xs text-muted-foreground">
            💡 Dica: comece importando sua lista atual de prospects no formato CSV — leva menos de 2 minutos.
          </p>
        </div>
      )}
    </div>
  );
}

function KPI({ title, value, tone = "neutral", icon }: {
  title: string; value: number; tone?: "urgent"|"warning"|"success"|"neutral"; icon?: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    urgent:  "bg-destructive/10 text-destructive",
    warning: "bg-warning-500/10 text-warning-500",
    success: "bg-success-500/10 text-success-500",
    neutral: "bg-secondary text-foreground/80",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">{title}</div>
        <div className="text-2xl font-semibold leading-tight text-foreground tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function Section({ title, leads, tone = "neutral", t, locale }: {
  title: string;
  leads: LeadEnriched[];
  tone?: string;
  t: (k: string) => string;
  locale: Locale;
}) {
  if (leads.length === 0) return null;
  const titleColor =
    tone === "urgent"  ? "text-destructive" :
    tone === "warning" ? "text-warning-500" :
    "text-muted-foreground";
  return (
    <section className="mb-6">
      <h2 className={`text-[11px] uppercase tracking-[0.12em] font-semibold mb-2 ${titleColor}`}>
        {title} <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">({leads.length})</span>
      </h2>
      <ul className="space-y-2">
        {leads.map(l => <LeadRow key={l.id} l={l} t={t} locale={locale} />)}
      </ul>
    </section>
  );
}

function LeadRow({ l, t, locale }: {
  l: LeadEnriched;
  t: (k: string) => string;
  locale: Locale;
}) {
  // Issue 4: getUrgenciaLabel é safe-fallback se l.urgencia for inválido
  const u = getUrgenciaLabel(l.urgencia);
  // Issue 8: traduz label da urgência
  const urgenciaLabel = t(`urgencia.${l.urgencia ?? "sem_acao"}`);
  const stageColor = l.crm_stage ? STAGE_COLORS[l.crm_stage] : null;
  // Issue 9: traduz label da etapa
  const stageLabel = l.crm_stage ? t(`pipeline_etapas.${l.crm_stage}`) : null;
  return (
    <li className="card p-3 md:p-4 transition-all hover:border-primary/30 hover:bg-secondary/40 dark:hover:bg-white/[0.03]">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/pipeline/${l.id}`}
              className="font-medium text-foreground hover:text-primary truncate transition-colors"
              style={{ letterSpacing: "-0.13px" }}
            >
              {l.empresa || l.nome || t("lead.sem_nome")}
            </Link>
            {l.crm_stage && stageColor && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-[0.1em] font-semibold ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
                {stageLabel}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${u.color}`}>{urgenciaLabel}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {l.nome ? `${l.nome} · ` : ""}
            {l.cargo ? `${l.cargo} · ` : ""}
            {l.segmento ?? "—"}
            {l.proxima_acao && <span className="ml-2 text-foreground/80">→ {l.proxima_acao}</span>}
            {l.data_proxima_acao && <span className="ml-2 tabular-nums">({fmt(l.data_proxima_acao, locale)})</span>}
            {l.dias_sem_tocar > 0 && (
              <span className="ml-2 tabular-nums">
                · {t("hoje.lead_dias_sem_tocar").replace("{{n}}", String(l.dias_sem_tocar))}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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

function TopRow({ l, t, locale, currency }: {
  l: TopOportunidade;
  t: (k: string) => string;
  locale: string;
  currency: string;
}) {
  const scoreCor =
    l.score >= 70 ? "bg-success-500/15 text-success-500 border-success-500/30"
    : l.score >= 45 ? "bg-warning-500/15 text-warning-500 border-warning-500/30"
    : "bg-destructive/15 text-destructive border-destructive/30";
  const stageColor = l.crm_stage ? STAGE_COLORS[l.crm_stage] : null;
  const stageLabel = l.crm_stage ? t(`pipeline_etapas.${l.crm_stage}`) : null;
  return (
    <li className="card p-3 transition-all hover:border-primary/40 bg-primary/[0.03] dark:bg-primary/[0.06]">
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-11 h-11 rounded-lg border grid place-items-center font-bold tabular-nums ${scoreCor} shrink-0`}>
          {l.score}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/pipeline/${l.id}`}
              className="font-medium text-foreground hover:text-primary truncate transition-colors"
              style={{ letterSpacing: "-0.13px" }}
            >
              {l.empresa || l.nome || t("lead.sem_nome")}
            </Link>
            {l.crm_stage && stageColor && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-[0.1em] font-semibold ${stageColor.bg} ${stageColor.text} ${stageColor.border}`}>
                {stageLabel}
              </span>
            )}
            {l.percepcao_vendedor && (
              <span className="text-[10px] text-muted-foreground">
                <TrendingUp className="w-3 h-3 inline mr-0.5" />
                {l.percepcao_vendedor}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {l.proxima_acao ? <span>→ {l.proxima_acao}</span> : <span className="italic">{t("hoje.sem_proxima_acao")}</span>}
            {l.data_proxima_acao && <span className="ml-2 tabular-nums">({fmt(l.data_proxima_acao, locale)})</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">{t("hoje.estimado")}</div>
          {/* Issue 13: currency dinâmica da org */}
          <div className="text-sm font-semibold text-primary tabular-nums">
            {Number(l.valor_esperado || 0).toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-muted-foreground/70 tabular-nums">
            {t("hoje.de_total")} {Number(l.valor_potencial || 0).toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 })}
          </div>
        </div>
        <Link href={`/pipeline/${l.id}`} className="btn-ghost shrink-0"><ChevronRight className="w-4 h-4"/></Link>
      </div>
    </li>
  );
}

function fmt(d: string, locale: string = "pt-BR") {
  const dt = new Date(d);
  return dt.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}
