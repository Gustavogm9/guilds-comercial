"use client";
import { useEffect, useState, useTransition } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, KeyboardSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import Link from "next/link";
import { moverEtapa } from "@/app/(app)/hoje/actions";
import {
  ETAPAS_PIPELINE_VISIVEL,
  STAGE_COLORS,
  ETAPAS_EXIGEM_MOTIVO,
  getUrgenciaLabel,
} from "@/lib/lists";
import type { CrmStage, LeadEnriched } from "@/lib/types";
import { GripVertical, AlertCircle, Clock, Activity, CheckCircle2, X } from "lucide-react";
import clsx from "clsx";
import MotivoSaidaModal from "./motivo-saida-modal";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

/**
 * Kanban com drag-and-drop entre etapas do funil.
 *
 * Fixes desta rodada:
 *   - Bug 1: rollback do optimistic update quando moverEtapa falha
 *   - Bug 2: getUrgenciaLabel com fallback (em Card)
 *   - Bug 3: confirmação inline ao mover pra "Fechado" (estado terminal)
 *   - Robustez 13: TouchSensor com delay (drag em mobile não conflita com scroll)
 *   - i18n 14, 15, 16: stage label, "Hoje", dias_sem_tocar, raiox_nivel via t()
 *   - UX 26, 28: feedback visual de drop válido + toast de sucesso
 *   - UX 27: grip handle apenas área visual (todo card é dragável)
 *   - A11y 33-35, 37: aria-label, KeyboardSensor, role na droppable
 */
