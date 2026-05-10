"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Heart } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

/**
 * Card em /hoje listando clientes em_risco (health_score < 40).
 * Mostra até 3 com link pra /pos-venda?tab=saude (e detalhe lead).
 */
export interface HealthEmRiscoHoje {
  lead_id: number;
  lead_empresa: string | null;
  lead_nome: string | null;
  health_score: number;
  dias_sem_interacao: number;
}

export default function HealthEmRiscoAlert({ leads }: { leads: HealthEmRiscoHoje[] }) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);

  if (!leads || leads.length === 0) return null;

  const visiveis = leads.slice(0, 3);
  const restantes = leads.length - 3;

  return (
    <div
      role="region"
      aria-label="Clientes em risco de churn"
      className="mb-6 p-4 rounded-xl border border-destructive/30 bg-destructive/[0.04] animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-destructive/15 grid place-items-center shrink-0">
          <Heart className="w-4 h-4 text-destructive" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />
            {leads.length === 1
              ? "1 cliente em risco de churn"
              : `${leads.length} clientes em risco de churn`}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Health score &lt; 40. Liga, manda mensagem, marca uma call — antes que renove (ou não).
          </p>
        </div>
        <Link href="/pos-venda" className="btn-ghost text-xs whitespace-nowrap" prefetch>
          Ver todos <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <ul className="space-y-1.5">
        {visiveis.map((l) => (
          <li
            key={l.lead_id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border"
          >
            <div className="flex-1 min-w-0">
              <Link href={`/pipeline/${l.lead_id}`} className="text-sm font-medium hover:text-destructive transition-colors truncate block">
                {l.lead_empresa ?? l.lead_nome ?? `Lead #${l.lead_id}`}
              </Link>
              <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums flex items-center gap-2">
                <span className="text-destructive font-semibold">Score: {l.health_score}</span>
                <span>·</span>
                <span>{l.dias_sem_interacao}d sem contato</span>
              </div>
            </div>
            <Link href={`/pipeline/${l.lead_id}`} className="btn-secondary text-xs" prefetch>
              <Heart className="w-3 h-3" aria-hidden="true" /> Reativar
            </Link>
          </li>
        ))}
      </ul>

      {restantes > 0 && (
        <Link href="/pos-venda" className="text-xs text-destructive hover:underline mt-2 inline-block">
          + {restantes} em risco
        </Link>
      )}
    </div>
  );
}
