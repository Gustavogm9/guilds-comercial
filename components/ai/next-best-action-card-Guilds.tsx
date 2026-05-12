"use client";
import { useState, useTransition } from "react";
import { nextBestAction } from "@/lib/ai/actions";
import { Bot, Sparkles, AlertCircle } from "lucide-react";
import AiOutputActions from "@/components/ai/ai-output-actions";

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
  const [invocationId, setInvocationId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [custo, setCusto] = useState<number | null>(null);

  function gerar() {
    setErro(null);
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
      setInvocationId(r.invocationId);
      setCusto(r.custoUsd);
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-border dark:border-white/[0.06]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground" style={{ letterSpacing: "-0.13px" }}>Próxima melhor ação</div>
            <div className="text-[10px] text-muted-foreground">Gerada pela IA com base no contexto completo</div>
          </div>
        </div>
        {!resultado && !pending && (
          <button onClick={gerar} className="btn-primary text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Gerar com IA
          </button>
        )}
        {pending && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
            Pensando…
          </span>
        )}
      </div>

      {erro && (
        <div className="mt-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/25 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>{erro}</div>
        </div>
      )}

      {resultado && (
        <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{resultado}</div>
          <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-primary/15 flex-wrap">
            <div className="text-[10px] text-muted-foreground tabular-nums">
              Custo estimado: ${custo?.toFixed(4) ?? "0"}
            </div>
            <div className="flex items-center gap-2">
              <AiOutputActions invocationId={invocationId} texto={resultado} />
              <button onClick={gerar} disabled={pending} className="btn-ghost text-xs text-primary">
                <Sparkles className="w-3 h-3" /> Regerar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
