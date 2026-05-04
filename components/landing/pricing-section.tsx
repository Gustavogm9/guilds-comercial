"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";
import { PLANS, TRIAL_DAYS, priceLabelOf, type CurrencyCode } from "@/lib/billing";

/**
 * Pricing-section da landing.
 *
 * Lê os planos diretamente de `lib/billing.ts` — single source of truth.
 * Quando alguém alterar billing.ts (preço, limite, novo plano), a LP atualiza junto.
 *
 * Plano "Trial" é virtual aqui: representa o onboarding free de 14 dias.
 * Os 3 planos pagos (Starter / Growth / Scale) vêm exatamente da fonte.
 *
 * Highlight: Growth (mais comum em times de 5-10 vendedores).
 */

type DisplayPlan = {
  name: string;
  description: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  href: string;
  highlight: boolean;
  contactSales?: boolean;
};

function formatLimit(v: number | "unlimited"): string {
  if (v === "unlimited") return "Ilimitado";
  return v.toLocaleString("pt-BR");
}

// LP é renderizada pra leitor BR (default). Currency switch fica pra outro turno.
const CURRENCY: CurrencyCode = "BRL";

const trialPlan: DisplayPlan = {
  name: "Trial",
  description: "Conheça a plataforma sem cartão. Vira Starter ao final.",
  price: "Grátis",
  period: `por ${TRIAL_DAYS} dias`,
  features: [
    "Acesso a todas as features do Starter",
    "300 invocações de IA",
    "Até 3 usuários",
    "Sem cartão de crédito",
    "Cancele quando quiser",
  ],
  cta: "Começar agora",
  href: "/cadastro",
  highlight: false,
};

function billingPlanToDisplay(planCode: "starter" | "growth" | "scale"): DisplayPlan {
  const plan = PLANS.find((p) => p.code === planCode)!;
  const isScale = planCode === "scale";

  // Quebra "R$ 149/mês" em ["R$ 149", "/mês"]
  const raw = priceLabelOf(plan, CURRENCY);
  let price = raw;
  let period = "";
  const slashIdx = raw.indexOf("/");
  if (slashIdx > 0) {
    price = raw.slice(0, slashIdx).trim();
    period = raw.slice(slashIdx);
  } else {
    period = "";
  }

  return {
    name: plan.name,
    description: plan.description,
    price,
    period,
    features: [
      `${formatLimit(plan.limits.seats)} usuários`,
      `${formatLimit(plan.limits.leadsMonth)} leads / mês`,
      `${formatLimit(plan.limits.aiActionsMonth)} invocações de IA / mês`,
      ...plan.highlights,
    ],
    cta: isScale ? "Falar com vendas" : "Começar agora",
    href: isScale ? "mailto:vendas@guilds.com.br" : "/cadastro",
    highlight: planCode === "growth",
    contactSales: isScale,
  };
}

const plans: DisplayPlan[] = [
  trialPlan,
  billingPlanToDisplay("starter"),
  billingPlanToDisplay("growth"),
  billingPlanToDisplay("scale"),
];

export default function PricingSection() {
  return (
    <section id="precos" className="py-24 bg-secondary/40 dark:bg-white/[0.02] relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 blur-[120px] rounded-full mix-blend-multiply" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-light text-foreground sm:text-4xl tracking-tight">
            Preços transparentes, sem surpresas
          </h2>
          <p className="mt-4 text-lg text-muted-foreground font-light">
            Comece grátis por {TRIAL_DAYS} dias. Faça o upgrade quando seu time precisar de mais escala.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className={`relative flex flex-col rounded-3xl p-7 border ${
                plan.highlight
                  ? "bg-foreground text-background border-foreground shadow-stripe-md lg:scale-105 z-10"
                  : "bg-card text-foreground border-border shadow-stripe-sm"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span className="bg-gradient-to-r from-primary to-purple-500 text-white text-xs font-bold px-3 py-1 uppercase tracking-[0.12em] rounded-full">
                    Mais Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-xl font-semibold ${plan.highlight ? "text-background" : "text-foreground"}`}>{plan.name}</h3>
                <p className={`mt-2 text-sm ${plan.highlight ? "text-background/70" : "text-muted-foreground"}`}>{plan.description}</p>
              </div>

              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-3xl font-light tracking-tight tabular-nums">{plan.price}</span>
                <span className={`text-sm font-medium ${plan.highlight ? "text-background/70" : "text-muted-foreground"}`}>{plan.period}</span>
              </div>

              <ul className="mb-8 space-y-3 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <Check className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                    <span className={plan.highlight ? "text-background/90" : "text-foreground/80"}>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`w-full py-2.5 px-4 rounded-xl text-center text-sm font-bold transition-all active:scale-95 ${
                  plan.highlight
                    ? "bg-background text-foreground hover:opacity-90"
                    : plan.contactSales
                    ? "bg-card border border-border text-foreground hover:bg-secondary"
                    : "bg-primary/10 text-primary hover:bg-primary/15"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8 max-w-2xl mx-auto">
          Preços em BRL. Pagamento mensal via Stripe. Sem fidelidade — cancele a qualquer momento. Excedente
          de IA cobrado por consumo a R$ 0,30 / invocação após o limite mensal.
        </p>
      </div>
    </section>
  );
}
