"use client";

import { useState } from "react";
import { Bot, FileText, PhoneCall, Save, X } from "lucide-react";
import { processarLigacaoAIAcion } from "./actions";
import AiOutputActions from "@/components/ai/ai-output-actions";
import clsx from "clsx";

interface ResultadoLigacao {
  sentimento: string;
  probabilidade_fechamento: number;
  resumo: string;
  objecoes?: string[];
  proximos_passos: string[];
}

/**
 * Serializa o output JSON estruturado em texto legível pra:
 *  - Copiar (vai pro clipboard)
 *  - Salvar como exemplo few-shot (vira referência pra próximas extrações)
 */
function serializarResultado(r: ResultadoLigacao): string {
  const partes: string[] = [];
  partes.push(`SENTIMENTO: ${r.sentimento.toUpperCase()}`);
  partes.push(`PROBABILIDADE DE FECHAMENTO: ${r.probabilidade_fechamento}%`);
  partes.push("");
  partes.push("RESUMO:");
  partes.push(r.resumo);
  if (r.objecoes && r.objecoes.length > 0) {
    partes.push("");
    partes.push("OBJEÇÕES:");
    r.objecoes.forEach((o) => partes.push(`- ${o}`));
  }
  if (r.proximos_passos && r.proximos_passos.length > 0) {
    partes.push("");
    partes.push("PRÓXIMOS PASSOS:");
    r.proximos_passos.forEach((p) => partes.push(`- ${p}`));
  }
  return partes.join("\n");
}

export default function NovaLigacaoAIModal({ orgId, leadId, onClose, onSaved }: { orgId: string, leadId?: string, onClose: () => void, onSaved: () => void }) {
  const [transcricao, setTranscricao] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLigacao | null>(null);
  const [invocationId, setInvocationId] = useState<number | null>(null);

  async function handleExtrair() {
    if (!transcricao.trim()) return;
    setLoading(true);
    const res = await processarLigacaoAIAcion(orgId, transcricao);
    if (res.error) {
      alert(res.error);
    } else {
      setResultado(res.data);
      setInvocationId(res.invocationId ?? null);
    }
    setLoading(false);
  }

  async function handleSalvar() {
    // Apenas simulação do salvar para o MVP
    setLoading(true);
    // await salvarNoBanco(resultado);
    setTimeout(() => {
      onSaved();
      onClose();
    }, 500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-stripe-lg w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/40 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Bot className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Extração de Ligação (Copiloto)</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {!resultado ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Cole a transcrição da call ou as suas anotações brutas. A IA irá estruturar os principais tópicos, objeções e o sentimento do cliente.</p>
              <textarea
                className="input-base w-full min-h-[200px] font-mono text-sm leading-relaxed"
                placeholder="Ex: O cliente falou que gostou da proposta mas achou caro. Pediu desconto de 10% e falou pra ligar na sexta..."
                value={transcricao}
                onChange={e => setTranscricao(e.target.value)}
              />
              <button onClick={handleExtrair} disabled={loading || !transcricao.trim()} className="btn-primary w-full justify-center">
                {loading ? <span className="animate-pulse">Analisando...</span> : <><Bot className="w-4 h-4 mr-2"/> Analisar com IA</>}
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-border bg-secondary/40 dark:bg-white/[0.02]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">Sentimento</div>
                  <div className={clsx("font-medium", resultado.sentimento === 'positivo' ? "text-success-500" : resultado.sentimento === 'negativo' ? "text-destructive" : "text-foreground/80")}>
                    {resultado.sentimento.toUpperCase()}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-border bg-secondary/40 dark:bg-white/[0.02]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">Probabilidade</div>
                  <div className="font-medium text-foreground tabular-nums">{resultado.probabilidade_fechamento}%</div>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-foreground mb-2">Resumo Estruturado</h3>
                <p className="text-sm text-muted-foreground leading-relaxed bg-secondary/40 dark:bg-white/[0.02] p-4 rounded-lg border border-border">{resultado.resumo}</p>
              </div>

              {resultado.objecoes && resultado.objecoes.length > 0 && (
                <div>
                  <h3 className="font-medium text-destructive mb-2 flex items-center gap-2">Objeções Levantadas</h3>
                  <ul className="space-y-2">
                    {resultado.objecoes.map((obj: string, i: number) => (
                      <li key={i} className="text-sm bg-destructive/10 text-destructive px-3 py-2 rounded-md border border-destructive/25">{obj}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="font-medium text-success-500 mb-2">Próximos Passos Sugeridos</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {resultado.proximos_passos.map((passo: string, i: number) => (
                    <li key={i} className="text-sm text-foreground/80">{passo}</li>
                  ))}
                </ul>
              </div>

              {/* Auto-evolução: copiar/marcar exemplo/feedback A/B */}
              <div className="pt-3 border-t border-border">
                <AiOutputActions
                  invocationId={invocationId}
                  texto={serializarResultado(resultado)}
                />
              </div>
            </div>
          )}
        </div>

        {resultado && (
          <div className="p-4 border-t border-border bg-secondary/40 dark:bg-white/[0.02] flex justify-end gap-3">
            <button onClick={() => setResultado(null)} className="btn-ghost">Voltar</button>
            <button onClick={handleSalvar} disabled={loading} className="btn-primary">
              <Save className="w-4 h-4 mr-2" />
              Salvar Histórico
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
