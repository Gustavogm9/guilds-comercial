import { NextResponse } from "next/server";
import { processWebhookQueue } from "@/lib/webhooks";

/**
 * Endpoint de cron: processa todos os eventos de webhook pendentes em todas
 * as orgs. Disparado por pg_cron a cada minuto via pg_net (ver
 * supabase/migrations/20260427100004_webhook_retry_hardening.sql).
 *
 * Auth: header `X-Cron-Secret` deve bater com env CRON_SECRET.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get("x-cron-secret");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await processWebhookQueue({ limit: 200 });
  return NextResponse.json(result);
}

// Suporta GET pra debug/manual em dev (mesmo guard).
export async function GET(req: Request) {
  return POST(req);
}
