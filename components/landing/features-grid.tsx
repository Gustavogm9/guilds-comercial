"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Filter, KanbanSquare, Mail, PieChart, ShieldAlert } from "lucide-react";

const features = [
  {
    icon: <KanbanSquare className="w-6 h-6 text-guild-600" />,
    title: "Pipeline Visual Intuitivo",
    description: "Arraste e solte oportunidades pelas 9 etapas do seu funil. Tenha visão clara do que precisa de atenção.",
  },
  {
    icon: <BrainCircuit className="w-6 h-6 text-indigo-600" />,
    title: "Raio-X Impulsionado por IA",
    description: "Nossa IA avalia 8 fatores críticos de cada lead e gera um score de fechamento automático.",
  },
  {
    icon: <Mail className="w-6 h-6 text-emerald-600" />,
    title: "Cadência Automática (D0 a D30)",
    description: "Nunca mais esqueça um follow-up. Modelos baseados no seu ICP enviados no momento exato.",
  },
  {
    icon: <PieChart className="w-6 h-6 text-amber-600" />,
    title: "Analytics Profundo",
    description: "Taxas de conversão por etapa, motivos de perda e forecast financeiro (Best/Likely/Worst case).",
  },
  {
    icon: <Filter className="w-6 h-6 text-rose-600" />,
    title: "Filtros e Segmentação",
    description: "Encontre leads em segundos com filtros rápidos e sistema avançado de tags.",
  },
  {
    icon: <ShieldAlert className="w-6 h-6 text-slate-600" />,
    title: "Segurança Multi-tenant",
    description: "Seus dados estão protegidos com RLS (Row Level Security). Arquitetura Enterprise-grade.",
  },
];

export default function FeaturesGrid() {
  return (
    <section id="features" className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Tudo o que você precisa para <span className="text-guild-600">escalar</span>.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
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
              className="group p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-white hover:border-guild-200 hover:shadow-xl hover:shadow-guild-900/5 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
