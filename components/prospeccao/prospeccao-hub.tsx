"use client";

/**
 * ProspeccaoHub v4 — Sprint 8
 *
 * 5 modos:
 *   - "url":       enriquecer site (Firecrawl)
 *   - "cnpj":      buscar por CNPJ (BrasilAPI — gratuito)
 *   - "nicho":     buscar por critérios (Tavily)
 *   - "lookalike": busca automática baseada em ICP (Fingerprint)
 *   - "campanhas": campanhas em lote com execução automática
 *
 * Sprint 8:
 *   - Aba Campanhas: cria e executa campanhas de prospecção em lote
 *   - Métricas ICP auto-incrementadas via triggers de pipeline e proposta
 *   - Edge Function periódica: supabase/functions/prospeccao-engine
 */

import { useState, useMemo } from "react";
import {
  Globe, Search, Target, Hash, Zap, Check, Loader2,
  AlertTriangle, CheckCircle2, X, Plus, SlidersHorizontal, Rocket,
} from "lucide-react";
import TabEnriquecer from "./tab-enriquecer";
import TabBuscar from "./tab-buscar";
import TabLookalike from "./tab-lookalike";
import TabCnpj from "./tab-cnpj";
import TabCampanhas from "./tab-campanhas";
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

type Modo = "url" | "cnpj" | "nicho" | "lookalike" | "campanhas";

type LeadParaAtivar = EmpresaEnriquecida & {
  _selecionado: boolean;
  _job_id?: number;
  _similaridade: number;
  _completude: number;
  instagram?: string | null;
};

type ResultadoAtivacao = {
  criados: number;
  duplicados: number;
  ignorados: number;
  detalhe_duplicados?: Array<{ empresa: string; motivo: string }>;
};

type Props = {
  orgId: string;
  icp: { segmento?: string | null; cargo_decisor?: string | null } | null;
  hipoteseId?: number;
  hipotesePre?: {
    id: number; nome: string;
    segmentos?: string[]; cidades?: string[]; cargos?: string[];
    produto_id?: number | null;
  } | null;
  hipoteses?: { id: number; nome: string; cor?: string; segmentos?: string[]; cidades?: string[]; cargos?: string[] }[];
  produtos?: { id: number; nome: string }[];
};

const MODOS: { key: Modo; icon: typeof Globe; label: string; badge?: string }[] = [
  { key: "url",       icon: Globe,   label: "Por Site" },
  { key: "cnpj",      icon: Hash,    label: "Por CNPJ",    badge: "Grátis" },
  { key: "nicho",     icon: Search,  label: "Por Nicho" },
  { key: "lookalike", icon: Target,  label: "Look-alike",  badge: "IA" },
  { key: "campanhas", icon: Rocket,  label: "Campanhas",   badge: "Auto" },
];

