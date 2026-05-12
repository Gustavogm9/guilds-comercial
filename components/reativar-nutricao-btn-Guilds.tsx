"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, RotateCcw } from "lucide-react";
import { reativarNutricaoAction } from "./reativar-nutricao-action";
import AiOutputActions from "@/components/ai/ai-output-actions";

/**
 * Botão ✨ Reativar com IA para leads em stage "Nutrição".
 * Gera sugestão de abordagem para reengajar o lead.
 */
export default function ReativarNutricaoBtn({ leadId, empresa, nome, segmento, motivo }: {
  leadId: number;
  empresa?: string | null;
  nome?: string | null;
  segmento?: string | null;
  motivo?: string | null;
}) {
  const [resultado, setResultado] = useState<string | null>(null);
  const [invocationId, setInvocationId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleClick() {
    setErro(null);
    start(async () => {
      const res = await reativarNutricaoAction({
        leadId,
        empresa: empresa ?? undefined,
        nome: nome ?? undefined,
        segmento: segmento ?? undefined,
        motivo: motivo ?? undefined,
      });
      if (res.ok) {
        setResultado(res.texto);
        setInvocationId(res.invocationId ?? null);
      } else {
        setErro(res.erro ?? "Erro ao gerar sugestão.");
      }
    });
  }

  if (resultado) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-success-500/10 border border-success-500/25 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-success-500 font-semibold flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Sugestão de reativação
          </span>
          <button
            onClick={handleClick}
            disabled={pending}
            className="text-[10px] text-success-500 hover:underline underline-offset-2"
          >
            Gerar outra
          </button>
        </div>
        {resultado}
        <div className="mt-2 pt-2 border-t border-success-500/20">
          <AiOutputActions invocationId={invocationId} texto={resultado} />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="btn-secondary text-xs inline-flex items-center gap-1.5"
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      Reativar com IA
      {erro && <span className="text-destructive ml-1">({erro})</span>}
    </button>
  );
}
