/**
 * Cron: processa push_outbox a cada 10 min.
 *
 * Acionado por pg_cron `push-outbox-process` (definido na migration
 * 20260511020000_push_flywheel_events.sql). Auth via X-Cron-Secret.
 *
 * Lógica:
 *   - Busca até 100 pushes com status='pending' e scheduled_for <= now()
 *   - Pra cada um: chama sendPushToUser de lib/push.ts (respeita prefs/janela)
 *   - Sucesso: status='sent', sent_at=now()
 *   - Skipped (prefs off, fora janela, sem subscription): status='skipped'
 *   - Falha: incrementa attempts, status='failed' até MAX_ATTEMPTS=5 → 'abandoned'
 *
 * Idempotência: status='pending' sai da lista assim que vira sent/skipped/failed.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser, type PushPayload, type PushEvento } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: rows, error: fetchErr } = await supa.rpc("claim_push_outbox", {
    _limit: BATCH_SIZE,
  });

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let abandoned = 0;

  for (const row of rows as any[]) {
    try {
      const payload: PushPayload = {
        evento: row.evento as PushEvento,
        title: row.title,
        body: row.body,
        url: row.url ?? undefined,
        tag: row.tag ?? undefined,
      };
      const r = await sendPushToUser(row.profile_id, payload);

      if (r.enviados > 0) {
        await supa
          .from("push_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            attempts: row.attempts + 1,
            processing_started_at: null,
          })
          .eq("id", row.id);
        sent += 1;
      } else if (r.pulado) {
        await supa
          .from("push_outbox")
          .update({
            status: "skipped",
            attempts: row.attempts + 1,
            last_error: r.pulado,
            processing_started_at: null,
          })
          .eq("id", row.id);
        skipped += 1;
      } else {
        // Sem enviados e sem motivo de pulo = falha técnica (web-push retornou erro)
        const attempts = row.attempts + 1;
        const novoStatus = attempts >= MAX_ATTEMPTS ? "abandoned" : "pending";
        await supa
          .from("push_outbox")
          .update({
            status: novoStatus,
            attempts,
            last_error: `falhas=${r.falhas} removidas=${r.removidas}`,
            processing_started_at: null,
          })
          .eq("id", row.id);
        if (novoStatus === "abandoned") abandoned += 1;
        else failed += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const attempts = row.attempts + 1;
      const novoStatus = attempts >= MAX_ATTEMPTS ? "abandoned" : "pending";
      await supa
        .from("push_outbox")
        .update({
          status: novoStatus,
          attempts,
          last_error: msg.slice(0, 500),
          processing_started_at: null,
        })
        .eq("id", row.id);
      if (novoStatus === "abandoned") abandoned += 1;
      else failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    sent,
    skipped,
    failed,
    abandoned,
  });
}
