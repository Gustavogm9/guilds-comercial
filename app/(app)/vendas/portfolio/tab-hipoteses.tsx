"use client";

/**
 * TabHipoteses — ICP Lab: gerencia hipóteses de ICP experimentais.
 *
 * O grande diferencial: ao invés de um único fingerprint ICP,
 * o vendedor pode criar múltiplos perfis hipotéticos e o sistema
 * rastreia qual converte melhor — ajudando a descobrir o PMF.
 *
 * Integração com o Motor:
 *   - Botão "Prospectar" → abre /prospeccao com hipotese_id pré-selecionada
 *   - Métricas: Leads / Propostas / Fechados / Conversão / Ticket Médio
 *   - Badge 🏆 para a hipótese com maior taxa de conversão
 */

import { useState, useTransition } from "react";
import {
  Target, Plus, Loader2, X, Check, Pencil, Trash2, Play, Pause,
  Trophy, TrendingUp, Users, FileText, CheckCircle, ArrowRight, Lightbulb,
} from "lucide-react";
import { salvarHipotese, atualizarStatusHipotese } from "./actions";
import Link from "next/link";

type Hipotese = {
  id: number; nome: string; descricao?: string;
  produto_id?: number | null; produtos?: { nome: string } | null;
  segmentos?: string[]; cidades?: string[]; cargos?: string[];
  canal_preferido?: string; cor?: string; status?: string;
  leads_prospectados?: number; leads_em_proposta?: number;
  leads_fechados?: number; receita_gerada?: number;
  taxa_conversao?: number; ticket_medio?: number;
};

type Props = { hipoteses: Hipotese[]; produtos: { id: number; nome: string }[] };

const COR_OPCOES = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#ef4444", "#06b6d4",
];

const EMPTY_FORM = {
  nome: "", descricao: "", produto_id: null as number | null,
  segmentos: [] as string[], cidades: [] as string[], cargos: [] as string[],
  canal_preferido: "", cor: "#6366f1",
};

