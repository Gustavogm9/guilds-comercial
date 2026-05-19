"use client";
import { useEffect, useState, useTransition } from "react";
import { ETAPAS_CRM } from "@/lib/lists";
import { moverEtapa } from "@/app/(app)/hoje/actions";
import { ETAPAS_EXIGEM_MOTIVO } from "@/lib/lists";
import CadenciaModal from "@/components/cadencia-modal";
import QuickActions from "@/components/quick-actions";
import MotivoSaidaModal from "@/components/motivo-saida-modal";
import AjustarCadenciaButton, { type AjustarCadenciaPasso } from "@/components/ajustar-cadencia-button";
import type { CrmStage, LeadEnriched } from "@/lib/types";
import { MessageSquareQuote, Play, AlertCircle, CheckCircle2, X, Loader2, Stethoscope } from "lucide-react";
import { iniciarCadenciaManual } from "@/app/(app)/comunicacao/cadencia/actions";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import RaioxModal from "@/components/raiox/raiox-modal";
import FechamentoCelebrationModal from "@/components/fechamento-celebration-modal";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

/**
 * Ações principais no header do detalhe do lead.
 *
 * Fixes desta rodada:
 *   - Issue 9: select de etapa rolla back se cancelar modal de motivo
 *     (antes ficava preso em "Perdido" mesmo após cancelar)
 *   - Issue 10: alert() nativo → toast + confirmação inline pro "Iniciar Cadência"
 *   - Issue 18: i18n em todas as strings
 *   - Issue 36: aria-label no select
 */
