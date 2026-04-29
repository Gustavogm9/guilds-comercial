/**
 * POST /api/push/subscribe
 *
 * Body: { endpoint, keys: { p256dh, auth } }  — output do PushManager.subscribe()
 *
 * Grava (ou atualiza last_seen_at) a subscription do user logado em
 * web_push_subscriptions. Idempotente via UNIQUE (profile_id, endpoint).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  user_agent?: string;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const ua = body.user_agent ?? req.headers.get("user-agent") ?? null;

  const { error } = await supabase
    .from("web_push_subscriptions")
    .upsert(
      {
        profile_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: ua,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,endpoint" }
    );

  if (error) {
    console.error("[push/subscribe] upsert failed", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
