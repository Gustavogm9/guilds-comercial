"use client";

import type { LeadEnriched } from "@/lib/types";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ETAPAS_PIPELINE_VISIVEL, STAGE_COLORS } from "@/lib/lists";
import clsx from "clsx";
import { Activity, Clock, AlertCircle } from "lucide-react";

// Função copiada do kanban-board para manter paridade visual
function getUrgenciaLabel(u: string | null) {
  if (!u) return "sem_acao";
  if (["vencida", "hoje", "amanha", "esta_semana", "futuro", "sem_acao"].includes(u)) {
    return u as any;
  }
  return "sem_acao";
}

function LeadCardReadOnly({ lead, t }: { lead: LeadEnriched; t: (k: string) => string }) {
  const raioxLabel = lead.raiox_nivel
    ? t(`pipeline.raiox_${lead.raiox_nivel.toLowerCase().replace("é", "e")}`)
    : null;

  const raioxCor =
    lead.raiox_nivel === "Alto"  ? "bg-success-500/15 text-success-500 border-success-500/25"
    : lead.raiox_nivel === "Médio" ? "bg-warning-500/15 text-warning-500 border-warning-500/25"
    : lead.raiox_nivel === "Baixo" ? "bg-muted text-muted-foreground border-border"
    : "bg-muted/60 text-muted-foreground/60 border-border";

  const empresaLabel = lead.empresa || lead.nome || t("pipeline.card_sem_nome");

  return (
    <Link
      href={`/vendas/pipeline/${lead.id}`}
      className="card p-4 hover:border-primary/50 hover:shadow-stripe-sm transition-all block group"
    >
      <div className="flex items-start justify-between gap-1">
        <div
          className="font-medium text-sm leading-tight truncate text-foreground group-hover:text-primary transition-colors"
          style={{ letterSpacing: "-0.13px" }}
        >
          {empresaLabel}
        </div>
        {lead.prioridade === "A" && (
          <span className="text-[10px] font-bold text-destructive shrink-0 bg-destructive/10 border border-destructive/25 rounded px-1.5 py-px">A</span>
        )}
      </div>
      {lead.nome && lead.empresa && (
        <div className="text-xs text-muted-foreground truncate mt-1">
          {lead.nome}{lead.cargo ? ` · ${lead.cargo}` : ""}
        </div>
      )}

      {/* Linha 1: raio-x, canal, responsável */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {raioxLabel && lead.raiox_nivel !== "Pendente" && (
          <span className={clsx("inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border", raioxCor)}>
            <Activity className="w-3 h-3" /> {raioxLabel}
          </span>
        )}
        {lead.canal_principal && (
          <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
            {lead.canal_principal}
          </span>
        )}
        {lead.responsavel_nome && (
          <span className="text-[10px] text-muted-foreground/70 ml-auto truncate max-w-[100px]">
            {lead.responsavel_nome}
          </span>
        )}
      </div>

      {/* Linha 2: próxima ação / urgência */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
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
          <span className="text-[11px] text-foreground/80 truncate">{lead.proxima_acao}</span>
        )}
      </div>

      {/* Linha 3: dias sem tocar + valor */}
      <div className="flex flex-wrap items-end justify-between mt-4 gap-2 pt-3 border-t border-border/50">
        <span className="text-[11px] text-muted-foreground font-medium">
          {lead.dias_sem_tocar > 0
            ? <span className={lead.dias_sem_tocar > 7 ? "text-destructive" : ""}>
                {t("hoje.lead_dias_sem_tocar").replace("{{n}}", String(lead.dias_sem_tocar))}
              </span>
            : t("hoje.tocado_hoje")}
        </span>
        
        {/* Valores Financeiros */}
        <div className="flex flex-col items-end gap-0.5 text-right">
          {lead.valor_potencial > 0 && (
            <span className="text-foreground font-semibold text-xs leading-none">
              {lead.valor_potencial.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </span>
          )}
          {(lead.valor_setup > 0 || lead.valor_mensal > 0) && (
            <span className="text-[10px] text-muted-foreground/80 leading-none">
              {[
                lead.valor_setup > 0 && `Setup: ${lead.valor_setup.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`,
                lead.valor_mensal > 0 && `MRR: ${lead.valor_mensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`
              ].filter(Boolean).join(" | ")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function PipelineGrid({ leads }: { leads: LeadEnriched[] }) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  if (leads.length === 0) {
    return (
      <div className="px-4 md:px-8 py-12 text-center">
        <p className="text-muted-foreground">{t("pipeline.card_vazio")}</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 pb-12 flex flex-col gap-8">
      {ETAPAS_PIPELINE_VISIVEL.map(stage => {
        const stageLeads = leads.filter(l => l.crm_stage === stage);
        if (stageLeads.length === 0) return null;
        
        const c = STAGE_COLORS[stage];
        const stageLabel = t(`pipeline_etapas.${stage}`);

        return (
          <div key={stage} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h3 className={clsx("text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border", c.bg, c.text, c.border)}>
                {stageLabel}
              </h3>
              <span className="text-xs font-medium text-muted-foreground">
                {stageLeads.length} {stageLeads.length === 1 ? "lead" : "leads"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {stageLeads.map(lead => (
                <LeadCardReadOnly key={lead.id} lead={lead} t={t} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
