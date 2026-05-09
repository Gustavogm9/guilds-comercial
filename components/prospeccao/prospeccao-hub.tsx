"use client";

/**
 * ProspeccaoHub v2 — Sprint 5
 *
 * 3 modos:
 *   - "url":       enriquecer um site específico (Firecrawl)
 *   - "nicho":     buscar por critérios (Tavily)
 *   - "lookalike": busca automática baseada nos clientes ganhos (Fingerprint ICP)
 *
 * Filtros avançados na fila de leads:
 *   - Confiança IA, dados obrigatórios, cargo, segmento, scores mínimos
 *
 * Score integrado por lead:
 *   - _similaridade (0-100): fit com ICP da org
 *   - _completude (0-100): qualidade dos dados disponíveis
 */

import { useState, useMemo } from "react";
import { Globe, Search, Target, Zap, Check, ArrowRight, Loader2, AlertTriangle, CheckCircle2, X, Plus, SlidersHorizontal } from "lucide-react";
import TabEnriquecer from "./tab-enriquecer";
import TabBuscar from "./tab-buscar";
import TabLookalike from "./tab-lookalike";
import FiltrosProspeccaoPanel from "./filtros-prospeccao";
import { CompletudeBadge } from "./badge-similaridade";
import BadgeSimilaridade from "./badge-similaridade";
import {
  aplicarFiltros,
  calcularCompletude,
  scoreSimilaridade,
} from "@/lib/prospeccao-lookalike";
import type { EmpresaEnriquecida } from "@/lib/prospeccao";
import type { FiltrosProspeccao, FingerprintICP } from "@/lib/prospeccao-lookalike";

type Modo = "url" | "nicho" | "lookalike";

type LeadParaAtivar = EmpresaEnriquecida & {
  _selecionado: boolean;
  _job_id?: number;
  _similaridade: number;
  _completude: number;
  instagram?: string | null;
};

type Props = {
  orgId: string;
  icp: { segmento?: string | null; cargo_decisor?: string | null } | null;
};

const MODOS = [
  { key: "url"      as Modo, icon: Globe,  label: "Por Site" },
  { key: "nicho"    as Modo, icon: Search, label: "Por Nicho" },
  { key: "lookalike"as Modo, icon: Target, label: "Look-alike IA" },
];

