"use client";

import { useState, useTransition, useMemo } from "react";
import { Sparkles, Trash2, Filter } from "lucide-react";
import { desativarFewshotExemplo } from "@/app/(app)/admin/ai/fewshot-actions";
import type { AiFeatureCodigo } from "@/lib/types";

export interface FewshotExemplo {
  id: number;
  feature_codigo: string;
  segmento_org: string | null;
  segmento_lead: string | null;
  cargo_decisor: string | null;
  ticket_range: string | null;
  output: string;
  score: number;
  fonte: string;
  ativo: boolean;
  created_at: string;
}

const FONTE_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: "Manual", color: "bg-primary/10 text-primary border-primary/30" },
  auto_clicado: { label: "Auto · clicado", color: "bg-muted text-muted-foreground border-border" },
  auto_respondido: { label: "Auto · respondido", color: "bg-success-500/10 text-success-500 border-success-500/30" },
  auto_convertido: { label: "Auto · convertido", color: "bg-success-500/20 text-success-500 border-success-500/50 font-semibold" },
  auto_resposta_lead: { label: "Auto · resposta lead", color: "bg-warning-500/10 text-warning-500 border-warning-500/30" },
};

export default function FewshotTab({ exemplos, features }: {
  exemplos: FewshotExemplo[];
  features: { codigo: AiFeatureCodigo; nome: string }[];
}) {
  const [filtroFeature, setFiltroFeature] = useState<string>("");
  const [filtroSegmento, setFiltroSegmento] = useState<string>("");
  const [pending, start] = useTransition();
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  const segmentosUnicos = useMemo(
    () => Array.from(new Set(exemplos.map((e) => e.segmento_lead).filter(Boolean))).sort(),
    [exemplos]
  );

  const exemplosFiltrados = useMemo(() => {
    return exemplos.filter((e) => {
      if (filtroFeature && e.feature_codigo !== filtroFeature) return false;
      if (filtroSegmento && e.segmento_lead !== filtroSegmento) return false;
      return true;
    });
  }, [exemplos, filtroFeature, filtroSegmento]);

  function desativar(id: number) {
    start(async () => {
      const res = await desativarFewshotExemplo(id);
      if (res.error) alert(res.error);
      setConfirmandoId(null);
    });
  }

  if (exemplos.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Sparkles className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-sm font-semibold text-foreground mb-1">Nenhum exemplo few-shot ainda</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Quando você marcar um output gerado como "perfeito" (botão estrela na invocação), ele vira
          exemplo desta organização. A IA usa esses exemplos pra aprender o tom, estilo e estrutura
          dos seus melhores outputs.
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          Outputs também são coletados <strong>automaticamente</strong> quando o vendedor copia, lead
          responde, ou lead avança etapa após receber a mensagem.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <select
          value={filtroFeature}
          onChange={(e) => setFiltroFeature(e.target.value)}
          className="input-base text-sm py-1 min-w-[200px]"
        >
          <option value="">Todas as features ({exemplos.length})</option>
          {features.map((f) => {
            const count = exemplos.filter((e) => e.feature_codigo === f.codigo).length;
            if (count === 0) return null;
            return <option key={f.codigo} value={f.codigo}>{f.nome} ({count})</option>;
          })}
        </select>
        <select
          value={filtroSegmento}
          onChange={(e) => setFiltroSegmento(e.target.value)}
          className="input-base text-sm py-1 min-w-[200px]"
        >
          <option value="">Todos os segmentos</option>
          {segmentosUnicos.map((s) => <option key={s} value={s as string}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {exemplosFiltrados.length} de {exemplos.length} exemplos
        </span>
      </div>

      <ul className="space-y-2">
        {exemplosFiltrados.map((ex) => {
          const fonte = FONTE_LABELS[ex.fonte] ?? { label: ex.fonte, color: "bg-muted text-muted-foreground border-border" };
          const featureNome = features.find((f) => f.codigo === ex.feature_codigo)?.nome ?? ex.feature_codigo;
          const scoreColor =
            ex.score >= 80 ? "bg-success-500/10 text-success-500 border-success-500/30" :
            ex.score >= 60 ? "bg-primary/10 text-primary border-primary/30" :
            "bg-warning-500/10 text-warning-500 border-warning-500/30";

          return (
            <li key={ex.id} className="card p-3">
              <div className="flex items-start gap-3 flex-wrap">
                {/* Score badge */}
                <div className={`px-2 py-1 rounded border text-xs font-mono font-semibold flex-shrink-0 ${scoreColor}`}>
                  {ex.score.toFixed(0)}
                </div>

                {/* Header */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium text-foreground">{featureNome}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${fonte.color}`}>
                      {fonte.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap mb-2">
                    {ex.segmento_lead && <span>📍 {ex.segmento_lead}</span>}
                    {ex.cargo_decisor && <span>👤 {ex.cargo_decisor}</span>}
                    {ex.ticket_range && <span>💰 {ex.ticket_range}</span>}
                    <span>{new Date(ex.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                      Ver output ({ex.output.length} chars)
                    </summary>
                    <pre className="mt-2 p-2 rounded bg-muted/40 border border-border/50 text-foreground whitespace-pre-wrap text-[11px] max-h-[200px] overflow-y-auto">
                      {ex.output}
                    </pre>
                  </details>
                </div>

                {/* Action */}
                <div className="flex-shrink-0">
                  {confirmandoId === ex.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => desativar(ex.id)}
                        disabled={pending}
                        className="text-xs px-2 py-1 rounded bg-urgent-500 text-white hover:brightness-110"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmandoId(null)}
                        className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmandoId(ex.id)}
                      title="Desativar exemplo"
                      className="p-1.5 rounded text-muted-foreground hover:text-urgent-500 hover:bg-urgent-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
