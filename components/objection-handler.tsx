"use client";

import { useState, useTransition } from "react";
import { Shield, Loader2, Send, Sparkles } from "lucide-react";
import { objectionHandlerAction } from "./objection-handler-action";

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
      } else {
        setErro(res.erro ?? "Erro ao processar objeção.");
      }
    });
  }

  return (
    <div className="card p-4 border-amber-100 bg-amber-50/20">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">Contorno de objeções</h3>
        <span className="text-[10px] text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded">IA</span>
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
        <div className="mt-3 p-3 rounded-lg bg-white border border-amber-100 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-600 font-semibold mb-2">
            <Sparkles className="w-3 h-3" /> Sugestão de contorno
          </div>
          {resultado}
        </div>
      )}

      {erro && (
        <div className="mt-2 p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {erro}
        </div>
      )}
    </div>
  );
}