export default function TabHipoteses({ hipoteses: inicial, produtos }: Props) {
  const [hipoteses, setHipoteses] = useState(inicial);
  const [form, setForm] = useState<typeof EMPTY_FORM & { id?: number } | null>(null);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  // Qual hipótese tem maior taxa de conversão
  const melhor = hipoteses
    .filter(h => h.leads_fechados! > 0)
    .sort((a, b) => (b.taxa_conversao ?? 0) - (a.taxa_conversao ?? 0))[0];

  function abrirNovo() { setForm({ ...EMPTY_FORM }); setErro(null); }
  function abrirEditar(h: Hipotese) {
    setForm({ id: h.id, nome: h.nome, descricao: h.descricao ?? "",
      produto_id: h.produto_id ?? null, segmentos: h.segmentos ?? [],
      cidades: h.cidades ?? [], cargos: h.cargos ?? [],
      canal_preferido: h.canal_preferido ?? "", cor: h.cor ?? "#6366f1",
    });
  }
  function fechar() { setForm(null); setErro(null); }

  function setField<K extends keyof typeof EMPTY_FORM>(k: K, v: any) {
    setForm(prev => prev ? { ...prev, [k]: v } : prev);
  }

  function salvar() {
    if (!form?.nome?.trim()) { setErro("Nome é obrigatório."); return; }
    start(async () => {
      const r = await salvarHipotese(form as any);
      if (!r.ok) { setErro(r.erro ?? "Erro."); return; }
      if (form.id) {
        setHipoteses(prev => prev.map(h => h.id === form!.id ? { ...h, ...form } as any : h));
      } else {
        setHipoteses(prev => [...prev, { id: Date.now(), ...form, leads_prospectados: 0, leads_em_proposta: 0, leads_fechados: 0, receita_gerada: 0 } as any]);
      }
      fechar();
    });
  }

  function alterarStatus(h: Hipotese, novo: "ativa" | "pausada" | "descartada" | "validada") {
    start(async () => {
      await atualizarStatusHipotese(h.id, novo);
      setHipoteses(prev => prev.map(x => x.id === h.id ? { ...x, status: novo } : x));
    });
  }

  const statusCor: Record<string, string> = {
    ativa:      "bg-green-500/10 text-green-600",
    pausada:    "bg-amber-500/10 text-amber-600",
    descartada: "bg-destructive/10 text-destructive",
    validada:   "bg-blue-500/10 text-blue-600",
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="card p-4 flex-1 bg-primary/[0.02] border-primary/20">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">O que é o ICP Lab?</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Crie hipóteses de clientes ideais (ex: <em>"Corretoras SP com Proprietário"</em>) e o motor prospecta cada uma separadamente.
            Rastreamos conversão por hipótese — você descobre qual perfil tem melhor PMF.
          </p>
        </div>
        <button onClick={abrirNovo} className="btn-primary shrink-0 gap-1.5">
          <Plus className="w-4 h-4" /> Nova hipótese
        </button>
      </div>

      {/* Form inline */}
      {form !== null && (
        <div className="card p-5 space-y-4 border-primary/30 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{form.id ? "Editar hipótese" : "Nova hipótese ICP"}</span>
            <button onClick={fechar}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {erro && <div className="text-xs text-destructive">{erro}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome da hipótese *</label>
              <input className="input-base" value={form.nome} onChange={e => setField("nome", e.target.value)} placeholder='Ex: "Corretoras interior SP"' />
            </div>
            <div>
              <label className="label">Produto associado</label>
              <select className="input-base" value={form.produto_id ?? ""} onChange={e => setField("produto_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Sem produto específico</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Descrição / hipótese</label>
              <textarea className="input-base min-h-[60px] text-sm" value={form.descricao} onChange={e => setField("descricao", e.target.value)} placeholder='Ex: "Acreditamos que proprietários de corretoras no interior de SP têm dor com CRM e fecham em 30 dias"' />
            </div>
            <div>
              <label className="label">Segmentos <span className="text-muted-foreground font-normal">(vírgula)</span></label>
              <input className="input-base" value={form.segmentos.join(", ")} onChange={e => setField("segmentos", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="Ex: Seguros, Imóveis" />
            </div>
            <div>
              <label className="label">Cidades/Regiões <span className="text-muted-foreground font-normal">(vírgula)</span></label>
              <input className="input-base" value={form.cidades.join(", ")} onChange={e => setField("cidades", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="Ex: Rio Preto/SP, SP capital" />
            </div>
            <div>
              <label className="label">Cargos-alvo <span className="text-muted-foreground font-normal">(vírgula)</span></label>
              <input className="input-base" value={form.cargos.join(", ")} onChange={e => setField("cargos", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="Ex: Proprietário, Sócio" />
            </div>
            <div>
              <label className="label">Canal preferido</label>
              <select className="input-base" value={form.canal_preferido} onChange={e => setField("canal_preferido", e.target.value)}>
                <option value="">Sem preferência</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Email">E-mail</option>
                <option value="Ligação">Ligação</option>
                <option value="Instagram">Instagram</option>
              </select>
            </div>
            <div>
              <label className="label">Cor da hipótese</label>
              <div className="flex gap-2">
                {COR_OPCOES.map(cor => (
                  <button
                    key={cor}
                    onClick={() => setField("cor", cor)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${form.cor === cor ? "scale-125 border-foreground" : "border-transparent"}`}
                    style={{ background: cor }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={salvar} disabled={pending} className="btn-primary gap-1.5">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar
            </button>
            <button onClick={fechar} className="btn-ghost">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de hipóteses */}
      {hipoteses.length === 0 && !form ? (
        <div className="card p-10 text-center border-dashed">
          <Target className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">Nenhuma hipótese cadastrada</p>
          <p className="text-xs text-muted-foreground mb-4">Crie sua primeira hipótese de ICP e o motor vai testar ela no mercado.</p>
          <button onClick={abrirNovo} className="btn-primary mx-auto gap-1.5"><Plus className="w-4 h-4" /> Criar hipótese</button>
        </div>
      ) : (
        <div className="space-y-3">
          {hipoteses.map(h => {
            const eMelhor = melhor?.id === h.id;
            const conv = h.taxa_conversao ?? (h.leads_prospectados! > 0 ? Math.round((h.leads_fechados! / h.leads_prospectados!) * 100) : 0);
            return (
              <div key={h.id} className={`card p-4 transition-all ${eMelhor ? "border-amber-500/30 bg-amber-500/[0.02]" : ""}`}>
                <div className="flex items-start gap-3">
                  {/* Cor + badge */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="w-3 h-3 rounded-full" style={{ background: h.cor ?? "#6366f1" }} />
                    {eMelhor && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{h.nome}</span>
                      {h.status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${statusCor[h.status] ?? "bg-secondary text-muted-foreground"}`}>
                          {h.status}
                        </span>
                      )}
                      {eMelhor && <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded font-bold">🏆 Melhor PMF</span>}
                    </div>
                    {h.descricao && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{h.descricao}</p>}
                    {h.produtos?.nome && <p className="text-[10px] text-primary mt-0.5">Produto: {h.produtos.nome}</p>}

                    {/* Métricas */}
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      {[
                        { icon: Users,       label: "Prospectados", val: h.leads_prospectados ?? 0 },
                        { icon: FileText,    label: "Propostas",    val: h.leads_em_proposta ?? 0 },
                        { icon: CheckCircle, label: "Fechados",     val: h.leads_fechados ?? 0 },
                        { icon: TrendingUp,  label: "Conversão",    val: `${conv}%` },
                      ].map(({ icon: Icon, label, val }) => (
                        <div key={label} className="text-center">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-0.5" />
                          <div className="text-xs font-bold text-foreground">{val}</div>
                          <div className="text-[10px] text-muted-foreground">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(h.segmentos ?? []).map(s => <span key={s} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">{s}</span>)}
                      {(h.cidades ?? []).map(c => <span key={c} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">{c}</span>)}
                      {(h.cargos ?? []).map(c => <span key={c} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">{c}</span>)}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Link
                      href={`/prospeccao?hipotese=${h.id}`}
                      className="btn-primary !py-1.5 !px-3 text-xs gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> Prospectar
                    </Link>
                    <div className="flex gap-1">
                      <button onClick={() => abrirEditar(h)} className="btn-ghost !p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                      {h.status === "ativa" ? (
                        <button onClick={() => alterarStatus(h, "pausada")} className="btn-ghost !p-1.5" title="Pausar"><Pause className="w-3.5 h-3.5" /></button>
                      ) : (
                        <button onClick={() => alterarStatus(h, "ativa")} className="btn-ghost !p-1.5" title="Ativar"><Play className="w-3.5 h-3.5" /></button>
                      )}
                      {h.status !== "validada" && (
                        <button onClick={() => alterarStatus(h, "validada")} className="btn-ghost !p-1.5 hover:text-green-600" title="Marcar como validada"><Check className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
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
