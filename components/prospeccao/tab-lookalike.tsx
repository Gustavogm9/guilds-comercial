"use client";

/**
 * TabLookalike — aba "Me encontre mais clientes como esses".
 *
 * Carrega o fingerprint ICP da org (via GET /api/prospeccao/lookalike/fingerprint)
 * e executa a busca look-alike com filtros opcionais de região e segmento.
 *
 * Exibe o fingerprint como "Perfil do cliente ideal detectado" e os
 * resultados rankeados por score de similaridade.
 */

import { useState, useEffect, useTransition } from "react";
import {
  Target, Loader2, ChevronDown, ChevronUp, Sparkles,
  AlertTriangle, TrendingUp, MapPin, Briefcase, Users,
} from "lucide-react";
import type { FingerprintICP } from "@/lib/prospeccao-lookalike";
import type { EmpresaBuscada } from "@/lib/prospeccao";
import BadgeSimilaridade from "./badge-similaridade";

type ResultadoLookalike = EmpresaBuscada & {
  _similaridade: number;
  _completude: number;
};

type Props = {
  onEmpresaEnriquecida: (empresa: any, jobId?: number) => void;
  orgId: string;
  hipoteseId?: number;
  hipotesePre?: {
    id: number; nome: string;
    segmentos?: string[]; cidades?: string[]; cargos?: string[];
  } | null;
};

const ESTADOS_BR = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG",
  "MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR",
  "RS","SC","SE","SP","TO",
];

