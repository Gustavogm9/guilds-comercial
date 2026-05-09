"use client";

/**
 * ProspeccaoHub — orquestrador principal do motor de prospecção.
 *
 * 2 modos:
 *   - "url":   vendedor cola um site → Firecrawl extrai o lead
 *   - "nicho": vendedor digita critérios → Tavily busca empresas
 *
 * Fluxo:
 *   1. Descoberta/Enriquecimento (API route)
 *   2. Revisão e seleção
 *   3. Ativação → POST /api/prospeccao/ativar
 */

import { useState } from "react";
import { Globe, Search, Zap, Check, ArrowRight, Loader2, AlertTriangle, CheckCircle2, X, Plus } from "lucide-react";
import TabEnriquecer from "./tab-enriquecer";
import TabBuscar from "./tab-buscar";
import type { EmpresaEnriquecida, EmpresaBuscada } from "@/lib/prospeccao";

type Modo = "url" | "nicho";

type LeadParaAtivar = EmpresaEnriquecida & {
  _selecionado: boolean;
  _job_id?: number;
};

type Props = {
  orgId: string;
  icp: { segmento?: string | null; cargo_decisor?: string | null } | null;
};

export default function ProspeccaoHub({ orgId, icp }: Props) {
  const [modo, setModo] = useState<Modo>("url");
  const [leads, setLeads] = useState<LeadParaAtivar[]>([]);
  const [ativando, setAtivando] = useState(false);
  const [resultado, setResultado] = useState<{ criados: number; ignorados: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function adicionarLead(empresa: EmpresaEnriquecida, jobId?: number) {
    setLeads(prev => {
      // Evita duplicata por site
      if (prev.some(l => l.site === empresa.site)) return prev;
      return [...prev, { ...empresa, _selecionado: true, _job_id: jobId }];
    });
  }

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
      // Remove leads ativados da fila
      const sitesAtivados = new Set(selecionados.map(l => l.site));
      setLeads(prev => prev.filter(l => !sitesAtivados.has(l.site)));
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setAtivando(false);
    }
  }

  const selecionados = leads.filter(l => l._selecionado).length;

  return (
    <div className="space-y-6">
      {/* Seletor de modo */}
      <div className="flex gap-2 p-1 bg-secondary/40 rounded-xl w-fit">
        {([
          { key: "url",   icon: Globe,   label: "Enriquecer por Site" },
          { key: "nicho", icon: Search,  label: "Buscar por Nicho" },
        ] as { key: Modo; icon: typeof Globe; label: string }[]).map(({ key, icon: Icon, label }) => (
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
          </button>
        ))}
      </div>

      {/* Conteúdo do modo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {modo === "url" && (
            <TabEnriquecer onEmpresaEnriquecida={adicionarLead} icp={icp} />
          )}
          {modo === "nicho" && (
            <TabBuscar onEmpresaEnriquecida={adicionarLead} icp={icp} />
          )}
        </div>

        {/* Painel de leads coletados */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground" style={{ letterSpacing: "-0.13px" }}>
              Fila de ativação
              {leads.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {selecionados}/{leads.length} selecionados
                </span>
              )}
            </h3>
            {leads.length > 0 && (
              <button
                onClick={() => setLeads([])}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Limpar tudo
              </button>
            )}
          </div>

          {/* Resultado de ativação */}
          {resultado && (
            <div className="card p-3 bg-success-500/5 border-success-500/20 flex items-center gap-3 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" />
              <div>
                <div className="text-sm font-semibold">{resultado.criados} lead{resultado.criados !== 1 ? "s" : ""} adicionado{resultado.criados !== 1 ? "s" : ""} à base!</div>
                {resultado.ignorados > 0 && (
                  <div className="text-xs text-muted-foreground">{resultado.ignorados} ignorado{resultado.ignorados !== 1 ? "s" : ""} (já existiam)</div>
                )}
              </div>
              <button onClick={() => setResultado(null)} className="ml-auto text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="card p-3 bg-destructive/5 border-destructive/20 flex items-start gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {/* Lista de leads */}
          {leads.length === 0 ? (
            <div className="card p-8 text-center border-dashed">
              <Plus className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Enriqueça um site ou busque por nicho para adicionar leads aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {leads.map(lead => (
                <div
                  key={lead.site}
                  className={`card p-3 transition-all cursor-pointer ${
                    lead._selecionado
                      ? "border-primary/30 bg-primary/3"
                      : "opacity-60"
                  }`}
                  onClick={() => toggleSelecionado(lead.site)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-5 h-5 rounded border-2 grid place-items-center shrink-0 mt-0.5 transition-colors ${
                      lead._selecionado ? "bg-primary border-primary" : "border-muted-foreground/40"
                    }`}>
                      {lead._selecionado && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {lead.empresa || lead.nome || lead.site}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {lead.cargo && `${lead.cargo} · `}
                        {lead.cidade_uf || lead.segmento || "—"}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {lead.email && <span className="text-[10px] bg-sky-500/10 text-sky-600 px-1.5 py-0.5 rounded">email</span>}
                        {lead.whatsapp && <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">WhatsApp</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          lead._confianca === "alta" ? "bg-green-500/10 text-green-600" :
                          lead._confianca === "media" ? "bg-amber-500/10 text-amber-600" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {lead._confianca === "alta" ? "✓ Alta confiança" :
                           lead._confianca === "media" ? "~ Média" : "? Baixa"}
                        </span>
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
            </div>
          )}

          {/* Botões de ativação */}
          {selecionados > 0 && (
            <div className="space-y-2 pt-2">
              <button
                onClick={() => ativar(false)}
                disabled={ativando}
                className="btn-secondary w-full text-sm justify-center"
              >
                {ativando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Adicionar {selecionados} lead{selecionados !== 1 ? "s" : ""} à base
              </button>
              <button
                onClick={() => ativar(true)}
                disabled={ativando}
                className="btn-primary w-full text-sm justify-center"
              >
                {ativando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Adicionar + iniciar cadência D0
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
