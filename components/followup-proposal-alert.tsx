"use client";

/**
 * FollowupProposalAlert — alerta de propostas paradas no /hoje.
 *
 * Aparece quando há leads em crm_stage="Proposta" há 3+ dias sem
 * próxima ação agendada (ou com data vencida). Cada lead aparece como
 * um item clicável que leva ao detalhe do pipeline.
 *
 * Lógica:
 *   - dias_sem_tocar >= 3 AND crm_stage = "Proposta"
 *   - data_proxima_acao is null OR data_proxima_acao < hoje
 *
 * Dismiss: persiste no localStorage por 24h para não incomodar.
 * Key: "guilds-followup-alert-{userId}-{date}"
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, X, ArrowRight, TrendingDown } from "lucide-react";

export type PropostaParada = {
  id: number;
  empresa: string | null;
  nome: string | null;
  dias_sem_tocar: number;
  valor_potencial: number;
};

type Props = {
  leads: PropostaParada[];
  userId: string;
  currency?: string;
  locale?: string;
};

export default function FollowupProposalAlert({ leads, userId, currency = "BRL", locale = "pt-BR" }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const DISMISS_KEY = `guilds-followup-alert-${userId}-${today}`;
  const [dismissed, setDismissed] = useState(true); // oculto até hidratar

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, [DISMISS_KEY]);

  if (dismissed || leads.length === 0) return null;

  function dispensar() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignora */ }
    setDismissed(true);
  }

  const totalEmRisco = leads.reduce((acc, l) => acc + (l.valor_potencial ?? 0), 0);

  return (
    <div className="card mb-6 border-warning-500/30 bg-warning-500/[0.04] animate-in fade-in slide-in-from-top-2">
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-warning-500/10 grid place-items-center shrink-0 mt-0.5">
            <TrendingDown className="w-4 h-4 text-warning-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-1.5" style={{ letterSpacing: "-0.13px" }}>
              <AlertTriangle className="w-3.5 h-3.5 text-warning-500" />
              {leads.length} proposta{leads.length > 1 ? "s" : ""} parada{leads.length > 1 ? "s" : ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {totalEmRisco.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 })} em risco · Sem follow-up há 3+ dias
            </div>
          </div>
        </div>
        <button onClick={dispensar} className="text-muted-foreground hover:text-foreground shrink-0 p-1" aria-label="Dispensar">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Lista de leads */}
      <div className="divide-y divide-border/40 border-t border-border/40">
        {leads.map((lead) => (
          <Link
            key={lead.id}
            href={`/pipeline/${lead.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-warning-500/5 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {lead.empresa || lead.nome || "Sem nome"}
              </div>
              <div className="text-xs text-muted-foreground">
                Sem toque há <span className="font-semibold text-warning-500">{lead.dias_sem_tocar} dias</span>
                {" · "}
                {lead.valor_potencial.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 })}
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-warning-500 transition-colors shrink-0" />
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/40">
        <p className="text-[10px] text-muted-foreground">
          💡 80% dos fechamentos acontecem após 3+ follow-ups. Entre em contato hoje.
        </p>
      </div>
    </div>
  );
}