export default function TabLookalike({ onEmpresaEnriquecida, orgId, hipoteseId, hipotesePre }: Props) {
  const [fingerprint, setFingerprint] = useState<FingerprintICP | null>(null);
  const [fpLoading, setFpLoading] = useState(true);
  const [fpExpanded, setFpExpanded] = useState(false);

  // Pré-popula com critérios da hipótese se vier do ICP Lab
  const [regioesSelecionadas, setRegioesSelecionadas] = useState<string[]>(
    hipotesePre?.cidades?.flatMap(c => c.match(/\b([A-Z]{2})\b/g) ?? []) ?? []
  );
  const [segmentosSelecionados, setSegmentosSelecionados] = useState<string[]>(
    hipotesePre?.segmentos ?? []
  );
  const [maxQueries, setMaxQueries] = useState(4);

  const [pending, start] = useTransition();
  const [resultados, setResultados] = useState<ResultadoLookalike[]>([]);
  const [jobId, setJobId] = useState<number | undefined>();
  const [queries, setQueries] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enriquecendo, setEnriquecendo] = useState<Set<string>>(new Set());

  // Carrega fingerprint ao montar
  useEffect(() => {
    fetch("/api/prospeccao/lookalike/fingerprint")
      .then(r => r.json())
      .then(d => d.fingerprint && setFingerprint(d.fingerprint))
      .catch(() => null)
      .finally(() => setFpLoading(false));
  }, []);

  function toggleRegiao(uf: string) {
    setRegioesSelecionadas(prev =>
      prev.includes(uf) ? prev.filter(r => r !== uf) : [...prev, uf]
    );
  }

  function toggleSegmento(seg: string) {
    setSegmentosSelecionados(prev =>
      prev.includes(seg) ? prev.filter(s => s !== seg) : [...prev, seg]
    );
  }

  function buscarLookalike() {
    setErro(null);
    setResultados([]);
    setQueries([]);
    start(async () => {
      try {
        const res = await fetch("/api/prospeccao/lookalike", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            regioes: regioesSelecionadas,
            segmentos: segmentosSelecionados,
            cargos: hipotesePre?.cargos ?? [],
            hipotese_id: hipoteseId ?? null,
            maxQueries,
            maxResultadosPorQuery: 5,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro);
        setResultados(data.resultados ?? []);
        setJobId(data.job_id);
        setQueries(data.queries ?? []);
        if (data.fingerprint) setFingerprint(data.fingerprint);
        if (data.aviso) setErro(data.aviso);
      } catch (err: any) {
        setErro(err.message);
      }
    });
  }

  async function enriquecerResultado(r: ResultadoLookalike) {
    if (enriquecendo.has(r.url)) return;
    setEnriquecendo(prev => new Set([...prev, r.url]));
    try {
      const res = await fetch("/api/prospeccao/enriquecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: r.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      onEmpresaEnriquecida(data.empresa, data.job_id ?? jobId);
    } catch (err: any) {
      console.error("[enriquecer lookalike]", err);
    } finally {
      setEnriquecendo(prev => { const s = new Set(prev); s.delete(r.url); return s; });
    }
  }

  return (
    <div className="space-y-4">
      {/* Banner hipótese ativa */}
      {hipotesePre && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/[0.05] border border-primary/20 text-xs">
          <Target className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-medium">Hipótese: {hipotesePre.nome}</span>
          {hipotesePre.segmentos?.length ? (
            <span className="text-muted-foreground">· {hipotesePre.segmentos.join(", ")}</span>
          ) : null}
        </div>
      )}
      {/* Fingerprint ICP */}
      <div className="card p-4 border-primary/20 bg-primary/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>
              Perfil do cliente ideal (ICP)
            </span>
            {fingerprint && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                {fingerprint.total_ganhos} ganhos · {fingerprint.total_base} na base
              </span>
            )}
          </div>
          {fingerprint && (
            <button onClick={() => setFpExpanded(v => !v)} className="text-muted-foreground">
              {fpExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>

        {fpLoading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Analisando sua base de clientes…
          </div>
        )}

        {fingerprint && !fpLoading && (
          <>
            {/* Resumo compacto sempre visível */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              {[
                { icon: Briefcase, label: "Top segmento", value: fingerprint.segmentos_top[0]?.valor ?? "—" },
                { icon: MapPin,    label: "Top região",   value: fingerprint.cidades_top[0]?.valor ?? "—" },
                { icon: Users,     label: "Top cargo",    value: fingerprint.cargos_top[0]?.valor ?? "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="text-center">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="text-xs font-medium text-foreground truncate" title={value}>{value}</div>
                </div>
              ))}
            </div>

            {/* Detalhes expandidos */}
            {fpExpanded && (
              <div className="mt-4 space-y-3 border-t border-border/40 pt-3">
                {[
                  { label: "Segmentos", items: fingerprint.segmentos_top },
                  { label: "Regiões", items: fingerprint.cidades_top },
                  { label: "Cargos", items: fingerprint.cargos_top },
                ].map(({ label, items }) => (
                  <div key={label}>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map(i => (
                        <span key={i.valor} className="text-[11px] px-2 py-0.5 bg-secondary rounded-md text-foreground">
                          {i.valor} <span className="text-muted-foreground">({i.percentual}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Valor médio</span>
                    <div className="font-semibold">
                      {fingerprint.valor_medio_brl > 0
                        ? fingerprint.valor_medio_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tem WhatsApp</span>
                    <div className="font-semibold">{fingerprint.completude.tem_whatsapp}% da base</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!fpLoading && !fingerprint && (
          <p className="mt-2 text-xs text-muted-foreground">
            Adicione leads qualificados ao pipeline para gerar o perfil ICP automaticamente.
          </p>
        )}
      </div>

      {/* Filtros */}
      <div className="card p-4 space-y-4">
        {/* Regiões */}
        <div>
          <div className="label mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Regiões (UF)
            <span className="ml-auto text-[10px] text-muted-foreground font-normal">Vazio = usa top do ICP</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS_BR.map(uf => (
              <button
                key={uf}
                onClick={() => toggleRegiao(uf)}
                className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                  regioesSelecionadas.includes(uf)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {uf}
              </button>
            ))}
          </div>
        </div>

        {/* Segmentos (da base ICP) */}
        {fingerprint && fingerprint.segmentos_top.length > 0 && (
          <div>
            <div className="label mb-2">Segmentos</div>
            <div className="flex flex-wrap gap-1.5">
              {fingerprint.segmentos_top.map(s => (
                <button
                  key={s.valor}
                  onClick={() => toggleSegmento(s.valor)}
                  className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                    segmentosSelecionados.includes(s.valor)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {s.valor}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Controle de profundidade */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="label mb-1">Profundidade da busca ({maxQueries} queries)</label>
            <input
              type="range" min={1} max={8} value={maxQueries}
              onChange={e => setMaxQueries(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Rápida (1)</span>
              <span>Profunda (8)</span>
            </div>
          </div>
        </div>

        <button
          onClick={buscarLookalike}
          disabled={pending || !fingerprint}
          className="btn-primary w-full justify-center"
        >
          {pending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Buscando look-alikes…</>
          ) : (
            <><Target className="w-4 h-4" /> 🎯 Buscar clientes similares</>
          )}
        </button>
      </div>

      {/* Queries geradas (debug amigável) */}
      {queries.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Queries executadas:{" "}
          {queries.map((q, i) => <span key={i} className="italic">"{q}"{i < queries.length - 1 ? ", " : ""}</span>)}
        </div>
      )}

      {/* Erro / aviso */}
      {erro && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {erro}
        </div>
      )}

      {/* Resultados rankeados */}
      {resultados.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>
              {resultados.length} empresas — rankeadas por fit com seu ICP
            </span>
          </div>
          {resultados.map(r => (
            <div key={r.url} className="card p-3 flex items-start gap-3 group">
              <BadgeSimilaridade score={r._similaridade} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.titulo}</div>
                <div className="text-[10px] text-muted-foreground">{r.dominio}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.snippet}</div>
              </div>
              <button
                onClick={() => enriquecerResultado(r)}
                disabled={enriquecendo.has(r.url)}
                className="btn-secondary !py-1 !px-2 text-xs shrink-0 opacity-0 group-hover:opacity-100 transition-opacity gap-1"
              >
                {enriquecendo.has(r.url) ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Enriquecer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
