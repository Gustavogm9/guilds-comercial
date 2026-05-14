import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dispatchWebhook } from "@/lib/webhooks";

export const runtime = "nodejs";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function readString(payload: any, keys: string[]) {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], payload);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function mapStatus(value: string | null) {
  const status = (value ?? "").toLowerCase();
  if (["closed", "signed", "completed", "finished"].some((item) => status.includes(item))) return "assinado";
  if (["canceled", "cancelled", "refused", "rejected"].some((item) => status.includes(item))) return "cancelado";
  if (["running", "sent", "notified", "waiting"].some((item) => status.includes(item))) return "aguardando_assinatura";
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.CLICKSIGN_WEBHOOK_SECRET;
  if (secret) {
    const received = req.headers.get("x-clicksign-secret") ?? req.headers.get("x-guilds-secret") ?? new URL(req.url).searchParams.get("secret");
    if (received !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const envelopeId = readString(payload, [
    "envelope_id",
    "envelope.id",
    "data.id",
    "data.relationships.envelope.data.id",
    "data.attributes.envelope_id",
  ]);
  const documentId = readString(payload, [
    "document_id",
    "document.id",
    "data.relationships.document.data.id",
    "data.attributes.document_id",
  ]);
  const eventName = readString(payload, ["event.name", "event_name", "name", "data.attributes.name", "data.type"]);
  const clicksignStatus = readString(payload, ["status", "data.attributes.status", "event.status"]);
  const status = mapStatus(`${eventName ?? ""} ${clicksignStatus ?? ""}`);

  if (!envelopeId && !documentId) {
    return NextResponse.json({ ok: true, ignored: "missing envelope/document id" });
  }

  const supabase = admin();
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, organizacao_id, lead_id, status")
    .or([
      envelopeId ? `clicksign_envelope_id.eq.${envelopeId}` : "",
      documentId ? `clicksign_document_id.eq.${documentId}` : "",
    ].filter(Boolean).join(","))
    .limit(1)
    .maybeSingle();

  const contratoId = contrato?.id ?? null;
  const orgId = contrato?.organizacao_id ?? null;

  await supabase.from("contrato_clicksign_eventos").insert({
    organizacao_id: orgId,
    contrato_id: contratoId,
    envelope_id: envelopeId,
    document_id: documentId,
    event_name: eventName,
    status: clicksignStatus,
    payload,
  });

  if (contratoId && orgId) {
    const update: Record<string, unknown> = {
      clicksign_status: clicksignStatus ?? eventName,
      clicksign_payload: payload,
      updated_at: new Date().toISOString(),
    };
    if (status) update.status = status;
    if (status === "assinado") {
      update.data_assinatura = new Date().toISOString().slice(0, 10);
      update.assinatura_completed_at = new Date().toISOString();
    }

    await supabase.from("contratos").update(update).eq("id", contratoId).eq("organizacao_id", orgId);

    await supabase.from("contrato_feedback").insert({
      organizacao_id: orgId,
      contrato_id: contratoId,
      tipo: status === "assinado" ? "aprovacao" : status === "cancelado" ? "rejeicao" : "juridico",
      conteudo: `Evento Clicksign recebido: ${eventName ?? clicksignStatus ?? "sem nome"}.`,
      resolvido: status === "assinado",
    });

    if (status === "assinado") {
      await dispatchWebhook(orgId, "contract.signed", { contrato_id: contratoId, envelope_id: envelopeId, payload });
    } else if (status === "cancelado") {
      await dispatchWebhook(orgId, "contract.canceled", { contrato_id: contratoId, envelope_id: envelopeId, payload });
    }
  }

  return NextResponse.json({ ok: true });
}