export default function KanbanBoard({ leads }: { leads: LeadEnriched[] }) {
  const [active, setActive] = useState<LeadEnriched | null>(null);
  const [items, setItems] = useState(leads);
  // Sincroniza props → state (filtros do server-side mudam leads)
  useEffect(() => { setItems(leads); }, [leads]);

  const [pending, start] = useTransition();
  const [motivoModo, setMotivoModo] = useState<{ lead_id: number; destino: CrmStage; etapaOriginal: CrmStage | null } | null>(null);
  const [confirmFechar, setConfirmFechar] = useState<{ lead: LeadEnriched; etapaOriginal: CrmStage | null } | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: "sucesso" | "erro"; mensagem: string } | null>(null);
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  // Sensors:
  //  - PointerSensor: desktop (mouse) com distância de 5px pra evitar drag acidental
  //  - TouchSensor: mobile com delay de 200ms (não conflita com scroll vertical)
  //  - KeyboardSensor: a11y — Space + setas + Enter
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // Auto-dismiss toast
  useEffect(() => {
    if (!feedback) return;
    const ms = feedback.tipo === "sucesso" ? 2500 : 4500;
    const timer = setTimeout(() => setFeedback(null), ms);
    return () => clearTimeout(timer);
  }, [feedback]);

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

    // Bug 3: "Fechado" exige confirmação (estado terminal de ganho)
    if (novaEtapa === "Fechado") {
      setConfirmFechar({ lead, etapaOriginal: lead.crm_stage });
      return;
    }

    // Etapas com motivo obrigatório (Perdido, Nutrição) abrem modal
    if (ETAPAS_EXIGEM_MOTIVO.includes(novaEtapa)) {
      setItems(prev => prev.map(l => l.id === id ? { ...l, crm_stage: novaEtapa } : l));
      setMotivoModo({ lead_id: id, destino: novaEtapa, etapaOriginal: lead.crm_stage });
      return;
    }

    // Optimistic update
    const etapaOriginal = lead.crm_stage;
    setItems(prev => prev.map(l => l.id === id ? { ...l, crm_stage: novaEtapa } : l));
    start(async () => {
      try {
        await moverEtapa(id, novaEtapa);
        setFeedback({
          tipo: "sucesso",
          mensagem: t("pipeline.toast_movido").replace("{{stage}}", t(`pipeline_etapas.${novaEtapa}`)),
        });
      } catch (err) {
        // Bug 1: rollback do optimistic update
        setItems(prev => prev.map(l => l.id === id ? { ...l, crm_stage: etapaOriginal } : l));
        setFeedback({
          tipo: "erro",
          mensagem: err instanceof Error ? err.message : t("pipeline.toast_movido_erro"),
        });
      }
    });
  }

  function cancelarMotivo() {
    if (motivoModo) {
      const origem = motivoModo.etapaOriginal;
      setItems(prev => prev.map(l => l.id === motivoModo.lead_id ? { ...l, crm_stage: origem } : l));
    }
    setMotivoModo(null);
  }

  function confirmarFechar() {
    if (!confirmFechar) return;
    const { lead, etapaOriginal } = confirmFechar;
    setConfirmFechar(null);
    // Optimistic
    setItems(prev => prev.map(l => l.id === lead.id ? { ...l, crm_stage: "Fechado" } : l));
    start(async () => {
      try {
        await moverEtapa(lead.id, "Fechado");
        setFeedback({
          tipo: "sucesso",
          mensagem: t("pipeline.toast_movido").replace("{{stage}}", t("pipeline_etapas.Fechado")),
        });
      } catch (err) {
        setItems(prev => prev.map(l => l.id === lead.id ? { ...l, crm_stage: etapaOriginal } : l));
        setFeedback({
          tipo: "erro",
          mensagem: err instanceof Error ? err.message : t("pipeline.toast_movido_erro"),
        });
      }
    });
  }

  return (
    <DndContext id="kanban-board" sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 px-4 md:px-8">
        {ETAPAS_PIPELINE_VISIVEL.map(stage => (
          <Column
            key={stage}
            stage={stage}
            stageLabel={t(`pipeline_etapas.${stage}`)}
            ponderadoLabel={t("pipeline.card_ponderado")}
            vazioLabel={t("pipeline.card_vazio")}
            leads={items.filter(l => l.crm_stage === stage)}
            t={t}
          />
        ))}
      </div>
      <DragOverlay>
        {active && <Card lead={active} dragging t={t} />}
      </DragOverlay>

      <MotivoSaidaModal
        modo={motivoModo ? { tipo: "mover", lead_id: motivoModo.lead_id, destino: motivoModo.destino } : null}
        onClose={cancelarMotivo}
      />

      {/* Modal de confirmação Fechado */}
      {confirmFechar && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setConfirmFechar(null)}
        >
          <div
            className="bg-card text-foreground border border-border rounded-xl max-w-sm w-full p-6 shadow-stripe-md"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fechar-confirm-titulo"
          >
            <div className="w-12 h-12 rounded-full bg-success-500/10 text-success-500 grid place-items-center mx-auto mb-4">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 id="fechar-confirm-titulo" className="text-base font-semibold text-foreground text-center" style={{ letterSpacing: "-0.24px" }}>
              {t("pipeline.fechar_confirmar_titulo").replace("{{empresa}}", confirmFechar.lead.empresa || confirmFechar.lead.nome || t("pipeline.card_sem_nome"))}
            </h3>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {t("pipeline.fechar_confirmar_msg")}
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirmFechar(null)}
                className="btn-secondary text-sm flex-1"
                type="button"
              >
                {t("pipeline.fechar_confirmar_nao")}
              </button>
              <button
                onClick={confirmarFechar}
                disabled={pending}
                className="btn-primary text-sm flex-1"
                type="button"
              >
                {t("pipeline.fechar_confirmar_sim")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de feedback */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 right-6 md:right-8 md:bottom-28 z-[100] max-w-sm card p-3 flex items-start gap-2.5 shadow-stripe-md animate-in fade-in slide-in-from-bottom-2 ${
            feedback.tipo === "sucesso"
              ? "border-success-500/30 bg-success-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          {feedback.tipo === "sucesso" ? (
            <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          )}
          <span className="text-sm text-foreground flex-1">{feedback.mensagem}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </DndContext>
  );
}

function Column({ stage, stageLabel, ponderadoLabel, vazioLabel, leads, t }: {
  stage: CrmStage;
  stageLabel: string;
  ponderadoLabel: string;
  vazioLabel: string;
  leads: LeadEnriched[];
  t: (k: string) => string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const c = STAGE_COLORS[stage];
  const totalValor = leads.reduce((s, l) => s + (l.receita_ponderada || 0), 0);

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`${stageLabel} (${leads.length})`}
      className={clsx(
        "min-w-[280px] w-[280px] flex flex-col rounded-xl border transition-all",
        c.bg, c.border,
        isOver && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <div className="px-3 py-2 border-b border-border/60 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className={clsx("text-[11px] font-semibold uppercase tracking-[0.12em]", c.text)}>{stageLabel}</span>
          <span className="text-xs font-medium text-foreground/80 tabular-nums">{leads.length}</span>
        </div>
        {totalValor > 0 && (
          <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} {ponderadoLabel}
          </div>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-220px)] overflow-y-auto">
        {leads.map(l => <Card key={l.id} lead={l} t={t} />)}
        {leads.length === 0 && (
          <div className="text-xs text-muted-foreground/60 text-center py-6 italic">{vazioLabel}</div>
        )}
      </div>
    </div>
  );
}

