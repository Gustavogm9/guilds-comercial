"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ListChecks, Star, Layers, Plus, X, ArrowRight,
  CheckCircle2, AlertCircle, Loader2, TrendingUp, Users,
  AlertTriangle, MessageSquare, Heart, Rocket, DollarSign,
  RotateCw, Save, Calendar,
} from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import type {
  OnboardingPendente,
  OnboardingTemplate,
  OnboardingTemplateItem,
  NpsResponse,
  NpsResumo,
  CategoriaNps,
  HealthScore,
  HealthResumo,
  CategoriaHealth,
  ExpansaoAtiva,
  ExpansoesResumo,
  Expansao,
  EstagioExpansao,
  TipoExpansao,
} from "@/lib/types";
import {
  TIPOS_EXPANSAO, ESTAGIOS_EXPANSAO_ATIVOS,
} from "@/lib/types";
import {
  responderNps, descartarNpsPendente,
  criarTemplateOnboarding, adicionarItemTemplate, removerItemTemplate,
} from "./actions";
import {
  criarExpansao, atualizarEstagioExpansao, atualizarExpansao, removerExpansao,
} from "./expansoes-actions";
import HealthBreakdownModal from "@/components/health-breakdown-modal";
import OnboardingChecklistModal from "@/components/onboarding-checklist-modal";
import NpsInsightsCard from "@/components/nps-insights-card";
import { bulkAtualizarRenovacoes } from "./renovacoes-bulk-actions";
import ComunicacaoTabs from "../comunicacao-tabs";

type Tab = "onboarding" | "nps" | "saude" | "expansoes" | "renovacoes" | "templates";

interface RenovacaoLead {
  id: number;
  empresa: string | null;
  nome: string | null;
  valor_potencial: number | null;
  data_fechamento: string | null;
  data_renovacao: string | null;
  ciclo_renovacao_meses: number | null;
  valor_renovacao: number | null;
  responsavel_id: string | null;
}
type Feedback = { tipo: "sucesso" | "erro"; mensagem: string };
type T = (key: string) => string;

/**
 * /pos-venda — fase P2 do flywheel.
 *
 * 3 abas:
 *   1. Onboarding   — checklists abertos com % completude
 *   2. NPS          — respostas (pendentes + categorizadas) + KPIs
 *   3. Templates    — gestor configura template default + items
 */
export default function PosVendaClient({
  meId,
  isGestor,
  onboardings,
  templates,
  templateItens,
  npsResponses,
  npsResumo,
  healthScores,
  healthResumo,
  expansoesAtivas,
  expansoesResumo,
  expansoesHistorico,
  renovacoesLeads,
}: {
  meId: string;
  isGestor: boolean;
  onboardings: OnboardingPendente[];
  templates: OnboardingTemplate[];
  templateItens: OnboardingTemplateItem[];
  npsResponses: NpsResponse[];
  npsResumo: NpsResumo | null;
  healthScores: HealthScore[];
  healthResumo: HealthResumo | null;
  expansoesAtivas: ExpansaoAtiva[];
  expansoesResumo: ExpansoesResumo | null;
  expansoesHistorico: Expansao[];
  renovacoesLeads: Array<RenovacaoLead>;
}) {
  const [tab, setTab] = useState<Tab>("onboarding");
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.tipo === "sucesso" ? 2500 : 4500;
    const id = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(id);
  }, [feedback]);

  const onSucesso = (m: string) => setFeedback({ tipo: "sucesso", mensagem: m });
  const onErro = (e: unknown) =>
    setFeedback({
      tipo: "erro",
      mensagem: e instanceof Error ? e.message : "Erro inesperado.",
    });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <ComunicacaoTabs isGestor={isGestor} />
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pos_venda.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("pos_venda.subtitulo")}</p>
      </header>

      <NpsKpiBar t={t} resumo={npsResumo} responses={npsResponses} />

      <div role="tablist" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        <TabBtn v="onboarding" cur={tab} set={setTab}
          icon={<ListChecks className="w-3.5 h-3.5" />}
          label={t("pos_venda.tab_onboarding").replace("{{n}}", String(onboardings.length))} />
        <TabBtn v="nps" cur={tab} set={setTab}
          icon={<Star className="w-3.5 h-3.5" />}
          label={t("pos_venda.tab_nps")} />
        <TabBtn v="saude" cur={tab} set={setTab}
          icon={<Heart className="w-3.5 h-3.5" />}
          label={`Saúde${healthResumo && healthResumo.em_risco > 0 ? ` (${healthResumo.em_risco})` : ""}`} />
        <TabBtn v="expansoes" cur={tab} set={setTab}
          icon={<Rocket className="w-3.5 h-3.5" />}
          label={`Expansões${expansoesResumo && expansoesResumo.ativas > 0 ? ` (${expansoesResumo.ativas})` : ""}`} />
        <TabBtn v="renovacoes" cur={tab} set={setTab}
          icon={<RotateCw className="w-3.5 h-3.5" />}
          label={`Renovações${renovacoesLeads.filter(r => !r.data_renovacao).length > 0 ? ` (${renovacoesLeads.filter(r => !r.data_renovacao).length})` : ""}`} />
        {isGestor && (
          <TabBtn v="templates" cur={tab} set={setTab}
            icon={<Layers className="w-3.5 h-3.5" />}
            label={t("pos_venda.tab_templates")} />
        )}
      </div>

      {tab === "onboarding" && <OnboardingTab onboardings={onboardings} t={t} locale={locale} />}
      {tab === "nps" && <NpsTab responses={npsResponses} t={t} locale={locale} onSucesso={onSucesso} onErro={onErro} />}
      {tab === "saude" && <SaudeTab scores={healthScores} resumo={healthResumo} t={t} locale={locale} />}
      {tab === "expansoes" && (
        <ExpansoesTab
          ativas={expansoesAtivas}
          resumo={expansoesResumo}
          historico={expansoesHistorico}
          healthScores={healthScores}
          t={t}
          locale={locale}
          onSucesso={onSucesso}
          onErro={onErro}
        />
      )}
      {tab === "renovacoes" && (
        <RenovacoesBulkTab
          leads={renovacoesLeads}
          locale={locale}
          onSucesso={onSucesso}
          onErro={onErro}
        />
      )}
      {tab === "templates" && isGestor && (
        <TemplatesTab
          templates={templates}
          itens={templateItens}
          t={t}
          onSucesso={onSucesso}
          onErro={onErro}
        />
      )}

      {feedback && <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />}
    </div>
  );
}

