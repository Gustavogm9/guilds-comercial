"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, ArrowRight, Clock } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

/**
 * Card em /hoje listando expansões com próxima ação atrasada.
 * Mostra até 3 com link pra /pos-venda?tab=expansoes.
 */
export interface ExpansaoAtrasadaHoje {
  expansao_id: number;
  cliente_lead_id: number;
  cliente_empresa: string | null;
  cliente_nome: string | null;
  titulo: string;
  proxima_acao: string | null;
  dias_atrasada: number;
  valor_potencial: number;
  estagio: string;
}

export default function ExpansoesAtrasadasAlert({ expansoes }: { expansoes: ExpansaoAtrasadaHoje[] }) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);

  if (!expansoes || expansoes.length === 0) return null;

  const visiveis = expansoes.slice(0, 3);
  const restantes = expansoes.length - 3;
  const valorTotal = expansoes.reduce((acc, e) => acc + (e.valor_potencial || 0), 0);
  const fmtBRL = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  return (
    <div
      role="region"
      aria-label="Expansões atrasadas"
      className="mb-6 p-4 rounded-xl border border-warning-500/25 bg-warning-500/[0.04] animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-warning-500/15 grid place-items-center shrink-0">
          <Rocket className="w-4 h-4 text-warning-500" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">
            {expansoes.length === 1
              ? "1 expansão com follow-up atrasado"
              : `${expansoes.length} expansões com follow-up atrasado`}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fmtBRL(valorTotal)} em pipeline parado. Liga, manda mensagem, fecha.
          </p>
        </div>
        <Link href="/comunicacao/pos-venda?tab=expansoes" className="btn-ghost text-xs whitespace-nowrap" prefetch>
          Ver todos <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <ul className="space-y-1.5">
        {visiveis.map((e) => (
          <li
            key={e.expansao_id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border"
          >
            <div className="flex-1 min-w-0">
              <Link href={`/vendas/pipeline/${e.cliente_lead_id}`} className="text-sm font-medium hover:text-warning-500 transition-colors truncate block">
                {e.titulo}
              </Link>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{e.cliente_empresa ?? e.cliente_nome ?? `Lead #${e.cliente_lead_id}`}</span>
                <span>·</span>
                <span className="text-warning-500 font-semibold tabular-nums">
                  <Clock className="w-3 h-3 inline" aria-hidden="true" /> {e.dias_atrasada}d atrasada
                </span>
                <span>·</span>
                <span className="tabular-nums">{fmtBRL(e.valor_potencial)}</span>
              </div>
            </div>
            <Link href={`/vendas/pipeline/${e.cliente_lead_id}`} className="btn-secondary text-xs" prefetch>
              <Rocket className="w-3 h-3" aria-hidden="true" /> Trabalhar
            </Link>
          </li>
        ))}
      </ul>

      {restantes > 0 && (
        <Link href="/comunicacao/pos-venda?tab=expansoes" className="text-xs text-warning-500 hover:underline mt-2 inline-block">
          + {restantes} atrasada{restantes > 1 ? "s" : ""}
        </Link>
      )}
    </div>
  );
}
