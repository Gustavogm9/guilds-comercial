/**
 * Cron mensal: reporta o overage de IA acumulado no mês anterior pro Stripe.
 *
 * Roda dia 1 às 03:00 UTC (via pg_cron com X-Cron-Secret).
 *
 * Para cada org:
 *   1. Soma o `valor_overage_centavos` de todas as features no mês anterior
 *   2. Converte em "units" (R$0,30 = 1 unit) usando ceil
 *   3. Encontra o subscription_item de overage no Stripe (STRIPE_PRICE_AI_OVERAGE)
 *   4. Chama POST /v1/subscription_items/{id}/usage_records com Idempotency-Key
 *      `<org>-<periodo>` (evita duplo reporte se cron rodar 2x)
 *   5. Marca `reportado_stripe_em` em cada row de ai_usage_mensal do mês
 *
 * Se org não tem stripe_subscription_id ou STRIPE_PRICE_AI_OVERAGE não está
 * configurado, pula silenciosamente (não falha).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findAiOverageSubscriptionItem, reportAiOverageUsage } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNIT_PRICE_CENTAVOS = 30; // R$0,30 = 1 unit no Stripe

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mês anterior — primeiro dia em UTC
  const hoje = new Date();
  const periodoAnterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const periodoStr = periodoAnterior.toISOString().slice(0, 10);

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Agrega usage por org no mês anterior
  const { data: rows } = await supa
    .from("ai_usage_mensal")
    .select("organizacao_id, valor_overage_centavos")
    .eq("periodo_inicio", periodoStr)
    .is("reportado_stripe_em", null)
    .gt("valor_overage_centavos", 0);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "sem overage no mes anterior" });
  }

  // Soma por org
  const porOrg = new Map<string, number>();
  for (const r of rows) {
    porOrg.set(r.organizacao_id, (porOrg.get(r.organizacao_id) ?? 0) + r.valor_overage_centavos);
  }

  const results: Array<{
    organizacao_id: string;
    valorCentavos: number;
    units: number;
    status: "reported" | "skipped" | "error";
    motivo?: string;
  }> = [];

  for (const [orgId, valorCentavos] of porOrg) {
    try {
      const { data: org } = await supa
        .from("organizacoes")
        .select("stripe_subscription_id")
        .eq("id", orgId)
        .maybeSingle();

      if (!org?.stripe_subscription_id) {
        results.push({ organizacao_id: orgId, valorCentavos, units: 0, status: "skipped", motivo: "sem_stripe_subscription" });
        continue;
      }

      const overageItemId = await findAiOverageSubscriptionItem(org.stripe_subscription_id);
      if (!overageItemId) {
        results.push({ organizacao_id: orgId, valorCentavos, units: 0, status: "skipped", motivo: "sem_item_overage" });
        continue;
      }

      const units = Math.ceil(valorCentavos / UNIT_PRICE_CENTAVOS);
      await reportAiOverageUsage({
        subscriptionItemId: overageItemId,
        units,
        idempotencyKey: `${orgId}-${periodoStr}`,
        timestamp: Math.floor(periodoAnterior.getTime() / 1000),
      });

      // Marca todas as rows de usage do periodo como reportadas
      await supa
        .from("ai_usage_mensal")
        .update({ reportado_stripe_em: new Date().toISOString() })
        .eq("organizacao_id", orgId)
        .eq("periodo_inicio", periodoStr);

      results.push({ organizacao_id: orgId, valorCentavos, units, status: "reported" });
    } catch (err: any) {
      results.push({
        organizacao_id: orgId,
        valorCentavos,
        units: 0,
        status: "error",
        motivo: err?.message ?? String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    periodo: periodoStr,
    processed: results.length,
    reported: results.filter((r) => r.status === "reported").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
