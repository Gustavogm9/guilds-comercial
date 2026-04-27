import type { PlanCode } from "@/lib/billing";

type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: URLSearchParams;
};

export function getStripePriceId(plan: PlanCode) {
  const prices: Partial<Record<PlanCode, string | undefined>> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    scale: process.env.STRIPE_PRICE_SCALE,
  };

  return prices[plan];
}

export function isStripeConfiguredForPlan(plan: PlanCode) {
  return Boolean(process.env.STRIPE_SECRET_KEY && getStripePriceId(plan));
}

export function planFromStripePrice(priceId?: string | null): PlanCode | null {
  if (!priceId) return null;

  const entries: Array<[PlanCode, string | undefined]> = [
    ["starter", process.env.STRIPE_PRICE_STARTER],
    ["growth", process.env.STRIPE_PRICE_GROWTH],
    ["scale", process.env.STRIPE_PRICE_SCALE],
  ];

  return entries.find(([, id]) => id === priceId)?.[0] ?? null;
}

export function billingStatusFromStripe(status?: string | null) {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "canceled") return "canceled";
  return "past_due";
}

async function stripeRequest<T>(path: string, options: StripeRequestOptions = {}) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY nao configurada");

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: options.method ?? "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: options.body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Stripe retornou ${res.status}`);
  }

  return data as T;
}

export async function createStripeCustomer(input: {
  email?: string | null;
  name?: string | null;
  organizacaoId: string;
  orgName: string;
}) {
  const body = new URLSearchParams();
  if (input.email) body.set("email", input.email);
  if (input.name) body.set("name", input.name);
  body.set("metadata[organizacao_id]", input.organizacaoId);
  body.set("metadata[organizacao_nome]", input.orgName);

  return stripeRequest<{ id: string }>("customers", { body });
}

export async function createCheckoutSession(input: {
  customerId: string;
  organizacaoId: string;
  plan: PlanCode;
  successUrl: string;
  cancelUrl: string;
}) {
  const priceId = getStripePriceId(input.plan);
  if (!priceId) throw new Error(`Preco Stripe nao configurado para o plano ${input.plan}`);

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", input.customerId);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("metadata[organizacao_id]", input.organizacaoId);
  body.set("metadata[plano]", input.plan);
  body.set("subscription_data[metadata][organizacao_id]", input.organizacaoId);
  body.set("subscription_data[metadata][plano]", input.plan);

  return stripeRequest<{ id: string; url: string }>("checkout/sessions", { body });
}

export async function createCustomerPortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  const body = new URLSearchParams();
  body.set("customer", input.customerId);
  body.set("return_url", input.returnUrl);

  return stripeRequest<{ id: string; url: string }>("billing_portal/sessions", { body });
}
