"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { PhoneCall, MessageSquare, X, Calendar, ChevronDown, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { registrarLigacao, registrarToque, adiarAcao } from "@/app/(app)/hoje/actions";
import type { LeadEnriched } from "@/lib/types";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import MotivoSaidaModal from "./motivo-saida-modal";
import VoiceNoteRecorder from "./voice-note-recorder";

/**
 * Ações rápidas no card de lead da /hoje.
 *
 * Coberto:
 *   - "Liguei" abre dropdown com 6 resultados pré-set + observação opcional
 *   - "Mandei WhatsApp" registra toque + atualiza próxima ação D3
 *   - "Adiar" 1/3/7 dias
 *   - "Sem fit" → abre MotivoSaidaModal pra mover lead pra Nutrição (era bug:
 *     antes só registrava ligação, lead continuava em Prospecção)
 *
 * UX:
 *   - Click fora fecha popovers
 *   - Esc fecha popovers
 *   - Toast de feedback (sucesso/erro) no canto inferior direito
 *   - i18n via getClientLocale + getT
 *   - aria-haspopup, aria-expanded, role=menu
 *
 * Strings dos `RESULTADOS_RAPIDOS` são traduzidas pra UI mas o `valor enviado
 * ao DB` continua canônico (PT) — assim queries em outras telas não quebram
 * com locales mistos.
 */

type ResultadoRapido = {
  /** Valor canônico armazenado no DB (sempre PT — chave compartilhada) */
  v: string;
  /** Chave i18n pra label visual */
  labelKey: string;
  /** Chave i18n pra label de "próxima ação" (também armazenado em PT no DB) */
  proxKey: string;
  /** Valor canônico de próxima ação no DB (sempre PT) */
  prox: string;
  dias: number;
};

const RESULTADOS_RAPIDOS: ResultadoRapido[] = [
  { v: "Atendeu e qualificou",    labelKey: "hoje.qa_resultado_atendeu_qualificou",     prox: "Enviar Raio-X",      proxKey: "hoje.qa_proxima_enviar_raiox",   dias: 1 },
  { v: "Atendeu e pediu retorno", labelKey: "hoje.qa_resultado_atendeu_pediu_retorno",  prox: "Ligar",              proxKey: "hoje.qa_proxima_ligar",          dias: 3 },
  { v: "Atendeu e sem fit",       labelKey: "hoje.qa_resultado_atendeu_sem_fit",        prox: "Entrar em nutrição", proxKey: "hoje.qa_proxima_nutricao",       dias: 30 },
  { v: "Sem resposta",            labelKey: "hoje.qa_resultado_sem_resposta",           prox: "Enviar D3",          proxKey: "hoje.qa_proxima_enviar_d3",      dias: 3 },
  { v: "Caixa postal",            labelKey: "hoje.qa_resultado_caixa_postal",           prox: "Ligar",              proxKey: "hoje.qa_proxima_ligar",          dias: 1 },
  { v: "Agendou call",            labelKey: "hoje.qa_resultado_agendou_call",           prox: "Agendar call",       proxKey: "hoje.qa_proxima_agendar_call",   dias: 0 },
];

const DIAS_ADIAR = [1, 3, 7] as const;

type FeedbackToast = { tipo: "sucesso" | "erro"; mensagem: string } | null;

