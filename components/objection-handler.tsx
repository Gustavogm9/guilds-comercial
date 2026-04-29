"use client";

import { useState, useTransition } from "react";
import { Shield, Loader2, Send, Sparkles } from "lucide-react";
import { objectionHandlerAction } from "./objection-handler-action";
import AiOutputActions from "@/components/ai/ai-output-actions";

/**
 * Widget interativo para lidar com objeções do cliente.
 * O vendedor digita a objeção e a IA sugere um contorno.
 */
export default function ObjectionHandler({ leadId, empresa, segmento }: {
  leadId: number;
  empresa?: string | null;
  segmento?: string | null;
}) {
  const [objecao, setObjecao] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const [invocationId, setInvocationId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!objecao.trim()) return;
    setErro(null);
    start(async () => {
      const res = await objectionHandlerAction({
        leadId,
        objecao: objecao.trim(),
        empresa: empresa ?? undefined,
        segmento: segmento ?? undefined,
      });
      if (res.ok) {
        setResultado(res.texto);
        setInvocationId(res.invocationId ?? null);
      } else {
        setErro(res.erro ?? "Erro ao processar objeção.");
      }
    });
  }

  return (
    <div className="card p-4 border-warning-500/25 bg-warning-500/5">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-warning-500" />
        <h3 className="text-sm font-semibold text-foreground" style={{ letterSpacing: "-0.13px" }}>Contorno de objeções</h3>
        <span className="text-[10px] text-warning-500 bg-warning-500/15 border border-warning-500/25 px-1.5 py-0.5 rounded font-semibold uppercase tracking-[0.1em]">IA</span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={objecao}
          onChange={e => setObjecao(e.target.value)}
          placeholder="Qual objeção o cliente fez? Ex: 'O preço está alto'"
          className="input-base flex-1 text-xs"
          disabled={pending}
        />
        <button type="submit" disabled={pending || !objecao.trim()} className="btn-primary text-xs shrink-0">
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Contornar
        </button>
      </form>

      {resultado && (
        <div className="mt-3 p-3 rounded-lg bg-card border border-warning-500/25 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-warning-500 font-semibold mb-2">
            <Sparkles className="w-3 h-3" /> Sugestão de contorno
          </div>
          {resultado}
          <div className="mt-2 pt-2 border-t border-warning-500/15">
            <AiOutputActions invocationId={invocationId} texto={resultado} />
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
