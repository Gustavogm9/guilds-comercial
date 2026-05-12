/**
 * Webhook Brevo: recebe eventos de delivery, soft_bounce, hard_bounce, etc.
 *
 * Configurar em Brevo → Transactional → Settings → Webhooks → Add:
 *   URL: https://crm.guilds.com.br/api/webhooks/brevo
 *   Events: hard_bounce, soft_bounce, blocked, spam, complaint
 *
 * Sem auth pesada — Brevo manda HTTP POST simples. Validamos pelo
 * shape do payload + lookup do email no nosso registro.
 *
 * Bounce permanente (hard_bounce, blocked, spam, complaint) → marca
 * email_validacao.status = 'bounce_perm' → futuras tentativas são bloqueadas.
 * Bounce temporário (soft_bounce) → 'bounce_temp', pode tentar de novo.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTOS_PERMANENTES = new Set(["hard_bounce", "blocked", "spam", "complaint", "unsubscribed"]);
const EVENTOS_TEMPORARIOS = new Set(["soft_bounce", "deferred"]);

export async function POST(req: NextRequest) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Brevo envia events como objeto único ou array
  const events: any[] = Array.isArray(payload) ? payload : [payload];

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let registrados = 0;
  for (const ev of events) {
    const email = (ev.email ?? ev["X-Mailin-EventReport"]?.email)?.toLowerCase()?.trim();
    const eventType = (ev.event ?? ev["event-name"] ?? "")?.toLowerCase();
    if (!email || !eventType) continue;

    const isPerm = EVENTOS_PERMANENTES.has(eventType);
    const isTemp = EVENTOS_TEMPORARIOS.has(eventType);
    if (!isPerm && !isTemp) continue;

    const motivo = ev.reason ?? ev.message ?? eventType;

    try {
      await supa.rpc("registrar_bounce_email", {
        _email: email,
        _permanente: isPerm,
        _motivo: motivo,
      });
      registrados += 1;
    } catch (e) {
      console.warn(`[brevo webhook] erro registrando ${email}:`, e);
    }
  }

  return NextResponse.json({ ok: true, registrados, total_eventos: events.length });
}

// Brevo às vezes faz GET pra health-check
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "brevo-webhook" });
}