export default function QuickActions({ lead }: { lead: LeadEnriched }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | "lig" | "adiar">(null);
  const [obs, setObs] = useState("");
  const [feedback, setFeedback] = useState<FeedbackToast>(null);
  const [movendoNutricao, setMovendoNutricao] = useState(false);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const ligRef = useRef<HTMLDivElement>(null);
  const adiarRef = useRef<HTMLDivElement>(null);

  // ===== UX 14: click fora fecha popover =====
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (open === "lig" && ligRef.current && !ligRef.current.contains(target)) setOpen(null);
      if (open === "adiar" && adiarRef.current && !adiarRef.current.contains(target)) setOpen(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ===== A11y 23: Esc fecha popover =====
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Auto-dismiss do toast
  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.tipo === "sucesso" ? 2500 : 4500;
    const timer = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(timer);
  }, [feedback]);

  function dataAhead(dias: number) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function showSucesso(msg: string) {
    setFeedback({ tipo: "sucesso", mensagem: msg });
  }

  function showErro(err: unknown) {
    const msg = err instanceof Error ? err.message : t("hoje.qa_toast_erro");
    setFeedback({ tipo: "erro", mensagem: msg });
  }

  function handleLiguei(r: ResultadoRapido) {
    start(async () => {
      try {
        await registrarLigacao({
          lead_id: lead.id,
          resultado: r.v,
          proxima_acao: r.prox,
          data_proxima_acao: dataAhead(r.dias),
          observacoes: obs || undefined,
        });
        setOpen(null);
        setObs("");
        showSucesso(t("hoje.qa_toast_ligacao_registrada"));
      } catch (e) {
        showErro(e);
      }
    });
  }

  function handleWhatsApp() {
    start(async () => {
      try {
        await registrarToque({
          lead_id: lead.id,
          canal: "WhatsApp",
          proxima_acao: "Enviar D3",
          data_proxima_acao: dataAhead(3),
        });
        showSucesso(t("hoje.qa_toast_toque_registrado"));
      } catch (e) {
        showErro(e);
      }
    });
  }

  function handleAdiar(d: number) {
    start(async () => {
      try {
        await adiarAcao(lead.id, d);
        setOpen(null);
        showSucesso(t("hoje.qa_toast_acao_adiada").replace("{{n}}", String(d)));
      } catch (e) {
        showErro(e);
      }
    });
  }

  function handleSemFit() {
    // Bug 1: antes só registrava ligação. Agora abre modal pra mover pra Nutrição
    // (Nutrição exige motivo obrigatório, modal cuida do fluxo).
    setMovendoNutricao(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Voice note recorder — registro rápido por áudio */}
        <VoiceNoteRecorder leadId={lead.id} />

        {/* "Liguei" — popover com 6 resultados pré-set */}
        <div className="relative" ref={ligRef}>
          <button
            type="button"
            onClick={() => setOpen(open === "lig" ? null : "lig")}
            className="btn-secondary text-xs"
            aria-haspopup="menu"
            aria-expanded={open === "lig"}
            disabled={pending}
          >
            <PhoneCall className="w-3.5 h-3.5" /> {t("hoje.qa_liguei")} <ChevronDown className="w-3 h-3" />
          </button>
          {open === "lig" && (
            <div
              role="menu"
              className="absolute z-20 mt-1 w-72 bg-popover text-popover-foreground border border-border rounded-md p-2 shadow-stripe-md dark:bg-[hsl(220_5%_10%)] dark:border-white/[0.08]"
            >
              {/* UX 17: Input obs ANTES dos resultados */}
              <input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={t("hoje.qa_observacao_placeholder")}
                aria-label={t("hoje.qa_observacao_placeholder")}
                className="input-base text-xs mb-2"
                disabled={pending}
              />
              {RESULTADOS_RAPIDOS.map((r) => (
                <button
                  key={r.v}
                  role="menuitem"
                  type="button"
                  disabled={pending}
                  onClick={() => handleLiguei(r)}
                  className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-secondary dark:hover:bg-white/[0.04] transition-colors"
                >
                  {t(r.labelKey)}
                  <span className="text-[10px] text-muted-foreground ml-2">→ {t(r.proxKey)} (+{r.dias}d)</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* "Mandei WhatsApp" — toque direto */}
        <button
          type="button"
          disabled={pending}
          onClick={handleWhatsApp}
          className="btn-secondary text-xs"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
          {t("hoje.qa_mandei_whatsapp")}
        </button>

        {/* "Adiar" — popover com 1/3/7 dias */}
        <div className="relative" ref={adiarRef}>
          <button
            type="button"
            onClick={() => setOpen(open === "adiar" ? null : "adiar")}
            className="btn-ghost text-xs"
            aria-haspopup="menu"
            aria-expanded={open === "adiar"}
            disabled={pending}
          >
            <Calendar className="w-3.5 h-3.5" /> {t("hoje.qa_adiar")}
          </button>
          {open === "adiar" && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-40 bg-popover text-popover-foreground border border-border rounded-md p-2 shadow-stripe-md dark:bg-[hsl(220_5%_10%)] dark:border-white/[0.08]"
            >
              {DIAS_ADIAR.map((d) => (
                <button
                  key={d}
                  role="menuitem"
                  type="button"
                  disabled={pending}
                  onClick={() => handleAdiar(d)}
                  className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-secondary dark:hover:bg-white/[0.04] transition-colors"
                >
                  +{d === 1 ? t("hoje.qa_dia_singular").replace("{{n}}", "1") : t("hoje.qa_dia_plural").replace("{{n}}", String(d))}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* "Sem fit" — agora move pra Nutrição via modal */}
        <button
          type="button"
          disabled={pending}
          onClick={handleSemFit}
          className="btn-ghost text-xs text-muted-foreground hover:text-destructive"
        >
          <X className="w-3.5 h-3.5" /> {t("hoje.qa_sem_fit")}
        </button>
      </div>

      {/* Modal de motivo (mover pra Nutrição) */}
      <MotivoSaidaModal
        modo={movendoNutricao ? { tipo: "mover", lead_id: lead.id, destino: "Nutrição" } : null}
        onClose={() => setMovendoNutricao(false)}
      />

      {/* Toast de feedback */}
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
    </>
  );
}
