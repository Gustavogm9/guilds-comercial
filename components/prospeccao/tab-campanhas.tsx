"use client";

/**
 * TabCampanhas — gerencia campanhas automáticas de prospecção em lote.
 *
 * Uma campanha = instrução para o motor buscar N leads automaticamente
 * com base em uma hipótese ICP ou no fingerprint geral, sem intervenção manual.
 *
 * Fluxo:
 *   1. Criar campanha (nome + hipótese + configuração)
 *   2. Executar → motor roda Tavily, dedup e ativa leads
 *   3. Histórico com métricas (encontrados/criados/duplicados/custo)
 */

import { useState, useTransition } from "react";
import {
  Rocket, Plus, Loader2, X, Check, Play, RotateCcw,
  Target, Package, Zap, AlertTriangle, CheckCircle2,
  TrendingUp, Users, Copy, Clock,
} from "lucide-react";

type Campanha = {
  id: number; nome: string; status: string;
  hipotese_id?: number | null; produto_id?: number | null;
  configuracao: {
    max_leads?: number; regioes?: string[]; segmentos?: string[];
    max_queries?: number; iniciar_cadencia?: boolean;
  };
  leads_encontrados: number; leads_criados: number; leads_duplicados: number;
  custo_estimado_usd?: number; erro_detalhes?: string;
  iniciada_em?: string; concluida_em?: string; created_at: string;
  icp_hipoteses?: { nome: string; cor?: string; taxa_conversao?: number } | null;
  produtos?: { nome: string } | null;
};

type Props = {
  hipoteses: { id: number; nome: string; cor?: string; segmentos?: string[]; cidades?: string[]; cargos?: string[] }[];
  produtos: { id: number; nome: string }[];
};

const EMPTY_CFG = {
  nome: "",
  hipotese_id: null as number | null,
  produto_id: null as number | null,
  max_leads: 15,
  max_queries: 3,
  regioes: [] as string[],
  segmentos: [] as string[],
  iniciar_cadencia: false,
};

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  aguardando: { label: "Aguardando", cls: "bg-secondary text-muted-foreground" },
  rodando:    { label: "⚡ Rodando…", cls: "bg-amber-500/10 text-amber-600 animate-pulse" },
  concluida:  { label: "✓ Concluída", cls: "bg-green-500/10 text-green-600" },
  erro:       { label: "✗ Erro", cls: "bg-destructive/10 text-destructive" },
};