// ======================== KPI Bar ========================
function NpsKpiBar({ t, resumo, responses }: {
  t: T; resumo: NpsResumo | null; responses: NpsResponse[];
}) {
  const respondidas = responses.filter((r) => r.score !== null).length;
  const total = responses.length;
  const pctResposta = total > 0 ? Math.round((respondidas / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <KpiCard
        label={t("pos_venda.kpi_nps_score")}
        value={resumo?.nps_score != null ? `${resumo.nps_score}` : "—"}
        sub={t("pos_venda.kpi_nps_score_sub")}
        icon={<TrendingUp className="w-4 h-4" />}
        tone={resumo?.nps_score != null && resumo.nps_score >= 50 ? "success" : "primary"}
      />
      <KpiCard
        label={t("pos_venda.kpi_promotores")}
        value={(resumo?.promotores ?? 0).toString()}
        sub={`${resumo?.detratores ?? 0} ${t("pos_venda.kpi_detratores").toLowerCase()}`}
        icon={<Users className="w-4 h-4" />}
        tone="success"
      />
      <KpiCard
        label={t("pos_venda.kpi_score_medio")}
        value={resumo?.score_medio != null ? resumo.score_medio.toString() : "—"}
        sub={`/10`}
        icon={<Star className="w-4 h-4" />}
      />
      <KpiCard
        label={t("pos_venda.kpi_pct_resposta")}
        value={`${pctResposta}%`}
        sub={t("pos_venda.kpi_total_respostas").replace("{{n}}", String(total))}
        icon={<MessageSquare className="w-4 h-4" />}
      />
    </div>
  );
}

function KpiCard({ label, value, sub, icon, tone }: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; tone?: "primary" | "success" | "default";
}) {
  const toneClass =
    tone === "primary" ? "text-primary" :
    tone === "success" ? "text-success-500" :
    "text-foreground";
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
        <span className="uppercase tracking-[0.12em] font-semibold text-[10px]">{label}</span>
        <span className={toneClass} aria-hidden="true">{icon}</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

// ======================== Tabs ========================
function TabBtn({ v, cur, set, icon, label }: {
  v: Tab; cur: Tab; set: (t: Tab) => void; icon: React.ReactNode; label: string;
}) {
  const active = v === cur;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => set(v)}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ======================== Tab Onboarding ========================
function OnboardingTab({ onboardings, t, locale }: {
  onboardings: OnboardingPendente[]; t: T; locale: Locale;
}) {
  const [checklistAberto, setChecklistAberto] = useState<{ id: number; empresa: string | null } | null>(null);
  if (onboardings.length === 0) {
    return (
      <div className="card p-12 text-center">
        <ListChecks className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("pos_venda.vazio_onboarding")}</p>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.onb_th_cliente")}</th>
            <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.onb_th_iniciado")}</th>
            <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.onb_th_progresso")}</th>
            <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.onb_th_atrasados")}</th>
            <th className="text-right px-3 py-2 font-semibold">{t("pos_venda.onb_th_acoes")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {onboardings.map((o) => (
            <tr key={o.checklist_id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
              <td className="px-3 py-2 font-medium">
                <Link href={`/vendas/pipeline/${o.lead_id}`} className="hover:text-primary transition-colors">
                  {o.lead_empresa ?? o.lead_nome ?? `Lead #${o.lead_id}`}
                </Link>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                {fmtData(o.iniciado_em, locale)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-32">
                    <div
                      className={`h-full rounded-full ${
                        o.pct_concluido >= 80 ? "bg-success-500" :
                        o.pct_concluido >= 40 ? "bg-warning-500" :
                        "bg-primary"
                      }`}
                      style={{ width: `${o.pct_concluido}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {o.concluidos}/{o.total_items}
                  </span>
                </div>
              </td>
              <td className="px-3 py-2 text-xs">
                {o.atrasados > 0 ? (
                  <span className="inline-flex items-center gap-1 text-destructive font-semibold tabular-nums">
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                    {o.atrasados}
                  </span>
                ) : (
                  <span className="text-muted-foreground tabular-nums">0</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => setChecklistAberto({ id: o.checklist_id, empresa: o.lead_empresa })}
                  className="btn-secondary text-xs"
                >
                  {t("pos_venda.onb_btn_ver")}
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {checklistAberto && (
        <OnboardingChecklistModal
          checklistId={checklistAberto.id}
          leadEmpresa={checklistAberto.empresa}
          onClose={() => setChecklistAberto(null)}
        />
      )}
    </div>
  );
}

// ======================== Tab NPS ========================
function NpsTab({ responses, t, locale, onSucesso, onErro }: {
  responses: NpsResponse[]; t: T; locale: Locale;
  onSucesso: (m: string) => void; onErro: (e: unknown) => void;
}) {
  const [responderModal, setResponderModal] = useState<NpsResponse | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDescartar(nps_id: number) {
    startTransition(async () => {
      try {
        await descartarNpsPendente(nps_id);
        onSucesso("Descartado.");
      } catch (e) { onErro(e); }
    });
  }

  if (responses.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Star className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("pos_venda.vazio_nps")}</p>
      </div>
    );
  }

  // Mostra insights se há ao menos 3 respostas com comentário
  const comComentario = responses.filter((r) => r.score != null && r.comentario).length;

  return (
    <>
      {comComentario >= 3 && <NpsInsightsCard />}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.nps_th_cliente")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.nps_th_solicitado")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.nps_th_canal")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.nps_th_score")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("pos_venda.nps_th_categoria")}</th>
              <th className="text-right px-3 py-2 font-semibold">{t("pos_venda.nps_th_acoes")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {responses.map((n) => (
              <tr key={n.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
                <td className="px-3 py-2">
                  <Link href={`/vendas/pipeline/${n.lead_id}`} className="hover:text-primary transition-colors">
                    Lead #{n.lead_id}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                  {fmtData(n.solicitado_em, locale)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {n.canal ? t(`pos_venda.canal_${n.canal}`) : "—"}
                </td>
                <td className="px-3 py-2">
                  {n.score != null ? (
                    <span className="font-semibold text-base tabular-nums">{n.score}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">{t("pos_venda.nps_pendente")}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {n.categoria ? <CategoriaBadge cat={n.categoria} t={t} /> : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-right space-x-1">
                  {n.score == null ? (
                    <>
                      <button
                        onClick={() => setResponderModal(n)}
                        disabled={pending}
                        className="btn-primary text-xs"
                      >
                        <Star className="w-3 h-3" aria-hidden="true" />
                        {t("pos_venda.nps_btn_responder")}
                      </button>
                      <button
                        onClick={() => handleDescartar(n.id)}
                        disabled={pending}
                        className="btn-ghost text-xs text-muted-foreground"
                      >
                        {t("pos_venda.nps_btn_descartar")}
                      </button>
                    </>
                  ) : (
                    n.comentario && (
                      <span className="text-xs text-muted-foreground italic truncate inline-block max-w-xs">
                        "{n.comentario}"
                      </span>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {responderModal && (
        <ResponderNpsModal
          nps={responderModal}
          t={t}
          onClose={() => setResponderModal(null)}
          onSucesso={(m) => {
            setResponderModal(null);
            onSucesso(m);
          }}
          onErro={onErro}
        />
      )}
    </>
  );
}

function CategoriaBadge({ cat, t }: { cat: CategoriaNps; t: T }) {
  const cls = {
    promotor: "bg-success-500/15 text-success-500 border border-success-500/30",
    neutro: "bg-warning-500/15 text-warning-500 border border-warning-500/30",
    detrator: "bg-destructive/15 text-destructive border border-destructive/30",
  }[cat];
  return (
    <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {t(`pos_venda.nps_categoria_${cat}`)}
    </span>
  );
}

function ResponderNpsModal({ nps, t, onClose, onSucesso, onErro }: {
  nps: NpsResponse;
  t: T;
  onClose: () => void;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");

  function handleSalvar() {
    if (score == null) {
      onErro(new Error("Selecione um score de 0 a 10."));
      return;
    }
    startTransition(async () => {
      try {
        await responderNps({ nps_id: nps.id, score, comentario: comentario || undefined });
        onSucesso(t("pos_venda.toast_nps_registrado"));
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">{t("pos_venda.nps_modal_titulo")}</div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="label mb-2 block">{t("pos_venda.nps_modal_score_label")}</label>
          <div className="flex flex-wrap gap-1.5">
            {[0,1,2,3,4,5,6,7,8,9,10].map((n) => {
              const tone =
                n <= 6 ? "bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/30" :
                n <= 8 ? "bg-warning-500/10 hover:bg-warning-500/20 text-warning-500 border-warning-500/30" :
                "bg-success-500/10 hover:bg-success-500/20 text-success-500 border-success-500/30";
              const selected = score === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  aria-pressed={selected}
                  className={`w-9 h-9 rounded-md border font-semibold tabular-nums text-sm transition ${tone} ${
                    selected ? "ring-2 ring-primary scale-105" : ""
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {t("pos_venda.nps_modal_score_help")}
          </p>
        </div>

        <div>
          <label className="label">{t("pos_venda.nps_modal_comentario")}</label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={t("pos_venda.nps_modal_comentario_placeholder")}
            className="input-base mt-1 min-h-[60px] text-sm"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button onClick={onClose} className="btn-ghost text-sm">
            {t("pos_venda.nps_modal_btn_cancelar")}
          </button>
          <button
            onClick={handleSalvar}
            disabled={pending || score == null}
            className="btn-primary text-sm"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {t("pos_venda.nps_modal_btn_salvar")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ======================== Tab Templates ========================
function TemplatesTab({ templates, itens, t, onSucesso, onErro }: {
  templates: OnboardingTemplate[];
  itens: OnboardingTemplateItem[];
  t: T;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [showNovo, setShowNovo] = useState(false);

  if (templates.length === 0 && !showNovo) {
    return (
      <div className="card p-12 text-center">
        <Layers className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground mb-3">{t("pos_venda.vazio_templates")}</p>
        <button onClick={() => setShowNovo(true)} className="btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t("pos_venda.tpl_btn_novo")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowNovo(true)} className="btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t("pos_venda.tpl_btn_novo")}
        </button>
      </div>

      {showNovo && (
        <NovoTemplateForm
          t={t}
          onSucesso={(m) => { setShowNovo(false); onSucesso(m); }}
          onErro={onErro}
          onCancel={() => setShowNovo(false)}
        />
      )}

      {templates.map((tpl) => (
        <TemplateCard
          key={tpl.id}
          tpl={tpl}
          itens={itens.filter((i) => i.template_id === tpl.id)}
          t={t}
          onSucesso={onSucesso}
          onErro={onErro}
        />
      ))}
    </div>
  );
}

function NovoTemplateForm({ t, onSucesso, onErro, onCancel }: {
  t: T;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [isDefault, setIsDefault] = useState(true);

  function handleCriar() {
    if (!nome.trim()) { onErro(new Error("Nome é obrigatório.")); return; }
    startTransition(async () => {
      try {
        await criarTemplateOnboarding({
          nome,
          descricao: descricao || undefined,
          default_template: isDefault,
        });
        onSucesso(t("pos_venda.toast_template_criado"));
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="font-semibold text-sm">{t("pos_venda.tpl_btn_novo")}</div>
      <div>
        <label className="label">{t("pos_venda.tpl_modal_nome")}</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="input-base mt-1 text-sm"
          aria-label={t("pos_venda.tpl_modal_nome")}
        />
      </div>
      <div>
        <label className="label">{t("pos_venda.tpl_modal_descricao")}</label>
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="input-base mt-1 text-sm"
          aria-label={t("pos_venda.tpl_modal_descricao")}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        {t("pos_venda.tpl_modal_default")}
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost text-sm">
          {t("pos_venda.nps_modal_btn_cancelar")}
        </button>
        <button onClick={handleCriar} disabled={pending} className="btn-primary text-sm">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {t("pos_venda.tpl_modal_btn_criar")}
        </button>
      </div>
    </div>
  );
}

function TemplateCard({ tpl, itens, t, onSucesso, onErro }: {
  tpl: OnboardingTemplate;
  itens: OnboardingTemplateItem[];
  t: T;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleRemoverItem(item_id: number) {
    startTransition(async () => {
      try {
        await removerItemTemplate(item_id);
        onSucesso("Item removido.");
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            {tpl.nome}
            {tpl.default_template && (
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded border border-primary/30">
                {t("pos_venda.tpl_th_default")}
              </span>
            )}
          </div>
          {tpl.descricao && <p className="text-xs text-muted-foreground mt-0.5">{tpl.descricao}</p>}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary text-xs">
          <Plus className="w-3 h-3" aria-hidden="true" /> {t("pos_venda.tpl_item_btn_adicionar")}
        </button>
      </div>

      {showAdd && (
        <NovoItemForm
          template_id={tpl.id}
          t={t}
          onClose={() => setShowAdd(false)}
          onSucesso={onSucesso}
          onErro={onErro}
        />
      )}

      {itens.length > 0 ? (
        <ul className="space-y-1.5 mt-3">
          {itens.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 dark:bg-white/[0.02] border border-border"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{it.titulo}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>D+{it.due_offset_dias}</span>
                  {it.responsavel_papel && <span>· {t(`pos_venda.papel_${it.responsavel_papel}`)}</span>}
                  {it.obrigatorio && <span className="text-[10px] uppercase tracking-[0.1em] text-warning-500">obrigatório</span>}
                </div>
              </div>
              <button
                onClick={() => handleRemoverItem(it.id)}
                disabled={pending}
                className="btn-ghost text-muted-foreground hover:text-destructive"
                aria-label={t("pos_venda.tpl_btn_remover")}
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground/70 mt-2 italic">Sem items ainda.</p>
      )}
    </div>
  );
}

function NovoItemForm({ template_id, t, onClose, onSucesso, onErro }: {
  template_id: number;
  t: T;
  onClose: () => void;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [offset, setOffset] = useState(0);
  const [obrigatorio, setObrigatorio] = useState(true);
  const [papel, setPapel] = useState<string>("comercial");

  function handleSalvar() {
    if (!titulo.trim()) { onErro(new Error("Título obrigatório.")); return; }
    startTransition(async () => {
      try {
        await adicionarItemTemplate({
          template_id,
          titulo,
          descricao: descricao || undefined,
          due_offset_dias: offset,
          obrigatorio,
          responsavel_papel: papel as any,
        });
        onSucesso("Item adicionado.");
        onClose();
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/30 dark:bg-white/[0.02] p-3 mt-2 space-y-2">
      <input
        placeholder={t("pos_venda.tpl_item_titulo")}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        className="input-base text-sm"
        aria-label={t("pos_venda.tpl_item_titulo")}
      />
      <input
        placeholder={t("pos_venda.tpl_item_descricao")}
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        className="input-base text-xs"
        aria-label={t("pos_venda.tpl_item_descricao")}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-[10px]">{t("pos_venda.tpl_item_offset")}</label>
          <input
            type="number"
            min={0}
            max={365}
            value={offset}
            onChange={(e) => setOffset(parseInt(e.target.value || "0", 10) || 0)}
            className="input-base text-xs mt-0.5"
            aria-label={t("pos_venda.tpl_item_offset")}
          />
        </div>
        <div>
          <label className="label text-[10px]">{t("pos_venda.tpl_item_papel")}</label>
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            className="input-base !text-xs mt-0.5"
            aria-label={t("pos_venda.tpl_item_papel")}
          >
            <option value="comercial">{t("pos_venda.papel_comercial")}</option>
            <option value="sdr">{t("pos_venda.papel_sdr")}</option>
            <option value="gestor">{t("pos_venda.papel_gestor")}</option>
            <option value="cliente">{t("pos_venda.papel_cliente")}</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={obrigatorio}
          onChange={(e) => setObrigatorio(e.target.checked)}
        />
        {t("pos_venda.tpl_item_obrigatorio")}
      </label>
      <div className="flex justify-end gap-1.5">
        <button onClick={onClose} className="btn-ghost text-xs">
          {t("pos_venda.nps_modal_btn_cancelar")}
        </button>
        <button onClick={handleSalvar} disabled={pending} className="btn-primary text-xs">
          {pending && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
          {t("pos_venda.nps_modal_btn_salvar")}
        </button>
      </div>
    </div>
  );
}

// ======================== Toast ========================
function FeedbackToast({ feedback, onClose }: { feedback: Feedback; onClose: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 right-6 md:right-8 md:bottom-28 z-[100] max-w-sm card p-3 flex items-start gap-2.5 shadow-stripe-md animate-in fade-in slide-in-from-bottom-2 ${
        feedback.tipo === "sucesso" ? "border-success-500/30 bg-success-500/5" : "border-destructive/30 bg-destructive/5"
      }`}
    >
      {feedback.tipo === "sucesso" ? (
        <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <span className="text-sm text-foreground flex-1">{feedback.mensagem}</span>
      <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ======================== Tab Saúde (Health Score) ========================
function SaudeTab({ scores, resumo, t, locale }: {
  scores: HealthScore[];
  resumo: HealthResumo | null;
  t: T;
  locale: Locale;
}) {
  const [breakdownLeadId, setBreakdownLeadId] = useState<number | null>(null);
  if (!resumo || resumo.total_fechados === 0) {
    return (
      <div className="card p-12 text-center">
        <Heart className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Sem clientes fechados ainda. O health score aparece aqui depois do primeiro fechamento.
        </p>
      </div>
    );
  }

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Score médio"
          value={resumo.score_medio != null ? `${resumo.score_medio}` : "—"}
          sub={`/100 · ${resumo.total_fechados} clientes`}
          icon={<Heart className="w-4 h-4" />}
          tone={
            resumo.score_medio != null && resumo.score_medio >= 70 ? "success" :
            "primary"
          }
        />
        <KpiCard
          label="Saudáveis"
          value={resumo.saudaveis.toString()}
          sub="score ≥ 70"
          icon={<TrendingUp className="w-4 h-4" />}
          tone="success"
        />
        <KpiCard
          label="Atenção"
          value={resumo.atencao.toString()}
          sub="score 40-69"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <KpiCard
          label="Em risco"
          value={resumo.em_risco.toString()}
          sub={`${fmtBRL(resumo.arr_em_risco)} ARR em risco`}
          icon={<AlertCircle className="w-4 h-4" />}
          tone="primary"
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Cliente</th>
              <th className="text-left px-3 py-2 font-semibold">Score</th>
              <th className="text-left px-3 py-2 font-semibold">Categoria</th>
              <th className="text-right px-3 py-2 font-semibold">Sem contato</th>
              <th className="text-right px-3 py-2 font-semibold">NPS</th>
              <th className="text-right px-3 py-2 font-semibold">Indicações</th>
              <th className="text-right px-3 py-2 font-semibold">Valor</th>
              <th className="text-right px-3 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scores.map((s) => (
              <tr key={s.lead_id} className={`hover:bg-secondary/60 dark:hover:bg-white/[0.04] ${s.categoria === "em_risco" ? "bg-destructive/[0.03]" : ""}`}>
                <td className="px-3 py-2 font-medium">
                  <Link href={`/vendas/pipeline/${s.lead_id}`} className="hover:text-primary transition-colors">
                    {s.lead_empresa ?? s.lead_nome ?? `Lead #${s.lead_id}`}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => setBreakdownLeadId(s.lead_id)}
                    className="cursor-pointer hover:opacity-80 transition-opacity text-left"
                    aria-label="Ver breakdown do health score"
                  >
                    <ScoreBar score={s.health_score} categoria={s.categoria} />
                  </button>
                </td>
                <td className="px-3 py-2">
                  <CategoriaHealthBadge cat={s.categoria} />
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  <span className={s.dias_sem_interacao > 30 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                    {s.dias_sem_interacao}d
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {s.ultimo_nps_score != null ? s.ultimo_nps_score : <span className="text-muted-foreground/60">—</span>}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {s.indicacoes_dadas > 0 ? (
                    <span className="text-success-500 font-semibold">{s.indicacoes_dadas}</span>
                  ) : (
                    <span className="text-muted-foreground/60">0</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {fmtBRL(s.valor_potencial ?? 0)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setBreakdownLeadId(s.lead_id)}
                    className="btn-ghost text-xs"
                    aria-label="Ver detalhe do health"
                    title="Ver detalhe"
                  >
                    Detalhe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {breakdownLeadId != null && (
        <HealthBreakdownModal leadId={breakdownLeadId} onClose={() => setBreakdownLeadId(null)} />
      )}
    </>
  );
}

function ScoreBar({ score, categoria }: { score: number; categoria: CategoriaHealth }) {
  const color =
    categoria === "saudavel" ? "bg-success-500" :
    categoria === "atencao" ? "bg-warning-500" :
    "bg-destructive";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-24">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      <span className="text-xs tabular-nums font-semibold w-8 text-right">{score}</span>
    </div>
  );
}

function CategoriaHealthBadge({ cat }: { cat: CategoriaHealth }) {
  const cls = {
    saudavel: "bg-success-500/15 text-success-500 border border-success-500/30",
    atencao: "bg-warning-500/15 text-warning-500 border border-warning-500/30",
    em_risco: "bg-destructive/15 text-destructive border border-destructive/30",
  }[cat];
  const label = {
    saudavel: "Saudável",
    atencao: "Atenção",
    em_risco: "Em risco",
  }[cat];
  return (
    <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

// ======================== Tab Expansões ========================
function ExpansoesTab({
  ativas, resumo, historico, healthScores, t, locale, onSucesso, onErro,
}: {
  ativas: ExpansaoAtiva[];
  resumo: ExpansoesResumo | null;
  historico: Expansao[];
  healthScores: HealthScore[];
  t: T;
  locale: Locale;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [showNova, setShowNova] = useState(false);
  const [editing, setEditing] = useState<ExpansaoAtiva | null>(null);
  const [pending, startTransition] = useTransition();

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  function handleEstagio(id: number, estagio: EstagioExpansao, motivo?: string) {
    startTransition(async () => {
      try {
        await atualizarEstagioExpansao({ expansao_id: id, estagio, motivo_perda: motivo });
        onSucesso("Estágio atualizado.");
      } catch (e) { onErro(e); }
    });
  }

  function handleRemover(id: number) {
    if (!confirm("Remover esta expansão? (só ativas podem ser removidas)")) return;
    startTransition(async () => {
      try {
        await removerExpansao(id);
        onSucesso("Expansão removida.");
      } catch (e) { onErro(e); }
    });
  }

  // Sugestões: clientes saudáveis sem expansão ativa
  const clientesComAtiva = new Set(ativas.map((a) => a.cliente_lead_id));
  const sugestoes = healthScores
    .filter((s) => s.categoria === "saudavel" && !clientesComAtiva.has(s.lead_id))
    .slice(0, 3);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Pipeline expansão"
          value={fmtBRL(resumo?.pipeline_aberto ?? 0)}
          sub={`${resumo?.ativas ?? 0} ativas`}
          icon={<Rocket className="w-4 h-4" />}
          tone="primary"
        />
        <KpiCard
          label="Receita expandida"
          value={fmtBRL(resumo?.receita_expandida ?? 0)}
          sub={`${resumo?.fechadas ?? 0} fechadas`}
          icon={<DollarSign className="w-4 h-4" />}
          tone="success"
        />
        <KpiCard
          label="ARR expansão"
          value={fmtBRL(resumo?.arr_expandido ?? 0)}
          sub="anualizado"
          icon={<TrendingUp className="w-4 h-4" />}
          tone="success"
        />
        <KpiCard
          label="Conversão"
          value={resumo?.taxa_conversao_pct != null ? `${resumo.taxa_conversao_pct}%` : "—"}
          sub={`${resumo?.fechadas ?? 0}/${(resumo?.fechadas ?? 0) + (resumo?.perdidas ?? 0)} fechadas`}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>

      <div className="flex justify-between items-center mb-3">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
          Expansões ativas ({ativas.length})
        </div>
        <button onClick={() => setShowNova(true)} className="btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Nova expansão
        </button>
      </div>

      {ativas.length === 0 ? (
        <div className="card p-12 text-center">
          <Rocket className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground mb-3">
            Nenhuma oportunidade de expansão aberta. Clientes fechados podem comprar mais — pergunta.
          </p>
          {sugestoes.length > 0 && (
            <div className="text-xs text-muted-foreground/80 max-w-md mx-auto">
              <div className="font-medium text-foreground mb-1">Sugestões pra começar:</div>
              <ul className="space-y-0.5">
                {sugestoes.map((s) => (
                  <li key={s.lead_id}>
                    <Link href={`/vendas/pipeline/${s.lead_id}`} className="text-primary hover:underline">
                      {s.lead_empresa ?? s.lead_nome ?? `Lead #${s.lead_id}`}
                    </Link>
                    {" "}— score {s.health_score}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Cliente</th>
                <th className="text-left px-3 py-2 font-semibold">Tipo</th>
                <th className="text-left px-3 py-2 font-semibold">Título</th>
                <th className="text-left px-3 py-2 font-semibold">Estágio</th>
                <th className="text-right px-3 py-2 font-semibold">Valor</th>
                <th className="text-left px-3 py-2 font-semibold">Próxima ação</th>
                <th className="text-right px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ativas.map((e) => {
                const atrasada = e.dias_ate_acao != null && e.dias_ate_acao < 0;
                return (
                  <tr key={e.id} className={`hover:bg-secondary/60 dark:hover:bg-white/[0.04] ${atrasada ? "bg-warning-500/[0.03]" : ""}`}>
                    <td className="px-3 py-2">
                      <Link href={`/vendas/pipeline/${e.cliente_lead_id}`} className="font-medium hover:text-primary transition-colors">
                        {e.cliente_empresa ?? e.cliente_nome ?? `Lead #${e.cliente_lead_id}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {e.tipo.replace("_", " ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.titulo}
                      {e.origem.startsWith("sistema") && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-[0.12em] text-warning-500" title="Sugerido pelo sistema">
                          ✨ auto
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={e.estagio}
                        onChange={(ev) => {
                          const novo = ev.target.value as EstagioExpansao;
                          if (novo === "perdida") {
                            const motivo = prompt("Motivo da perda?");
                            if (!motivo?.trim()) return;
                            handleEstagio(e.id, novo, motivo);
                          } else {
                            handleEstagio(e.id, novo);
                          }
                        }}
                        disabled={pending}
                        aria-label="Estágio"
                        className="input-base !py-1 !text-xs !w-32"
                      >
                        {ESTAGIOS_EXPANSAO_ATIVOS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="fechada">fechada</option>
                        <option value="perdida">perdida</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums font-semibold">
                      {fmtBRL(e.valor_potencial)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.proxima_acao ? (
                        <div>
                          <div className="font-medium text-foreground">{e.proxima_acao}</div>
                          {e.data_proxima_acao && (
                            <div className={`text-[10px] tabular-nums ${atrasada ? "text-warning-500 font-semibold" : "text-muted-foreground"}`}>
                              {atrasada ? `${Math.abs(e.dias_ate_acao!)}d atrasada` : `em ${e.dias_ate_acao}d`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">sem ação</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setEditing(e)}
                        className="btn-ghost text-xs"
                        aria-label="Editar"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleRemover(e.id)}
                        disabled={pending}
                        className="btn-ghost text-xs text-muted-foreground hover:text-destructive"
                        aria-label="Remover"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {historico.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none">
            Histórico ({historico.length} fechadas/perdidas)
          </summary>
          <div className="card overflow-hidden mt-2">
            <table className="w-full text-xs">
              <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Título</th>
                  <th className="text-left px-3 py-2 font-semibold">Estágio</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor</th>
                  <th className="text-left px-3 py-2 font-semibold">Quando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-1.5">
                      <Link href={`/vendas/pipeline/${h.cliente_lead_id}`} className="hover:text-primary">
                        {h.titulo}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded ${
                        h.estagio === "fechada"
                          ? "bg-success-500/15 text-success-500 border border-success-500/30"
                          : "bg-destructive/15 text-destructive border border-destructive/30"
                      }`}>
                        {h.estagio}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL(h.valor_potencial)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                      {fmtData(h.data_fechada ?? h.data_perdida ?? h.updated_at, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {showNova && (
        <NovaExpansaoModal
          t={t}
          healthScores={healthScores}
          onClose={() => setShowNova(false)}
          onSucesso={(m) => { setShowNova(false); onSucesso(m); }}
          onErro={onErro}
        />
      )}

      {editing && (
        <EditarExpansaoModal
          expansao={editing}
          onClose={() => setEditing(null)}
          onSucesso={(m) => { setEditing(null); onSucesso(m); }}
          onErro={onErro}
        />
      )}
    </>
  );
}

function NovaExpansaoModal({ t, healthScores, onClose, onSucesso, onErro }: {
  t: T;
  healthScores: HealthScore[];
  onClose: () => void;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    cliente_lead_id: 0,
    tipo: "upsell" as TipoExpansao,
    titulo: "",
    descricao: "",
    valor_potencial: 0,
    valor_recorrente_mensal: 0,
    data_proxima_acao: "",
    proxima_acao: "",
  });

  function handleCriar() {
    if (!form.cliente_lead_id) { onErro(new Error("Selecione um cliente.")); return; }
    if (!form.titulo.trim()) { onErro(new Error("Título obrigatório.")); return; }
    startTransition(async () => {
      try {
        await criarExpansao({
          cliente_lead_id: form.cliente_lead_id,
          tipo: form.tipo,
          titulo: form.titulo,
          descricao: form.descricao || undefined,
          valor_potencial: form.valor_potencial,
          valor_recorrente_mensal: form.valor_recorrente_mensal || undefined,
          data_proxima_acao: form.data_proxima_acao || undefined,
          proxima_acao: form.proxima_acao || undefined,
        });
        onSucesso("Expansão criada.");
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm">Nova oportunidade de expansão</div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          <div>
            <label className="label">Cliente</label>
            <select
              value={form.cliente_lead_id || ""}
              onChange={(e) => setForm({ ...form, cliente_lead_id: parseInt(e.target.value, 10) })}
              className="input-base !text-sm w-full mt-1"
              aria-label="Cliente"
            >
              <option value="">Selecione um cliente fechado…</option>
              {healthScores.map((s) => (
                <option key={s.lead_id} value={s.lead_id}>
                  {s.lead_empresa ?? s.lead_nome ?? `Lead #${s.lead_id}`}
                  {" — score " + s.health_score}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Lista vem dos clientes em "Fechado" da org.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoExpansao })}
                className="input-base !text-sm w-full mt-1"
                aria-label="Tipo"
              >
                {TIPOS_EXPANSAO.map((tp) => (
                  <option key={tp} value={tp}>{tp.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Valor potencial (R$)</label>
              <input
                type="number"
                min={0}
                value={form.valor_potencial}
                onChange={(e) => setForm({ ...form, valor_potencial: parseFloat(e.target.value || "0") })}
                className="input-base text-sm mt-1"
                aria-label="Valor potencial"
              />
            </div>
          </div>
          <div>
            <label className="label">Título</label>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Upgrade pra plano Growth"
              className="input-base text-sm mt-1"
              aria-label="Título"
            />
          </div>
          <div>
            <label className="label">Descrição (opcional)</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="input-base mt-1 min-h-[60px] text-sm"
              aria-label="Descrição"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Próxima ação</label>
              <input
                value={form.proxima_acao}
                onChange={(e) => setForm({ ...form, proxima_acao: e.target.value })}
                placeholder="Marcar call de upgrade"
                className="input-base text-sm mt-1"
                aria-label="Próxima ação"
              />
            </div>
            <div>
              <label className="label">Quando</label>
              <input
                type="date"
                value={form.data_proxima_acao}
                onChange={(e) => setForm({ ...form, data_proxima_acao: e.target.value })}
                className="input-base text-sm mt-1"
                aria-label="Data próxima ação"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={handleCriar} disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

function EditarExpansaoModal({ expansao, onClose, onSucesso, onErro }: {
  expansao: ExpansaoAtiva;
  onClose: () => void;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    titulo: expansao.titulo,
    descricao: expansao.descricao ?? "",
    valor_potencial: expansao.valor_potencial,
    valor_recorrente_mensal: expansao.valor_recorrente_mensal ?? 0,
    data_proxima_acao: expansao.data_proxima_acao ?? "",
    proxima_acao: expansao.proxima_acao ?? "",
  });

  function handleSalvar() {
    startTransition(async () => {
      try {
        await atualizarExpansao({
          expansao_id: expansao.id,
          titulo: form.titulo,
          descricao: form.descricao,
          valor_potencial: form.valor_potencial,
          valor_recorrente_mensal: form.valor_recorrente_mensal,
          data_proxima_acao: form.data_proxima_acao || null,
          proxima_acao: form.proxima_acao,
        });
        onSucesso("Atualizada.");
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Editar expansão</div>
            <div className="text-xs text-muted-foreground">{expansao.cliente_empresa ?? expansao.cliente_nome}</div>
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          <div>
            <label className="label">Título</label>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="input-base text-sm mt-1"
              aria-label="Título"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor potencial</label>
              <input
                type="number"
                min={0}
                value={form.valor_potencial}
                onChange={(e) => setForm({ ...form, valor_potencial: parseFloat(e.target.value || "0") })}
                className="input-base text-sm mt-1"
                aria-label="Valor potencial"
              />
            </div>
            <div>
              <label className="label">Valor recorrente/mês</label>
              <input
                type="number"
                min={0}
                value={form.valor_recorrente_mensal}
                onChange={(e) => setForm({ ...form, valor_recorrente_mensal: parseFloat(e.target.value || "0") })}
                className="input-base text-sm mt-1"
                aria-label="Valor recorrente"
              />
            </div>
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="input-base mt-1 min-h-[60px] text-sm"
              aria-label="Descrição"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Próxima ação</label>
              <input
                value={form.proxima_acao}
                onChange={(e) => setForm({ ...form, proxima_acao: e.target.value })}
                className="input-base text-sm mt-1"
                aria-label="Próxima ação"
              />
            </div>
            <div>
              <label className="label">Quando</label>
              <input
                type="date"
                value={form.data_proxima_acao}
                onChange={(e) => setForm({ ...form, data_proxima_acao: e.target.value })}
                className="input-base text-sm mt-1"
                aria-label="Data próxima ação"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={handleSalvar} disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ======================== Tab Renovações (bulk) ========================
function RenovacoesBulkTab({
  leads, locale, onSucesso, onErro,
}: {
  leads: RenovacaoLead[];
  locale: Locale;
  onSucesso: (m: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<"todos" | "sem_data" | "com_data">("sem_data");
  const [edits, setEdits] = useState<Record<number, {
    data?: string;
    ciclo?: number;
    valor?: number;
  }>>({});

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const filtrados = leads.filter((l) => {
    if (filtro === "sem_data") return !l.data_renovacao;
    if (filtro === "com_data") return !!l.data_renovacao;
    return true;
  });

  function update(leadId: number, patch: { data?: string; ciclo?: number; valor?: number }) {
    setEdits((prev) => ({
      ...prev,
      [leadId]: { ...(prev[leadId] ?? {}), ...patch },
    }));
  }

  function handleSalvarLote() {
    const updates = Object.entries(edits)
      .filter(([_, e]) => e.data !== undefined || e.ciclo !== undefined || e.valor !== undefined)
      .map(([leadIdStr, e]) => {
        const leadId = parseInt(leadIdStr, 10);
        const orig = leads.find((l) => l.id === leadId);
        return {
          lead_id: leadId,
          data_renovacao: e.data !== undefined ? (e.data || null) : (orig?.data_renovacao ?? null),
          ciclo_renovacao_meses: e.ciclo !== undefined ? e.ciclo : (orig?.ciclo_renovacao_meses ?? null),
          valor_renovacao: e.valor !== undefined ? e.valor : (orig?.valor_renovacao ?? null),
        };
      });

    if (updates.length === 0) {
      onErro(new Error("Nenhuma alteração pra salvar."));
      return;
    }

    startTransition(async () => {
      try {
        const r = await bulkAtualizarRenovacoes(updates);
        if (r.erros.length > 0) {
          onErro(new Error(`${r.atualizados} ok · ${r.erros.length} com erro: ${r.erros[0]}`));
        } else {
          onSucesso(`${r.atualizados} renovação(ões) atualizada(s).`);
        }
        setEdits({});
      } catch (e) {
        onErro(e);
      }
    });
  }

  // Sugestão automática: cliente fechado há > 6m → sugerir 12m de ciclo a partir do fechamento
  function sugerirAutomatico() {
    const novosEdits: typeof edits = { ...edits };
    let count = 0;
    leads.forEach((l) => {
      if (l.data_renovacao || !l.data_fechamento) return;
      const fechamento = new Date(l.data_fechamento);
      const sugestao = new Date(fechamento);
      sugestao.setFullYear(sugestao.getFullYear() + 1);
      novosEdits[l.id] = {
        data: sugestao.toISOString().slice(0, 10),
        ciclo: 12,
        valor: l.valor_potencial ?? 0,
      };
      count += 1;
    });
    setEdits(novosEdits);
    if (count > 0) {
      onSucesso(`Sugerido D+12m pra ${count} cliente(s). Revise e salve.`);
    } else {
      onErro(new Error("Nenhum cliente sem renovação configurada."));
    }
  }

  const semData = leads.filter((l) => !l.data_renovacao).length;
  const comData = leads.length - semData;
  const editsCount = Object.keys(edits).length;

  return (
    <div className="space-y-4">
      {/* Header explicativo */}
      <div className="card p-4 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <RotateCw className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-semibold text-sm mb-1">Configuração em massa de renovação</div>
            <p className="text-xs text-muted-foreground">
              Defina data de renovação, ciclo e valor pra vários clientes de uma vez. O cron diário 08:00 detecta
              vencimentos &lt;= 90d e cria expansão tipo=renovacao automaticamente.{" "}
              <strong>{semData}</strong> cliente(s) ainda sem data configurada,{" "}
              <strong>{comData}</strong> com data.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Filtrar:</span>
          {(["todos", "sem_data", "com_data"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-2 py-1 rounded text-xs ${
                filtro === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground bg-secondary"
              }`}
            >
              {f === "todos" ? "Todos" : f === "sem_data" ? "Sem data" : "Com data"}
              <span className="ml-1 tabular-nums opacity-70">
                ({f === "todos" ? leads.length : f === "sem_data" ? semData : comData})
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={sugerirAutomatico}
            disabled={pending || semData === 0}
            className="btn-ghost text-xs"
            title="Preenche data = data_fechamento + 12 meses pra clientes sem data"
          >
            <Calendar className="w-3 h-3" aria-hidden="true" /> Sugerir +12m
          </button>
          {editsCount > 0 && (
            <button
              onClick={handleSalvarLote}
              disabled={pending}
              className="btn-primary text-xs"
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Save className="w-3 h-3" aria-hidden="true" />}
              Salvar {editsCount} alteraç{editsCount === 1 ? "ão" : "ões"}
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="card p-12 text-center text-sm text-muted-foreground">
          Nenhum cliente nesse filtro.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Cliente</th>
                  <th className="text-left px-3 py-2 font-semibold">Fechado em</th>
                  <th className="text-left px-3 py-2 font-semibold">Data renovação</th>
                  <th className="text-left px-3 py-2 font-semibold">Ciclo (meses)</th>
                  <th className="text-right px-3 py-2 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((l) => {
                  const edit = edits[l.id];
                  const hasEdit = edit && (edit.data !== undefined || edit.ciclo !== undefined || edit.valor !== undefined);
                  return (
                    <tr key={l.id} className={hasEdit ? "bg-warning-500/5" : "hover:bg-secondary/40"}>
                      <td className="px-3 py-2">
                        <Link href={`/vendas/pipeline/${l.id}`} className="font-medium hover:text-primary transition-colors">
                          {l.empresa ?? l.nome ?? `Lead #${l.id}`}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {l.data_fechamento ? new Date(l.data_fechamento).toLocaleDateString(locale) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={edit?.data ?? l.data_renovacao ?? ""}
                          onChange={(e) => update(l.id, { data: e.target.value })}
                          className="input-base !text-xs !py-1 w-36"
                          aria-label="Data de renovação"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={edit?.ciclo ?? l.ciclo_renovacao_meses ?? 12}
                          onChange={(e) => update(l.id, { ciclo: parseInt(e.target.value, 10) })}
                          className="input-base !text-xs !py-1 w-20"
                          aria-label="Ciclo"
                        >
                          <option value={1}>1</option>
                          <option value={3}>3</option>
                          <option value={6}>6</option>
                          <option value={12}>12</option>
                          <option value={24}>24</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={edit?.valor ?? l.valor_renovacao ?? l.valor_potencial ?? 0}
                          onChange={(e) => update(l.id, { valor: parseFloat(e.target.value || "0") })}
                          className="input-base !text-xs !py-1 w-28 text-right tabular-nums"
                          aria-label="Valor"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================== Helpers ========================
function fmtData(s: string, locale: Locale): string {
  return new Date(s).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}
