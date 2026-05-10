"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles, ListChecks, Star, Heart, Rocket, Repeat, Gift,
  TrendingUp, ArrowRight, AlertTriangle,
} from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import type {
  AdvocacyKpis,
  TopEmbaixador,
  HealthResumo,
  ExpansoesResumo,
  RenovacoesResumo,
  NpsResumo,
  RecompensasResumo,
} from "@/lib/types";

interface Counts {
  pedidos_pendentes: number;
  nps_pendentes: number;
  health_em_risco: number;
  expansoes_atrasadas: number;
  renovacoes_iminentes: number;
}

/**
 * Dashboard do funil borboleta. 6 cards (P1-P6) com KPI principal + alerta
 * + CTA pra a página detalhada.
 *
 * Layout responsivo: grid 1/2/3 colunas conforme tela.
 */
export default function FlywheelDashboard({
  orgNome, currency,
  advocacy, topEmbaixadores,
  health, expansoes, renovacoes, nps, recompensas,
  counts,
}: {
  orgNome: string;
  currency: string;
  advocacy: AdvocacyKpis | null;
  topEmbaixadores: TopEmbaixador[];
  health: HealthResumo | null;
  expansoes: ExpansoesResumo | null;
  renovacoes: RenovacoesResumo | null;
  nps: NpsResumo | null;
  recompensas: RecompensasResumo | null;
  counts: Counts;
}) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);

  const totalAlertas =
    counts.pedidos_pendentes +
    counts.nps_pendentes +
    counts.health_em_risco +
    counts.expansoes_atrasadas +
    counts.renovacoes_iminentes;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 mb-2 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-[10px] font-semibold uppercase tracking-[0.12em]">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Funil borboleta
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            Flywheel — pós-venda em movimento
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cada cliente fechado é fonte de novos clientes. Acompanhe os 6 estágios do lado direito do funil.
          </p>
        </div>
        {totalAlertas > 0 && (
          <Link href="/hoje" className="btn-secondary text-xs whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            {totalAlertas} {totalAlertas === 1 ? "alerta" : "alertas"} hoje
          </Link>
        )}
      </header>

      {/* Topline composto */}
      <section className="card p-5 mb-6 bg-gradient-to-br from-primary/5 via-card to-success-500/5 border-primary/20">
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-3">
          Visão consolidada
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Topline
            label="Clientes ativos"
            value={(health?.total_fechados ?? 0).toString()}
            sub={`${health?.saudaveis ?? 0} saudáveis`}
            tone="primary"
          />
          <Topline
            label="K-factor"
            value={(advocacy?.k_factor ?? 0).toFixed(2)}
            sub="leads novos por cliente"
            tone="success"
          />
          <Topline
            label="ARR expansão"
            value={fmt(expansoes?.arr_expandido ?? 0)}
            sub={`${expansoes?.fechadas ?? 0} fechadas`}
            tone="success"
          />
          <Topline
            label="ARR em renovação"
            value={fmt(renovacoes?.arr_em_renovacao_90d ?? 0)}
            sub={`próximos 90 dias`}
            tone={renovacoes && renovacoes.renovacoes_vencidas > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      {/* 6 Cards do flywheel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* P1 — Indicações (Advocacy) */}
        <FaseCard
          fase="P1"
          titulo="Indicações"
          subtitulo="Cliente fechado pede pra outro fechar"
          icon={<Sparkles className="w-5 h-5" />}
          tone="primary"
          alerta={counts.pedidos_pendentes > 0 ? `${counts.pedidos_pendentes} ${counts.pedidos_pendentes === 1 ? "pedido pendente" : "pedidos pendentes"}` : null}
          kpis={[
            { label: "K-factor", value: (advocacy?.k_factor ?? 0).toFixed(2) },
            { label: "Receita via indicação", value: fmt(advocacy?.receita_via_indicacao ?? 0), tone: "success" },
            { label: "Embaixadores", value: (advocacy?.clientes_que_indicaram ?? 0).toString() },
          ]}
          extra={topEmbaixadores.length > 0 ? (
            <div className="text-xs text-muted-foreground">
              Top: <strong className="text-foreground">{topEmbaixadores[0].embaixador_empresa ?? topEmbaixadores[0].embaixador_nome}</strong>
              {" "}— {fmt(topEmbaixadores[0].receita_gerada)}
            </div>
          ) : null}
          ctaLabel="Abrir indicações"
          ctaHref="/growth/indicacoes"
        />

        {/* P2 — Onboarding */}
        <FaseCard
          fase="P2"
          titulo="Onboarding"
          subtitulo="Cliente novo até estar usando 100%"
          icon={<ListChecks className="w-5 h-5" />}
          tone="primary"
          alerta={null}
          kpis={[
            { label: "Em andamento", value: (health?.total_fechados ?? 0).toString() },
            { label: "Templates", value: "Ver" },
          ]}
          extra={
            <div className="text-xs text-muted-foreground italic">
              Configure template default em /comunicacao/pos-venda.
            </div>
          }
          ctaLabel="Abrir onboardings"
          ctaHref="/comunicacao/pos-venda?tab=onboarding"
        />

        {/* P2 — NPS */}
        <FaseCard
          fase="P2"
          titulo="NPS"
          subtitulo="Coleta automática D+7 do fechamento"
          icon={<Star className="w-5 h-5" />}
          tone={nps?.nps_score != null && nps.nps_score >= 50 ? "success" : "warning"}
          alerta={counts.nps_pendentes > 0 ? `${counts.nps_pendentes} aguardando resposta` : null}
          kpis={[
            { label: "NPS Score", value: nps?.nps_score != null ? nps.nps_score.toString() : "—",
              tone: nps?.nps_score != null && nps.nps_score >= 50 ? "success" : "default" },
            { label: "Promotores", value: (nps?.promotores ?? 0).toString(), tone: "success" },
            { label: "Detratores", value: (nps?.detratores ?? 0).toString(), tone: nps && nps.detratores > 0 ? "warning" : "default" },
          ]}
          ctaLabel="Abrir NPS"
          ctaHref="/comunicacao/pos-venda?tab=nps"
        />

        {/* P3 — Health Score */}
        <FaseCard
          fase="P3"
          titulo="Health Score"
          subtitulo="Detecta churn antes que aconteça"
          icon={<Heart className="w-5 h-5" />}
          tone={counts.health_em_risco > 0 ? "warning" : "success"}
          alerta={counts.health_em_risco > 0 ? `${counts.health_em_risco} em risco` : null}
          kpis={[
            { label: "Score médio", value: health?.score_medio != null ? `${health.score_medio}` : "—" },
            { label: "Saudáveis", value: (health?.saudaveis ?? 0).toString(), tone: "success" },
            { label: "ARR em risco", value: fmt(health?.arr_em_risco ?? 0),
              tone: (health?.arr_em_risco ?? 0) > 0 ? "warning" : "default" },
          ]}
          ctaLabel="Abrir saúde"
          ctaHref="/comunicacao/pos-venda?tab=saude"
        />

        {/* P4 — Expansão */}
        <FaseCard
          fase="P4"
          titulo="Expansão"
          subtitulo="Upsell, cross-sell, mais seats"
          icon={<Rocket className="w-5 h-5" />}
          tone="success"
          alerta={counts.expansoes_atrasadas > 0 ? `${counts.expansoes_atrasadas} atrasadas` : null}
          kpis={[
            { label: "Pipeline", value: fmt(expansoes?.pipeline_aberto ?? 0) },
            { label: "Receita", value: fmt(expansoes?.receita_expandida ?? 0), tone: "success" },
            { label: "Conversão", value: expansoes?.taxa_conversao_pct != null ? `${expansoes.taxa_conversao_pct}%` : "—" },
          ]}
          ctaLabel="Abrir expansões"
          ctaHref="/comunicacao/pos-venda?tab=expansoes"
        />

        {/* P5 — Renovação */}
        <FaseCard
          fase="P5"
          titulo="Renovação"
          subtitulo="Ciclo recorrente automatizado"
          icon={<Repeat className="w-5 h-5" />}
          tone={counts.renovacoes_iminentes > 0 ? "warning" : "default"}
          alerta={counts.renovacoes_iminentes > 0 ? `${counts.renovacoes_iminentes} em ≤30 dias` : null}
          kpis={[
            { label: "Recorrentes", value: (renovacoes?.total_clientes_recorrentes ?? 0).toString() },
            { label: "Em 90d", value: (renovacoes?.renovacoes_proximas_90d ?? 0).toString() },
            { label: "Taxa renovação", value: renovacoes?.taxa_renovacao_pct != null ? `${renovacoes.taxa_renovacao_pct}%` : "—" },
          ]}
          ctaLabel="Abrir renovações"
          ctaHref="/comunicacao/pos-venda?tab=expansoes"
        />

        {/* P6 — Portal embaixador */}
        <FaseCard
          fase="P6"
          titulo="Portal embaixador"
          subtitulo="Cliente indica self-service"
          icon={<Gift className="w-5 h-5" />}
          tone="primary"
          alerta={null}
          kpis={[
            { label: "Embaixadores ativos", value: (advocacy?.clientes_que_indicaram ?? 0).toString() },
            { label: "Recompensas pendentes", value: (recompensas?.total_pendentes ?? 0).toString(),
              tone: (recompensas?.total_pendentes ?? 0) > 0 ? "warning" : "default" },
            { label: "Pago total", value: fmt(recompensas?.total_valor_pago ?? 0), tone: "success" },
          ]}
          ctaLabel="Abrir embaixadores"
          ctaHref="/growth/indicacoes?tab=embaixadores"
        />
      </div>

      {/* Footer com link pro funil tradicional */}
      <div className="mt-6 text-center text-xs text-muted-foreground">
        Buscando dados do funil de aquisição (lado esquerdo)?{" "}
        <Link href="/growth/funil" className="text-primary hover:underline inline-flex items-center gap-0.5">
          Ver funil <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function Topline({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub: string;
  tone?: "primary" | "success" | "warning" | "default";
}) {
  const cls =
    tone === "primary" ? "text-primary" :
    tone === "success" ? "text-success-500" :
    tone === "warning" ? "text-warning-500" :
    "text-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">{label}</div>
      <div className={`text-2xl md:text-3xl font-semibold tabular-nums mt-0.5 ${cls}`} style={{ letterSpacing: "-0.5px" }}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

interface Kpi {
  label: string;
  value: string;
  tone?: "success" | "warning" | "default";
}

function FaseCard({ fase, titulo, subtitulo, icon, tone, alerta, kpis, extra, ctaLabel, ctaHref }: {
  fase: string;
  titulo: string;
  subtitulo: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "warning" | "default";
  alerta: string | null;
  kpis: Kpi[];
  extra?: React.ReactNode;
  ctaLabel: string;
  ctaHref: string;
}) {
  const borderTone = {
    primary: "border-primary/20 hover:border-primary/40",
    success: "border-success-500/20 hover:border-success-500/40",
    warning: "border-warning-500/20 hover:border-warning-500/40",
    default: "border-border hover:border-foreground/20",
  }[tone];
  const iconTone = {
    primary: "text-primary",
    success: "text-success-500",
    warning: "text-warning-500",
    default: "text-muted-foreground",
  }[tone];

  return (
    <div className={`card p-4 transition-colors ${borderTone} flex flex-col`}>
      {/* Header card */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-lg grid place-items-center ${iconTone} bg-current/10`}>
            <span className={iconTone} aria-hidden="true">{icon}</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">{fase}</span>
              <h3 className="font-semibold text-sm" style={{ letterSpacing: "-0.13px" }}>{titulo}</h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitulo}</p>
          </div>
        </div>
        {alerta && (
          <span className="text-[10px] uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5 rounded border border-warning-500/30 bg-warning-500/10 text-warning-500 whitespace-nowrap">
            {alerta}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="space-y-1.5 flex-1">
        {kpis.map((k, idx) => {
          const valueTone = {
            success: "text-success-500",
            warning: "text-warning-500",
            default: "text-foreground",
          }[k.tone ?? "default"];
          return (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className={`font-semibold tabular-nums ${valueTone}`}>{k.value}</span>
            </div>
          );
        })}
      </div>

      {extra && <div className="mt-3 pt-3 border-t border-border">{extra}</div>}

      {/* CTA */}
      <Link
        href={ctaHref}
        className="mt-4 inline-flex items-center justify-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        {ctaLabel} <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