export default function TabCampanhas({ hipoteses, produtos }: Props) {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_CFG | null>(null);
  const [pending, start] = useTransition();
  const [executando, setExecutando] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  // Carrega campanhas ao abrir a aba
  if (!carregado) {
    setCarregado(true);
    fetch("/api/prospeccao/campanhas")
      .then(r => r.json())
      .then(d => d.campanhas && setCampanhas(d.campanhas))
      .catch(() => null);
  }

  function salvarCampanha() {
    if (!form?.nome?.trim()) { setErro("Nome é obrigatório."); return; }
    setErro(null);
    start(async () => {
      try {
        const res = await fetch("/api/prospeccao/campanhas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.nome,
            hipotese_id: form.hipotese_id ?? null,
            produto_id: form.produto_id ?? null,
            configuracao: {
              max_leads: form.max_leads,
              max_queries: form.max_queries,
              regioes: form.regioes,
              segmentos: form.segmentos,
              iniciar_cadencia: form.iniciar_cadencia,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro);
        // Recarrega lista
        const lista = await fetch("/api/prospeccao/campanhas").then(r => r.json());
        if (lista.campanhas) setCampanhas(lista.campanhas);
        setForm(null);
      } catch (err: any) {
        setErro(err.message);
      }
    });
  }

  async function executarCampanha(campanha: Campanha) {
    if (executando.has(campanha.id)) return;
    setExecutando(prev => new Set([...prev, campanha.id]));
    setCampanhas(prev => prev.map(c => c.id === campanha.id ? { ...c, status: "rodando" } : c));
    try {
      const res = await fetch(`/api/prospeccao/campanhas/${campanha.id}/executar`, { method: "POST" });
      const data = await res.json();
      setCampanhas(prev => prev.map(c => c.id === campanha.id
        ? { ...c, status: res.ok ? "concluida" : "erro", leads_criados: data.criados ?? 0,
            leads_encontrados: data.encontrados ?? 0, leads_duplicados: data.duplicados ?? 0,
            custo_estimado_usd: data.custo_usd, erro_detalhes: data.erro }
        : c));
    } catch {
      setCampanhas(prev => prev.map(c => c.id === campanha.id ? { ...c, status: "erro" } : c));
    } finally {
      setExecutando(prev => { const s = new Set(prev); s.delete(campanha.id); return s; });
    }
  }

  // Pré-preenche segmentos/regiões da hipótese selecionada
  function selecionarHipotese(hipId: number | null) {
    if (!hipId) { setForm(f => f ? { ...f, hipotese_id: null, segmentos: [], regioes: [] } : f); return; }
    const hip = hipoteses.find(h => h.id === hipId);
    setForm(f => f ? {
      ...f, hipotese_id: hipId,
      segmentos: hip?.segmentos ?? [],
      regioes: hip?.cidades?.flatMap(c => c.match(/\b([A-Z]{2})\b/g) ?? []) ?? [],
    } : f);
  }

  return (
    <div className="space-y-5">
      {/* Info card */}
      <div className="card p-4 flex items-start gap-3 bg-primary/[0.02] border-primary/15">
        <Rocket className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold mb-1">Campanhas automáticas de prospecção</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Defina uma campanha com critérios de hipótese ICP e o motor executa a prospecção em lote:
            busca Tavily → deduplicação → ativação na base → cadência D0 (opcional).
            Perfeito para alimentar o pipeline sem esforço manual.
          </p>
        </div>
        <button onClick={() => { setForm({ ...EMPTY_CFG }); setErro(null); }} className="btn-primary shrink-0 gap-1.5 !py-1.5 !px-3 text-sm">
          <Plus className="w-3.5 h-3.5" /> Nova
        </button>
      </div>

      {/* Form de criação */}
      {form && (
        <div className="card p-5 space-y-4 border-primary/25 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Nova campanha</span>
            <button onClick={() => setForm(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {erro && <div className="text-xs text-destructive">{erro}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome da campanha *</label>
              <input className="input-base" value={form.nome} onChange={e => setForm(f => f ? { ...f, nome: e.target.value } : f)} placeholder='Ex: "Corretoras SP — Maio/26"' />
            </div>
            <div>
              <label className="label">Hipótese ICP</label>
              <select className="input-base" value={form.hipotese_id ?? ""} onChange={e => selecionarHipotese(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Fingerprint geral (clientes ganhos)</option>
                {hipoteses.map(h => <option key={h.id} value={h.id}>{h.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Produto associado</label>
              <select className="input-base" value={form.produto_id ?? ""} onChange={e => setForm(f => f ? { ...f, produto_id: e.target.value ? Number(e.target.value) : null } : f)}>
                <option value="">Sem produto</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Segmentos extras <span className="text-muted-foreground font-normal">(vírgula)</span></label>
              <input className="input-base" value={form.segmentos.join(", ")} onChange={e => setForm(f => f ? { ...f, segmentos: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : f)} placeholder="Pré-preenchido da hipótese" />
            </div>
            <div>
              <label className="label">Regiões / UF extras <span className="text-muted-foreground font-normal">(vírgula)</span></label>
              <input className="input-base" value={form.regioes.join(", ")} onChange={e => setForm(f => f ? { ...f, regioes: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : f)} placeholder="Ex: SP, MG" />
            </div>
            <div>
              <label className="label">Máximo de leads <span className="text-primary font-bold">{form.max_leads}</span></label>
              <input type="range" min={5} max={50} step={5} value={form.max_leads} onChange={e => setForm(f => f ? { ...f, max_leads: Number(e.target.value) } : f)} className="w-full accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground"><span>5</span><span>50</span></div>
            </div>
            <div>
              <label className="label">Profundidade <span className="text-primary font-bold">{form.max_queries} queries</span></label>
              <input type="range" min={1} max={8} value={form.max_queries} onChange={e => setForm(f => f ? { ...f, max_queries: Number(e.target.value) } : f)} className="w-full accent-primary" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-primary" checked={form.iniciar_cadencia} onChange={e => setForm(f => f ? { ...f, iniciar_cadencia: e.target.checked } : f)} />
                <Zap className="w-3.5 h-3.5 text-primary" /> Iniciar cadência D0 automaticamente
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={salvarCampanha} disabled={pending} className="btn-primary gap-1.5">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Criar campanha
            </button>
            <button onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de campanhas */}
      {campanhas.length === 0 ? (
        <div className="card p-10 text-center border-dashed">
          <Rocket className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">Nenhuma campanha criada</p>
          <p className="text-xs text-muted-foreground">Crie sua primeira campanha para prospectar em lote com 1 clique.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campanhas.map(c => {
            const rodando = executando.has(c.id) || c.status === "rodando";
            const { label: sLabel, cls: sCls } = STATUS_STYLE[c.status] ?? STATUS_STYLE.aguardando;
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-foreground">{c.nome}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sCls}`}>{sLabel}</span>
                    </div>

                    {/* Hipótese + produto */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                      {c.icp_hipoteses && (
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" /> {c.icp_hipoteses.nome}
                        </span>
                      )}
                      {c.produtos && (
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" /> {c.produtos.nome}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> Alvo: {c.configuracao.max_leads ?? 10} leads
                      </span>
                    </div>

                    {/* Métricas se executada */}
                    {c.status === "concluida" && (
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {[
                          { label: "Encontrados", val: c.leads_encontrados, cls: "" },
                          { label: "Criados",     val: c.leads_criados,    cls: "text-green-600 font-bold" },
                          { label: "Duplicatas",  val: c.leads_duplicados, cls: "text-muted-foreground" },
                        ].map(({ label, val, cls }) => (
                          <div key={label} className="text-center">
                            <div className={`text-lg font-bold leading-none ${cls}`}>{val}</div>
                            <div className="text-[10px] text-muted-foreground">{label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Custo e tempo */}
                    {c.status === "concluida" && (
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {c.custo_estimado_usd && (
                          <span>Custo: ~${c.custo_estimado_usd.toFixed(4)} USD</span>
                        )}
                        {c.concluida_em && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(c.concluida_em).toLocaleString("pt-BR")}
                          </span>
                        )}
                        {c.configuracao.iniciar_cadencia && (
                          <span className="text-primary flex items-center gap-1"><Zap className="w-3 h-3" /> Cadência iniciada</span>
                        )}
                      </div>
                    )}

                    {/* Erro */}
                    {c.status === "erro" && c.erro_detalhes && (
                      <div className="text-xs text-destructive mt-1 flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {c.erro_detalhes}
                      </div>
                    )}
                  </div>

                  {/* Ação */}
                  <div className="shrink-0">
                    {(c.status === "aguardando" || c.status === "erro" || c.status === "concluida") && (
                      <button
                        onClick={() => executarCampanha(c)}
                        disabled={rodando}
                        className="btn-primary !py-1.5 !px-3 text-xs gap-1.5"
                      >
                        {rodando
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rodando…</>
                          : c.status === "concluida"
                          ? <><RotateCcw className="w-3.5 h-3.5" /> Re-executar</>
                          : <><Play className="w-3.5 h-3.5" /> Executar</>
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
