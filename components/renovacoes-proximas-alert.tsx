"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Repeat, ArrowRight, AlertTriangle, Clock } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import type { UrgenciaRenovacao } from "@/lib/types";

/**
 * Card em /hoje listando renovações em <= 30 dias (urgentes + vencidas).
 * Renovações 30-90d ficam só em /pos-venda e /funil pra não poluir o /hoje.
 *
 * Tons:
 *   - vencida → vermelho (já passou)
 *   - critica (≤7d) → vermelho
 *   - urgente (≤30d) → amarelo
 */
export interface RenovacaoProximaHoje {
  lead_id: number;
  cliente_empresa: string | null;
  cliente_nome: string | null;
  data_renovacao: string;
  dias_ate_renovacao: number;
  urgencia: UrgenciaRenovacao;
  valor_previsto: number;
  tem_expansao_ativa: boolean;
}

export default function RenovacoesProximasAlert({
  renovacoes,
}: {
  renovacoes: RenovacaoProximaHoje[];
}) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);

  if (!renovacoes || renovacoes.length === 0) return null;

  const visiveis = renovacoes.slice(0, 3);
  const restantes = renovacoes.length - 3;
  const valorTotal = renovacoes.reduce((acc, r) => acc + r.valor_previsto, 0);
  const fmtBRL = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const algumVencida = renovacoes.some((r) => r.urgencia === "vencida");
  const containerTone = algumVencida
    ? "border-destructive/30 bg-destructive/[0.04]"
    : "border-warning-500/25 bg-warning-500/[0.04]";
  const iconTone = algumVencida ? "text-destructive" : "text-warning-500";
  const linkTone = algumVencida ? "text-destructive" : "text-warning-500";

  return (
    <div
      role="region"
      aria-label="Renovações próximas"
      className={`mb-6 p-4 rounded-xl border ${containerTone} animate-in fade-in slide-in-from-top-2`}
    >
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${algumVencida ? "bg-destructive/15" : "bg-warning-500/15"}`}>
          <Repeat className={`w-4 h-4 ${iconTone}`} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground flex items-center gap-2">
            {algumVencida && <AlertTriangle className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />}
            {renovacoes.length === 1
              ? "1 renovação iminente"
              : `${renovacoes.length} renovações iminentes`}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fmtBRL(valorTotal)} em ARR no horizonte de 30d. Renovação fechada = receita garantida.
          </p>
        </div>
        <Link href="/comunicacao/pos-venda" className="btn-ghost text-xs whitespace-nowrap" prefetch>
          Ver todas <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <ul className="space-y-1.5">
        {visiveis.map((r) => {
          const venceu = r.urgencia === "vencida";
          return (
            <li
              key={r.lead_id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border"
            >
              <div className="flex-1 min-w-0">
                <Link href={`/pipeline/${r.lead_id}`} className="text-sm font-medium hover:text-primary transition-colors truncate block">
                  {r.cliente_empresa ?? r.cliente_nome ?? `Lead #${r.lead_id}`}
                </Link>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className={`tabular-nums font-semibold inline-flex items-center gap-1 ${venceu ? "text-destructive" : "text-warning-500"}`}>
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {venceu ? `${Math.abs(r.dias_ate_renovacao)}d vencida` : `em ${r.dias_ate_renovacao}d`}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">{fmtBRL(r.valor_previsto)}</span>
                  {r.tem_expansao_ativa && (
                    <>
                      <span>·</span>
                      <span className="text-success-500">expansão ativa</span>
                    </>
                  )}
                </div>
              </div>
              <Link href={`/pipeline/${r.lead_id}`} className="btn-secondary text-xs" prefetch>
                <Repeat className="w-3 h-3" aria-hidden="true" /> Trabalhar
              </Link>
            </li>
          );
        })}
      </ul>

      {restantes > 0 && (
        <Link href="/comunicacao/pos-venda" className={`text-xs hover:underline mt-2 inline-block ${linkTone}`}>
          + {restantes} próxima{restantes > 1 ? "s" : ""}
        </Link>
      )}
    </div>
  );
}
