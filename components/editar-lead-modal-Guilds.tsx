"use client";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Save } from "lucide-react";
import { editarLeadInline } from "@/app/(app)/vendas/base/actions";
import type { LeadEnriched } from "@/lib/types";

// Re-using ETAPAS_CRM manually or importing if available
const ETAPAS_CRM = [
  "Base Qualificada", "Em Negociação", "Call Marcada", "Proposta", "Fechada", "Teste n8n"
];

export default function EditarLeadModal({
  lead,
  profiles,
  onClose,
  onSuccess
}: {
  lead: LeadEnriched;
  profiles: { id: string; display_name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    data_entrada: lead.data_entrada || "",
    data_fechamento: lead.data_fechamento || "",
    responsavel_id: lead.responsavel_id || "",
    crm_stage: lead.crm_stage || ""
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await editarLeadInline(lead.id, {
          data_entrada: form.data_entrada || undefined,
          data_fechamento: form.data_fechamento || undefined,
          responsavel_id: form.responsavel_id || undefined,
          crm_stage: form.crm_stage || null
        } as Partial<LeadEnriched>);
        onSuccess();
      } catch (err: any) {
        alert(err.message || "Erro ao salvar lead.");
      }
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div 
        className="w-full max-w-sm bg-card text-card-foreground border border-border shadow-stripe-lg rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/30">
          <h2 className="font-semibold text-sm tracking-tight">Editar Dados ({lead.empresa})</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">Responsável</label>
              <select
                value={form.responsavel_id}
                onChange={(e) => setForm(f => ({ ...f, responsavel_id: e.target.value }))}
                className="input-base text-sm w-full"
              >
                <option value="">Sem responsável</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">Data de Entrada</label>
                <input
                  type="date"
                  value={form.data_entrada}
                  onChange={(e) => setForm(f => ({ ...f, data_entrada: e.target.value }))}
                  className="input-base text-sm w-full"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">Fechamento</label>
                <input
                  type="date"
                  value={form.data_fechamento}
                  onChange={(e) => setForm(f => ({ ...f, data_fechamento: e.target.value }))}
                  className="input-base text-sm w-full"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">Estágio no CRM</label>
              <select
                value={form.crm_stage}
                onChange={(e) => setForm(f => ({ ...f, crm_stage: e.target.value }))}
                className="input-base text-sm w-full"
              >
                <option value="">(Automático / Limpar)</option>
                {ETAPAS_CRM.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="btn-primary flex-1">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Salvar</>}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
