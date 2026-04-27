import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { billingStatusFromStripe, planFromStripePrice } from "@/lib/stripe";

export const runtime = "nodejs";

function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").reduce<{ timestamp?: string; signatures: string[] }>((acc, part) => {
    const [key, value] = part.split("=");
    if (key === "t") acc.timestamp = value;
    if (key === "v1" && value) acc.signatures.push(value);
    return acc;
  }, { signatures: [] });

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  const timestamp = Number(parts.timestamp);
  if (!Number.isFinite(timestamp)) return false;

  const age = Math.abs(Date.now() / 1000 - timestamp);
  if (age > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts.timestamp}.${payload}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  return parts.signatures.some((signature) => {
    const received = Buffer.from(signature);
    return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
  });
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function firstPriceId(subscription: any) {
  return subscription?.items?.data?.[0]?.price?.id as string | undefined;
}

async function updateOrgFromSubscription(subscription: any) {
  const supabase = getSupabaseAdmin();
  const orgId = subscription?.metadata?.organizacao_id as string | undefined;
  const customerId = typeof subscription?.customer === "string" ? subscription.customer : subscription?.customer?.id;
  const subscriptionId = subscription?.id as string | undefined;
  const plan = (subscription?.metadata?.plano as string | undefined) ?? planFromStripePrice(firstPriceId(subscription));

  const patch: Record<string, unknown> = {
    billing_status: billingStatusFromStripe(subscription?.status),
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
  };

  if (plan) patch.plano = plan;
  if (subscription?.trial_end) {
    patch.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
  }

  let query = supabase.from("organizacoes").update(patch);
  if (orgId) {
    query = query.eq("id", orgId);
  } else if (subscriptionId) {
    query = query.eq("stripe_subscription_id", subscriptionId);
  } else if (customerId) {
    query = query.eq("stripe_customer_id", customerId);
  } else {
    return;
  }

  await query;
}

async function updateOrgFromCheckoutSession(session: any) {
  const orgId = session?.metadata?.organizacao_id as string | undefined;
  if (!orgId) return;

  const patch: Record<string, unknown> = {
    stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id,
    stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
  };

  if (session?.metadata?.plano) patch.plano = session.metadata.plano;

  await getSupabaseAdmin()
    .from("organizacoes")
    .update(patch)
    .eq("id", orgId);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET nao configurado" }, { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(payload, signature, webhookSecret)) {
    return NextResponse.json({ error: "Assinatura invalida" }, { status: 400 });
  }

  const event = JSON.parse(payload);

  switch (event.type) {
    case "checkout.session.completed":
      await updateOrgFromCheckoutSession(event.data.object);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await updateOrgFromSubscription(event.data.object);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
