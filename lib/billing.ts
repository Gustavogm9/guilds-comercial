export type BillingStatus = "trialing" | "active" | "past_due" | "canceled";

export type PlanCode = "trial" | "starter" | "growth" | "scale";
export type CurrencyCode = "BRL" | "USD" | "EUR";

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  description: string;
  /** Preço por moeda. BRL é fixo do plano original; USD/EUR são equivalência aproximada. */
  priceByCurrency: Partial<Record<CurrencyCode, string>>;
  limits: {
    seats: number | "unlimited";
    leadsMonth: number | "unlimited";
    aiActionsMonth: number | "unlimited";
  };
  highlights: string[];
};

export const TRIAL_DAYS = 14;

export const PLANS: PlanDefinition[] = [
  {
    code: "starter",
    name: "Starter",
    description: "Para validar o processo comercial com um time enxuto.",
    priceByCurrency: {
      BRL: "R$ 149/mês",
      USD: "$29/mo",
      EUR: "€27/mo",
    },
    limits: { seats: 3, leadsMonth: 500, aiActionsMonth: 300 },
    highlights: ["Pipeline e cadencias", "IA essencial", "Convites de equipe"],
  },
  {
    code: "growth",
    name: "Growth",
    description: "Para times que ja operam carteira, metas e rituais semanais.",
    priceByCurrency: {
      BRL: "R$ 399/mês",
      USD: "$79/mo",
      EUR: "€73/mo",
    },
    limits: { seats: 10, leadsMonth: 2500, aiActionsMonth: 2000 },
    highlights: ["Metas por vendedor", "API e webhooks", "Relatorios de ativacao"],
  },
  {
    code: "scale",
    name: "Scale",
    description: "Para operacoes multi-time com alto volume e governanca.",
    priceByCurrency: {
      BRL: "Sob consulta",
      USD: "Contact us",
      EUR: "Contact us",
    },
    limits: { seats: "unlimited", leadsMonth: "unlimited", aiActionsMonth: "unlimited" },
    highlights: ["SLA dedicado", "Limites customizados", "Suporte de implantacao"],
  },
];

/**
 * Helper: pega priceLabel matching a moeda; cai pra BRL se não houver.
 * Ex: priceLabelOf(plan, "USD") → "$29/mo" ou "R$ 149/mês" se USD não definido.
 */
export function priceLabelOf(plan: PlanDefinition, currency: CurrencyCode = "BRL"): string {
  return plan.priceByCurrency[currency] ?? plan.priceByCurrency.BRL ?? "—";
}

export function getTrialState(trialEndsAt?: string | null, billingStatus?: string | null) {
  if (!trialEndsAt || (billingStatus && billingStatus !== "trialing")) {
    return { isTrial: false, daysLeft: null as number | null, expired: false };
  }

  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  return {
    isTrial: true,
    daysLeft: Math.max(daysLeft, 0),
    expired: daysLeft <= 0,
  };
}
