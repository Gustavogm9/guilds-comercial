"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Inbox, Users, Trophy, Gift, Plus, X,
  CheckCircle2, AlertCircle, Loader2, Clock, ArrowRight,
  Sparkles, TrendingUp,
} from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import type {
  PedidoIndicacaoEnriched,
  IndicacaoEnriched,
  AdvocacyKpis,
  TopEmbaixador,
  StatusPedidoIndicacao,
} from "@/lib/types";
import {
  responderPedidoIndicacao,
  adiarPedidoIndicacao,
  type NovaIndicacaoInput,
} from "./actions";

type Tab = "pendentes" | "indicacoes" | "embaixadores" | "recompensas";
type Feedback = { tipo: "sucesso" | "erro"; mensagem: string };
type T = (key: string) => string;

/**
 * /indicacoes — feature de advocacy / funil borboleta.
 *
 * 4 sub-abas:
 *   1. Pendentes      — pedidos que vendedor precisa responder
 *   2. Indicações     — todas as indicações recebidas (com de quem veio)
 *   3. Embaixadores   — ranking por receita gerada
 *   4. Recompensas    — placeholder fase 2 (UX completa virá depois)
 *
 * Padrões alinhados com /equipe:
 *   - FeedbackToast com aria-live
 *   - role=tablist semântico
 *   - useTransition em mutações
 *   - i18n via t() + .replace() pra placeholders
 */
