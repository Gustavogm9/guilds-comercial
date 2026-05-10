"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ListChecks, Star, Layers, Plus, X, ArrowRight,
  CheckCircle2, AlertCircle, Loader2, TrendingUp, Users,
  AlertTriangle, MessageSquare, Heart,
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
} from "@/lib/types";
import {
  responderNps, descartarNpsPendente,
  criarTemplateOnboarding, adicionarItemTemplate, removerItemTemplate,
} from "./actions";

type Tab = "onboarding" | "nps" | "saude" | "templates";
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
        {isGestor && (
          <TabBtn v="templates" cur={tab} set={setTab}
            icon={<Layers className="w-3.5 h-3.5" />}
            label={t("pos_venda.tab_templates")} />
        )}
      </div>

      {tab === "onboarding" && <OnboardingTab onboardings={onboardings} t={t} locale={locale} />}
      {tab === "nps" && <NpsTab responses={npsResponses} t={t} locale={locale} onSucesso={onSucesso} onErro={onErro} />}
      {tab === "saude" && <SaudeTab scores={healthScores} resumo={healthResumo} t={t} locale={locale} />}
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
                <Link href={`/pipeline/${o.lead_id}`} className="hover:text-primary transition-colors">
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
                <Link href={`/pipeline/${o.lead_id}`} className="btn-secondary text-xs">
                  {t("pos_venda.onb_btn_ver")}
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  return (
    <>
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
                  <Link href={`/pipeline/${n.lead_id}`} className="hover:text-primary transition-colors">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scores.map((s) => (
              <tr key={s.lead_id} className={`hover:bg-secondary/60 dark:hover:bg-white/[0.04] ${s.categoria === "em_risco" ? "bg-destructive/[0.03]" : ""}`}>
                <td className="px-3 py-2 font-medium">
                  <Link href={`/pipeline/${s.lead_id}`} className="hover:text-primary transition-colors">
                    {s.lead_empresa ?? s.lead_nome ?? `Lead #${s.lead_id}`}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <ScoreBar score={s.health_score} categoria={s.categoria} />
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

// ======================== Helpers ========================
function fmtData(s: string, locale: Locale): string {
  return new Date(s).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}
