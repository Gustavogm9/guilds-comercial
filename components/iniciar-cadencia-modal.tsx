"use client";

import { useState, useTransition, useEffect } from "react";
import { buscarLeadsParaCadencia, iniciarCadenciaManual } from "@/app/(app)/cadencia/actions";
import { X, Play, Search, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

type LeadLite = {
  id: number;
  nome: string | null;
  empresa: string | null;
  email: string | null;
};

type ConfirmacaoLead = LeadLite | null;

type FeedbackToast = { tipo: "sucesso" | "erro"; mensagem: string } | null;

/**
 * Modal "Nova Cadência" — busca um lead do pipeline e inicia/reinicia os 6 passos.
 *
 * UX:
 *   - i18n via getClientLocale() — pt-BR + en-US.
 *   - Sem confirm()/alert() nativos: usa overlay de confirmação inline e toast
 *     temporário no canto inferior pra feedback. Mais consistente com o sistema
 *     e acessível (focus trap mantido dentro do modal).
 *   - Search com debounce de 400ms.
 *   - Preserva passos enviados/respondidos (action `iniciarCadenciaManual` faz isso).
 */
export default function IniciarCadenciaModal() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [confirmando, setConfirmando] = useState<ConfirmacaoLead>(null);
  const [feedback, setFeedback] = useState<FeedbackToast>(null);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setSearch("");
      setLeads([]);
      setConfirmando(null);
    }
  }, [open]);

  // Search debounced
  useEffect(() => {
    if (!search || search.length < 2) {
      setLeads([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await buscarLeadsParaCadencia(search);
        setLeads(res as LeadLite[]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Auto-dismiss do toast de feedback
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), feedback.tipo === "sucesso" ? 3000 : 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  function pedirConfirmacao(lead: LeadLite) {
    setConfirmando(lead);
  }

  function executarIniciar() {
    if (!confirmando) return;
    const leadAlvo = confirmando;
    start(async () => {
      try {
        await iniciarCadenciaManual(leadAlvo.id);
        setConfirmando(null);
        setOpen(false);
        setFeedback({ tipo: "sucesso", mensagem: t("paginas.cadencia_modal_sucesso") });
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("paginas.cadencia_modal_erro_generico");
        setConfirmando(null);
        setFeedback({ tipo: "erro", mensagem: msg });
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-primary text-xs shrink-0"
        type="button"
      >
        <Play className="w-3.5 h-3.5 mr-1" />
        {t("paginas.cadencia_nova_btn")}
      </button>

      {/* Toast de feedback (canto inferior direito) */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 right-6 md:right-8 md:bottom-28 z-[100] max-w-sm card p-3 flex items-start gap-2.5 shadow-stripe-md animate-in fade-in slide-in-from-bottom-2 ${
            feedback.tipo === "sucesso"
              ? "border-success-500/30 bg-success-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          {feedback.tipo === "sucesso" ? (
            <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          )}
          <span className="text-sm text-foreground flex-1" style={{ letterSpacing: "-0.13px" }}>
            {feedback.mensagem}
          </span>
          <button
            onClick={() => setFeedback(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("comum.cancelar")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal principal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && !confirmando && setOpen(false)}
        >
          <div
            className="relative bg-card text-foreground border border-border rounded-xl max-w-lg w-full flex flex-col max-h-[80vh] shadow-stripe-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="iniciar-cadencia-titulo"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 id="iniciar-cadencia-titulo" className="font-semibold text-sm" style={{ letterSpacing: "-0.13px" }}>
                {t("paginas.cadencia_modal_titulo")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost"
                disabled={pending}
                aria-label={t("modais.fechar")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-4">
                {t("paginas.cadencia_modal_descricao")}
              </p>

              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("paginas.cadencia_modal_buscar_placeholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-base w-full pl-9"
                  disabled={pending}
                  autoFocus
                />
              </div>

              {loading && (
                <div className="text-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" />
                </div>
              )}

              {!loading && search.length >= 2 && leads.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-4">
                  {t("paginas.cadencia_modal_nenhum_lead").replace("{{q}}", search)}
                </div>
              )}

              {!loading && leads.length > 0 && (
                <div className="space-y-2">
                  {leads.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-3 border border-border rounded-lg flex items-center justify-between gap-3 hover:bg-secondary/40 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate" style={{ letterSpacing: "-0.13px" }}>
                          {lead.empresa || lead.nome || "(?)"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {lead.nome ? lead.nome : lead.email}
                        </div>
                      </div>
                      <button
                        onClick={() => pedirConfirmacao(lead)}
                        disabled={pending}
                        className="btn-primary text-xs shrink-0"
                        type="button"
                      >
                        {t("paginas.cadencia_modal_iniciar_btn")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirmação inline (overlay sobre o conteúdo) */}
            {confirmando && (
              <div
                className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-xl flex items-center justify-center p-6 z-10"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-iniciar-titulo"
              >
                <div className="max-w-sm w-full text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-warning-500/10 text-warning-500 grid place-items-center mx-auto">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <h3
                    id="confirm-iniciar-titulo"
                    className="text-base font-semibold text-foreground"
                    style={{ letterSpacing: "-0.24px" }}
                  >
                    {t("paginas.cadencia_modal_confirmar_titulo").replace(
                      "{{empresa}}",
                      confirmando.empresa || confirmando.nome || "(?)",
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("paginas.cadencia_modal_confirmar_msg")}
                  </p>
                  <div className="flex items-center gap-2 justify-center pt-2">
                    <button
                      onClick={() => setConfirmando(null)}
                      disabled={pending}
                      className="btn-secondary text-sm flex-1"
                      type="button"
                    >
                      {t("paginas.cadencia_modal_confirmar_nao")}
                    </button>
                    <button
                      onClick={executarIniciar}
                      disabled={pending}
                      className="btn-primary text-sm flex-1"
                      type="button"
                    >
                      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {t("paginas.cadencia_modal_confirmar_sim")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
