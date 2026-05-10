"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

/**
 * Card de NPS pendentes em /hoje (cobra vendedor pra registrar resposta).
 * Mostra até 3 com link pra /pos-venda; resto via "Ver todos".
 */
export interface NpsPendenteHoje {
  nps_id: number;
  lead_id: number;
  lead_empresa: string | null;
  lead_nome: string | null;
  solicitado_em: string;
  dias_pendente: number;
}

export default function NpsPendenteAlert({ npsList }: { npsList: NpsPendenteHoje[] }) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  if (!npsList || npsList.length === 0) return null;

  const visiveis = npsList.slice(0, 3);
  const restantes = npsList.length - 3;

  return (
    <div
      role="region"
      aria-label="NPS pendentes"
      className="mb-6 p-4 rounded-xl border border-warning-500/25 bg-warning-500/[0.04] animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-warning-500/15 grid place-items-center shrink-0">
          <Star className="w-4 h-4 text-warning-500" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">
            {npsList.length === 1
              ? "1 cliente esperando NPS"
              : `${npsList.length} clientes esperando NPS`}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Coleta a nota pra fechar o ciclo do funil borboleta — promotores viram embaixadores.
          </p>
        </div>
        <Link href="/pos-venda" className="btn-ghost text-xs whitespace-nowrap" prefetch>
          Ver todos <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <ul className="space-y-1.5">
        {visiveis.map((n) => (
          <li
            key={n.nps_id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border"
          >
            <div className="flex-1 min-w-0">
              <Link href={`/pipeline/${n.lead_id}`} className="text-sm font-medium hover:text-warning-500 transition-colors truncate block">
                {n.lead_empresa ?? n.lead_nome ?? `Lead #${n.lead_id}`}
              </Link>
              <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                Solicitado há {n.dias_pendente}d
              </div>
            </div>
            <Link href="/pos-venda" className="btn-secondary text-xs" prefetch>
              <Star className="w-3 h-3" aria-hidden="true" />
              Registrar
            </Link>
          </li>
        ))}
      </ul>

      {restantes > 0 && (
        <Link href="/pos-venda" className="text-xs text-warning-500 hover:underline mt-2 inline-block">
          + {restantes} pendente{restantes > 1 ? "s" : ""}
        </Link>
      )}
    </div>
  );
}
