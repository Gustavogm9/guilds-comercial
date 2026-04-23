"use client";
import { useState, useTransition } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import Link from "next/link";
import { moverEtapa, ETAPAS_EXIGEM_MOTIVO } from "@/app/(app)/hoje/actions";
import { ETAPAS_PIPELINE_VISIVEL, STAGE_COLORS, URGENCIA_LABELS } from "@/lib/lists";
import type { CrmStage, LeadEnriched } from "@/lib/types";
import { GripVertical, AlertCircle, Clock, Activity } from "lucide-react";
import clsx from "clsx";
import MotivoSaidaModal from "./motivo-saida-modal";

export default function KanbanBoard({ leads }: { leads: LeadEnriched[] }) {
  const [active, setActive] = useState<LeadEnriched | null>(null);
  const [items, setItems] = useState(leads);
  const [, start] = useTransition();
  // Se o usuário arrastar pra Perdido/Nutrição, abre modal de motivo em vez de mover direto.
  const [motivoModo, setMotivoModo] = useState<{ lead_id: number; destino: CrmStage; etapaOriginal: CrmStage | null } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onStart(e: DragStartEvent) {
    setActive(items.find(l => l.id === e.active.id) ?? null);
  }
  function onEnd(e: DragEndEvent) {
    setActive(null);
    if (!e.over) return;
    const novaEtapa = e.over.id as CrmStage;
    const id = e.active.id as number;
    const lead = items.find(l => l.id === id);
    if (!lead || lead.crm_stage === novaEtapa) return;

    // Se exige motivo, mostra modal — mas ainda faz optimistic update pra experiência não travar
    if (ETAPAS_EXIGEM_MOTIVO.includes(novaEtapa)) {
      setItems(prev => prev.map(l => l.id === id ? { ...l, crm_stage: novaEtapa } : l));
      setMotivoModo({ lead_id: id, destino: novaEtapa, etapaOriginal: lead.crm_stage });
      return;
    }

    // optimistic update
    setItems(prev => prev.map(l => l.id === id ? { ...l, crm_stage: novaEtapa } : l));
    start(async () => { await moverEtapa(id, novaEtapa); });
  }

  // Se o usuário cancelar o modal, reverter o card pra etapa original
  function cancelarMotivo() {
    if (motivoModo) {
      const origem = motivoModo.etapaOriginal;
      setItems(prev => prev.map(l => l.id === motivoModo.lead_id ? { ...l, crm_stage: origem } : l));
    }
    setMotivoModo(null);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 px-4 md:px-8">
        {ETAPAS_PIPELINE_VISIVEL.map(stage => (
          <Column key={stage} stage={stage}
            leads={items.filter(l => l.crm_stage === stage)} />
        ))}
      </div>
      <DragOverlay>
        {active && <Card lead={active} dragging />}
      </DragOverlay>
      <MotivoSaidaModal
        modo={motivoModo ? { tipo: "mover", lead_id: motivoModo.lead_id, destino: motivoModo.destino } : null}
        onClose={cancelarMotivo}
      />
    </DndContext>
  );
}

function Column({ stage, leads }: { stage: CrmStage; leads: LeadEnriched[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const c = STAGE_COLORS[stage];
  const totalValor = leads.reduce((s, l) => s + (l.receita_ponderada || 0), 0);

  return (
    <div ref={setNodeRef}
      className={clsx(
        "min-w-[280px] w-[280px] flex flex-col rounded-xl border-2 transition",
        c.bg, c.border,
        isOver && "ring-2 ring-guild-500 ring-offset-2"
      )}>
      <div className="px-3 py-2 border-b border-slate-200/60">
        <div className="flex items-center justify-between">
          <span className={clsx("text-xs font-semibold uppercase tracking-wider", c.text)}>{stage}</span>
          <span className="text-xs font-medium text-slate-600">{leads.length}</span>
        </div>
        {totalValor > 0 && (
          <div className="text-[10px] text-slate-500 mt-0.5">
            {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} ponderado
          </div>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-220px)] overflow-y-auto">
        {leads.map(l => <Card key={l.id} lead={l} />)}
        {leads.length === 0 && <div className="text-xs text-slate-400 text-center py-6">vazio</div>}
      </div>
    </div>
  );
}

function Card({ lead, dragging = false }: { lead: LeadEnriched; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const u = URGENCIA_LABELS[lead.urgencia];
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const raioxCor =
    lead.raiox_nivel === "Alto" ? "bg-emerald-100 text-emerald-700"
    : lead.raiox_nivel === "Médio" ? "bg-amber-100 text-amber-700"
    : lead.raiox_nivel === "Baixo" ? "bg-slate-100 text-slate-500"
    : "bg-slate-100 text-slate-400";

  return (
    <div ref={setNodeRef} style={style}
      className={clsx(
        "card p-3 select-none cursor-grab active:cursor-grabbing transition shadow-sm",
        (isDragging || dragging) && "shadow-xl scale-[1.02] opacity-90"
      )}>
      <div className="flex items-start gap-2">
        <button {...listeners} {...attributes}
          className="text-slate-300 hover:text-slate-500 mt-0.5">
          <GripVertical className="w-3.5 h-3.5"/>
        </button>
        <div className="flex-1 min-w-0">
          <Link href={`/pipeline/${lead.id}`} className="block">
            <div className="flex items-start justify-between gap-1">
              <div className="font-medium text-sm leading-tight truncate hover:text-guild-700">
                {lead.empresa || lead.nome || "(sem nome)"}
              </div>
              {lead.prioridade === "A" && (
                <span className="text-[10px] font-bold text-rose-600 shrink-0 bg-rose-50 rounded px-1">A</span>
              )}
            </div>
            {lead.nome && lead.empresa && (
              <div className="text-[11px] text-slate-500 truncate">{lead.nome}{lead.cargo ? ` · ${lead.cargo}` : ""}</div>
            )}

            {/* Linha 1: raio-x, canal, responsável */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {lead.raiox_nivel && lead.raiox_nivel !== "Pendente" && (
                <span className={clsx("inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded", raioxCor)}>
                  <Activity className="w-2.5 h-2.5"/> {lead.raiox_nivel}
                </span>
              )}
              {lead.canal_principal && (
                <span className="text-[9px] text-slate-500">{lead.canal_principal}</span>
              )}
              {lead.responsavel_nome && (
                <span className="text-[9px] text-slate-400 ml-auto truncate max-w-[80px]">{lead.responsavel_nome}</span>
              )}
            </div>

            {/* Linha 2: próxima ação / urgência */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {lead.urgencia === "vencida" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-urgent-500 font-medium">
                  <AlertCircle className="w-3 h-3"/> {u.label}
                </span>
              )}
              {lead.urgencia === "hoje" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-warning-500 font-medium">
                  <Clock className="w-3 h-3"/> Hoje
                </span>
              )}
              {lead.proxima_acao && (
                <span className="text-[10px] text-slate-600 truncate">{lead.proxima_acao}</span>
              )}
            </div>

            {/* Linha 3: dias sem tocar + valor */}
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500">
              <span>
                {lead.dias_sem_tocar > 0
                  ? <span className={lead.dias_sem_tocar > 7 ? "text-urgent-500 font-medium" : ""}>
                      {lead.dias_sem_tocar}d sem tocar
                    </span>
                  : "tocado hoje"}
              </span>
              {lead.valor_potencial > 0 && (
                <span className="text-slate-700 font-medium">
                  {lead.valor_potencial.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
