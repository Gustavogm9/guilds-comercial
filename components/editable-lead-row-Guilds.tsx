"use client";

import { useState, useTransition } from "react";
import { editarLeadInline } from "@/app/(app)/vendas/base/actions";
import type { LeadEnriched } from "@/lib/types";
import BaseRowActions from "@/components/base-row-actions";
import { Loader2 } from "lucide-react";
import { CRM_STAGES_ATIVAS, MOTIVOS_PERDA } from "@/lib/types";

// Helper component for cells
function EditableCell({ 
  value, 
  onSave, 
  type = "text",
  options,
  placeholder = "—",
  list
}: { 
  value: string | number | null; 
  onSave: (val: any) => Promise<void>;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  list?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState<string | number>(value || "");
  const [isSaving, startTransition] = useTransition();

  const handleBlur = () => {
    if (val === (value || "")) {
      setIsEditing(false);
      return;
    }
    
    startTransition(async () => {
      try {
        await onSave(val === "" ? null : val);
        setIsEditing(false);
      } catch (err: any) {
        alert("Erro ao salvar: " + err.message);
        setVal(value || ""); // rollback
        setIsEditing(false);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && type !== "select") {
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      setVal(value || "");
      setIsEditing(false);
    }
  };

  if (isSaving) {
    return <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /></div>;
  }

  if (!isEditing && type !== "select") {
    return (
      <div 
        className="px-3 py-1 cursor-text hover:bg-secondary/50 rounded min-h-7 truncate transition-colors border border-transparent hover:border-border"
        onClick={() => setIsEditing(true)}
        title={String(val || placeholder)}
      >
        {val || <span className="text-muted-foreground/50">{placeholder}</span>}
      </div>
    );
  }

  if (type === "select") {
    // Para selects, renderizamos o select diretamente
    return (
      <select
        value={val as string}
        onChange={(e) => {
          setVal(e.target.value);
          // Auto-save on select change
          startTransition(async () => {
             try {
                await onSave(e.target.value === "" ? null : e.target.value);
             } catch (err: any) {
                alert("Erro ao salvar: " + err.message);
                setVal(value || ""); 
             }
          });
        }}
        className="w-full bg-transparent border-0 hover:bg-secondary/30 focus:bg-secondary/50 focus:ring-1 focus:ring-primary rounded px-2 py-1 text-xs cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  return (
    <input
      type={type}
      value={val}
      list={list}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      autoFocus
      className="w-full bg-background border border-primary focus:outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1 text-xs"
      placeholder={placeholder}
    />
  );
}

export default function EditableLeadRow({ 
  lead, 
  profiles 
}: { 
  lead: LeadEnriched; 
  profiles: { id: string; display_name: string }[] 
}) {
  const handleSave = async (field: keyof LeadEnriched, val: any) => {
    await editarLeadInline(lead.id, { [field]: val });
  };

  const dtEntrada = lead.data_entrada ? lead.data_entrada.split("T")[0] : "";
  const dtProposta = lead.data_proposta ? lead.data_proposta.split("T")[0] : "";
  const dtFechamento = lead.data_fechamento ? lead.data_fechamento.split("T")[0] : "";

  return (
    <tr className="hover:bg-secondary/40 dark:hover:bg-white/[0.03] transition-colors group">
      <td className="px-2 py-2 sticky left-0 bg-background group-hover:bg-secondary/40 border-r border-border/40 min-w-[250px] max-w-[300px] z-10 shadow-[1px_0_0_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-1 mb-1">
          <a href={`/pipeline/${lead.id}`} className="text-muted-foreground hover:text-primary shrink-0" title="Abrir lead no pipeline">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
          <div className="font-medium text-sm flex-1 overflow-hidden">
            <EditableCell value={lead.empresa} onSave={(v) => handleSave("empresa", v)} list="empresas-list" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 px-3">
          {lead.is_demo && (
            <span className="text-[9px] uppercase bg-warning-500/15 text-warning-500 border border-warning-500/25 px-1 rounded font-semibold">
              Demo
            </span>
          )}
          <span className="text-[9px] uppercase bg-secondary text-muted-foreground border border-border px-1 rounded font-semibold">
            {lead.funnel_stage === "pipeline" ? "Pipeline" :
             lead.funnel_stage === "base_bruta" ? "Bruta" :
             lead.funnel_stage === "base_qualificada" ? "Qualif." :
             lead.funnel_stage === "arquivado" ? "Arquiv." : lead.funnel_stage}
          </span>
        </div>
      </td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.nome} onSave={(v) => handleSave("nome", v)} /></td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.cargo} onSave={(v) => handleSave("cargo", v)} /></td>
      <td className="px-1 py-1 min-w-[180px]"><EditableCell value={lead.email} onSave={(v) => handleSave("email", v)} /></td>
      <td className="px-1 py-1 min-w-[130px]"><EditableCell value={lead.whatsapp} onSave={(v) => handleSave("whatsapp", v)} /></td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.linkedin} onSave={(v) => handleSave("linkedin", v)} /></td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.instagram} onSave={(v) => handleSave("instagram", v)} /></td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.segmento} onSave={(v) => handleSave("segmento", v)} /></td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.cidade_uf} onSave={(v) => handleSave("cidade_uf", v)} /></td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.site} onSave={(v) => handleSave("site", v)} /></td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.fonte} onSave={(v) => handleSave("fonte", v)} /></td>
      
      <td className="px-1 py-1 min-w-[150px]">
        <EditableCell 
          type="select" 
          value={lead.responsavel_id} 
          onSave={(v) => handleSave("responsavel_id", v)}
          options={profiles.map(p => ({ value: p.id, label: p.display_name }))}
        />
      </td>
      <td className="px-1 py-1 min-w-[120px]">
        <EditableCell 
          type="select" 
          value={lead.temperatura} 
          onSave={(v) => handleSave("temperatura", v)}
          options={[{value: "Frio", label: "Frio"}, {value: "Morno", label: "Morno"}, {value: "Quente", label: "Quente"}]}
        />
      </td>
      <td className="px-1 py-1 min-w-[100px]">
        <EditableCell 
          type="select" 
          value={lead.prioridade} 
          onSave={(v) => handleSave("prioridade", v)}
          options={[{value: "A", label: "A"}, {value: "B", label: "B"}, {value: "C", label: "C"}]}
        />
      </td>
      <td className="px-1 py-1 min-w-[150px]">
        <EditableCell 
          type="select" 
          value={lead.crm_stage || ""} 
          onSave={(v) => handleSave("crm_stage", v)}
          options={CRM_STAGES_ATIVAS.map(s => ({ value: s, label: s }))}
        />
      </td>
      <td className="px-1 py-1 min-w-[120px]"><EditableCell type="number" value={lead.valor_potencial} onSave={(v) => handleSave("valor_potencial", v ? Number(v) : null)} /></td>
      <td className="px-1 py-1 min-w-[120px]"><EditableCell type="number" value={lead.valor_setup} onSave={(v) => handleSave("valor_setup", v ? Number(v) : null)} /></td>
      <td className="px-1 py-1 min-w-[120px]"><EditableCell type="number" value={lead.valor_mensal} onSave={(v) => handleSave("valor_mensal", v ? Number(v) : null)} /></td>
      <td className="px-1 py-1 min-w-[100px]"><EditableCell type="number" value={lead.probabilidade} onSave={(v) => handleSave("probabilidade", v ? Number(v) : null)} /></td>
      <td className="px-3 py-2 min-w-[120px] text-muted-foreground">{lead.receita_ponderada ? `R$ ${lead.receita_ponderada.toFixed(2)}` : "—"}</td>
      
      <td className="px-1 py-1 min-w-[140px]"><EditableCell type="date" value={dtEntrada} onSave={(v) => handleSave("data_entrada", v ? new Date(v).toISOString() : null)} /></td>
      <td className="px-1 py-1 min-w-[140px]"><EditableCell type="date" value={dtProposta} onSave={(v) => handleSave("data_proposta", v ? new Date(v).toISOString() : null)} /></td>
      <td className="px-1 py-1 min-w-[140px]"><EditableCell type="date" value={dtFechamento} onSave={(v) => handleSave("data_fechamento", v ? new Date(v).toISOString() : null)} /></td>
      
      <td className="px-1 py-1 min-w-[150px]">
        <EditableCell 
          type="select" 
          value={lead.motivo_perda || ""} 
          onSave={(v) => handleSave("motivo_perda", v)}
          options={MOTIVOS_PERDA.map(s => ({ value: s, label: s }))}
        />
      </td>
      <td className="px-1 py-1 min-w-[150px]"><EditableCell value={lead.link_proposta} onSave={(v) => handleSave("link_proposta", v)} /></td>
      <td className="px-1 py-1 min-w-[200px] max-w-[300px]"><EditableCell value={lead.observacoes} onSave={(v) => handleSave("observacoes", v)} /></td>
      
      <td className="px-3 py-2 sticky right-0 bg-background group-hover:bg-secondary/40 border-l border-border/40 min-w-[80px] z-10 text-right shadow-[-1px_0_0_rgba(0,0,0,0.1)]">
        <BaseRowActions lead={lead} profiles={profiles} />
      </td>
    </tr>
  );
}
