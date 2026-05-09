"use client";

/**
 * TabBuscar — modo "busca por nicho".
 *
 * O vendedor descreve o tipo de empresa que quer prospectar.
 * Tavily busca e retorna até 10 resultados.
 * Para cada resultado, o vendedor pode solicitar enriquecimento (Firecrawl).
 */

import { useState, useTransition } from "react";
import { Search, Loader2, Globe, ExternalLink, Sparkles, ChevronRight } from "lucide-react";
import type { EmpresaEnriquecida, EmpresaBuscada } from "@/lib/prospeccao";

type Props = {
  onEmpresaEnriquecida: (empresa: EmpresaEnriquecida, jobId?: number) => void;
  icp: { segmento?: string | null; cargo_decisor?: string | null } | null;
};

// Sugestões rápidas baseadas em nichos comuns
const SUGESTOES = [
  "Corretoras de seguros São Paulo",
  "Imobiliárias Porto Alegre médio porte",
  "Construtoras Minas Gerais",
  "Clínicas odontológicas Curitiba",
  "Escritórios de contabilidade Rio de Janeiro",
];

export default function TabBuscar({ onEmpresaEnriquecida, icp }: Props) {
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [resultados, setResultados] = useState<EmpresaBuscada[]>([]);
  const [jobId, setJobId] = useState<number | undefined>();
  const [enriquecendo, setEnriquecendo] = useState<Set<string>>(new Set());

  const queryPlaceholder = icp?.segmento
    ? `${icp.segmento} em [cidade] — pequeno a médio porte`
    : "Ex: Corretoras de seguros SP médio porte";

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setErro(null);
    setResultados([]);

    start(async () => {
      try {
        const res = await fetch("/api/prospeccao/buscar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim(), maxResults: 10 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro);
        setResultados(data.resultados ?? []);
        setJobId(data.job_id);
      } catch (err: any) {
        setErro(err.message || "Erro na busca. Verifique sua chave Tavily.");
      }
    });
  }

  async function enriquecerResultado(empresa: EmpresaBuscada) {
    if (enriquecendo.has(empresa.url)) return;
    setEnriquecendo(prev => new Set([...prev, empresa.url]));

    try {
      const res = await fetch("/api/prospeccao/enriquecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: empresa.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      onEmpresaEnriquecida(data.empresa, data.job_id ?? jobId);
    } catch (err: any) {
      console.error("[enriquecer]", err);
    } finally {
      setEnriquecendo(prev => { const s = new Set(prev); s.delete(empresa.url); return s; });
    }
  }

  async function enriquecerTodos() {
    const naoEnriquecidos = resultados.filter(r => !enriquecendo.has(r.url));
    for (const r of naoEnriquecidos) {
      await enriquecerResultado(r);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>Buscar por Nicho</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Descreva o tipo de empresa que quer prospectar. Tavily busca e retorna até 10 resultados.
        </p>

        <form onSubmit={buscar} className="space-y-3">
          <div className="flex gap-2">
            <input
              className="input-base flex-1"
              placeholder={queryPlaceholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              disabled={pending}
            />
            <button
              type="submit"
              className="btn-primary shrink-0"
              disabled={pending || query.trim().length < 3}
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {/* Sugestões rápidas */}
          {!query && (
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="text-[11px] px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </form>

        {erro && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/5 border border-destructive/15 text-xs text-destructive">
            {erro}
          </div>
        )}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>
              {resultados.length} empresas encontradas
            </div>
            <button
              onClick={enriquecerTodos}
              disabled={enriquecendo.size > 0}
              className="btn-secondary !py-1.5 text-xs gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {enriquecendo.size > 0 ? "Enriquecendo…" : "Enriquecer todos"}
            </button>
          </div>

          <div className="space-y-2">
            {resultados.map(r => {
              const isEnriquecendo = enriquecendo.has(r.url);
              return (
                <div key={r.url} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors group">
                  <div className="w-7 h-7 rounded bg-secondary grid place-items-center shrink-0 mt-0.5">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-medium text-foreground truncate">{r.titulo}</div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-muted-foreground hover:text-primary shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{r.dominio}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {r.snippet}
                    </div>
                  </div>
                  <button
                    onClick={() => enriquecerResultado(r)}
                    disabled={isEnriquecendo}
                    className="btn-secondary !py-1 !px-2 text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Enriquecer esta empresa"
                  >
                    {isEnriquecendo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
