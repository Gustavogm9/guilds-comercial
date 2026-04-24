"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "R$ 0",
    period: "para sempre",
    description: "Para testar a plataforma e sentir o poder da IA.",
    features: [
      "Até 2 usuários",
      "200 invocações de IA / mês",
      "CRM Core completo",
      "Cadência básica",
      "Raio-X de leads",
    ],
    cta: "Criar conta grátis",
    highlight: false,
  },
  {
    name: "Pro",
    price: "R$ 89",
    period: "/mês por vendedor",
    description: "O sweet spot para times de vendas crescendo.",
    features: [
      "Até 10 usuários",
      "2.000 invocações de IA / mês",
      "Todas as features de IA",
      "Integrações básicas",
      "Suporte prioritário",
    ],
    cta: "Começar agora",
    highlight: true,
  },
  {
    name: "Business",
    price: "R$ 149",
    period: "/mês por vendedor",
    description: "Autopagável com a economia de ferramentas extras.",
    features: [
      "Até 50 usuários",
      "10.000 invocações de IA / mês",
      "API Pública e Webhooks",
      "Single Sign-On (SSO)",
      "Marketplace de integrações",
    ],
    cta: "Falar com vendas",
    highlight: false,
  },
];

export default function PricingSection() {
  return (
    <section id="precos" className="py-24 bg-slate-50 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-guild-500 to-emerald-500 blur-[120px] rounded-full mix-blend-multiply" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Preços transparentes, sem surpresas
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Comece grátis, faça o upgrade quando seu time precisar de mais escala.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative flex flex-col rounded-3xl p-8 shadow-sm border ${
                plan.highlight 
                  ? "bg-guild-900 text-white border-guild-800 shadow-xl shadow-guild-900/10 scale-105 z-10" 
                  : "bg-white text-slate-900 border-slate-200"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-indigo-400 to-guild-400 text-white text-xs font-bold px-3 py-1 uppercase tracking-widest rounded-full">
                    Mais Popular
                  </span>
                </div>
              )}
              
              <div className="mb-6">
                <h3 className={`text-xl font-semibold ${plan.highlight ? "text-white" : "text-slate-900"}`}>{plan.name}</h3>
                <p className={`mt-2 text-sm ${plan.highlight ? "text-guild-200" : "text-slate-500"}`}>{plan.description}</p>
              </div>

              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
                <span className={`text-sm font-medium ${plan.highlight ? "text-guild-200" : "text-slate-500"}`}>{plan.period}</span>
              </div>

              <ul className="mb-8 space-y-4 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <Check className={`w-5 h-5 shrink-0 ${plan.highlight ? "text-guild-400" : "text-guild-600"}`} />
                    <span className={plan.highlight ? "text-slate-100" : "text-slate-700"}>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/cadastro"
                className={`w-full py-3 px-4 rounded-xl text-center text-sm font-bold transition-all active:scale-95 ${
                  plan.highlight
                    ? "bg-white text-guild-900 hover:bg-slate-50"
                    : "bg-guild-50 text-guild-700 hover:bg-guild-100"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