function Card({ lead, dragging = false, t }: {
  lead: LeadEnriched;
  dragging?: boolean;
  t: (k: string) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  // Bug 2: getUrgenciaLabel com fallback
  const u = getUrgenciaLabel(lead.urgencia);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  // i18n 16: raiox_nivel via t()
  const raioxLabel = lead.raiox_nivel
    ? t(`pipeline.raiox_${lead.raiox_nivel.toLowerCase().replace("é", "e")}`)
    : null;

  const raioxCor =
    lead.raiox_nivel === "Alto"  ? "bg-success-500/15 text-success-500 border-success-500/25"
    : lead.raiox_nivel === "Médio" ? "bg-warning-500/15 text-warning-500 border-warning-500/25"
    : lead.raiox_nivel === "Baixo" ? "bg-muted text-muted-foreground border-border"
    : "bg-muted/60 text-muted-foreground/60 border-border";

  const empresaLabel = lead.empresa || lead.nome || t("pipeline.card_sem_nome");
  const stageLabel = lead.crm_stage ? t(`pipeline_etapas.${lead.crm_stage}`) : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "card p-3 select-none cursor-grab active:cursor-grabbing transition-all",
        "hover:border-primary/30",
        (isDragging || dragging) && "shadow-stripe-md scale-[1.02] opacity-95 border-primary/50",
      )}
      {...listeners}
      {...attributes}
      // A11y 33: aria-label descritivo
      aria-label={t("pipeline.kanban_card_aria")
        .replace("{{empresa}}", empresaLabel)
        .replace("{{stage}}", stageLabel)}
      aria-roledescription="card"
    >
      <div className="flex items-start gap-2">
        {/* UX 27: grip apenas visual (não-interativo); todo o card é dragável */}
        <span
          aria-hidden
          className="text-muted-foreground/40 mt-0.5 shrink-0"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          {/* Link só no clique; drag é o card inteiro via setNodeRef. Stop propagation evita conflito. */}
          <Link
            href={`/vendas/pipeline/${lead.id}`}
            className="block"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-1">
              <div
                className="font-medium text-sm leading-tight truncate text-foreground hover:text-primary transition-colors"
                style={{ letterSpacing: "-0.13px" }}
              >
                {empresaLabel}
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
              {raioxLabel && lead.raiox_nivel !== "Pendente" && (
                <span className={clsx("inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border", raioxCor)}>
                  <Activity className="w-2.5 h-2.5" /> {raioxLabel}
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

            {/* Linha 2: próxima ação / urgência (i18n 15) */}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {lead.urgencia === "vencida" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-destructive font-medium">
                  <AlertCircle className="w-3 h-3" /> {t("urgencia.vencida")}
                </span>
              )}
              {lead.urgencia === "hoje" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-warning-500 font-medium">
                  <Clock className="w-3 h-3" /> {t("urgencia.hoje")}
                </span>
              )}
              {lead.proxima_acao && (
                <span className="text-[10px] text-foreground/70 truncate">{lead.proxima_acao}</span>
              )}
            </div>

            {/* Linha 3: dias sem tocar + valor (i18n 15) */}
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground tabular-nums">
              <span>
                {lead.dias_sem_tocar > 0
                  ? <span className={lead.dias_sem_tocar > 7 ? "text-destructive font-medium" : ""}>
                      {t("hoje.lead_dias_sem_tocar").replace("{{n}}", String(lead.dias_sem_tocar))}
                    </span>
                  : t("hoje.tocado_hoje")}
              </span>
              {/* Valores Financeiros */}
              <div className="flex flex-col items-end gap-0.5 text-right">
                {lead.valor_potencial > 0 && (
                  <span className="text-foreground/80 font-medium leading-none">
                    {lead.valor_potencial.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                  </span>
                )}
                {(lead.valor_setup > 0 || lead.valor_mensal > 0) && (
                  <span className="text-[9px] text-muted-foreground/80 leading-none">
                    {[
                      lead.valor_setup > 0 && `Setup: ${lead.valor_setup.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`,
                      lead.valor_mensal > 0 && `MRR: ${lead.valor_mensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`
                    ].filter(Boolean).join(" | ")}
                  </span>
                )}
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
