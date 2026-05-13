"use client";

/**
 * WelcomeWizard — wizard de 2 telas para colaboradores recém-convidados.
 *
 * Tela 1: Apresenta o papel do usuário (SDR/Comercial/Gestor)
 *         com as 3 ações principais do role.
 * Tela 2: "Seus primeiros passos" — os 3 marcos do ActivationChecklist
 *         em formato de card visual.
 *
 * Dismiss: ao clicar "Começar" ou fechar, grava localStorage
 * "guilds-welcome-done-{userId}" e redireciona para /hoje.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X, Users, Target, BarChart2, Import, MessageSquare, PhoneCall, CheckCircle2 } from "lucide-react";

type Role = "gestor" | "comercial" | "sdr";

const ROLE_CONFIG: Record<Role, {
  label: string;
  descricao: string;
  cor: string;
  emoji: string;
  acoes: { icone: React.ElementType; titulo: string; descricao: string }[];
  marcos: { titulo: string; href: string }[];
}> = {
  gestor: {
    label: "Gestor",
    emoji: "🏆",
    descricao: "Você é responsável pela operação comercial da equipe. Sua visão cobre todo o funil.",
    cor: "from-violet-500 to-indigo-600",
    acoes: [
      { icone: Users,    titulo: "Gerencie a equipe",   descricao: "Convide vendedores e SDRs pelo painel de equipe." },
      { icone: BarChart2, titulo: "Acompanhe o funil",  descricao: "Veja o pipeline e o funil de todos os membros." },
      { icone: Target,    titulo: "Configure o CRM",    descricao: "Defina ICP, cadência e segmentos da organização." },
    ],
    marcos: [
      { titulo: "Adicionar 1º lead ao pipeline", href: "/vendas/base" },
      { titulo: "Convidar 1 membro do time",     href: "/gestao/equipe" },
      { titulo: "Iniciar 1 cadência de outreach", href: "/comunicacao/cadencia" },
    ],
  },
  comercial: {
    label: "Comercial",
    emoji: "🚀",
    descricao: "Você é responsável por qualificar e fechar negócios. Seu foco é o pipeline.",
    cor: "from-sky-500 to-blue-600",
    acoes: [
      { icone: Target,       titulo: "Qualifique leads",    descricao: "Mova leads pelo pipeline de Prospecção ao Fechado." },
      { icone: MessageSquare, titulo: "Execute a cadência", descricao: "D0 a D30 — outreach estruturado via WhatsApp e Email." },
      { icone: PhoneCall,     titulo: "Registre ligações",  descricao: "Log de calls com resumo e próxima ação." },
    ],
    marcos: [
      { titulo: "Registrar 1º lead como responsável", href: "/vendas/base" },
      { titulo: "Qualificar 1 lead no pipeline",      href: "/vendas/pipeline" },
      { titulo: "Registrar 1ª ligação ou interação",  href: "/comunicacao/ligacoes" },
    ],
  },
  sdr: {
    label: "SDR",
    emoji: "🔍",
    descricao: "Você é responsável pela prospecção. Seu trabalho é encontrar e qualificar leads para o comercial.",
    cor: "from-emerald-500 to-teal-600",
    acoes: [
      { icone: Import,       titulo: "Importe listas",     descricao: "Suba CSVs com novos contatos para a base bruta." },
      { icone: MessageSquare, titulo: "Execute a cadência", descricao: "Inicie o outreach estruturado D0→D30 com cada lead." },
      { icone: Target,        titulo: "Qualifique leads",   descricao: "Identifique os interessados e passe pro comercial." },
    ],
    marcos: [
      { titulo: "Prospectar 1º lead na base",           href: "/vendas/base" },
      { titulo: "Qualificar 1 lead com o comercial",    href: "/vendas/pipeline" },
      { titulo: "Registrar 1ª resposta na cadência",    href: "/comunicacao/cadencia" },
    ],
  },
};

type Props = {
  userId: string;
  role: Role;
};

export default function WelcomeWizard({ userId, role }: Props) {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.comercial;

  function done() {
    try {
      localStorage.setItem(`guilds-welcome-done-${userId}`, "1");
    } catch { /* ignora */ }
    router.push("/hoje");
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-background">
      <div className="w-full max-w-lg animate-in fade-in zoom-in-95">

        {/* Card principal */}
        <div className="card overflow-hidden">
          {/* Header gradiente */}
          <div className={`bg-gradient-to-br ${config.cor} p-8 text-white relative`}>
            <button
              onClick={done}
              className="absolute top-4 right-4 text-white/60 hover:text-white"
              aria-label="Pular boas-vindas"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-4xl mb-3">{config.emoji}</div>
            {step === 0 && (
              <>
                <div className="text-xs uppercase tracking-[0.15em] font-semibold text-white/70 mb-1">
                  Bem-vindo ao Guilds!
                </div>
                <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.5px" }}>
                  Você é {config.label}
                </h1>
                <p className="text-sm text-white/80 leading-relaxed">{config.descricao}</p>
              </>
            )}
            {step === 1 && (
              <>
                <div className="text-xs uppercase tracking-[0.15em] font-semibold text-white/70 mb-1">
                  Seus primeiros passos
                </div>
                <h1 className="text-2xl font-bold" style={{ letterSpacing: "-0.5px" }}>
                  Por onde começar?
                </h1>
                <p className="text-sm text-white/80 mt-1">Complete esses 3 marcos para ativar o sistema.</p>
              </>
            )}
          </div>

          {/* Conteúdo da tela */}
          <div className="p-6">
            {step === 0 && (
              <div className="space-y-4">
                {config.acoes.map((acao, i) => {
                  const Icon = acao.icone;
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-secondary grid place-items-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">{acao.titulo}</div>
                        <div className="text-xs text-muted-foreground">{acao.descricao}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                {config.marcos.map((marco, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-secondary/20">
                    <div className="w-7 h-7 rounded-full border-2 border-muted-foreground/30 grid place-items-center shrink-0 text-xs font-bold text-muted-foreground">
                      {i + 1}
                    </div>
                    <span className="text-sm text-foreground">{marco.titulo}</span>
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground/25 ml-auto shrink-0" />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Você verá o progresso no cockpit do dia (/hoje) até completar todos.
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between">
              {/* Dots */}
              <div className="flex gap-1.5">
                {[0, 1].map(i => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all ${i === step ? "bg-primary w-5" : "bg-muted-foreground/30"}`}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                {step === 1 && (
                  <button onClick={() => setStep(0)} className="btn-secondary text-sm">
                    Voltar
                  </button>
                )}
                {step === 0 ? (
                  <button onClick={() => setStep(1)} className="btn-primary text-sm">
                    Próximo <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={done} className="btn-primary text-sm">
                    Começar! 🎉
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
