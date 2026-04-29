import type { PlanCode } from "@/lib/billing";

type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: URLSearchParams;
};

/**
 * Moedas suportadas. Adicione conforme criar prices no Stripe.
 * Env vars seguem padrão `STRIPE_PRICE_{PLAN}_{CURRENCY}` (ex: STRIPE_PRICE_STARTER_USD).
 * Fallback: env legado `STRIPE_PRICE_{PLAN}` é tratado como BRL.
 */
export type Currency = "BRL" | "USD" | "EUR";
export const SUPPORTED_CURRENCIES: Currency[] = ["BRL", "USD", "EUR"];

export function getStripePriceId(plan: PlanCode, currency: Currency = "BRL"): string | undefined {
  const upper = plan.toUpperCase();
  const cur = currency.toUpperCase();
  const specific = process.env[`STRIPE_PRICE_${upper}_${cur}`];
  if (specific) return specific;
  if (cur === "BRL") return process.env[`STRIPE_PRICE_${upper}`];
  return undefined;
}

export function isStripeConfiguredForPlan(plan: PlanCode, currency: Currency = "BRL"): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && getStripePriceId(plan, currency));
}

export function planFromStripePrice(priceId?: string | null): PlanCode | null {
  if (!priceId) return null;
  const plans: PlanCode[] = ["starter", "growth", "scale"];
  for (const plan of plans) {
    for (const currency of SUPPORTED_CURRENCIES) {
      if (getStripePriceId(plan, currency) === priceId) return plan;
    }
  }
  return null;
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
  /** Moeda. Default 'BRL'. Ler de organizacoes.moeda_padrao. */
  currency?: Currency;
}) {
  const currency = input.currency ?? "BRL";
  const priceId = getStripePriceId(input.plan, currency);
  if (!priceId) {
    throw new Error(
      `Preco Stripe nao configurado para ${input.plan} em ${currency}. ` +
      `Configure STRIPE_PRICE_${input.plan.toUpperCase()}_${currency} ou STRIPE_PRICE_${input.plan.toUpperCase()} (BRL legado).`
    );
  }

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", input.customerId);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  // Adiciona price metered de AI overage matching a moeda (se configurado)
  const overagePriceId =
    process.env[`STRIPE_PRICE_AI_OVERAGE_${currency}`] ?? process.env.STRIPE_PRICE_AI_OVERAGE;
  if (overagePriceId) {
    body.set("line_items[1][price]", overagePriceId);
    // metered: não setar quantity (Stripe rejeita)
  }
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("metadata[organizacao_id]", input.organizacaoId);
  body.set("metadata[plano]", input.plan);
  body.set("metadata[currency]", currency);
  body.set("subscription_data[metadata][organizacao_id]", input.organizacaoId);
  body.set("subscription_data[metadata][plano]", input.plan);
  body.set("subscription_data[metadata][currency]", currency);

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

/**
 * Reporta usage para o item metered de overage de IA da subscription.
 *
 * Modelo: 1 price metered "Guilds AI Overage" no Stripe com unit_amount=30 (R$0,30).
 * Cada invocação extra reporta `valor_overage_centavos / 30` units (weighted).
 * Ex: gerar_proposta = 100 cents → reporta 3.33 units (arredondado pra 3).
 *
 * Setup esperado no Stripe:
 *   1. Criar produto "Guilds AI Overage"
 *   2. Criar price recurring com `usage_type: metered`, `aggregate_usage: sum`,
 *      `currency: brl`, `unit_amount: 30` (centavos)
 *   3. Adicionar esse price como segundo line_item de cada subscription
 *      (o primeiro continua sendo o plan fixo Starter/Growth/Scale)
 *   4. Setar STRIPE_PRICE_AI_OVERAGE no env com o ID do price
 *
 * Esta função recebe o subscription_id do cliente e o item_id do line_item de overage.
 * Retorna { reported, errored } pra cada chamada.
 */
export async function reportAiOverageUsage(input: {
  subscriptionItemId: string;
  units: number;
  timestamp?: number; // unix seconds; default = now
  idempotencyKey: string; // ex: `${orgId}-${periodo}` pra evitar duplo reporte
}) {
  if (input.units <= 0) return { reported: 0 };

  const body = new URLSearchParams();
  body.set("quantity", String(Math.max(1, Math.floor(input.units))));
  body.set("timestamp", String(input.timestamp ?? Math.floor(Date.now() / 1000)));
  body.set("action", "increment");

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY nao configurada");

  const res = await fetch(
    `https://api.stripe.com/v1/subscription_items/${input.subscriptionItemId}/usage_records`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body,
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Stripe usage_records retornou ${res.status}`);
  }
  return { reported: input.units, ...data };
}

/**
 * Lista os subscription items de uma subscription pra encontrar qual é o de
 * AI overage (price = STRIPE_PRICE_AI_OVERAGE).
 */
export async function findAiOverageSubscriptionItem(subscriptionId: string): Promise<string | null> {
  const overagePriceId = process.env.STRIPE_PRICE_AI_OVERAGE;
  if (!overagePriceId) return null;

  const sub = await stripeRequest<{
    items: { data: Array<{ id: string; price: { id: string } }> };
  }>(`subscriptions/${subscriptionId}`, { method: "GET" });

  const item = sub.items.data.find((it) => it.price.id === overagePriceId);
  return item?.id ?? null;
}
