"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Star, ThumbsUp, ThumbsDown, Sparkles } from "lucide-react";
import { promoverInvocacaoAExemplo, registrarUsoOutput } from "@/app/(app)/admin/ai/fewshot-actions";
import { registrarEventoExperimento } from "@/app/(app)/admin/ai/experimentos-actions";

/**
 * Barra de ações compacta para outputs de IA. Plugar onde a UI mostra texto
 * gerado pela IA (cadência, NBA, briefing, proposta, etc.).
 *
 * Implementa os 3 hooks de auto-evolução:
 *  - Copiar → clipboard + `registrarUsoOutput` (auto_clicado, score 60)
 *  - Estrela → `promoverInvocacaoAExemplo` (manual, score 80, gestor only)
 *  - 👍/👎 → `registrarEventoExperimento` (só tem efeito se invocação faz parte de experimento A/B)
 *
 * Props mínimas: `invocationId` (do `InvokeAIResult.invocationId`) e `texto`.
 *
 * Notas:
 *  - Permission check de gestor é server-side (action retorna erro pra outros).
 *  - Eventos de experimento sempre exibidos: se invocação não faz parte de
 *    experimento, o UPDATE no banco não acha row e a função retorna false (sem efeito).
 *  - Se `invocationId` é null (raro), só mostra Copiar (sem registro).
 */
export default function AiOutputActions({
  invocationId,
  texto,
  className = "",
}: {
  invocationId: number | null;
  texto: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const [exemploRegistrado, setExemploRegistrado] = useState(false);
  const [feedback, setFeedback] = useState<"aceito" | "recusado" | null>(null);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function copiar() {
    setErro(null);
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
    // Hook auto_clicado — silencioso, best-effort
    if (invocationId) {
      registrarUsoOutput(invocationId).catch(() => {});
    }
  }

  function marcarExemplo() {
    if (!invocationId) return;
    setErro(null);
    start(async () => {
      const r = await promoverInvocacaoAExemplo(invocationId);
      if (r.error) {
        setErro(r.error);
      } else {
        setExemploRegistrado(true);
      }
    });
  }

  function feedbackClick(evento: "aceito" | "recusado" | "copiado") {
    if (!invocationId) return;
    setFeedback(evento === "recusado" ? "recusado" : "aceito");
    registrarEventoExperimento(invocationId, evento).catch(() => {});
  }

  return (
    <div className={`flex items-center justify-between gap-2 flex-wrap ${className}`}>
      <div className="flex items-center gap-1">
        {/* Feedback A/B (silencioso fora de experimento) */}
        <button
          type="button"
          onClick={() => feedbackClick("aceito")}
          disabled={feedback === "aceito"}
          title="Útil — ajuda o A/B test do prompt"
          className={`btn-ghost text-xs ${feedback === "aceito" ? "text-success-500" : "text-muted-foreground"}`}
        >
          <ThumbsUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => feedbackClick("recusado")}
          disabled={feedback === "recusado"}
          title="Não usei — ajuda o A/B test"
          className={`btn-ghost text-xs ${feedback === "recusado" ? "text-urgent-500" : "text-muted-foreground"}`}
        >
          <ThumbsDown className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        {/* Marcar como exemplo manual */}
        {invocationId && !exemploRegistrado && (
          <button
            type="button"
            onClick={marcarExemplo}
            disabled={pending}
            title="Marcar este output como exemplo de referência (gestor) — IA aprende a partir daqui"
            className="btn-ghost text-xs text-muted-foreground hover:text-warning-500"
          >
            <Star className="w-3 h-3" />
            <span className="hidden sm:inline">Salvar como exemplo</span>
          </button>
        )}
        {exemploRegistrado && (
          <span className="text-xs text-warning-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Exemplo salvo
          </span>
        )}

        {/* Copiar */}
        <button
          type="button"
          onClick={copiar}
          className="btn-ghost text-xs text-muted-foreground hover:text-foreground"
          title="Copiar para clipboard"
        >
          {copiado ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
          <span>{copiado ? "Copiado" : "Copiar"}</span>
        </button>
      </div>

      {erro && (
        <div className="w-full text-[11px] text-urgent-500">
          {erro}
        </div>
      )}
    </div>
  );
}
