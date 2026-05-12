"use client";
import { useEffect, useState } from "react";
import { X, ArrowLeft, ArrowRight, Sparkles, ListChecks, Star, Heart, Rocket, Repeat, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { trackFlywheelEvent } from "@/lib/analytics/flywheel";

/**
 * Tour interativo de primeira visita ao /flywheel.
 *
 * Aparece automaticamente quando o user nunca viu — dismissa via localStorage
 * prefixado por user.id (não-por-device). Se trocar de conta no mesmo browser,
 * o tour reaparece pro novo user.
 *
 * Reinicia se localStorage limpar.
 */
const LS_KEY_PREFIX = "guilds:flywheel-tour-v1";

const SLIDES = [
  {
    icon: Sparkles,
    titulo: "Bem-vindo ao Flywheel",
    corpo:
      "O lado direito do funil borboleta. Aqui você acompanha o que acontece DEPOIS do lead fechar. " +
      "Cada cliente fechado é matéria-prima pra novos clientes — esse loop é o seu flywheel.",
    bullets: [
      "Visão única das 6 fases do pós-venda",
      "Alertas centralizados em /hoje",
      "Forecast composto (aquisição + expansão + renovação)",
    ],
    cor: "primary",
  },
  {
    icon: Sparkles,
    fase: "P1",
    titulo: "Indicações",
    corpo:
      "Cliente fechado pede indicação. Você converte essas indicações em leads novos com origem rastreada. " +
      "Métrica-chave: K-factor (quantos leads novos por cliente).",
    bullets: [
      "Pedido automático ao fechar (trigger SQL)",
      "Portal embaixador pra autosserviço",
      "Recompensas configuráveis (dinheiro, crédito, desconto)",
    ],
    cor: "primary",
  },
  {
    icon: ListChecks,
    fase: "P2",
    titulo: "Onboarding",
    corpo:
      "Cliente novo até estar usando 100% do produto. Templates configuráveis por organização. " +
      "Itens marcados como obrigatórios bloqueiam o NPS automático até serem concluídos.",
    bullets: [
      "Template default replicado em cada novo cliente",
      "Checklist editável (concluído / pular / reabrir)",
      "Atrasos disparam alertas em /hoje",
    ],
    cor: "primary",
  },
  {
    icon: Star,
    fase: "P2",
    titulo: "NPS",
    corpo:
      "Coleta automática D+7 do fechamento. Detratores viram alerta no mesmo dia. " +
      "Análise simples de comentários (sem IA) extrai palavras mais citadas e categoria dominante.",
    bullets: [
      "Email automático via outbox + Brevo",
      "Token público pro cliente responder em 1 clique",
      "Insights agregados na tab NPS de /comunicacao/pos-venda",
    ],
    cor: "primary",
  },
  {
    icon: Heart,
    fase: "P3",
    titulo: "Health Score",
    corpo:
      "Detecta churn antes que aconteça. Score 0–100 composto de 4 componentes: " +
      "recência de toque (30%), NPS (30%), onboarding (20%), comportamento de indicação (20%).",
    bullets: [
      "Snapshot diário (cron 03:30 UTC) pra tendência",
      "Modal de breakdown explica cada componente",
      "Categoria: saudável / atenção / em risco",
    ],
    cor: "warning",
  },
  {
    icon: Rocket,
    fase: "P4",
    titulo: "Expansão",
    corpo:
      "Upsell, cross-sell, mais seats. Clientes saudáveis com NPS alto e onboarding completo são " +
      "candidatos naturais. Sugestões automáticas todo dia 1 (cron mensal).",
    bullets: [
      "Pipeline aberto de expansões",
      "ARR expandido vira parte do NRR",
      "Conversão e dias médio fechar acompanhados",
    ],
    cor: "success",
  },
  {
    icon: Repeat,
    fase: "P5",
    titulo: "Renovação",
    corpo:
      "Ciclo recorrente automatizado. Data de renovação + ciclo (meses) por cliente. " +
      "Alertas em /hoje quando faltam ≤ 30 dias. Bulk edit no /comunicacao/pos-venda?tab=renovacoes.",
    bullets: [
      "Taxa de renovação dos últimos 12 meses",
      "ARR em renovação 90d (ponderado pela taxa)",
      "Vencidas viram alerta crítico",
    ],
    cor: "warning",
  },
  {
    icon: Gift,
    fase: "P6",
    titulo: "Portal embaixador",
    corpo:
      "Cliente acessa /indicar/{token} pra registrar indicações sem precisar de conta. " +
      "Branding custom (logo + cor) configurável em /configuracoes/organizacao.",
    bullets: [
      "QR code pra compartilhar offline",
      "Histórico de indicações + status",
      "Dark mode + i18n pt-BR/en-US",
    ],
    cor: "primary",
  },
];

export default function FlywheelOnboardingTour() {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [lsKey, setLsKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // Tenta pegar user atual pra montar chave por user
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (cancelado) return;
        const key = `${LS_KEY_PREFIX}:${user?.id ?? "anon"}`;
        setLsKey(key);
        const v = localStorage.getItem(key);
        if (!v) setOpen(true);
      } catch {
        // localStorage/auth indisponível — não mostra
      }
    })();
    return () => { cancelado = true; };
  }, []);

  function dismiss() {
    try { if (lsKey) localStorage.setItem(lsKey, "1"); } catch { /* ignore */ }
    // Track: tour completo (último slide) vs dismissed (cedo)
    const evento = idx === SLIDES.length - 1 ? "flywheel_tour_completo" : "flywheel_tour_dismissed";
    trackFlywheelEvent(evento, { slide_idx: idx, total_slides: SLIDES.length }).catch(() => {});
    setOpen(false);
  }

  if (!open) return null;

  const slide = SLIDES[idx];
  const Icon = slide.icon;
  const corClass =
    slide.cor === "primary" ? "text-primary bg-primary/10 border-primary/30" :
    slide.cor === "success" ? "text-success-500 bg-success-500/10 border-success-500/30" :
    "text-warning-500 bg-warning-500/10 border-warning-500/30";

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Tour de boas-vindas do Flywheel"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full overflow-hidden shadow-stripe-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
            {idx === 0 ? "Bem-vindo" : `Fase ${slide.fase} · ${idx} de ${SLIDES.length - 1}`}
          </div>
          <button onClick={dismiss} className="btn-ghost" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          <div className={`inline-flex w-12 h-12 rounded-xl grid place-items-center border mb-4 ${corClass}`}>
            <Icon className="w-6 h-6" aria-hidden="true" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight mb-2" style={{ letterSpacing: "-0.3px" }}>
            {slide.titulo}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{slide.corpo}</p>

          <ul className="space-y-1.5 mb-2">
            {slide.bullets.map((b, i) => (
              <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={() => setIdx(Math.max(0, idx - 1))}
            disabled={idx === 0}
            className="btn-ghost text-xs disabled:opacity-30"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Voltar
          </button>

          {/* Dots */}
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Ir pro slide ${i + 1}`}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === idx ? "bg-primary w-4" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>

          {idx < SLIDES.length - 1 ? (
            <button onClick={() => setIdx(idx + 1)} className="btn-primary text-xs">
              Próximo
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button onClick={dismiss} className="btn-primary text-xs">
              Começar
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
