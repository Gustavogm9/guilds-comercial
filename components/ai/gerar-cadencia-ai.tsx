"use client";
import { useState, useTransition } from "react";
import { gerarMensagemCadencia } from "@/lib/ai/actions";
import { Bot, Sparkles, Copy, AlertCircle } from "lucide-react";
import type { LeadEnriched } from "@/lib/types";

/**
 * Botão "Gerar com IA" dentro do modal de cadência.
 * Produz mensagem personalizada do passo (D0/D3/D7/...) com base em todo contexto do lead.
 */
export default function GerarCadenciaAI({
  lead, vendedor, passo, canal, onResultado,
}: {
  lead: LeadEnriched;
  vendedor: string;
  passo: "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
  canal: "WhatsApp" | "Email" | "LinkedIn";
  onResultado?: (msg: string) => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function gerar() {
    setErro(null);
    setCopiado(false);
    start(async () => {
      const r = await gerarMensagemCadencia({
        leadId: lead.id,
        empresa: lead.empresa ?? "",
        nome: lead.nome ?? "Cliente",
        cargo: lead.cargo ?? undefined,
        passo, canal,
        dor_principal: lead.dor_principal ?? undefined,
        raiox_status: lead.raiox_status ?? undefined,
        raiox_score: lead.raiox_score ?? undefined,
        vendedor,
        // ultima_interacao/tom viriam de um fetch da última ligação — simplificado aqui
      });
      if (!r.ok) {
        setErro(r.erro ?? "Erro");
        return;
      }
      setMsg(r.texto);
      onResultado?.(r.texto);
    });
  }

  function copiar() {
    if (!msg) return;
    navigator.clipboard.writeText(msg);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="mt-2">
      {!msg && !pending && (
        <button onClick={gerar} type="button" className="btn-secondary text-xs">
          <Sparkles className="w-3.5 h-3.5 text-violet-600" /> Gerar {passo} com IA
        </button>
      )}
      {pending && (
        <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 px-3 py-1.5">
          <div className="w-3 h-3 border-2 border-guild-500 border-t-transparent rounded-full animate-spin"/>
          Gerando {passo}…
        </div>
      )}
      {erro && (
        <div className="mt-2 p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5"/>{erro}
        </div>
      )}
      {msg && (
        <div className="mt-2 p-3 rounded-lg bg-violet-50/60 border border-violet-200">
          <div className="flex items-center gap-1.5 mb-2">
            <Bot className="w-3.5 h-3.5 text-violet-600"/>
            <span className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider">IA — passo {passo}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap text-slate-700">{msg}</div>
          <div className="flex justify-end gap-1.5 mt-2">
            <button type="button" onClick={copiar} className="btn-ghost text-xs">
              <Copy className="w-3 h-3"/> {copiado ? "Copiado!" : "Copiar"}
            </button>
            <button type="button" onClick={gerar} disabled={pending} className="btn-ghost text-xs text-guild-600">
              <Sparkles className="w-3 h-3"/> Regerar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