export default function ProspeccaoHub({ orgId, icp, hipoteseId, hipotesePre, hipoteses = [], produtos = [] }: Props) {
  // Se veio do ICP Lab, abre direto no look-alike
  const [modo, setModo] = useState<Modo>(hipoteseId ? "lookalike" : "url");
  const [leads, setLeads] = useState<LeadParaAtivar[]>([]);
  const [fingerprint, setFingerprint] = useState<FingerprintICP | null>(null);
  const [filtros, setFiltros] = useState<FiltrosProspeccao>({});
  const [ativando, setAtivando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAtivacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  function adicionarLead(empresa: EmpresaEnriquecida, jobId?: number) {
    setLeads(prev => {
      if (prev.some(l => l.site === empresa.site && empresa.site)) return prev;
      const sim = fingerprint ? scoreSimilaridade(empresa, fingerprint) : 0;
      const comp = calcularCompletude(empresa);
      return [...prev, { ...empresa, _selecionado: true, _job_id: jobId, _similaridade: sim, _completude: comp }];
    });
  }

  const segmentosDisponiveis = useMemo(() =>
    [...new Set(leads.map(l => l.segmento).filter(Boolean) as string[])],
    [leads]
  );

  const leadsFiltrados = useMemo(() => aplicarFiltros(leads, filtros), [leads, filtros]);
  const totalSelecionados = leads.filter(l => l._selecionado).length;

  function toggleSelecionado(site: string | null) {
    setLeads(prev => prev.map(l => l.site === site ? { ...l, _selecionado: !l._selecionado } : l));
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
          hipotese_id: hipoteseId ?? null,
          iniciar_cadencia: iniciarCadencia,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setResultado(data);
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
      <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl w-fit flex-wrap">
        {MODOS.map(({ key, icon: Icon, label, badge }) => (
          <button
            key={key}
            onClick={() => setModo(key)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              modo === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {badge && (
              <span className={`text-[9px] px-1 py-0.5 rounded uppercase font-bold tracking-wide ${
                badge === "Grátis" ? "bg-green-500/20 text-green-600" : "bg-primary/20 text-primary"
              }`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          {modo === "url"       && <TabEnriquecer onEmpresaEnriquecida={adicionarLead} icp={icp} />}
          {modo === "cnpj"      && <TabCnpj onEmpresaEnriquecida={adicionarLead} />}
          {modo === "nicho"     && <TabBuscar onEmpresaEnriquecida={adicionarLead} icp={icp} />}
          {modo === "lookalike" && (
            <TabLookalike
              onEmpresaEnriquecida={adicionarLead}
              orgId={orgId}
              hipoteseId={hipoteseId}
              hipotesePre={hipotesePre}
              produtos={produtos}
            />
          )}
        </div>

        {/* Campanhas: tela cheia, gerencia próprios leads */}
        {modo === "campanhas" && (
          <div className="lg:col-span-2">
            <TabCampanhas hipoteses={hipoteses} produtos={produtos} />
          </div>
        )}

        {/* Coluna direita: fila */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ letterSpacing: "-0.13px" }}>
              Fila de ativação
              {leads.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {totalSelecionados}/{leads.length}
                  {hipoteseId && <span className="ml-1 text-primary text-[10px]">· hipótese ativa</span>}
                </span>
              )}
            </h3>
            {leads.length > 0 && (
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setMostrarFiltros(v => !v)}
                  className={`btn-ghost !py-1 !px-2 text-xs gap-1 ${mostrarFiltros ? "text-primary" : "text-muted-foreground"}`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filtros
                  {Object.values(filtros).filter(v => v !== undefined && v !== false && (!Array.isArray(v) || v.length > 0)).length > 0 && (
                    <span className="bg-primary text-primary-foreground text-[9px] px-1 rounded-full">
                      {Object.values(filtros).filter(v => v !== undefined && v !== false && (!Array.isArray(v) || v.length > 0)).length}
                    </span>
                  )}
                </button>
                <button onClick={() => setLeads([])} className="text-xs text-muted-foreground hover:text-destructive">Limpar</button>
              </div>
            )}
          </div>

          {mostrarFiltros && leads.length > 0 && (
            <FiltrosProspeccaoPanel filtros={filtros} onChange={setFiltros} segmentosDisponiveis={segmentosDisponiveis} regioes={[]} />
          )}

          {/* Resultado */}
          {resultado && (
            <div className="card p-3 bg-success-500/5 border-success-500/20 space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <div className="text-sm font-semibold flex-1">
                  {resultado.criados} lead{resultado.criados !== 1 ? "s" : ""} adicionado{resultado.criados !== 1 ? "s" : ""}!
                </div>
                <button onClick={() => setResultado(null)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
              {resultado.duplicados > 0 && (
                <div className="text-xs text-amber-600 pl-6">
                  {resultado.duplicados} duplicata{resultado.duplicados !== 1 ? "s" : ""} ignorada{resultado.duplicados !== 1 ? "s" : ""} (dedup fuzzy)
                  {resultado.detalhe_duplicados?.map((d, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground">{d.empresa}: {d.motivo}</div>
                  ))}
                </div>
              )}
              {hipoteseId && resultado.criados > 0 && (
                <div className="text-[10px] text-primary pl-6">↗ Hipótese ICP atualizada com +{resultado.criados} leads</div>
              )}
            </div>
          )}

          {erro && (
            <div className="card p-3 bg-destructive/5 border-destructive/20 flex items-start gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {leads.length === 0 ? (
            <div className="card p-8 text-center border-dashed">
              <Plus className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Nenhum lead na fila.</p>
              <p className="text-xs text-muted-foreground">Use um dos modos à esquerda para adicionar empresas.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {leadsFiltrados.map(lead => (
                <div
                  key={lead.site ?? Math.random()}
                  className={`card p-3 transition-all cursor-pointer ${lead._selecionado ? "border-primary/30 bg-primary/[0.02]" : "opacity-60"}`}
                  onClick={() => toggleSelecionado(lead.site)}
                >
                  <div className="flex items-start gap-2.5">
                    <BadgeSimilaridade score={lead._similaridade} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className={`w-4 h-4 rounded border-2 grid place-items-center shrink-0 transition-colors ${lead._selecionado ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                          {lead._selecionado && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <div className="text-sm font-medium text-foreground truncate">
                          {lead.empresa || lead.nome || lead.site}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {lead.cargo && `${lead.cargo} · `}{lead.cidade_uf || lead.segmento || "—"}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {lead.email    && <span className="text-[10px] bg-sky-500/10 text-sky-600 px-1.5 py-0.5 rounded">email</span>}
                        {lead.whatsapp && <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">WhatsApp</span>}
                        {lead.linkedin && <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">LinkedIn</span>}
                        <CompletudeBadge score={lead._completude} />
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); removerLead(lead.site); }} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {leadsFiltrados.length === 0 && leads.length > 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  Nenhum lead passa pelos filtros.{" "}
                  <button onClick={() => setFiltros({})} className="text-primary underline">Limpar filtros</button>
                </div>
              )}
            </div>
          )}

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
