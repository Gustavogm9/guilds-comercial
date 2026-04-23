"use client";
import { useState, useTransition } from "react";
import { nextBestAction } from "@/lib/ai/actions";
import { Bot, Sparkles, Copy, AlertCircle } from "lucide-react";

/**
 * Card "Next Best Action" — narrativa da IA ao lado do score.
 * Expande o /pipeline/[id] com recomendação contextual gerada sob demanda.
 * Chama a feature `next_best_action` via dispatcher (com prompt versionado e logado).
 */
export default function NextBestActionCard({
  leadId, empresa, score, rotuloScore, crmStage,
  diasSemTocar, ultimaInteracao, tomAnterior, dorPrincipal,
  cadenciaPendente, valorPotencial,
}: {
  leadId: number;
  empresa: string;
  score: number;
  rotuloScore: string;
  crmStage: string;
  diasSemTocar: number;
  ultimaInteracao: string;
  tomAnterior: string;
  dorPrincipal: string;
  cadenciaPendente: string;
  valorPotencial: number;
}) {
  const [pending, start] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [custo, setCusto] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);

  function gerar() {
    setErro(null);
    setCopiado(false);
    start(async () => {
      const r = await nextBestAction({
        leadId, empresa, score, rotulo_score: rotuloScore, crm_stage: crmStage,
        dias_sem_tocar: diasSemTocar, ultima_interacao: ultimaInteracao,
        tom_anterior: tomAnterior, dor_principal: dorPrincipal,
        cadencia_pendente: cadenciaPendente, valor_potencial: valorPotencial,
      });
      if (!r.ok) {
        setErro(r.erro ?? "Erro desconhecido");
        return;
      }
      setResultado(r.texto);
      setCusto(r.custoUsd);
    });
  }

  function copiar() {
    if (!resultado) return;
    navigator.clipboard.writeText(resultado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-700">Próxima melhor ação</div>
            <div className="text-[10px] text-slate-500">Gerada pela IA com base no contexto completo</div>
          </div>
        </div>
        {!resultado && !pending && (
          <button onClick={gerar} className="btn-primary text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Gerar com IA
          </button>
        )}
        {pending && (
          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-guild-500 border-t-transparent rounded-full animate-spin"/>
            Pensando…
          </span>
        )}
      </div>

      {erro && (
        <div className="mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>{erro}</div>
        </div>
      )}

      {resultado && (
        <div className="mt-3 p-3 rounded-lg bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200">
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{resultado}</div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-violet-200/60">
            <div className="text-[10px] text-slate-500">
              Custo estimado: ${custo?.toFixed(4) ?? "0"}
            </div>
            <div className="flex gap-1.5">
              <button onClick={copiar} className="btn-ghost text-xs text-slate-600">
                <Copy className="w-3 h-3" /> {copiado ? "Copiado!" : "Copiar"}
              </button>
              <button onClick={gerar} disabled={pending} className="btn-ghost text-xs text-guild-600">
                <Sparkles className="w-3 h-3" /> Regerar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
