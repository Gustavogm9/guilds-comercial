"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, RefreshCcw, FileText } from "lucide-react";
import { gerarPropostaAction } from "@/app/(app)/proposta/[leadId]/actions";
import AiOutputActions from "@/components/ai/ai-output-actions";

type Variacao = "conservadora" | "recomendada" | "premium";

const VARIACOES: { key: Variacao; label: string; desc: string; tone: string; border: string }[] = [
  { key: "conservadora", label: "Conservadora", desc: "Escopo mínimo, menor investimento, baixo risco.", tone: "text-foreground/80", border: "bg-secondary/40 dark:bg-white/[0.02]" },
  { key: "recomendada", label: "Recomendada", desc: "Melhor custo-benefício, escopo equilibrado.", tone: "text-primary", border: "border-primary/40 bg-primary/5 ring-2 ring-primary/40 ring-offset-2 ring-offset-background" },
  { key: "premium", label: "Premium", desc: "Escopo completo, máximo valor entregue.", tone: "text-success-500", border: "border-success/30 bg-success/5" },
];

export default function PropostaGerador({ leadId }: { leadId: number }) {
  const [propostas, setPropostas] = useState<Record<Variacao, string | null>>({
    conservadora: null,
    recomendada: null,
    premium: null,
  });
  const [invocacoes, setInvocacoes] = useState<Record<Variacao, number | null>>({
    conservadora: null,
    recomendada: null,
    premium: null,
  });
  const [gerando, setGerando] = useState<Variacao | null>(null);
  const [pending, start] = useTransition();

  function gerar(variacao: Variacao) {
    setGerando(variacao);
    start(async () => {
      const res = await gerarPropostaAction({ leadId, variacao });
      if (res.ok) {
        setPropostas(prev => ({ ...prev, [variacao]: res.texto }));
        setInvocacoes(prev => ({ ...prev, [variacao]: res.invocationId ?? null }));
      } else {
        setPropostas(prev => ({ ...prev, [variacao]: `⚠ Erro: ${res.erro}` }));
      }
      setGerando(null);
    });
  }

  function gerarTodas() {
    VARIACOES.forEach(v => gerar(v.key));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Clique em cada variação para gerar, ou gere as 3 de uma vez.
        </p>
        <button onClick={gerarTodas} disabled={pending} className="btn-primary text-xs">
          <Sparkles className="w-3.5 h-3.5" /> Gerar as 3 propostas
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {VARIACOES.map(v => (
          <div key={v.key} className={`card p-5 ${v.border} transition`}>
            <div className="flex items-center gap-2 mb-2">
              <FileText className={`w-4 h-4 ${v.tone}`} />
              <h3 className={`text-sm font-semibold ${v.tone}`}>{v.label}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{v.desc}</p>

            {propostas[v.key] ? (
              <>
                <div className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed border-t border-border pt-3 mb-2 max-h-96 overflow-y-auto">
                  {propostas[v.key]}
                </div>
                <div className="mb-3 pt-2 border-t border-border">
                  <AiOutputActions
                    invocationId={invocacoes[v.key]}
                    texto={propostas[v.key] ?? ""}
                  />
                </div>
              </>
            ) : gerando === v.key ? (
              <div className="flex items-center gap-2 py-8 justify-center text-primary text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Gerando proposta...
              </div>
            ) : null}

            <button
              onClick={() => gerar(v.key)}
              disabled={pending}
              className="btn-secondary text-xs w-full"
            >
              {propostas[v.key] ? (
                <><RefreshCcw className="w-3.5 h-3.5" /> Regenerar</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Gerar proposta</>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
