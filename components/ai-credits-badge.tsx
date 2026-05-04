import { cache } from "react";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { PLANS, type PlanCode } from "@/lib/billing";
import { Sparkles, AlertTriangle } from "lucide-react";

/**
 * Badge compacto de créditos IA do mês.
 *
 * Renderizado no footer da sidebar via <Suspense> — não bloqueia o app shell.
 * - Conta invocações com status="sucesso" desde o 1º dia do mês corrente.
 * - Compara com `aiActionsMonth` do plano da org (default: starter se sem plano).
 * - Mostra percentual + bar de progresso. Cor muda em 80% e 100%.
 *
 * Cache:
 *   - `unstable_cache` (Next): 60s por orgId — evita 2 queries Supabase em cada navegação.
 *   - `react.cache()`: dedup dentro da mesma RSC pass.
 *
 * Invalidação: as actions do dispatcher de IA podem chamar `revalidateTag` quando
 * incrementarem ai_invocations — mas pra o widget de header, 60s é OK.
 */

const _getUsoMensalUncached = async (orgId: string) => {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [{ count }, { data: org }] = await Promise.all([
    supabase
      .from("ai_invocations")
      .select("id", { count: "exact", head: true })
      .eq("organizacao_id", orgId)
      .eq("status", "sucesso")
      .gte("created_at", startOfMonth.toISOString()),
    supabase
      .from("organizacoes")
      .select("plano")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  const planoCode = (org?.plano as PlanCode | null) ?? "starter";
  const plano = PLANS.find((p) => p.code === planoCode) ?? PLANS[0];
  const limite = plano.limits.aiActionsMonth;

  return {
    used: count ?? 0,
    limit: limite,
    planName: plano.name,
  };
};

const getUsoMensal = cache((orgId: string) =>
  unstable_cache(
    () => _getUsoMensalUncached(orgId),
    ["ai-uso-mensal", orgId],
    { revalidate: 60, tags: [`ai-uso-${orgId}`] },
  )(),
);

export default async function AiCreditsBadge({ orgId }: { orgId: string | null }) {
  if (!orgId) return null;

  let uso: { used: number; limit: number | "unlimited"; planName: string };
  try {
    uso = await getUsoMensal(orgId);
  } catch {
    return null; // não quebrar a sidebar se a query falhar
  }

  const { used, limit, planName } = uso;

  // Plano Scale = ilimitado
  if (limit === "unlimited") {
    return (
      <Link
        href="/admin/ai"
        className="block px-2.5 py-2 rounded-md hover:bg-secondary/60 dark:hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
          <Sparkles className="w-3 h-3 text-primary" /> IA · {planName}
        </div>
        <div className="text-[11px] text-foreground mt-0.5 tabular-nums">
          {used.toLocaleString("pt-BR")} ações este mês · ilimitado
        </div>
      </Link>
    );
  }

  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone =
    pct >= 100 ? "destructive" :
    pct >= 80  ? "warning"     :
    "primary";

  const barColor =
    tone === "destructive" ? "bg-destructive" :
    tone === "warning"     ? "bg-warning-500" :
    "bg-primary";

  const labelColor =
    tone === "destructive" ? "text-destructive" :
    tone === "warning"     ? "text-warning-500" :
    "text-foreground";

  return (
    <Link
      href="/configuracoes/billing"
      className="block px-2.5 py-2 rounded-md hover:bg-secondary/60 dark:hover:bg-white/[0.03] transition-colors group"
    >
      <div className="flex items-center justify-between gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" /> IA · {planName}
        </span>
        {pct >= 80 && (
          <AlertTriangle className={`w-3 h-3 ${tone === "destructive" ? "text-destructive" : "text-warning-500"}`} />
        )}
      </div>
      <div className="flex items-baseline justify-between gap-1.5 mt-1">
        <div className={`text-[11px] tabular-nums ${labelColor}`}>
          <span className="font-semibold">{used.toLocaleString("pt-BR")}</span>
          <span className="text-muted-foreground"> / {limit.toLocaleString("pt-BR")}</span>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">{pct}%</div>
      </div>
      {/* Bar */}
      <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-secondary dark:bg-white/[0.05]">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}
