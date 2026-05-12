"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Target, Sparkles, Loader2, Check, AlertCircle, Building2, RefreshCw,
} from "lucide-react";
import { recalcularCentroideIcp, gerarEmbeddingsLote } from "./actions";

interface TopEmpresa {
  empresa_id: number;
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  porte: string | null;
  cidade: string | null;
  uf: string | null;
  cnae_normalizado: string | null;
  fit_score: number;
}

export default function IcpFitClient({
  isGestor,
  centroide,
  totalEmpresas,
  totalEmbeddings,
  totalClientesFechados,
  topEmpresas,
}: {
  isGestor: boolean;
  centroide: { total_clientes: number; atualizado_em: string; amostra_textos: string[] } | null;
  totalEmpresas: number;
  totalEmbeddings: number;
  totalClientesFechados: number;
  topEmpresas: TopEmpresa[];
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function recalcular() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const r = await recalcularCentroideIcp({ limit: 50 });
        setFeedback({
          tipo: "ok",
          texto: `Centroide recalculado com ${r.total_clientes} clientes (custo ~$${r.custo_estimado_usd.toFixed(4)}).`,
        });
        router.refresh();
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      } finally {
        setTimeout(() => setFeedback(null), 5000);
      }
    });
  }

  function gerarLote() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const r = await gerarEmbeddingsLote({ limit: 50 });
        setFeedback({
          tipo: "ok",
          texto: `${r.processadas} empresa(s) processada(s) (custo ~$${r.custo_estimado_usd.toFixed(4)}).`,
        });
        router.refresh();
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      } finally {
        setTimeout(() => setFeedback(null), 5000);
      }
    });
  }

  const pctCobertura = totalEmpresas > 0 ? Math.round((totalEmbeddings / totalEmpresas) * 100) : 0;

  return (
    <>
      {/* Estado do centroide */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Centroide ICP</div>
          {centroide ? (
            <>
              <div className="text-2xl font-semibold text-primary tabular-nums mt-1">{centroide.total_clientes}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                clientes amostrados · atualizado {new Date(centroide.atualizado_em).toLocaleDateString("pt-BR")}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-semibold text-muted-foreground tabular-nums mt-1">—</div>
              <div className="text-xs text-muted-foreground mt-0.5">Não calculado ainda</div>
            </>
          )}
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Cobertura embeddings</div>
          <div className="text-2xl font-semibold text-foreground tabular-nums mt-1">
            {totalEmbeddings.toLocaleString("pt-BR")} / {totalEmpresas.toLocaleString("pt-BR")}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{pctCobertura}% das empresas no cache</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Clientes fechados</div>
          <div className="text-2xl font-semibold text-success-500 tabular-nums mt-1">{totalClientesFechados}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{totalClientesFechados >= 3 ? "fonte do centroide" : "mínimo 3 pra calcular"}</div>
        </div>
      </section>

      {feedback && (
        <div role="alert" className={`card p-3 mb-4 text-sm flex items-center gap-2 ${
          feedback.tipo === "ok" ? "border-success-500/30 bg-success-500/5 text-success-500" :
          "border-destructive/30 bg-destructive/5 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.texto}
        </div>
      )}

      {/* Ações gestor */}
      {isGestor && (
        <section className="card p-4 mb-6">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Configuração
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={recalcular}
              disabled={pending || totalClientesFechados < 3}
              className="btn-primary text-xs"
              title={totalClientesFechados < 3 ? "Mínimo 3 clientes fechados" : "Recalcula o centroide ICP com OpenAI embeddings"}
            >
              {pending && <Loader2 className="w-3 h-3 animate-spin" />}
              <RefreshCw className="w-3 h-3" />
              {centroide ? "Recalcular centroide" : "Calcular centroide pela 1ª vez"}
            </button>
            <button
              onClick={gerarLote}
              disabled={pending || totalEmbeddings >= totalEmpresas}
              className="btn-secondary text-xs"
              title={`Gera embeddings pras próximas 50 empresas sem embedding (custo ~$0.00005)`}
            >
              Gerar 50 embeddings
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Custo OpenAI: <strong>$0.02 / 1M tokens</strong>. Cada empresa ~50 tokens = $0.000001. Prospectando 10k empresas = ~$0.01.
            Centroide deve ser recalculado periodicamente (quando ICP muda muito).
          </p>
        </section>
      )}

      {/* Top empresas */}
      {!centroide ? (
        <div className="card p-12 text-center">
          <Target className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Centroide ICP ainda não foi calculado.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {isGestor
              ? `Você tem ${totalClientesFechados} clientes fechados. Clique em "Calcular centroide" acima quando tiver pelo menos 3.`
              : "Peça pro gestor calcular o centroide ICP."
            }
          </p>
        </div>
      ) : topEmpresas.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Sem empresas com embedding ainda — ou todas já viraram leads.
          </p>
          {isGestor && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              Clique em "Gerar 50 embeddings" pra processar as empresas no cache.
            </p>
          )}
        </div>
      ) : (
        <section>
          <h2 className="font-semibold text-sm mb-3">Top {topEmpresas.length} empresas com melhor fit</h2>
          <ul className="space-y-2">
            {topEmpresas.map((e) => (
              <li key={e.empresa_id} className="card p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <Link href={`/vendas/prospeccao/empresa/${e.empresa_id}`} className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      {e.nome_fantasia || e.razao_social}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      {e.cnae_normalizado && <span>{e.cnae_normalizado}</span>}
                      {e.cidade && <span>· {e.cidade}/{e.uf}</span>}
                      {e.porte && <span>· {e.porte}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-2xl font-bold tabular-nums ${
                      e.fit_score >= 80 ? "text-success-500" :
                      e.fit_score >= 60 ? "text-warning-500" :
                      "text-muted-foreground"
                    }`} style={{ letterSpacing: "-0.5px" }}>
                      {e.fit_score}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">fit / 100</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