export default function IndicacoesClient({
  meId,
  isGestor,
  pendentes,
  indicacoes,
  embaixadores,
  kpis,
}: {
  meId: string;
  isGestor: boolean;
  pendentes: PedidoIndicacaoEnriched[];
  indicacoes: IndicacaoEnriched[];
  embaixadores: TopEmbaixador[];
  kpis: AdvocacyKpis | null;
}) {
  const [tab, setTab] = useState<Tab>("pendentes");
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

  const recompensasPendentes = indicacoes.filter(
    (i) => i.status === "fechado" && !i.recompensa_paga,
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("indicacoes.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("indicacoes.subtitulo")}</p>
      </header>

      {kpis && <KpiBar t={t} kpis={kpis} indicacoes={indicacoes} />}

      <div role="tablist" className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
        <TabBtn v="pendentes" cur={tab} set={setTab}
          icon={<Inbox className="w-3.5 h-3.5" />}
          label={t("indicacoes.tab_pendentes").replace("{{n}}", String(pendentes.length))} />
        <TabBtn v="indicacoes" cur={tab} set={setTab}
          icon={<Users className="w-3.5 h-3.5" />}
          label={t("indicacoes.tab_indicacoes")} />
        <TabBtn v="embaixadores" cur={tab} set={setTab}
          icon={<Trophy className="w-3.5 h-3.5" />}
          label={t("indicacoes.tab_embaixadores")} />
        <TabBtn v="recompensas" cur={tab} set={setTab}
          icon={<Gift className="w-3.5 h-3.5" />}
          label={t("indicacoes.tab_recompensas")} />
      </div>

      {tab === "pendentes" && (
        <PendentesTab pendentes={pendentes} t={t} locale={locale}
          onSucesso={(m) => setFeedback({ tipo: "sucesso", mensagem: m })}
          onErro={(e) => setFeedback({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." })} />
      )}
      {tab === "indicacoes" && <IndicacoesTab indicacoes={indicacoes} t={t} locale={locale} />}
      {tab === "embaixadores" && <EmbaixadoresTab embaixadores={embaixadores} t={t} locale={locale} />}
      {tab === "recompensas" && <RecompensasTab recompensas={recompensasPendentes} t={t} locale={locale} />}

      {feedback && <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />}
    </div>
  );
}

// ================== KPI Bar ==================
function KpiBar({ t, kpis, indicacoes }: { t: T; kpis: AdvocacyKpis; indicacoes: IndicacaoEnriched[] }) {
  const fechadosPorIndicacao = indicacoes.filter((i) => i.status === "fechado").length;
  const totalIndicacoes = indicacoes.length;
  const taxaFech = totalIndicacoes > 0 ? Math.round((fechadosPorIndicacao / totalIndicacoes) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <KpiCard
        label={t("indicacoes.kpi_k_factor")}
        value={kpis.k_factor.toFixed(2)}
        sub={t("indicacoes.kpi_k_factor_sub")}
        icon={<Sparkles className="w-4 h-4" />}
        tone="primary"
      />
      <KpiCard
        label={t("indicacoes.kpi_clientes_embaixadores")}
        value={kpis.clientes_que_indicaram.toString()}
        sub={`${kpis.clientes_fechados} fechados`}
        icon={<Users className="w-4 h-4" />}
      />
      <KpiCard
        label={t("indicacoes.kpi_receita_indicacao")}
        value={formatBRL(kpis.receita_via_indicacao)}
        sub={t("indicacoes.kpi_receita_indicacao_sub")}
        icon={<TrendingUp className="w-4 h-4" />}
        tone="success"
      />
      <KpiCard
        label={t("indicacoes.indicacao_status_fechado").replace(" ✨", "")}
        value={`${taxaFech}%`}
        sub={`${fechadosPorIndicacao} de ${totalIndicacoes}`}
        icon={<Trophy className="w-4 h-4" />}
        tone="success"
      />
    </div>
  );
}

function KpiCard({ label, value, sub, icon, tone }: {
  label: string; value: string; sub?: string;
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
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ================== Tab buttons + helpers ==================
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

// ================== Tab: Pendentes ==================
function PendentesTab({ pendentes, t, locale, onSucesso, onErro }: {
  pendentes: PedidoIndicacaoEnriched[]; t: T; locale: Locale;
  onSucesso: (m: string) => void; onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [responderModal, setResponderModal] = useState<PedidoIndicacaoEnriched | null>(null);

  function handleQuickStatus(pedido_id: number, status: StatusPedidoIndicacao, msgKey: string) {
    startTransition(async () => {
      try {
        await responderPedidoIndicacao({ pedido_id, status });
        onSucesso(t(msgKey));
      } catch (e) { onErro(e); }
    });
  }

  function handleAdiar(pedido_id: number, dias = 7) {
    startTransition(async () => {
      try {
        await adiarPedidoIndicacao(pedido_id, dias);
        onSucesso(t("indicacoes.toast_pedido_adiado").replace("{{n}}", String(dias)));
      } catch (e) { onErro(e); }
    });
  }

  if (pendentes.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <h3 className="font-semibold text-sm mb-1">{t("indicacoes.vazio_pendentes_titulo")}</h3>
        <p className="text-xs text-muted-foreground">{t("indicacoes.vazio_pendentes_sub")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.pendentes_th_cliente")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.pendentes_th_vendedor")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.pendentes_th_pedido_em")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.pendentes_th_dias")}</th>
              <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.pendentes_th_momento")}</th>
              <th className="text-right px-3 py-2 font-semibold">{t("indicacoes.pendentes_th_acoes")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pendentes.map((p) => (
              <tr key={p.pedido_id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/pipeline/${p.lead_id}`} className="hover:text-primary transition-colors">
                    {p.lead_empresa ?? p.lead_nome ?? `Lead #${p.lead_id}`}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{p.solicitado_por_nome ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{fmtData(p.data_pedido, locale)}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={`tabular-nums ${p.dias_pendente > 7 ? "text-warning-500 font-semibold" : "text-muted-foreground"}`}>
                    {p.dias_pendente}d
                  </span>
                </td>
                <td className="px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {t(`indicacoes.momento_${p.momento}`)}
                </td>
                <td className="px-3 py-2 text-right space-x-1">
                  <button
                    onClick={() => setResponderModal(p)}
                    disabled={pending}
                    className="btn-primary text-xs"
                  >
                    {pending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3 h-3" aria-hidden="true" />}
                    {t("indicacoes.pendentes_btn_pedir")}
                  </button>
                  <button
                    onClick={() => handleQuickStatus(p.pedido_id, "negado", "indicacoes.toast_pedido_negado")}
                    disabled={pending}
                    className="btn-ghost text-xs text-muted-foreground"
                  >
                    {t("indicacoes.pendentes_btn_negado")}
                  </button>
                  <button
                    onClick={() => handleAdiar(p.pedido_id, 7)}
                    disabled={pending}
                    className="btn-ghost text-xs text-muted-foreground"
                    title={t("indicacoes.pendentes_btn_adiar")}
                  >
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {responderModal && (
        <ResponderModal
          pedido={responderModal}
          t={t}
          onClose={() => setResponderModal(null)}
          onSucesso={(n) => {
            setResponderModal(null);
            onSucesso(t("indicacoes.toast_pedido_respondido").replace("{{n}}", String(n)));
          }}
          onErro={onErro}
        />
      )}
    </>
  );
}

// ================== Modal: Responder ==================
function ResponderModal({ pedido, t, onClose, onSucesso, onErro }: {
  pedido: PedidoIndicacaoEnriched;
  t: T;
  onClose: () => void;
  onSucesso: (n: number) => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [obs, setObs] = useState("");
  const [indicacoes, setIndicacoes] = useState<NovaIndicacaoInput[]>([
    { nome: "", empresa: "", cargo: "", email: "", whatsapp: "", contexto: "" },
  ]);

  function addIndicacao() {
    if (indicacoes.length >= 10) return;
    setIndicacoes([...indicacoes, { nome: "" }]);
  }

  function updateIndicacao(i: number, patch: Partial<NovaIndicacaoInput>) {
    setIndicacoes(indicacoes.map((ind, idx) => idx === i ? { ...ind, ...patch } : ind));
  }

  function removerIndicacao(i: number) {
    if (indicacoes.length === 1) return;
    setIndicacoes(indicacoes.filter((_, idx) => idx !== i));
  }

  function handleSalvar() {
    const validas = indicacoes.filter((i) => i.nome?.trim());
    if (validas.length === 0) {
      onErro(new Error("Adicione ao menos 1 indicação com nome."));
      return;
    }
    startTransition(async () => {
      try {
        const r = await responderPedidoIndicacao({
          pedido_id: pedido.pedido_id,
          status: "respondido",
          observacoes: obs,
          indicacoes: validas,
        });
        onSucesso(r.indicacoes_criadas);
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
        className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">{t("indicacoes.modal_titulo")}</div>
            <div className="text-xs text-muted-foreground">{pedido.lead_empresa}</div>
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label={t("indicacoes.modal_btn_cancelar")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-muted-foreground">{t("indicacoes.modal_sub")}</p>

          {indicacoes.map((ind, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-secondary/30 dark:bg-white/[0.02]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
                  Indicação {i + 1}
                </span>
                {indicacoes.length > 1 && (
                  <button
                    onClick={() => removerIndicacao(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label={`${t("indicacoes.modal_field_nome")} *`}
                  value={ind.nome ?? ""}
                  onChange={(v) => updateIndicacao(i, { nome: v })}
                  required
                />
                <Field
                  label={t("indicacoes.modal_field_empresa")}
                  value={ind.empresa ?? ""}
                  onChange={(v) => updateIndicacao(i, { empresa: v })}
                />
                <Field
                  label={t("indicacoes.modal_field_cargo")}
                  value={ind.cargo ?? ""}
                  onChange={(v) => updateIndicacao(i, { cargo: v })}
                />
                <Field
                  label={t("indicacoes.modal_field_email")}
                  type="email"
                  value={ind.email ?? ""}
                  onChange={(v) => updateIndicacao(i, { email: v })}
                />
                <Field
                  label={t("indicacoes.modal_field_whatsapp")}
                  value={ind.whatsapp ?? ""}
                  onChange={(v) => updateIndicacao(i, { whatsapp: v })}
                />
                <Field
                  label={t("indicacoes.modal_field_linkedin")}
                  value={ind.linkedin ?? ""}
                  onChange={(v) => updateIndicacao(i, { linkedin: v })}
                />
              </div>
              <div>
                <label className="label text-[10px]">{t("indicacoes.modal_field_contexto")}</label>
                <input
                  value={ind.contexto ?? ""}
                  onChange={(e) => updateIndicacao(i, { contexto: e.target.value })}
                  placeholder={t("indicacoes.modal_field_contexto_placeholder")}
                  className="input-base text-xs mt-1"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addIndicacao}
            disabled={indicacoes.length >= 10}
            className="btn-secondary text-xs"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            {t("indicacoes.modal_btn_adicionar")}
          </button>
          {indicacoes.length >= 10 && (
            <p className="text-[11px] text-muted-foreground">{t("indicacoes.modal_max_indicacoes")}</p>
          )}

          <div>
            <label className="label">{t("indicacoes.modal_obs")}</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder={t("indicacoes.modal_obs_placeholder")}
              className="input-base mt-1 min-h-[60px] text-sm"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">{t("indicacoes.modal_btn_cancelar")}</button>
          <button
            onClick={handleSalvar}
            disabled={pending}
            className="btn-primary text-sm"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {t("indicacoes.modal_btn_salvar")}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="label text-[10px]">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="input-base text-xs mt-1"
      />
    </div>
  );
}

// ================== Tab: Indicações ==================
function IndicacoesTab({ indicacoes, t, locale }: {
  indicacoes: IndicacaoEnriched[]; t: T; locale: Locale;
}) {
  if (indicacoes.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Users className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <h3 className="font-semibold text-sm mb-1">{t("indicacoes.vazio_indicacoes_titulo")}</h3>
        <p className="text-xs text-muted-foreground">{t("indicacoes.vazio_indicacoes_sub")}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.indicacao_th_indicado")}</th>
            <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.indicacao_th_embaixador")}</th>
            <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.indicacao_th_status")}</th>
            <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.indicacao_th_vendedor")}</th>
            <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.indicacao_th_data")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {indicacoes.map((i) => (
            <tr key={i.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
              <td className="px-3 py-2">
                <div className="font-medium text-sm">{i.indicado_nome}</div>
                {i.indicado_empresa && <div className="text-xs text-muted-foreground">{i.indicado_empresa}</div>}
                {i.lead_convertido_id && (
                  <Link href={`/pipeline/${i.lead_convertido_id}`} className="text-[10px] text-primary hover:underline">
                    Ver lead →
                  </Link>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {i.embaixador_lead_id ? (
                  <Link href={`/pipeline/${i.embaixador_lead_id}`} className="hover:text-primary transition-colors">
                    {i.embaixador_empresa ?? i.embaixador_nome ?? "—"}
                  </Link>
                ) : (
                  <span className="italic">{i.embaixador_externo_nome ?? "—"}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={i.status} t={t} />
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{i.solicitado_por_nome ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{fmtData(i.data_recebida, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status, t }: { status: IndicacaoEnriched["status"]; t: T }) {
  const cls = {
    recebida: "bg-secondary text-muted-foreground border border-border",
    contactado: "bg-primary/15 text-primary border border-primary/30",
    virou_lead: "bg-warning-500/15 text-warning-500 border border-warning-500/30",
    fechado: "bg-success-500/15 text-success-500 border border-success-500/30",
    perdido: "bg-destructive/15 text-destructive border border-destructive/30",
    descartado: "bg-secondary text-muted-foreground border border-border opacity-60",
  }[status];
  return (
    <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {t(`indicacoes.indicacao_status_${status}`)}
    </span>
  );
}

// ================== Tab: Embaixadores ==================
function EmbaixadoresTab({ embaixadores, t, locale }: {
  embaixadores: TopEmbaixador[]; t: T; locale: Locale;
}) {
  if (embaixadores.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Trophy className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("indicacoes.vazio_embaixadores")}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">#</th>
            <th className="text-left px-3 py-2 font-semibold">{t("indicacoes.embaixador_th_cliente")}</th>
            <th className="text-right px-3 py-2 font-semibold">{t("indicacoes.embaixador_th_qtd")}</th>
            <th className="text-right px-3 py-2 font-semibold">{t("indicacoes.embaixador_th_fechou")}</th>
            <th className="text-right px-3 py-2 font-semibold">{t("indicacoes.embaixador_th_taxa")}</th>
            <th className="text-right px-3 py-2 font-semibold">{t("indicacoes.embaixador_th_receita")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {embaixadores.map((e, idx) => (
            <tr key={e.embaixador_lead_id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
              <td className="px-3 py-2">
                <Link
                  href={`/pipeline/${e.embaixador_lead_id}`}
                  className="font-medium hover:text-primary transition-colors"
                >
                  {e.embaixador_empresa ?? e.embaixador_nome ?? `Lead #${e.embaixador_lead_id}`}
                </Link>
                {e.embaixador_nome && e.embaixador_empresa && (
                  <div className="text-[10px] text-muted-foreground">{e.embaixador_nome}</div>
                )}
              </td>
              <td className="px-3 py-2 text-right text-xs tabular-nums">{e.qtd_indicacoes}</td>
              <td className="px-3 py-2 text-right text-xs tabular-nums text-success-500 font-semibold">{e.qtd_fecharam}</td>
              <td className="px-3 py-2 text-right text-xs tabular-nums">{e.taxa_conversao_pct.toFixed(0)}%</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums font-semibold text-success-500">
                {formatBRL(e.receita_gerada)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ================== Tab: Recompensas (placeholder fase 2) ==================
function RecompensasTab({ recompensas, t, locale }: {
  recompensas: IndicacaoEnriched[]; t: T; locale: Locale;
}) {
  if (recompensas.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Gift className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Sem recompensas pendentes.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Indicações que viraram clientes aparecerão aqui aguardando pagamento.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Embaixador</th>
            <th className="text-left px-3 py-2 font-semibold">Cliente fechado</th>
            <th className="text-right px-3 py-2 font-semibold">Valor</th>
            <th className="text-right px-3 py-2 font-semibold">Data fech.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recompensas.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-xs">
                {r.embaixador_lead_id ? (
                  <Link href={`/pipeline/${r.embaixador_lead_id}`} className="hover:text-primary">
                    {r.embaixador_empresa ?? r.embaixador_nome}
                  </Link>
                ) : (
                  <span className="italic">{r.embaixador_externo_nome}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                <Link href={`/pipeline/${r.lead_convertido_id}`} className="hover:text-primary">
                  {r.lead_convertido_empresa ?? r.indicado_nome}
                </Link>
              </td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">
                {formatBRL(r.lead_convertido_valor ?? 0)}
              </td>
              <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                {r.data_fechado ? fmtData(r.data_fechado, locale) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3 border-t border-border text-[11px] text-muted-foreground italic text-center">
        UI de pagamento de recompensa virá na fase 2.
      </div>
    </div>
  );
}

// ================== Helpers ==================
function fmtData(s: string, locale: Locale): string {
  return new Date(s).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
