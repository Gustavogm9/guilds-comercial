export type BillingStatus = "trialing" | "active" | "past_due" | "canceled";

export type PlanCode = "trial" | "starter" | "growth" | "scale";

export type PlanDefinition = {
  code: PlanCode;
  name: string;
  description: string;
  priceLabel: string;
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
    priceLabel: "R$ 149/mês",
    limits: { seats: 3, leadsMonth: 500, aiActionsMonth: 300 },
    highlights: ["Pipeline e cadencias", "IA essencial", "Convites de equipe"],
  },
  {
    code: "growth",
    name: "Growth",
    description: "Para times que ja operam carteira, metas e rituais semanais.",
    priceLabel: "R$ 399/mês",
    limits: { seats: 10, leadsMonth: 2500, aiActionsMonth: 2000 },
    highlights: ["Metas por vendedor", "API e webhooks", "Relatorios de ativacao"],
  },
  {
    code: "scale",
    name: "Scale",
    description: "Para operacoes multi-time com alto volume e governanca.",
    priceLabel: "Sob consulta",
    limits: { seats: "unlimited", leadsMonth: "unlimited", aiActionsMonth: "unlimited" },
    highlights: ["SLA dedicado", "Limites customizados", "Suporte de implantacao"],
  },
];

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
