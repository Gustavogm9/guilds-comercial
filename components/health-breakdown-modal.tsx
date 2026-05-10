"use client";
import { useEffect, useState } from "react";
import { X, AlertCircle, Loader2, Heart, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { HealthBreakdown, HealthTendencia, TendenciaHealth } from "@/lib/types";

/**
 * Modal que mostra breakdown completo do health score de um lead.
 *
 * Conteúdo:
 *   - Score principal + categoria + tendência (subindo/caindo)
 *   - 4 componentes (recência/NPS/onboarding/indicação) com:
 *       label · pontos · peso · descrição humana · ação sugerida
 *   - Próxima ação recomendada (composta — a mais urgente)
 *   - Mini-gráfico de tendência 30/60/90d
 *
 * Carregado lazy: só busca dados quando abre.
 */
export default function HealthBreakdownModal({
  leadId,
  onClose,
}: {
  leadId: number;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<HealthBreakdown | null>(null);
  const [tendencia, setTendencia] = useState<HealthTendencia | null>(null);

  useEffect(() => {
    const sb = createClient();
    Promise.all([
      sb.from("v_health_breakdown").select("*").eq("lead_id", leadId).maybeSingle(),
      sb.from("v_health_tendencia").select("*").eq("lead_id", leadId).maybeSingle(),
    ])
      .then(([brRes, tendRes]) => {
        if (brRes.error) throw brRes.error;
        setBreakdown(brRes.data as HealthBreakdown);
        setTendencia((tendRes.data as HealthTendencia) ?? null);
        setLoading(false);
      })
      .catch((e) => {
        setErro(e instanceof Error ? e.message : "Erro ao carregar.");
        setLoading(false);
      });
  }, [leadId]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe do health score"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-primary" aria-hidden="true" />
            <div>
              <div className="font-semibold text-sm">Health Score</div>
              {breakdown && (
                <div className="text-xs text-muted-foreground">
                  {breakdown.lead_empresa ?? breakdown.lead_nome ?? `Lead #${leadId}`}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" aria-hidden="true" />
              <p className="text-xs mt-2">Calculando...</p>
            </div>
          )}

          {erro && (
            <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" aria-hidden="true" /> {erro}
            </div>
          )}

          {!loading && breakdown && (
            <>
              {/* Score principal + tendência */}
              <div className="text-center mb-5">
                <div className={`text-5xl font-semibold tabular-nums ${
                  breakdown.categoria === "saudavel" ? "text-success-500" :
                  breakdown.categoria === "atencao" ? "text-warning-500" :
                  "text-destructive"
                }`} style={{ letterSpacing: "-1px" }}>
                  {breakdown.health_score}
                </div>
                <div className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground mt-1">
                  /100 ·{" "}
                  {breakdown.categoria === "saudavel" ? "Saudável" :
                   breakdown.categoria === "atencao" ? "Atenção" :
                   "Em risco"}
                </div>

                {tendencia && tendencia.tendencia_30d !== "novo" && (
                  <TendenciaBadge t={tendencia} />
                )}
              </div>

              {/* Próxima ação composta */}
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 mb-5">
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary mb-1">
                  Próxima ação recomendada
                </div>
                <p className="text-sm font-medium">{breakdown.proxima_acao_recomendada}</p>
              </div>

              {/* 4 componentes */}
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
                  Composição do score
                </div>
                {breakdown.componentes.map((c) => (
                  <ComponenteCard key={c.componente} c={c} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ComponenteCard({ c }: { c: HealthBreakdown["componentes"][number] }) {
  const tone =
    c.pontos >= 80 ? "success-500" :
    c.pontos >= 50 ? "warning-500" :
    "destructive";

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-medium text-sm">{c.label}</div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`tabular-nums font-semibold text-${tone}`}>{c.pontos}/100</span>
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            peso {c.peso}%
          </span>
        </div>
      </div>

      {/* Bar */}
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
        <div
          className={`h-full bg-${tone} transition-all`}
          style={{ width: `${Math.max(2, c.pontos)}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground">{c.descricao}</p>

      {c.acao_sugerida && (
        <p className="text-xs text-primary mt-1.5 font-medium">→ {c.acao_sugerida}</p>
      )}
    </div>
  );
}

function TendenciaBadge({ t }: { t: HealthTendencia }) {
  const config: Record<TendenciaHealth, { label: string; tone: string; icon: React.ReactNode }> = {
    subindo_forte: { label: "subindo forte", tone: "text-success-500", icon: <TrendingUp className="w-3 h-3" /> },
    subindo: { label: "subindo", tone: "text-success-500", icon: <TrendingUp className="w-3 h-3" /> },
    estavel: { label: "estável", tone: "text-muted-foreground", icon: <Minus className="w-3 h-3" /> },
    caindo: { label: "caindo", tone: "text-warning-500", icon: <TrendingDown className="w-3 h-3" /> },
    caindo_forte: { label: "caindo forte", tone: "text-destructive", icon: <TrendingDown className="w-3 h-3" /> },
    novo: { label: "novo", tone: "text-muted-foreground", icon: null },
  };
  const { label, tone, icon } = config[t.tendencia_30d];

  const delta30 =
    t.score_30d_atras != null ? t.score_atual - t.score_30d_atras : null;

  return (
    <div className={`inline-flex items-center gap-1 mt-2 text-xs ${tone}`}>
      {icon}
      <span className="uppercase tracking-[0.1em] font-semibold">{label}</span>
      {delta30 != null && delta30 !== 0 && (
        <span className="tabular-nums">
          ({delta30 > 0 ? "+" : ""}{delta30} em 30d)
        </span>
      )}
    </div>
  );
}
