import type { AiUso30d } from "@/lib/types";
import { TrendingUp, AlertCircle, DollarSign, Clock } from "lucide-react";

/**
 * Painel compacto com agregados de uso de IA nos últimos 30 dias.
 * Server component — recebe `uso` (uma row por feature_codigo da org) e calcula totais.
 *
 * KPIs:
 *  - Invocações OK | erros | bloqueadas por budget
 *  - Custo total (USD)
 *  - Latência média ponderada
 *  - Top 3 features por custo (alerta visual)
 */
export default function Ai30dSummary({ uso }: { uso: AiUso30d[] }) {
  if (uso.length === 0) {
    return (
      <div className="card p-4 mb-6 text-sm text-muted-foreground">
        Nenhuma invocação de IA nos últimos 30 dias.
      </div>
    );
  }

  const totalOk = uso.reduce((s, u) => s + (u.invocacoes_ok ?? 0), 0);
  const totalErro = uso.reduce((s, u) => s + (u.invocacoes_erro ?? 0), 0);
  const totalBloq = uso.reduce((s, u) => s + (u.bloqueadas ?? 0), 0);
  const custoUsd = uso.reduce((s, u) => s + Number(u.custo_usd ?? 0), 0);

  // Latência média ponderada por # invocações OK
  const totalLat = uso.reduce((s, u) => s + Number(u.latencia_media_ms ?? 0) * (u.invocacoes_ok ?? 0), 0);
  const latMedia = totalOk > 0 ? Math.round(totalLat / totalOk) : 0;

  // Taxa de erro
  const totalChamadas = totalOk + totalErro;
  const taxaErro = totalChamadas > 0 ? (totalErro / totalChamadas) * 100 : 0;

  // Top 3 features por custo
  const top3 = [...uso]
    .filter((u) => Number(u.custo_usd ?? 0) > 0)
    .sort((a, b) => Number(b.custo_usd) - Number(a.custo_usd))
    .slice(0, 3);

  return (
    <section className="mb-6">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Visão geral · últimos 30 dias
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KPI
          icon={<TrendingUp className="w-4 h-4" />}
          label="Invocações OK"
          value={totalOk.toLocaleString("pt-BR")}
          sub={totalBloq > 0 ? `${totalBloq} bloqueadas (budget)` : undefined}
          tone="success"
        />
        <KPI
          icon={<AlertCircle className="w-4 h-4" />}
          label="Taxa de erro"
          value={`${taxaErro.toFixed(1)}%`}
          sub={`${totalErro} erros`}
          tone={taxaErro > 5 ? "urgent" : taxaErro > 1 ? "warning" : "neutral"}
        />
        <KPI
          icon={<DollarSign className="w-4 h-4" />}
          label="Custo estimado"
          value={`US$ ${custoUsd.toFixed(2)}`}
          sub="OpenAI/Claude/Gemini"
          tone="neutral"
        />
        <KPI
          icon={<Clock className="w-4 h-4" />}
          label="Latência média"
          value={`${latMedia} ms`}
          sub={latMedia > 5000 ? "alta" : latMedia > 2000 ? "ok" : "rápido"}
          tone={latMedia > 5000 ? "warning" : "neutral"}
        />
      </div>

      {top3.length > 0 && (
        <div className="card p-3">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Top 3 features por custo
          </div>
          <ul className="space-y-1.5">
            {top3.map((f, idx) => (
              <li key={f.feature_codigo} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground w-4 text-center">{idx + 1}.</span>
                <span className="font-medium flex-1 truncate">{f.feature_codigo}</span>
                <span className="text-xs text-muted-foreground">
                  {(f.invocacoes_ok ?? 0).toLocaleString("pt-BR")} OK
                </span>
                <span className="font-mono text-sm text-foreground min-w-[80px] text-right">
                  US$ {Number(f.custo_usd ?? 0).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type Tone = "success" | "warning" | "urgent" | "neutral";

function KPI({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  const toneClasses: Record<Tone, string> = {
    success: "bg-success-500/10 text-success-500",
    warning: "bg-warning-500/10 text-warning-500",
    urgent: "bg-urgent-500/10 text-urgent-500",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <div className="card p-3 flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${toneClasses[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</div>
        <div className="text-lg font-semibold leading-tight">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
      </div>
    </div>
  );
}
