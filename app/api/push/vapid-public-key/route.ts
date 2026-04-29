/**
 * GET /api/push/vapid-public-key
 *
 * Retorna a chave VAPID pública para o client usar em
 * `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ... })`.
 *
 * Pública = pode ser exposta. Lê de NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json({ error: "vapid_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ key });
}
