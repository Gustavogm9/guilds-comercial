"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { forecastMLAction } from "./forecast-ai-action";
import AiOutputActions from "@/components/ai/ai-output-actions";

/**
 * Botão de insight IA no card de Forecast do /funil.
 * Gera análise preditiva com base nos dados do pipeline.
 */
export default function ForecastAIInsight({ forecastBest, forecastLikely, forecastWorst, leadsAtivos, leadsAltos }: {
  forecastBest: number;
  forecastLikely: number;
  forecastWorst: number;
  leadsAtivos: number;
  leadsAltos: number;
}) {
  const [insight, setInsight] = useState<string | null>(null);
  const [invocationId, setInvocationId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleClick() {
    setErro(null);
    start(async () => {
      const res = await forecastMLAction({
        forecastBest,
        forecastLikely,
        forecastWorst,
        leadsAtivos,
        leadsAltos,
      });
      if (res.ok) {
        setInsight(res.texto);
        setInvocationId(res.invocationId ?? null);
      } else {
        setErro(res.erro ?? "Erro ao gerar insight.");
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:brightness-110 transition"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Bot className="w-3.5 h-3.5" />
        )}
        {insight ? "Atualizar insight IA" : "🤖 Insight IA"}
      </button>

      {insight && (
        <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/25 text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-primary font-semibold mb-2">
            <Sparkles className="w-3 h-3" /> Análise preditiva IA
          </div>
          {insight}
          <div className="mt-2 pt-2 border-t border-primary/20">
            <AiOutputActions invocationId={invocationId} texto={insight} />
          </div>
        </div>
      )}

      {erro && (
        <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/25 text-xs text-destructive">
          {erro}
        </div>
      )}
    </div>
  );
}
