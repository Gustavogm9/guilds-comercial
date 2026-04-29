"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, Zap } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      {/* Background Glows — Stripe-feel decorative gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 blur-[100px] rounded-full mix-blend-multiply" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              O CRM turbinado com Inteligência Artificial
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-light text-foreground tracking-tight leading-[1.05]"
          >
            Acelere suas vendas B2B com precisão e <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">automação</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed font-light"
          >
            Diga adeus ao trabalho manual. Gerencie seu pipeline, crie cadências automáticas e preveja fechamentos com o Raio-X impulsionado por IA.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/cadastro" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-stripe-sm hover:brightness-110 hover:shadow-stripe-md transition-all active:scale-95">
              Começar agora
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a href="#como-funciona" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-8 py-3.5 text-base font-semibold text-foreground/80 shadow-stripe-xs hover:bg-secondary/60 hover:border-foreground/20 transition-all active:scale-95 dark:hover:bg-white/[0.04]">
              Ver como funciona
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-4 text-sm text-muted-foreground"
          >
            Plano gratuito disponível. Sem necessidade de cartão de crédito.
          </motion.p>
        </div>

        {/* Hero Visual Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-16 lg:mt-24 relative max-w-5xl mx-auto"
        >
          <div className="rounded-2xl border border-border/60 bg-card/40 p-2 sm:p-4 backdrop-blur-xl shadow-stripe-md">
            <div className="rounded-xl overflow-hidden border border-border bg-card shadow-inner aspect-[16/9] relative flex flex-col">
              {/* Mockup Header */}
              <div className="h-12 border-b border-border flex items-center px-4 gap-2 bg-secondary/40 dark:bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-secondary dark:bg-white/[0.08]" />
                  <div className="w-3 h-3 rounded-full bg-secondary dark:bg-white/[0.08]" />
                  <div className="w-3 h-3 rounded-full bg-secondary dark:bg-white/[0.08]" />
                </div>
              </div>
              {/* Mockup Content */}
              <div className="flex-1 p-6 flex gap-6 bg-secondary/30 dark:bg-white/[0.01]">
                {/* Sidebar Mock */}
                <div className="w-48 hidden md:flex flex-col gap-3">
                  <div className="h-8 rounded-md bg-primary/10 border border-primary/20" />
                  <div className="h-8 rounded-md bg-card border border-border" />
                  <div className="h-8 rounded-md bg-card border border-border" />
                  <div className="h-8 rounded-md bg-card border border-border" />
                </div>
                {/* Main Content Mock */}
                <div className="flex-1 flex flex-col gap-6">
                  <div className="flex gap-4">
                    <div className="flex-1 h-24 rounded-xl bg-card border border-border shadow-stripe-xs p-4 flex flex-col justify-between">
                      <div className="w-20 h-4 bg-secondary dark:bg-white/[0.05] rounded" />
                      <div className="w-16 h-6 bg-secondary dark:bg-white/[0.08] rounded" />
                    </div>
                    <div className="flex-1 h-24 rounded-xl bg-card border border-border shadow-stripe-xs p-4 flex flex-col justify-between">
                      <div className="w-24 h-4 bg-secondary dark:bg-white/[0.05] rounded" />
                      <div className="w-12 h-6 bg-secondary dark:bg-white/[0.08] rounded" />
                    </div>
                    <div className="flex-1 h-24 rounded-xl bg-primary shadow-stripe-xs p-4 flex flex-col justify-between">
                      <div className="w-16 h-4 bg-accent rounded" />
                      <div className="w-20 h-6 bg-primary-foreground rounded" />
                    </div>
                  </div>
                  <div className="flex-1 bg-card border border-border rounded-xl shadow-stripe-xs p-4">
                    <div className="w-32 h-5 bg-secondary dark:bg-white/[0.08] rounded mb-4" />
                    <div className="space-y-3">
                      <div className="w-full h-12 bg-secondary/60 dark:bg-white/[0.03] border border-border rounded-lg" />
                      <div className="w-full h-12 bg-secondary/60 dark:bg-white/[0.03] border border-border rounded-lg" />
                      <div className="w-full h-12 bg-secondary/60 dark:bg-white/[0.03] border border-border rounded-lg" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Element 1 - AI Score */}
              <motion.div
                animate={{ y: [-10, 10, -10] }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                className="absolute -right-6 top-32 w-64 bg-card/90 backdrop-blur-md border border-border shadow-stripe-md rounded-xl p-4 hidden lg:block"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-success-500" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">Raio-X Detectou Compra</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">Probabilidade: 92%</div>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-secondary dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div className="h-full bg-success-500 w-[92%]" />
                </div>
              </motion.div>

              {/* Floating Element 2 - Analytics */}
              <motion.div
                animate={{ y: [10, -10, 10] }}
                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
                className="absolute -left-6 bottom-24 w-56 bg-card/90 backdrop-blur-md border border-border shadow-stripe-md rounded-xl p-4 hidden lg:block"
              >
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Pipeline MRR</span>
                </div>
                <div className="text-2xl font-bold text-foreground tabular-nums">R$ 42.500</div>
                <div className="text-xs text-success-500 font-medium mt-1 tabular-nums">+14% essa semana</div>
              </motion.div>

            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
