/**
 * POST /api/push/unsubscribe
 *
 * Body: { endpoint }
 *
 * Remove a subscription do user logado. Usado quando user clica
 * "desativar push" na UI ou quando browser revoga permissão.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }

  await supabase
    .from("web_push_subscriptions")
    .delete()
    .eq("profile_id", user.id)
    .eq("endpoint", body.endpoint);

  return NextResponse.json({ ok: true });
}