export default function LeadDetailActions({
  lead, vendedor, cadencia,
}: {
  lead: LeadEnriched;
  vendedor: string;
  cadencia?: AjustarCadenciaPasso[];
}) {
  const [open, setOpen] = useState(false);
  const [raioxOpen, setRaioxOpen] = useState(false);
  const [motivoModo, setMotivoModo] = useState<{ lead_id: number; destino: CrmStage; etapaOriginal: CrmStage | null } | null>(null);
  const [confirmIniciarCadencia, setConfirmIniciarCadencia] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "sucesso" | "erro"; mensagem: string } | null>(null);
  const [pending, start] = useTransition();
  // Issue 9: state local pro select acompanhar (controlled). Se modal cancelar,
  // volta pro valor original do lead.
  const [etapaSelecionada, setEtapaSelecionada] = useState<string>(lead.crm_stage ?? "");
  const [celebracaoOpen, setCelebracaoOpen] = useState(false);
  const [pedidoIndicacaoId, setPedidoIndicacaoId] = useState<number | null>(null);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  // Auto-dismiss toast
  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.tipo === "sucesso" ? 2500 : 4500;
    const timer = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(timer);
  }, [feedback]);

  function handleChangeEtapa(novaEtapa: CrmStage) {
    setEtapaSelecionada(novaEtapa);
    if (ETAPAS_EXIGEM_MOTIVO.includes(novaEtapa)) {
      setMotivoModo({ lead_id: lead.id, destino: novaEtapa, etapaOriginal: lead.crm_stage });
      return;
    }
    start(async () => {
      try {
        await moverEtapa(lead.id, novaEtapa);
        setFeedback({
          tipo: "sucesso",
          mensagem: t("pipeline.toast_movido").replace("{{stage}}", t(`pipeline_etapas.${novaEtapa}`)),
        });
        // Bloco D: ao fechar lead, dispara modal de celebração + pedido de indicação
        if (novaEtapa === "Fechado" && lead.crm_stage !== "Fechado") {
          // Trigger SQL acabou de criar pedido_indicacao automático.
          // Aguardamos brevemente (50ms) e buscamos o id pra passar ao modal.
          setTimeout(async () => {
            try {
              const sb = createBrowserClient();
              const { data } = await sb
                .from("pedidos_indicacao")
                .select("id")
                .eq("lead_id", lead.id)
                .eq("momento", "pos_fechamento")
                .eq("status", "pendente")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (data?.id) {
                setPedidoIndicacaoId(data.id as number);
                setCelebracaoOpen(true);
              }
            } catch {
              // Silencioso — modal só abre se pedido foi criado
            }
          }, 200);
        }
      } catch (err) {
        // Rollback
        setEtapaSelecionada(lead.crm_stage ?? "");
        setFeedback({
          tipo: "erro",
          mensagem: err instanceof Error ? err.message : t("pipeline.toast_movido_erro"),
        });
      }
    });
  }

  // Issue 9: ao cancelar modal de motivo, volta select pro valor original
  function handleCloseMotivo() {
    if (motivoModo) {
      setEtapaSelecionada(motivoModo.etapaOriginal ?? "");
    }
    setMotivoModo(null);
  }

  // Issue 10: confirmação inline + toast
  function executarIniciarCadencia() {
    setConfirmIniciarCadencia(false);
    start(async () => {
      try {
        await iniciarCadenciaManual(lead.id);
        setFeedback({ tipo: "sucesso", mensagem: t("pipeline.actions_cadencia_sucesso") });
      } catch (err) {
        setFeedback({
          tipo: "erro",
          mensagem: err instanceof Error ? err.message : t("hoje.qa_toast_erro"),
        });
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={etapaSelecionada}
          onChange={(e) => handleChangeEtapa(e.target.value as CrmStage)}
          aria-label={t("pipeline.actions_etapa_aria")}
          disabled={pending}
          className="input-base !w-44 !text-xs"
        >
          <option value="" disabled>{t("pipeline.actions_etapa_placeholder")}</option>
          {ETAPAS_CRM.map((e) => (
            <option key={e} value={e}>{t(`pipeline_etapas.${e}`)}</option>
          ))}
        </select>

        <QuickActions lead={lead} />
        <AjustarCadenciaButton
          leadId={lead.id}
          proximaAcao={lead.proxima_acao}
          dataProximaAcao={lead.data_proxima_acao}
          passos={cadencia}
        />

        <button
          onClick={() => setOpen(true)}
          className="btn-primary text-xs"
          type="button"
        >
          <MessageSquareQuote className="w-3.5 h-3.5" /> {t("pipeline.actions_templates")}
        </button>

        <button
          onClick={() => setConfirmIniciarCadencia(true)}
          disabled={pending}
          className="btn-ghost text-xs font-medium text-primary hover:bg-primary/10"
          title={t("pipeline.actions_iniciar_cadencia_msg_confirm")}
          type="button"
        >
          <Play className="w-3.5 h-3.5 mr-1" />
          {t("pipeline.actions_iniciar_cadencia")}
        </button>

        <button
          onClick={() => setRaioxOpen(true)}
          className="btn-ghost text-xs font-medium text-primary hover:bg-primary/10"
          type="button"
        >
          <Stethoscope className="w-3.5 h-3.5 mr-1" />
          Executar Raio-X
        </button>

        <CadenciaModal open={open} onClose={() => setOpen(false)} lead={lead} vendedor={vendedor} />
        <RaioxModal open={raioxOpen} onClose={() => setRaioxOpen(false)} leadId={lead.id} />
        <MotivoSaidaModal
          modo={motivoModo ? { tipo: "mover", lead_id: motivoModo.lead_id, destino: motivoModo.destino } : null}
          onClose={handleCloseMotivo}
        />
      </div>

      {/* Confirmação inline pra Iniciar Cadência */}
      {confirmIniciarCadencia && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setConfirmIniciarCadencia(false)}
        >
          <div
            className="bg-card text-foreground border border-border rounded-xl max-w-sm w-full p-6 shadow-stripe-md"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cadencia-confirm-titulo"
          >
            <div className="w-12 h-12 rounded-full bg-warning-500/10 text-warning-500 grid place-items-center mx-auto mb-4">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3
              id="cadencia-confirm-titulo"
              className="text-base font-semibold text-foreground text-center"
              style={{ letterSpacing: "-0.24px" }}
            >
              {t("pipeline.actions_iniciar_cadencia_titulo_confirm")}
            </h3>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {t("pipeline.actions_iniciar_cadencia_msg_confirm")}
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmIniciarCadencia(false)}
                disabled={pending}
                className="btn-secondary text-sm flex-1"
                type="button"
              >
                {t("pipeline.actions_iniciar_cadencia_nao")}
              </button>
              <button
                onClick={executarIniciarCadencia}
                disabled={pending}
                className="btn-primary text-sm flex-1"
                type="button"
              >
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t("pipeline.actions_iniciar_cadencia_sim")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast feedback */}
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
          <span className="text-sm text-foreground flex-1">{feedback.mensagem}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal celebração + pedido de indicação imediato (Bloco D) */}
      <FechamentoCelebrationModal
        open={celebracaoOpen}
        pedidoId={pedidoIndicacaoId}
        leadEmpresa={lead.empresa}
        leadNome={lead.nome}
        onClose={() => setCelebracaoOpen(false)}
      />
    </>
  );
}
