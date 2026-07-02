"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { qualificarBase, promoverParaPipeline, enriquecerLead } from "@/app/(app)/vendas/base/actions";
import type { LeadEnriched } from "@/lib/types";
import { Check, ArrowRight, X, ChevronDown, Sparkles, Loader2, CheckCircle2, AlertCircle, Pencil } from "lucide-react";
import MotivoSaidaModal from "./motivo-saida-modal";
import EditarLeadModal from "./editar-lead-modal";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

/**
 * Ações por row na tabela /base.
 *
 * Fixes:
 *   - Bug 7: enriquecerLead com try/catch + toast de erro
 *   - Bug 8: popover "Qualificar" com click-outside + Esc
 *   - Bug 9: toast feedback após qualificar/promover/enriquecer
 *   - i18n via t()
 *   - A11y: aria-haspopup, aria-expanded, role=menu/menuitem
 */
export default function BaseRowActions({ lead, profiles }: { lead: LeadEnriched; profiles?: { id: string; display_name: string }[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | "qual">(null);
  const [dor, setDor] = useState(lead.dor_principal ?? "");
  const [arquivando, setArquivando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "sucesso" | "erro"; mensagem: string } | null>(null);
  const [enriquecendo, setEnriquecendo] = useState(false);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null);

  // Click outside fecha popover
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open === "qual" && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPopoverCoords({
        top: rect.bottom,
        left: rect.right - 288, // w-72 = 288px
      });
    }
  }, [open]);

  // Esc fecha popover
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) { if (e.key === "Escape") setOpen(null); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.tipo === "sucesso" ? 2500 : 4500;
    const timer = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(timer);
  }, [feedback]);

  function showSucesso(msg: string) { setFeedback({ tipo: "sucesso", mensagem: msg }); }
  function showErro(err: unknown) {
    setFeedback({
      tipo: "erro",
      mensagem: err instanceof Error ? err.message : t("base.row_toast_erro"),
    });
  }

  function handleQualificar() {
    start(async () => {
      try {
        await qualificarBase({
          lead_id: lead.id,
          fit_icp: true,
          dor_principal: dor || undefined,
          temperatura: "Morno",
        });
        setOpen(null);
        showSucesso(t("base.row_toast_qualificado"));
      } catch (e) { showErro(e); }
    });
  }

  function handlePromover() {
    start(async () => {
      try {
        await promoverParaPipeline(lead.id);
        showSucesso(t("base.row_toast_promovido"));
      } catch (e) {
        // promoverParaPipeline tem redirect — se falhar antes, captura aqui
        showErro(e);
      }
    });
  }

  function handleEnriquecer() {
    setEnriquecendo(true);
    start(async () => {
      try {
        await enriquecerLead(lead.id);
        showSucesso(t("base.row_toast_enriquecido"));
      } catch (e) {
        showErro(e);
      } finally {
        setEnriquecendo(false);
      }
    });
  }

  if (lead.funnel_stage === "base_bruta") {
    return (
      <>
        <div className="flex flex-wrap gap-1.5 items-center">
          <div className="relative">
            <button
              ref={btnRef}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(open === "qual" ? null : "qual"); }}
              className="btn-secondary text-xs"
              aria-haspopup="menu"
              aria-expanded={open === "qual"}
              disabled={pending}
            >
              <Check className="w-3.5 h-3.5"/> {t("base.row_qualificar")} <ChevronDown className="w-3 h-3"/>
            </button>
            {open === "qual" && popoverCoords && typeof document !== "undefined" && createPortal(
              <div
                ref={popRef}
                role="menu"
                style={{ top: popoverCoords.top + 4, left: popoverCoords.left }}
                className="fixed z-[999] w-72 bg-popover text-popover-foreground border border-border rounded-md p-3 space-y-2 shadow-stripe-md dark:bg-[hsl(220_5%_10%)] dark:border-white/[0.08]"
              >
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                  {t("base.row_qualificar_titulo")}
                </div>
                <textarea
                  value={dor}
                  onChange={(e) => setDor(e.target.value)}
                  placeholder={t("base.row_qualificar_dor_placeholder")}
                  aria-label={t("base.row_qualificar_dor_placeholder")}
                  className="input-base text-xs min-h-[60px]"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={handleQualificar}
                    className="btn-primary text-xs flex-1"
                  >
                    {pending && <Loader2 className="w-3 h-3 animate-spin" />}
                    {t("base.row_qualificar_tem_fit")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={pending}
                    onClick={() => { setOpen(null); setArquivando(true); }}
                    className="btn-ghost text-xs text-destructive hover:text-destructive"
                  >
                    {t("base.row_qualificar_sem_fit")}
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="btn-ghost text-xs text-muted-foreground hover:text-foreground"
            title="Editar lead"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setArquivando(true)}
            className="btn-ghost text-xs text-muted-foreground hover:text-destructive"
            title={t("base.row_arquivar")}
            aria-label={t("base.row_arquivar")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={pending || enriquecendo}
            onClick={handleEnriquecer}
            className="btn-ghost text-xs text-primary hover:text-accent"
            title={`${t("base.row_enriquecer_ia")} (${t("base.row_enriquecer_ia_demora")})`}
            aria-label={t("base.row_enriquecer_ia")}
          >
            {enriquecendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          </button>
        </div>
        <MotivoSaidaModal
          modo={arquivando ? { tipo: "arquivar", lead_id: lead.id } : null}
          onClose={() => setArquivando(false)}
        />
        {editando && profiles && (
          <EditarLeadModal
            lead={lead}
            profiles={profiles}
            onClose={() => setEditando(false)}
            onSuccess={() => {
              setEditando(false);
              showSucesso("Lead atualizado com sucesso");
            }}
          />
        )}
        {feedback && <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />}
      </>
    );
  }

  if (lead.funnel_stage === "pipeline" || lead.funnel_stage === "arquivado") {
    return (
      <>
        <div className="flex justify-end gap-1.5 items-center">
          {lead.funnel_stage === "pipeline" ? (
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> No Pipeline
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-destructive" /> Arquivado
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="btn-ghost text-xs text-muted-foreground hover:text-foreground ml-1"
            title="Editar lead"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
        {editando && profiles && (
          <EditarLeadModal
            lead={lead}
            profiles={profiles}
            onClose={() => setEditando(false)}
            onSuccess={() => {
              setEditando(false);
              showSucesso("Lead atualizado com sucesso");
            }}
          />
        )}
        {feedback && <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />}
      </>
    );
  }

  // base_qualificada → pode promover
  return (
    <>
      <div className="flex flex-wrap gap-1.5 items-center justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={handlePromover}
          className="btn-primary text-xs"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <ArrowRight className="w-3.5 h-3.5"/> {t("base.row_promover")}
        </button>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="btn-ghost text-xs text-muted-foreground hover:text-foreground"
          title="Editar lead"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setArquivando(true)}
          className="btn-ghost text-xs text-muted-foreground hover:text-destructive"
          title={t("base.row_arquivar")}
          aria-label={t("base.row_arquivar")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <MotivoSaidaModal
        modo={arquivando ? { tipo: "arquivar", lead_id: lead.id } : null}
        onClose={() => setArquivando(false)}
      />
      {editando && profiles && (
        <EditarLeadModal
          lead={lead}
          profiles={profiles}
          onClose={() => setEditando(false)}
          onSuccess={() => {
            setEditando(false);
            showSucesso("Lead atualizado com sucesso");
          }}
        />
      )}
      {feedback && <FeedbackToast feedback={feedback} onClose={() => setFeedback(null)} />}
    </>
  );
}

function FeedbackToast({
  feedback,
  onClose,
}: {
  feedback: { tipo: "sucesso" | "erro"; mensagem: string };
  onClose: () => void;
}) {
  return (
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
      <span className="text-sm text-foreground flex-1">{feedback.mensagem}</span>
      <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
