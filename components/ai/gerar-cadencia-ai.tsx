"use client";
import { useState, useTransition } from "react";
import { gerarMensagemCadencia } from "@/lib/ai/actions";
import { Bot, Sparkles, AlertCircle } from "lucide-react";
import type { LeadEnriched } from "@/lib/types";
import AiOutputActions from "@/components/ai/ai-output-actions";

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
  const [invocationId, setInvocationId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function gerar() {
    setErro(null);
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
      });
      if (!r.ok) {
        setErro(r.erro ?? "Erro");
        return;
      }
      setMsg(r.texto);
      setInvocationId(r.invocationId);
      onResultado?.(r.texto);
    });
  }

  return (
    <div className="mt-2">
      {!msg && !pending && (
        <button onClick={gerar} type="button" className="btn-secondary text-xs">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Gerar {passo} com IA
        </button>
      )}
      {pending && (
        <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
          Gerando {passo}…
        </div>
      )}
      {erro && (
        <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/25 text-xs text-destructive flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5"/>{erro}
        </div>
      )}
      {msg && (
        <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-1.5 mb-2">
            <Bot className="w-3.5 h-3.5 text-primary"/>
            <span className="text-[10px] font-semibold text-primary uppercase tracking-[0.12em]">IA — passo {passo}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap text-foreground mb-2">{msg}</div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-primary/15">
            <AiOutputActions invocationId={invocationId} texto={msg} />
            <button type="button" onClick={gerar} disabled={pending} className="btn-ghost text-xs text-primary">
              <Sparkles className="w-3 h-3"/> Regerar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
