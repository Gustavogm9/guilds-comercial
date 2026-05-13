"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, AlertCircle, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { analisarComentariosNps } from "@/app/(app)/growth/indicacoes/script-actions";

/**
 * Card de insights de NPS — análise simples de comentários sem IA.
 *
 * Conteúdo:
 *   - Top temas comuns (palavras mais citadas) com categoria dominante
 *     (promotores reclamaram disso ou elogiaram?)
 *   - 3 exemplos negativos + 3 exemplos positivos
 *
 * Renderizado dentro da tab NPS de /comunicacao/pos-venda quando há
 * comentários suficientes (>= 3 respostas com texto).
 */
export default function NpsInsightsCard() {
  const [pending, startTransition] = useTransition();
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof analisarComentariosNps>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);

  const carregar = useCallback(() => {
    setErro(null);
    startTransition(async () => {
      try {
        const r = await analisarComentariosNps();
        setInsights(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro");
      }
    });
  }, [startTransition]);

  useEffect(() => {
    if (expandido && !insights && !pending) {
      carregar();
    }
  }, [carregar, expandido, insights, pending]);

  return (
    <div className="card p-4 mb-4">
      <button
        type="button"
        onClick={() => setExpandido(!expandido)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={expandido}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
          <div>
            <div className="font-semibold text-sm">Insights dos comentários</div>
            <p className="text-xs text-muted-foreground">
              Temas comuns + exemplos do que os clientes escreveram
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {expandido ? "Recolher" : "Expandir"}
        </span>
      </button>

      {expandido && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          {pending && (
            <div className="text-center py-4 text-muted-foreground">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" aria-hidden="true" />
              <p className="text-xs mt-2">Analisando comentários...</p>
            </div>
          )}

          {erro && (
            <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> {erro}
            </div>
          )}

          {insights && insights.total_comentarios === 0 && (
            <p className="text-xs text-muted-foreground text-center italic">
              Sem comentários ainda. Análise aparece quando houver 3+ respostas com texto.
            </p>
          )}

          {insights && insights.total_comentarios > 0 && (
            <>
              {/* Categorias */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center p-2 rounded bg-success-500/10 border border-success-500/30">
                  <div className="text-success-500 font-bold tabular-nums text-lg">{insights.por_categoria.promotores}</div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-success-500/80">Promotores</div>
                </div>
                <div className="text-center p-2 rounded bg-warning-500/10 border border-warning-500/30">
                  <div className="text-warning-500 font-bold tabular-nums text-lg">{insights.por_categoria.neutros}</div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-warning-500/80">Neutros</div>
                </div>
                <div className="text-center p-2 rounded bg-destructive/10 border border-destructive/30">
                  <div className="text-destructive font-bold tabular-nums text-lg">{insights.por_categoria.detratores}</div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-destructive/80">Detratores</div>
                </div>
              </div>

              {/* Temas */}
              {insights.temas_comuns.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
                    Palavras mais citadas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {insights.temas_comuns.map((t) => {
                      const tone =
                        t.categoria_dominante === "promotor" ? "bg-success-500/15 text-success-500 border-success-500/30" :
                        t.categoria_dominante === "detrator" ? "bg-destructive/15 text-destructive border-destructive/30" :
                        "bg-secondary text-muted-foreground border-border";
                      return (
                        <span
                          key={t.palavra}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${tone}`}
                          title={`${t.ocorrencias} ocorrência(s) — categoria dominante: ${t.categoria_dominante}`}
                        >
                          {t.categoria_dominante === "promotor" && <TrendingUp className="w-2.5 h-2.5" aria-hidden="true" />}
                          {t.categoria_dominante === "detrator" && <TrendingDown className="w-2.5 h-2.5" aria-hidden="true" />}
                          {t.palavra} <span className="opacity-60 tabular-nums">{t.ocorrencias}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Exemplos */}
              <div className="grid md:grid-cols-2 gap-3">
                {insights.exemplos_negativos.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-destructive mb-1.5">
                      ⚠ Detratores
                    </div>
                    <ul className="space-y-1.5">
                      {insights.exemplos_negativos.map((e, idx) => (
                        <li key={idx} className="text-xs rounded bg-destructive/5 border border-destructive/20 p-2">
                          <div className="font-semibold text-destructive tabular-nums mb-0.5">Score {e.score}</div>
                          <p className="italic text-muted-foreground">"{e.comentario}"</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {insights.exemplos_positivos.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-success-500 mb-1.5">
                      ✨ Promotores
                    </div>
                    <ul className="space-y-1.5">
                      {insights.exemplos_positivos.map((e, idx) => (
                        <li key={idx} className="text-xs rounded bg-success-500/5 border border-success-500/20 p-2">
                          <div className="font-semibold text-success-500 tabular-nums mb-0.5">Score {e.score}</div>
                          <p className="italic text-muted-foreground">"{e.comentario}"</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
