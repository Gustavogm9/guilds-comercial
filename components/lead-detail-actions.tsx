"use client";
import { useState, useTransition } from "react";
import { ETAPAS_CRM } from "@/lib/lists";
import { moverEtapa, ETAPAS_EXIGEM_MOTIVO } from "@/app/(app)/hoje/actions";
import CadenciaModal from "@/components/cadencia-modal";
import QuickActions from "@/components/quick-actions";
import MotivoSaidaModal from "@/components/motivo-saida-modal";
import type { CrmStage, LeadEnriched } from "@/lib/types";
import { MessageSquareQuote } from "lucide-react";

export default function LeadDetailActions({
  lead, vendedor,
}: {
  lead: LeadEnriched;
  vendedor: string;
}) {
  const [open, setOpen] = useState(false);
  const [motivoModo, setMotivoModo] = useState<{ lead_id: number; destino: CrmStage } | null>(null);
  const [, start] = useTransition();

  function handleChangeEtapa(novaEtapa: CrmStage) {
    // Se etapa exige motivo (Perdido/Nutrição), abrir modal em vez de enviar direto
    if (ETAPAS_EXIGEM_MOTIVO.includes(novaEtapa)) {
      setMotivoModo({ lead_id: lead.id, destino: novaEtapa });
      return;
    }
    start(async () => {
      await moverEtapa(lead.id, novaEtapa);
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={lead.crm_stage ?? ""}
        onChange={(e) => handleChangeEtapa(e.target.value as CrmStage)}
        className="input-base !w-44 !text-xs">
        <option value="" disabled>— etapa —</option>
        {ETAPAS_CRM.map(e => <option key={e} value={e}>{e}</option>)}
      </select>

      <QuickActions lead={lead} />

      <button onClick={() => setOpen(true)} className="btn-primary text-xs">
        <MessageSquareQuote className="w-3.5 h-3.5"/> Templates de cadência
      </button>

      <CadenciaModal open={open} onClose={() => setOpen(false)} lead={lead} vendedor={vendedor} />
      <MotivoSaidaModal
        modo={motivoModo ? { tipo: "mover", ...motivoModo } : null}
        onClose={() => setMotivoModo(null)}
      />
    </div>
  );
}
