"use client";
import { useState, useTransition } from "react";
import { atualizarPercepcao, marcarTomUltimaInteracao } from "@/app/(app)/hoje/actions";
import { PERCEPCOES_VENDEDOR, type PercepcaoVendedor, type TomInteracao } from "@/lib/types";
import { TrendingUp, TrendingDown, Minus, Check, Zap } from "lucide-react";
import NextBestActionCard from "./ai/next-best-action-card";

type Breakdown = {
  etapa: number;        // 0-25
  fit_icp: number;      // 0-10
  decisor: number;      // 0-8
  temperatura: number;  // 0-10
  voucher: number;      // 0-10
  velocidade: number;   // 0-12
  percepcao: number;    // 0-15
  interacoes: number;   // 0-10
};

/**
 * Card de Score de Fechamento — visual do lead detail.
 * Mostra:
 *  - Score composto (0-100) com gauge visual
 *  - Valor esperado (valor_potencial × score/100)
 *  - Breakdown em 8 fatores (barras)
 *  - Select de percepção do vendedor (atualizável)
 *  - Botões de tom da última interação
 */
export default function LeadScoreCard({
  leadId,
  score,
  valorPotencial,
  valorEsperado,
  breakdown,
  percepcaoAtual,
  temLigacoes,
  // Contexto pro NBA
  empresa,
  crmStage,
  diasSemTocar,
  ultimaInteracao,
  tomAnterior,
  dorPrincipal,
  cadenciaPendente,
}: {
  leadId: number;
  score: number;
  valorPotencial: number;
  valorEsperado: number;
  breakdown: Breakdown;
  percepcaoAtual: PercepcaoVendedor | null;
  temLigacoes: boolean;
  empresa: string;
  crmStage: string;
  diasSemTocar: number;
  ultimaInteracao: string;
  tomAnterior: string;
  dorPrincipal: string;
  cadenciaPendente: string;
}) {
  const [pending, start] = useTransition();
  const [percepcao, setPercepcao] = useState<PercepcaoVendedor | null>(percepcaoAtual);
  const [tomMarcado, setTomMarcado] = useState<TomInteracao | null>(null);

  const corScore =
    score >= 70 ? "text-success-500"
    : score >= 45 ? "text-warning-500"
    : "text-destructive";
  const corGauge =
    score >= 70 ? "bg-success-500"
    : score >= 45 ? "bg-warning-500"
    : "bg-destructive";
  const rotulo =
    score >= 85 ? "Quase certo"
    : score >= 70 ? "Forte candidato"
    : score >= 45 ? "Depende da cadência"
    : score >= 20 ? "Baixa chance"
    : "Friíssimo";

  function handlePercepcao(nova: PercepcaoVendedor) {
    setPercepcao(nova);
    start(async () => {
      await atualizarPercepcao(leadId, nova);
    });
  }

  function handleTom(tom: TomInteracao) {
    setTomMarcado(tom);
    start(async () => {
      await marcarTomUltimaInteracao(leadId, tom);
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 80 80" className="transform -rotate-90">
              <circle cx="40" cy="40" r="34" strokeWidth="8" stroke="hsl(var(--secondary))" fill="none" />
              <circle
                cx="40" cy="40" r="34" strokeWidth="8" fill="none"
                className={corScore}
                stroke="currentColor"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 213.6} 213.6`}
              />
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center font-bold text-2xl ${corScore}`}>
              {score}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">Score de fechamento</div>
            <div className={`text-lg font-semibold ${corScore}`}>{rotulo}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Valor esperado: <b className="text-foreground tabular-nums">{moeda(valorEsperado)}</b>
              {" "}
              <span className="text-muted-foreground/70 tabular-nums">de {moeda(valorPotencial)}</span>
            </div>
          </div>
        </div>

        {/* Percepção do vendedor */}
        <div className="min-w-[220px]">
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold mb-1">
            Sua percepção
          </div>
          <div className="grid grid-cols-5 gap-1">
            {PERCEPCOES_VENDEDOR.map((p) => (
              <button
                key={p}
                disabled={pending}
                onClick={() => handlePercepcao(p)}
                title={p}
                className={`text-[10px] py-1.5 rounded border transition-colors ${
                  percepcao === p
                    ? "bg-primary text-primary-foreground border-primary font-semibold"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground dark:bg-white/[0.02] dark:border-white/[0.08]"
                }`}
              >
                {p.charAt(0) + (p === "Muito baixa" ? "B" : p === "Muito alta" ? "A" : "")}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">
            {percepcao ?? "Não avaliado — entra como neutro no score"}
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="mt-5 pt-5 border-t border-border dark:border-white/[0.06]">
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold mb-2">
          De onde vem o score
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
          <FatorBar label="Etapa CRM"      value={breakdown.etapa}       max={25} cor={corGauge} />
          <FatorBar label="Percepção"      value={breakdown.percepcao}   max={15} cor={corGauge} />
          <FatorBar label="Velocidade"     value={breakdown.velocidade}  max={12} cor={corGauge} />
          <FatorBar label="Interações"     value={breakdown.interacoes}  max={10} cor={corGauge} />
          <FatorBar label="Temperatura"    value={breakdown.temperatura} max={10} cor={corGauge} />
          <FatorBar label="Fit ICP"        value={breakdown.fit_icp}     max={10} cor={corGauge} />
          <FatorBar label="Raio-X pago"    value={breakdown.voucher}     max={10} cor={corGauge} />
          <FatorBar label="Decisor"        value={breakdown.decisor}     max={8}  cor={corGauge} />
        </div>
      </div>

      {/* Next Best Action via IA */}
      <NextBestActionCard
        leadId={leadId}
        empresa={empresa}
        score={score}
        rotuloScore={rotulo}
        crmStage={crmStage}
        diasSemTocar={diasSemTocar}
        ultimaInteracao={ultimaInteracao}
        tomAnterior={tomAnterior}
        dorPrincipal={dorPrincipal}
        cadenciaPendente={cadenciaPendente}
        valorPotencial={valorPotencial}
      />

      {/* Tom da última interação */}
      {temLigacoes && (
        <div className="mt-5 pt-5 border-t border-border dark:border-white/[0.06]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">
                Como foi a última interação?
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Alimenta o score. Marque só se houve ligação registrada.
              </div>
            </div>
            <div className="flex gap-1.5">
              <BtnTom label="Positivo" tom="positivo" icon={<TrendingUp className="w-3.5 h-3.5" />}
                cor="success" active={tomMarcado === "positivo"} onClick={handleTom} disabled={pending} />
              <BtnTom label="Neutro" tom="neutro" icon={<Minus className="w-3.5 h-3.5" />}
                cor="muted" active={tomMarcado === "neutro"} onClick={handleTom} disabled={pending} />
              <BtnTom label="Negativo" tom="negativo" icon={<TrendingDown className="w-3.5 h-3.5" />}
                cor="destructive" active={tomMarcado === "negativo"} onClick={handleTom} disabled={pending} />
            </div>
          </div>
          {tomMarcado && (
            <div className="text-xs text-success-500 mt-2 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Tom registrado. Score atualizado.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Sub-componentes
function FatorBar({ label, value, max, cor }: { label: string; value: number; max: number; cor: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-24 text-muted-foreground text-right shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-secondary dark:bg-white/[0.05] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-muted-foreground shrink-0 tabular-nums">
        {value}/{max}
      </div>
    </div>
  );
}

function BtnTom({ label, tom, icon, cor, active, onClick, disabled }: {
  label: string; tom: TomInteracao; icon: React.ReactNode; cor: "success" | "muted" | "destructive";
  active: boolean; onClick: (t: TomInteracao) => void; disabled: boolean;
}) {
  const classes = active
    ? cor === "success" ? "bg-success-500 text-white border-success-500"
    : cor === "destructive" ? "bg-destructive text-destructive-foreground border-destructive"
    : "bg-foreground text-background border-foreground"
    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground dark:bg-white/[0.02] dark:border-white/[0.08]";
  return (
    <button
      disabled={disabled}
      onClick={() => onClick(tom)}
      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border transition-colors ${classes}`}
    >
      {icon} {label}
    </button>
  );
}

function moeda(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  });
}
