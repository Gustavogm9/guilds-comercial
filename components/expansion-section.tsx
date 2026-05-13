"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, TrendingUp, DollarSign, Target, ArrowRight, Repeat, AlertTriangle } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import type { ExpansoesResumo, HealthResumo, RenovacoesResumo } from "@/lib/types";

/**
 * Seção "Expansão / NRR" do /funil — KPIs do P4 do flywheel.
 *
 * Mostra:
 *   - Pipeline de expansão aberto
 *   - Receita expandida (lifetime + ARR anualizado)
 *   - NRR estimado: (clientes ativos + receita expansão) / clientes ativos × 100
 *     (simplificação — real seria por coorte; aqui é proxy razoável)
 *   - Taxa de conversão de expansão
 */
export default function ExpansionSection({
  resumo,
  healthResumo,
  renovacoesResumo,
  currency = "BRL",
}: {
  resumo: ExpansoesResumo | null;
  healthResumo: HealthResumo | null;
  renovacoesResumo?: RenovacoesResumo | null;
  currency?: string;
}) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);

  const semDados = !resumo || resumo.total_expansoes === 0;
  const totalClientes = healthResumo?.total_fechados ?? 0;

  // NRR proxy: (1 + receita_expandida / valor_arr_base) * 100
  // ARR base seria a receita "padrão" dos clientes — aqui usamos
  // arr_em_risco como proxy do ARR total (chumbado, melhor que nada)
  // Quando billing tracking existir, recalcular com MRR real.
  const nrrProxy = (resumo && totalClientes > 0)
    ? Math.round(100 + (resumo.arr_expandido / Math.max(1, totalClientes * 1000)) * 100)
    : null;

  return (
    <section
      className="card p-5 mb-6 border-success-500/20 bg-success-500/[0.02]"
      aria-label="Expansão"
    >
      <header className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Rocket className="w-4 h-4 text-success-500" aria-hidden="true" />
            Expansão / Net Revenue Retention
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Receita gerada vendendo mais para quem já é cliente. NRR &gt; 100% = você cresce sem novo lead.
          </p>
        </div>
        <Link href="/comunicacao/pos-venda?tab=expansoes" className="btn-secondary text-xs whitespace-nowrap">
          Pós-venda <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </header>

      {semDados ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Rocket className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" aria-hidden="true" />
          <p className="text-sm text-foreground/80 mb-1">Sem expansões registradas ainda.</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-3">
            Clientes saudáveis (NPS alto + onboarding ok) são candidatos naturais a upsell.
            Comece pela aba Saúde em /pos-venda.
          </p>
          <Link href="/comunicacao/pos-venda?tab=saude" className="btn-secondary text-xs">
            Ver clientes <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Pipeline expansão"
            value={fmt(resumo?.pipeline_aberto ?? 0)}
            sub={`${resumo?.ativas ?? 0} oportunidades`}
            icon={<Rocket className="w-4 h-4" />}
            tone="primary"
          />
          <KpiCard
            label="Receita expandida"
            value={fmt(resumo?.receita_expandida ?? 0)}
            sub={`${resumo?.fechadas ?? 0} fechadas`}
            icon={<DollarSign className="w-4 h-4" />}
            tone="success"
          />
          <KpiCard
            label="ARR expansão"
            value={fmt(resumo?.arr_expandido ?? 0)}
            sub="recorrente anualizado"
            icon={<TrendingUp className="w-4 h-4" />}
            tone="success"
          />
          <KpiCard
            label="Conversão"
            value={resumo?.taxa_conversao_pct != null ? `${resumo.taxa_conversao_pct}%` : "—"}
            sub={`${resumo?.dias_medio_fechar ? Math.round(resumo.dias_medio_fechar) + "d" : "—"} médio fechar`}
            icon={<Target className="w-4 h-4" />}
          />
        </div>
      )}

      {/* Sub-bloco renovações — só aparece se tem dados de renovação */}
      {renovacoesResumo && renovacoesResumo.total_clientes_recorrentes > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Repeat className="w-3 h-3" aria-hidden="true" /> Renovações
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Recorrentes"
              value={renovacoesResumo.total_clientes_recorrentes.toString()}
              sub="clientes com data setada"
              icon={<Repeat className="w-4 h-4" />}
            />
            <KpiCard
              label="Próximas 30d"
              value={renovacoesResumo.renovacoes_proximas_30d.toString()}
              sub={`${renovacoesResumo.renovacoes_proximas_90d} em 90d`}
              icon={<Target className="w-4 h-4" />}
              tone={renovacoesResumo.renovacoes_proximas_30d > 0 ? "primary" : "default"}
            />
            <KpiCard
              label="ARR em renovação"
              value={fmt(
                renovacoesResumo.taxa_renovacao_pct != null
                  ? renovacoesResumo.arr_em_renovacao_90d * (renovacoesResumo.taxa_renovacao_pct / 100)
                  : renovacoesResumo.arr_em_renovacao_90d
              )}
              sub={
                renovacoesResumo.taxa_renovacao_pct != null
                  ? `próx. 90d · ${renovacoesResumo.taxa_renovacao_pct}% conv.`
                  : "próximos 90d (bruto)"
              }
              icon={<DollarSign className="w-4 h-4" />}
              tone="success"
            />
            <KpiCard
              label="Taxa renovação"
              value={renovacoesResumo.taxa_renovacao_pct != null ? `${renovacoesResumo.taxa_renovacao_pct}%` : "—"}
              sub={
                renovacoesResumo.renovacoes_vencidas > 0
                  ? `${renovacoesResumo.renovacoes_vencidas} vencida(s)`
                  : "últimos 12 meses"
              }
              icon={<AlertTriangle className="w-4 h-4" />}
              tone={renovacoesResumo.renovacoes_vencidas > 0 ? "primary" : "success"}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function KpiCard({ label, value, sub, icon, tone }: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: "primary" | "success" | "default";
}) {
  const toneClass =
    tone === "primary" ? "text-primary" :
    tone === "success" ? "text-success-500" :
    "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span className="uppercase tracking-[0.12em] font-semibold text-[10px]">{label}</span>
        <span className={toneClass} aria-hidden="true">{icon}</span>
      </div>
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
