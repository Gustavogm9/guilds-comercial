"use client";

import { TrendingUp } from "lucide-react";

/**
 * Badge compacto de score do lead (0-100).
 * - >= 70 verde (quente)
 * - >= 40 amarelo (morno)
 * - < 40  cinza (frio)
 */
export default function LeadScoreBadge({
  score,
  size = "sm",
}: {
  score: number | null | undefined;
  size?: "xs" | "sm" | "md";
}) {
  if (score == null) return null;
  const n = Number(score);
  if (!Number.isFinite(n)) return null;

  const tone =
    n >= 70 ? "text-success-500 bg-success-500/10 border-success-500/30" :
    n >= 40 ? "text-warning-500 bg-warning-500/10 border-warning-500/30" :
    "text-muted-foreground bg-muted border-border";

  const sizeClass = {
    xs: "text-[9px] px-1 py-0.5 gap-0.5",
    sm: "text-[10px] px-1.5 py-0.5 gap-1",
    md: "text-xs px-2 py-1 gap-1.5",
  }[size];

  return (
    <span
      className={`inline-flex items-center font-semibold tabular-nums rounded border ${tone} ${sizeClass}`}
      title={`Score do lead: ${Math.round(n)}/100`}
    >
      <TrendingUp className="w-2.5 h-2.5" />
      {Math.round(n)}
    </span>
  );
}
