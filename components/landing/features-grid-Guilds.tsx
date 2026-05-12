"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Filter, KanbanSquare, Mail, PieChart, ShieldAlert } from "lucide-react";

const features = [
  {
    icon: <KanbanSquare className="w-6 h-6 text-primary" />,
    title: "Pipeline Visual Intuitivo",
    description: "Arraste e solte oportunidades pelas 9 etapas do seu funil. Tenha visão clara do que precisa de atenção.",
  },
  {
    icon: <BrainCircuit className="w-6 h-6 text-accent" />,
    title: "Raio-X Impulsionado por IA",
    description: "Nossa IA avalia 8 fatores críticos de cada lead e gera um score de fechamento automático.",
  },
  {
    icon: <Mail className="w-6 h-6 text-success-500" />,
    title: "Cadência Automática (D0 a D30)",
    description: "Nunca mais esqueça um follow-up. Modelos baseados no seu ICP enviados no momento exato.",
  },
  {
    icon: <PieChart className="w-6 h-6 text-warning-500" />,
    title: "Analytics Profundo",
    description: "Taxas de conversão por etapa, motivos de perda e forecast financeiro (Best/Likely/Worst case).",
  },
  {
    icon: <Filter className="w-6 h-6 text-destructive" />,
    title: "Filtros e Segmentação",
    description: "Encontre leads em segundos com filtros rápidos e sistema avançado de tags.",
  },
  {
    icon: <ShieldAlert className="w-6 h-6 text-muted-foreground" />,
    title: "Segurança Multi-tenant",
    description: "Seus dados estão protegidos com RLS (Row Level Security). Arquitetura Enterprise-grade.",
  },
];

export default function FeaturesGrid() {
  return (
    <section id="features" className="py-24 bg-card relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-light text-foreground sm:text-4xl tracking-tight">
            Tudo o que você precisa para <span className="text-primary">escalar</span>.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground font-light">
            Uma plataforma completa que une gestão comercial robusta com as mais recentes inovações em Inteligência Artificial.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group p-8 rounded-2xl bg-secondary/40 border border-border hover:bg-card hover:border-primary/25 hover:shadow-stripe-md transition-all duration-300 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
            >
              <div className="w-12 h-12 rounded-xl bg-card border border-border shadow-stripe-xs flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
