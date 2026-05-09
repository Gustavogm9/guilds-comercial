"use client";

import { badgeSimilaridade, labelCompletude } from "@/lib/prospeccao-lookalike";

/** Badge de score de similaridade com ICP (0-100) */
export default function BadgeSimilaridade({ score }: { score: number }) {
  const { emoji, label, classe } = badgeSimilaridade(score);
  return (
    <div className="flex flex-col items-center shrink-0 w-10">
      <span className="text-base leading-none">{emoji}</span>
      <span className={`text-[10px] font-bold mt-0.5 ${classe}`}>{score}</span>
    </div>
  );
}

/** Badge de completude de dados do lead (0-100) */
export function CompletudeBadge({ score }: { score: number }) {
  const label = labelCompletude(score);
  const cor =
    score >= 80 ? "bg-green-500/10 text-green-700 dark:text-green-400" :
    score >= 50 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
    score >= 25 ? "bg-sky-500/10 text-sky-600" :
    "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cor}`}>
      {score}% · {label}
    </span>
  );
}
