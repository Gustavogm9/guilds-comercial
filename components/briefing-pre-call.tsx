"use client";

import { useState, useTransition } from "react";
import { ClipboardList, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import { gerarBriefingPreCall } from "./briefing-pre-call-action";

/**
 * Card expandível que gera um Briefing IA antes de uma call agendada.
 * Só aparece em leads com crm_stage === "Call Marcada".
 */
export default function BriefingPreCall({ leadId, empresa, nome, segmento, dorPrincipal, observacoes }: {
  leadId: number;
  empresa?: string | null;
  nome?: string | null;
  segmento?: string | null;
  dorPrincipal?: string | null;
  observacoes?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleClick() {
    if (resultado) {
      setAberto(!aberto);
      return;
    }
    setAberto(true);
    setErro(null);
    start(async () => {
      const res = await gerarBriefingPreCall({
        leadId,
        empresa: empresa ?? undefined,
        nome: nome ?? undefined,
        segmento: segmento ?? undefined,
        dorPrincipal: dorPrincipal ?? undefined,
        observacoes: observacoes ?? undefined,
      });
      if (res.ok) {
        setResultado(res.texto);
      } else {
        setErro(res.erro ?? "Erro ao gerar briefing.");
      }
    });
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ClipboardList className="w-3.5 h-3.5" />
        )}
        {resultado ? "Briefing IA" : "📋 Preparar Briefing IA"}
        {resultado && (aberto ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>

      {aberto && resultado && (
        <div className="mt-2 p-3 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed animate-in slide-in-from-top-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-indigo-500 font-semibold mb-2">
            <Sparkles className="w-3 h-3" /> Briefing pré-call
          </div>
          {resultado}
        </div>
      )}

      {aberto && erro && (
        <div className="mt-2 p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {erro}
        </div>
      )}
    </div>
  );
}
