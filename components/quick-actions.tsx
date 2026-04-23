"use client";
import { useState, useTransition } from "react";
import { PhoneCall, MessageSquare, X, Calendar, Check, ChevronDown } from "lucide-react";
import { registrarLigacao, registrarToque, adiarAcao } from "@/app/(app)/hoje/actions";
import type { LeadEnriched } from "@/lib/types";

const RESULTADOS_RAPIDOS = [
  { v: "Atendeu e qualificou",     prox: "Enviar Raio-X",       dias: 1 },
  { v: "Atendeu e pediu retorno",  prox: "Ligar",               dias: 3 },
  { v: "Atendeu e sem fit",        prox: "Entrar em nutrição",  dias: 30 },
  { v: "Sem resposta",             prox: "Enviar D3",           dias: 3 },
  { v: "Caixa postal",             prox: "Ligar",               dias: 1 },
  { v: "Agendou call",             prox: "Agendar call",        dias: 0 },
];

export default function QuickActions({ lead }: { lead: LeadEnriched }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | "lig" | "wa" | "email" | "adiar">(null);
  const [obs, setObs] = useState("");

  function dataAhead(dias: number) {
    const d = new Date(); d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button onClick={() => setOpen(open === "lig" ? null : "lig")}
          className="btn-secondary text-xs">
          <PhoneCall className="w-3.5 h-3.5"/> Liguei <ChevronDown className="w-3 h-3"/>
        </button>
        {open === "lig" && (
          <div className="absolute z-20 mt-1 w-72 card p-2 shadow-lg">
            {RESULTADOS_RAPIDOS.map(r => (
              <button key={r.v} disabled={pending}
                onClick={() => start(async () => {
                  await registrarLigacao({
                    lead_id: lead.id,
                    resultado: r.v,
                    proxima_acao: r.prox,
                    data_proxima_acao: dataAhead(r.dias),
                    observacoes: obs || undefined,
                  });
                  setOpen(null); setObs("");
                })}
                className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50">
                {r.v}
                <span className="text-[10px] text-slate-500 ml-2">→ {r.prox} (+{r.dias}d)</span>
              </button>
            ))}
            <input value={obs} onChange={(e)=>setObs(e.target.value)}
              placeholder="Observação rápida (opcional)"
              className="input-base mt-2 text-xs"/>
          </div>
        )}
      </div>

      <button disabled={pending}
        onClick={() => start(async () => {
          await registrarToque({
            lead_id: lead.id, canal: "WhatsApp",
            proxima_acao: "Enviar D3", data_proxima_acao: dataAhead(3),
          });
        })}
        className="btn-secondary text-xs">
        <MessageSquare className="w-3.5 h-3.5"/> Mandei WhatsApp
      </button>

      <div className="relative">
        <button onClick={() => setOpen(open === "adiar" ? null : "adiar")}
          className="btn-ghost text-xs">
          <Calendar className="w-3.5 h-3.5"/> Adiar
        </button>
        {open === "adiar" && (
          <div className="absolute z-20 mt-1 w-40 card p-2 shadow-lg">
            {[1, 3, 7].map(d => (
              <button key={d} disabled={pending}
                onClick={() => start(async () => { await adiarAcao(lead.id, d); setOpen(null); })}
                className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50">
                +{d} {d === 1 ? "dia" : "dias"}
              </button>
            ))}
          </div>
        )}
      </div>

      <button disabled={pending}
        onClick={() => start(async () => {
          await registrarLigacao({
            lead_id: lead.id, resultado: "Atendeu e sem fit",
            proxima_acao: "Entrar em nutrição", data_proxima_acao: dataAhead(30),
          });
        })}
        className="btn-ghost text-xs text-slate-500 hover:text-urgent-500">
        <X className="w-3.5 h-3.5"/> Sem fit
      </button>
    </div>
  );
}
