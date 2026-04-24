"use client";
import { useState, useTransition } from "react";
import { qualificarBase, promoverParaPipeline, enriquecerLead } from "@/app/(app)/base/actions";
import type { LeadEnriched } from "@/lib/types";
import { Check, ArrowRight, X, ChevronDown, Sparkles } from "lucide-react";
import MotivoSaidaModal from "./motivo-saida-modal";

export default function BaseRowActions({ lead }: { lead: LeadEnriched }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | "qual">(null);
  const [dor, setDor] = useState(lead.dor_principal ?? "");
  const [arquivando, setArquivando] = useState(false);

  if (lead.funnel_stage === "base_bruta") {
    return (
      <>
        <div className="flex flex-wrap gap-1.5 items-center">
          <div className="relative">
            <button onClick={() => setOpen(open === "qual" ? null : "qual")}
              className="btn-secondary text-xs">
              <Check className="w-3.5 h-3.5"/> Qualificar <ChevronDown className="w-3 h-3"/>
            </button>
            {open === "qual" && (
              <div className="absolute right-0 z-20 mt-1 w-72 card p-3 shadow-lg space-y-2">
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Qualificar lead</div>
                <textarea value={dor} onChange={(e) => setDor(e.target.value)}
                  placeholder="Dor principal (curto)"
                  className="input-base text-xs min-h-[60px]"/>
                <div className="flex gap-1.5">
                  <button disabled={pending}
                    onClick={() => start(async () => {
                      await qualificarBase({
                        lead_id: lead.id, fit_icp: true,
                        dor_principal: dor || undefined,
                        temperatura: "Morno",
                      });
                      setOpen(null);
                    })}
                    className="btn-primary text-xs flex-1">
                    Tem fit
                  </button>
                  <button disabled={pending}
                    onClick={() => { setOpen(null); setArquivando(true); }}
                    className="btn-ghost text-xs text-urgent-500">
                    Sem fit
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setArquivando(true)}
            className="btn-ghost text-xs text-slate-400 hover:text-urgent-500"
            title="Arquivar">
            <X className="w-3.5 h-3.5"/>
          </button>
          <button disabled={pending} onClick={() => start(async () => await enriquecerLead(lead.id))}
            className="btn-ghost text-xs text-guild-600 hover:text-guild-700"
            title="Enriquecer com IA">
            <Sparkles className="w-3.5 h-3.5"/>
          </button>
        </div>
        <MotivoSaidaModal
          modo={arquivando ? { tipo: "arquivar", lead_id: lead.id } : null}
          onClose={() => setArquivando(false)}
        />
      </>
    );
  }

  // base_qualificada → pode promover
  return (
    <>
      <div className="flex flex-wrap gap-1.5 items-center">
        <button disabled={pending}
          onClick={() => start(async () => { await promoverParaPipeline(lead.id); })}
          className="btn-primary text-xs">
          <ArrowRight className="w-3.5 h-3.5"/> Levar pro pipeline
        </button>
        <button onClick={() => setArquivando(true)}
          className="btn-ghost text-xs text-slate-400 hover:text-urgent-500"
          title="Arquivar">
          <X className="w-3.5 h-3.5"/>
        </button>
      </div>
      <MotivoSaidaModal
        modo={arquivando ? { tipo: "arquivar", lead_id: lead.id } : null}
        onClose={() => setArquivando(false)}
      />
    </>
  );
}
