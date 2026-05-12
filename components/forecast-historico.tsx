"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Snapshot {
  id: number;
  semana: string;
  pipeline_total: number;
  pipeline_ponderado: number;
  forecast_baixo: number;
  forecast_provavel: number;
  forecast_alto: number;
  confianca: number;
  fatores: any;
}

/**
 * Histórico semanal de forecast — bar chart simples mostrando evolução
 * dos 3 cenários nas últimas 12 semanas.
 */
export default function ForecastHistorico({ currency }: { currency: string }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const sb = createClient();
    sb.from("forecast_ai_snapshot")
      .select("*")
      .order("semana", { ascending: false })
      .limit(12)
      .then(({ data }) => {
        // Inverte pra mostrar em ordem cronológica
        setSnapshots(((data ?? []) as any[]).reverse());
        setCarregando(false);
      });
  }, []);

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);

  if (carregando) return null;
  if (snapshots.length === 0) return null;

  const maxValor = Math.max(...snapshots.map((s) => Number(s.forecast_alto)));
  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const tendencia = prev
    ? Number(latest.forecast_provavel) - Number(prev.forecast_provavel)
    : 0;

  const TrendIcon = tendencia > 0 ? TrendingUp : tendencia < 0 ? TrendingDown : Minus;

  return (
    <section className="card p-5 mb-6 border-primary/20">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
            Forecast IA — histórico {snapshots.length} semanas
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Snapshot semanal calculado domingo 23h. Modelo: heurística multi-sinal (pipeline ponderado + taxa histórica + velocity + engagement).
          </p>
        </div>
        <div className="text-right">
          <div className={`text-xs inline-flex items-center gap-1 ${
            tendencia > 0 ? "text-success-500" : tendencia < 0 ? "text-destructive" : "text-muted-foreground"
          }`}>
            <TrendIcon className="w-3 h-3" />
            {tendencia > 0 ? "+" : ""}{fmt(tendencia)} vs sem. anterior
          </div>
          <div className="text-[10px] text-muted-foreground">
            Confiança: {Math.round(Number(latest.confianca) * 100)}%
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-32 mt-3">
        {snapshots.map((s, idx) => {
          const altoPct = Math.max(2, (Number(s.forecast_alto) / maxValor) * 100);
          const provavelPct = Math.max(2, (Number(s.forecast_provavel) / maxValor) * 100);
          const baixoPct = Math.max(2, (Number(s.forecast_baixo) / maxValor) * 100);
          const isUltima = idx === snapshots.length - 1;

          return (
            <div key={s.id} className="flex-1 flex flex-col items-center group relative">
              {/* Bar stacked: baixo (sólido) + provável (mid) + alto (top) */}
              <div className="w-full relative flex flex-col items-center justify-end" style={{ height: "100%" }}>
                {/* Alto — outline */}
                <div
                  className="w-full bg-success-500/10 border border-success-500/30 rounded-t"
                  style={{ height: `${altoPct}%`, position: "absolute", bottom: 0 }}
                />
                {/* Provável */}
                <div
                  className="w-full bg-primary/60 rounded-t"
                  style={{ height: `${provavelPct}%`, position: "absolute", bottom: 0 }}
                />
                {/* Baixo */}
                <div
                  className="w-full bg-primary rounded-t"
                  style={{ height: `${baixoPct}%`, position: "absolute", bottom: 0 }}
                />
                {isUltima && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary border-2 border-card" />
                )}
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-44 bg-popover text-popover-foreground border border-border rounded-md p-2 shadow-stripe-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-xs">
                <div className="font-semibold mb-1">
                  {new Date(s.semana).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span className="text-success-500">Alto:</span> <span className="tabular-nums">{fmt(Number(s.forecast_alto))}</span></div>
                  <div className="flex justify-between"><span className="text-primary">Provável:</span> <span className="tabular-nums">{fmt(Number(s.forecast_provavel))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Baixo:</span> <span className="tabular-nums">{fmt(Number(s.forecast_baixo))}</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Eixo X */}
      <div className="flex items-center gap-1.5 mt-1.5">
        {snapshots.map((s, idx) => (
          <div key={s.id} className="flex-1 text-center">
            {idx % 2 === 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {new Date(s.semana).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground mt-2">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Baixo (worst)</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary/60" /> Provável</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success-500/30 border border-success-500/50" /> Alto (best)</span>
      </div>

      {/* Sinais do último */}
      {latest.fatores?.sinais && Array.isArray(latest.fatores.sinais) && latest.fatores.sinais.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
            Sinais detectados esta semana
          </div>
          <ul className="text-xs space-y-0.5">
            {latest.fatores.sinais.slice(0, 4).map((s: string, i: number) => (
              <li key={i} className="flex items-start gap-1.5 text-foreground/80">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-warning-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
