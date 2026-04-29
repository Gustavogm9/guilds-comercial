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
    <div
      ref={setNodeRef}
      className={clsx(
        "min-w-[280px] w-[280px] flex flex-col rounded-xl border transition-all",
        // Stage tint (light + dark via STAGE_COLORS)
        c.bg, c.border,
        // Drop highlight
        isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <div className="px-3 py-2 border-b border-border/60 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className={clsx("text-[11px] font-semibold uppercase tracking-[0.12em]", c.text)}>{stage}</span>
          <span className="text-xs font-medium text-foreground/80 tabular-nums">{leads.length}</span>
        </div>
        {totalValor > 0 && (
          <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} ponderado
          </div>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-220px)] overflow-y-auto">
        {leads.map(l => <Card key={l.id} lead={l} />)}
        {leads.length === 0 && <div className="text-xs text-muted-foreground/60 text-center py-6 italic">vazio</div>}
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
    lead.raiox_nivel === "Alto"  ? "bg-success-500/15 text-success-500 border-success-500/25"
    : lead.raiox_nivel === "Médio" ? "bg-warning-500/15 text-warning-500 border-warning-500/25"
    : lead.raiox_nivel === "Baixo" ? "bg-muted text-muted-foreground border-border"
    : "bg-muted/60 text-muted-foreground/60 border-border";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "card p-3 select-none cursor-grab active:cursor-grabbing transition-all",
        // Hover sutil em ambos themes
        "hover:border-primary/30",
        (isDragging || dragging) && "shadow-stripe-md scale-[1.02] opacity-95 border-primary/50",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="text-muted-foreground/40 hover:text-muted-foreground mt-0.5 transition-colors"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <Link href={`/pipeline/${lead.id}`} className="block">
            <div className="flex items-start justify-between gap-1">
              <div
                className="font-medium text-sm leading-tight truncate text-foreground hover:text-primary transition-colors"
                style={{ letterSpacing: "-0.13px" }}
              >
                {lead.empresa || lead.nome || "(sem nome)"}
              </div>
              {lead.prioridade === "A" && (
                <span className="text-[10px] font-bold text-destructive shrink-0 bg-destructive/10 border border-destructive/25 rounded px-1.5 py-px">A</span>
              )}
            </div>
            {lead.nome && lead.empresa && (
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {lead.nome}{lead.cargo ? ` · ${lead.cargo}` : ""}
              </div>
            )}

            {/* Linha 1: raio-x, canal, responsável */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {lead.raiox_nivel && lead.raiox_nivel !== "Pendente" && (
                <span className={clsx("inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border", raioxCor)}>
                  <Activity className="w-2.5 h-2.5" /> {lead.raiox_nivel}
                </span>
              )}
              {lead.canal_principal && (
                <span className="text-[9px] text-muted-foreground">{lead.canal_principal}</span>
              )}
              {lead.responsavel_nome && (
                <span className="text-[9px] text-muted-foreground/70 ml-auto truncate max-w-[80px]">
                  {lead.responsavel_nome}
                </span>
              )}
            </div>

            {/* Linha 2: próxima ação / urgência */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {lead.urgencia === "vencida" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-destructive font-medium">
                  <AlertCircle className="w-3 h-3" /> {u.label}
                </span>
              )}
              {lead.urgencia === "hoje" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-warning-500 font-medium">
                  <Clock className="w-3 h-3" /> Hoje
                </span>
              )}
              {lead.proxima_acao && (
                <span className="text-[10px] text-foreground/70 truncate">{lead.proxima_acao}</span>
              )}
            </div>

            {/* Linha 3: dias sem tocar + valor */}
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground tabular-nums">
              <span>
                {lead.dias_sem_tocar > 0
                  ? <span className={lead.dias_sem_tocar > 7 ? "text-destructive font-medium" : ""}>
                      {lead.dias_sem_tocar}d sem tocar
                    </span>
                  : "tocado hoje"}
              </span>
              {lead.valor_potencial > 0 && (
                <span className="text-foreground/80 font-medium">
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
