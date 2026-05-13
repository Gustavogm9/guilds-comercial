"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Trophy, Users, TrendingUp, ArrowRight } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import type { AdvocacyKpis, TopEmbaixador } from "@/lib/types";

/**
 * Seção "Advocacy" do /funil — fecha o lado direito do funil borboleta.
 *
 * Mostra:
 *   - K-factor (leads novos por cliente)
 *   - Receita gerada via indicação
 *   - Top 3 embaixadores
 *   - Tempo médio para responder pedido
 *
 * Comportamento:
 *   - Se org ainda não tem clientes fechados: card de onboarding apontando
 *     pra /indicacoes pra explicar o conceito.
 *   - Se tem fechados mas zero indicações: hint pra começar.
 */
export default function AdvocacySection({
  kpis,
  topEmbaixadores,
  currency = "BRL",
}: {
  kpis: AdvocacyKpis | null;
  topEmbaixadores: TopEmbaixador[];
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

  const top = topEmbaixadores.slice(0, 3);
  const semDados = !kpis || kpis.clientes_fechados === 0;

  return (
    <section className="card p-5 mb-6 border-primary/20 bg-primary/[0.02]" aria-label={t("indicacoes.section_advocacy")}>
      <header className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
            {t("indicacoes.section_advocacy")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cada cliente fechado é uma fonte de novos leads. Mede aqui o efeito multiplicador.
          </p>
        </div>
        <Link href="/growth/indicacoes" className="btn-secondary text-xs whitespace-nowrap">
          {t("indicacoes.titulo")} <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </header>

      {semDados ? (
        <EmptyAdvocacy t={t} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label={t("indicacoes.kpi_k_factor")}
              value={(kpis?.k_factor ?? 0).toFixed(2)}
              sub={t("indicacoes.kpi_k_factor_sub")}
              icon={<Sparkles className="w-4 h-4" />}
              tone="primary"
            />
            <KpiCard
              label={t("indicacoes.kpi_clientes_embaixadores")}
              value={(kpis?.clientes_que_indicaram ?? 0).toString()}
              sub={`${kpis?.clientes_fechados ?? 0} fechados`}
              icon={<Users className="w-4 h-4" />}
            />
            <KpiCard
              label={t("indicacoes.kpi_receita_indicacao")}
              value={fmt(kpis?.receita_via_indicacao ?? 0)}
              sub={t("indicacoes.kpi_receita_indicacao_sub")}
              icon={<TrendingUp className="w-4 h-4" />}
              tone="success"
            />
            <KpiCard
              label={t("indicacoes.kpi_dias_responder")}
              value={kpis?.dias_media_p_responder != null ? `${kpis.dias_media_p_responder.toFixed(0)}d` : "—"}
              sub={t("indicacoes.kpi_dias_responder_sub")}
              icon={<Trophy className="w-4 h-4" />}
            />
          </div>

          {top.length > 0 && (
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
                {t("indicacoes.tab_embaixadores")}
              </div>
              <ol className="space-y-1.5">
                {top.map((e, idx) => (
                  <li key={e.embaixador_lead_id} className="flex items-center gap-2 text-sm">
                    <span className={`text-[10px] font-bold tabular-nums w-5 h-5 rounded-full grid place-items-center ${
                      idx === 0 ? "bg-warning-500/20 text-warning-500" :
                      idx === 1 ? "bg-secondary text-muted-foreground" :
                      "bg-secondary/60 text-muted-foreground"
                    }`}>
                      {idx + 1}
                    </span>
                    <Link href={`/vendas/pipeline/${e.embaixador_lead_id}`} className="font-medium hover:text-primary transition-colors flex-1 truncate">
                      {e.embaixador_empresa ?? e.embaixador_nome ?? `Lead #${e.embaixador_lead_id}`}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {e.qtd_indicacoes} indic. · <span className="text-success-500 font-semibold">{fmt(e.receita_gerada)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
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

function EmptyAdvocacy({ t }: { t: (k: string) => string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" aria-hidden="true" />
      <p className="text-sm text-foreground/80 mb-1">
        Sem dados de advocacy ainda.
      </p>
      <p className="text-xs text-muted-foreground max-w-md mx-auto mb-3">
        Quando você fechar um cliente, o sistema vai automaticamente gerar um pedido
        de indicação. As métricas aparecem aqui assim que o ciclo completar.
      </p>
      <Link href="/growth/indicacoes" className="btn-secondary text-xs">
        Entender o funil borboleta <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