export default function ProspeccaoHub({ orgId, icp }: Props) {
  const [modo, setModo] = useState<Modo>("url");
  const [leads, setLeads] = useState<LeadParaAtivar[]>([]);
  const [fingerprint, setFingerprint] = useState<FingerprintICP | null>(null);
  const [filtros, setFiltros] = useState<FiltrosProspeccao>({});
  const [ativando, setAtivando] = useState(false);
  const [resultado, setResultado] = useState<{ criados: number; ignorados: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  function adicionarLead(empresa: EmpresaEnriquecida, jobId?: number) {
    setLeads(prev => {
      if (prev.some(l => l.site === empresa.site)) return prev;
      const sim = fingerprint ? scoreSimilaridade(empresa, fingerprint) : 0;
      const comp = calcularCompletude(empresa);
      return [...prev, {
        ...empresa,
        _selecionado: true,
        _job_id: jobId,
        _similaridade: sim,
        _completude: comp,
      }];
    });
  }

  // Segmentos únicos da fila para o painel de filtros
  const segmentosDisponiveis = useMemo(() =>
    [...new Set(leads.map(l => l.segmento).filter(Boolean) as string[])],
    [leads]
  );

  // Aplica filtros sobre a fila
  const leadsFiltrados = useMemo(() => aplicarFiltros(leads, filtros), [leads, filtros]);
  const selecionados = leadsFiltrados.filter(l => l._selecionado).length;
  const totalSelecionados = leads.filter(l => l._selecionado).length;

  function toggleSelecionado(site: string | null) {
    setLeads(prev => prev.map(l =>
      l.site === site ? { ...l, _selecionado: !l._selecionado } : l
    ));
  }

  function removerLead(site: string | null) {
    setLeads(prev => prev.filter(l => l.site !== site));
  }

  async function ativar(iniciarCadencia: boolean) {
    const selecionados = leads.filter(l => l._selecionado);
    if (!selecionados.length) return;

    setAtivando(true);
    setErro(null);
    try {
      const res = await fetch("/api/prospeccao/ativar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: selecionados,
          job_id: selecionados[0]._job_id ?? null,
          iniciar_cadencia: iniciarCadencia,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setResultado({ criados: data.criados, ignorados: data.ignorados });
      const sitesAtivados = new Set(selecionados.map(l => l.site));
      setLeads(prev => prev.filter(l => !sitesAtivados.has(l.site)));
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setAtivando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Seletor de modo */}
      <div className="flex gap-1.5 p-1 bg-secondary/40 rounded-xl w-fit">
        {MODOS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setModo(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              modo === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === "lookalike" && (
              <span className="text-[9px] bg-primary text-primary-foreground px-1 py-0.5 rounded uppercase font-bold tracking-wide">IA</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Coluna esquerda: modo ativo */}
        <div className="space-y-4">
          {modo === "url" && <TabEnriquecer onEmpresaEnriquecida={adicionarLead} icp={icp} />}
          {modo === "nicho" && <TabBuscar onEmpresaEnriquecida={adicionarLead} icp={icp} />}
          {modo === "lookalike" && (
            <TabLookalike
              onEmpresaEnriquecida={adicionarLead}
              orgId={orgId}
            />
          )}
        </div>

        {/* Coluna direita: fila de ativação */}
        <div className="space-y-3">
          {/* Header da fila */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground" style={{ letterSpacing: "-0.13px" }}>
              Fila de ativação
              {leads.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {totalSelecionados}/{leads.length}
                  {Object.keys(filtros).length > 0 ? ` (${leadsFiltrados.length} visíveis)` : ""}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {leads.length > 0 && (
                <>
                  <button
                    onClick={() => setMostrarFiltros(v => !v)}
                    className={`btn-ghost !py-1 !px-2 text-xs gap-1 ${mostrarFiltros ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Filtros
                    {Object.values(filtros).filter(Boolean).length > 0 && (
                      <span className="bg-primary text-primary-foreground text-[9px] px-1 rounded-full">
                        {Object.values(filtros).filter(v => v !== undefined && v !== false && (!Array.isArray(v) || v.length > 0)).length}
                      </span>
                    )}
                  </button>
                  <button onClick={() => setLeads([])} className="text-xs text-muted-foreground hover:text-destructive">
                    Limpar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Painel de filtros */}
          {mostrarFiltros && leads.length > 0 && (
            <FiltrosProspeccaoPanel
              filtros={filtros}
              onChange={setFiltros}
              segmentosDisponiveis={segmentosDisponiveis}
              regioes={[]}
            />
          )}

          {/* Resultado de ativação */}
          {resultado && (
            <div className="card p-3 bg-success-500/5 border-success-500/20 flex items-center gap-3 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  {resultado.criados} lead{resultado.criados !== 1 ? "s" : ""} adicionado{resultado.criados !== 1 ? "s" : ""}!
                </div>
                {resultado.ignorados > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {resultado.ignorados} ignorado{resultado.ignorados !== 1 ? "s" : ""} (já existiam)
                  </div>
                )}
              </div>
              <button onClick={() => setResultado(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="card p-3 bg-destructive/5 border-destructive/20 flex items-start gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {/* Lista vazia */}
          {leads.length === 0 ? (
            <div className="card p-8 text-center border-dashed">
              <Plus className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Nenhum lead na fila.</p>
              <p className="text-xs text-muted-foreground">
                Use um dos modos à esquerda para adicionar empresas.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {leadsFiltrados.map(lead => (
                <div
                  key={lead.site}
                  className={`card p-3 transition-all cursor-pointer ${
                    lead._selecionado
                      ? "border-primary/30 bg-primary/[0.02]"
                      : "opacity-60"
                  }`}
                  onClick={() => toggleSelecionado(lead.site)}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Score de similaridade */}
                    <BadgeSimilaridade score={lead._similaridade} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className={`w-4 h-4 rounded border-2 grid place-items-center shrink-0 transition-colors ${
                          lead._selecionado ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}>
                          {lead._selecionado && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <div className="text-sm font-medium text-foreground truncate">
                          {lead.empresa || lead.nome || lead.site}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {lead.cargo && `${lead.cargo} · `}
                        {lead.cidade_uf || lead.segmento || "—"}
                      </div>
                      {/* Badges de dados */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {lead.email && <span className="text-[10px] bg-sky-500/10 text-sky-600 px-1.5 py-0.5 rounded">email</span>}
                        {lead.whatsapp && <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">WhatsApp</span>}
                        {lead.linkedin && <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">LinkedIn</span>}
                        {lead.instagram && <span className="text-[10px] bg-pink-500/10 text-pink-600 px-1.5 py-0.5 rounded">Instagram</span>}
                        <CompletudeBadge score={lead._completude} />
                      </div>
                    </div>

                    <button
                      onClick={e => { e.stopPropagation(); removerLead(lead.site); }}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {leadsFiltrados.length === 0 && leads.length > 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  Nenhum lead passa pelos filtros ativos.{" "}
                  <button onClick={() => setFiltros({})} className="text-primary underline">Limpar filtros</button>
                </div>
              )}
            </div>
          )}

          {/* Botões de ativação */}
          {totalSelecionados > 0 && (
            <div className="space-y-2 pt-1 border-t border-border/40">
              <button onClick={() => ativar(false)} disabled={ativando} className="btn-secondary w-full text-sm justify-center">
                {ativando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Salvar {totalSelecionados} lead{totalSelecionados !== 1 ? "s" : ""} na base
              </button>
              <button onClick={() => ativar(true)} disabled={ativando} className="btn-primary w-full text-sm justify-center">
                {ativando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Salvar + iniciar cadência D0
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
