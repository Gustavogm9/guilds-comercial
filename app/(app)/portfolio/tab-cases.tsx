"use client";

import { useState, useTransition } from "react";
import { Plus, X, Check, Loader2, Briefcase, Star, ExternalLink, Trash2, Pencil } from "lucide-react";
import { salvarCase, deletarCase } from "./actions";

type Case = {
  id: number; titulo: string; produto_id?: number | null;
  produtos?: { nome: string } | null;
  cliente_nome?: string; cliente_segmento?: string;
  resultado?: string; resultado_metricas?: Record<string, string>;
  depoimento?: string; link_externo?: string;
  publico?: boolean; destaque?: boolean;
};

type Props = { cases: Case[]; produtos: { id: number; nome: string }[] };

const EMPTY = {
  titulo: "", produto_id: null as number | null, cliente_nome: "", cliente_segmento: "",
  resultado: "", depoimento: "", link_externo: "", publico: true, destaque: false,
  resultado_metricas: {} as Record<string, string>,
};

export default function TabCases({ cases: inicial, produtos }: Props) {
  const [cases, setCases] = useState(inicial);
  const [form, setForm] = useState<typeof EMPTY & { id?: number } | null>(null);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [novaMetricaKey, setNovaMetricaKey] = useState("");
  const [novaMetricaVal, setNovaMetricaVal] = useState("");

  function abrirNovo() { setForm({ ...EMPTY }); }
  function abrirEditar(c: Case) {
    setForm({ id: c.id, titulo: c.titulo, produto_id: c.produto_id ?? null,
      cliente_nome: c.cliente_nome ?? "", cliente_segmento: c.cliente_segmento ?? "",
      resultado: c.resultado ?? "", depoimento: c.depoimento ?? "",
      link_externo: c.link_externo ?? "", publico: c.publico ?? true,
      destaque: c.destaque ?? false, resultado_metricas: c.resultado_metricas ?? {},
    });
  }
  function fechar() { setForm(null); setErro(null); }

  function addMetrica() {
    if (!novaMetricaKey || !novaMetricaVal) return;
    setForm(prev => prev ? { ...prev, resultado_metricas: { ...prev.resultado_metricas, [novaMetricaKey]: novaMetricaVal } } : prev);
    setNovaMetricaKey(""); setNovaMetricaVal("");
  }

  function removerMetrica(k: string) {
    setForm(prev => {
      if (!prev) return prev;
      const { [k]: _, ...rest } = prev.resultado_metricas;
      return { ...prev, resultado_metricas: rest };
    });
  }

  function salvar() {
    if (!form?.titulo?.trim()) { setErro("Título é obrigatório."); return; }
    start(async () => {
      const r = await salvarCase(form as any);
      if (!r.ok) { setErro(r.erro ?? "Erro."); return; }
      if (form.id) {
        setCases(prev => prev.map(c => c.id === form!.id ? { ...c, ...form } as any : c));
      } else {
        setCases(prev => [{ id: Date.now(), ...form } as any, ...prev]);
      }
      fechar();
    });
  }

  function excluir(id: number) {
    if (!confirm("Excluir este case?")) return;
    start(async () => {
      await deletarCase(id);
      setCases(prev => prev.filter(c => c.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={abrirNovo} className="btn-primary gap-1.5">
          <Plus className="w-4 h-4" /> Novo case
        </button>
      </div>

      {/* Form */}
      {form && (
        <div className="card p-5 space-y-3 border-primary/30 animate-in fade-in">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">{form.id ? "Editar case" : "Novo case de sucesso"}</span>
            <button onClick={fechar}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {erro && <div className="text-xs text-destructive">{erro}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Título *</label>
              <input className="input-base" value={form.titulo} onChange={e => setForm(f => f ? { ...f, titulo: e.target.value } : f)} placeholder="Ex: +40% de conversão para corretora de seguros" />
            </div>
            <div>
              <label className="label">Produto</label>
              <select className="input-base" value={form.produto_id ?? ""} onChange={e => setForm(f => f ? { ...f, produto_id: e.target.value ? Number(e.target.value) : null } : f)}>
                <option value="">Sem produto</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cliente (pode ser anônimo)</label>
              <input className="input-base" value={form.cliente_nome} onChange={e => setForm(f => f ? { ...f, cliente_nome: e.target.value } : f)} placeholder="Ex: Corretora Seguros SP" />
            </div>
            <div>
              <label className="label">Segmento do cliente</label>
              <input className="input-base" value={form.cliente_segmento} onChange={e => setForm(f => f ? { ...f, cliente_segmento: e.target.value } : f)} placeholder="Ex: Seguros" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Resultado obtido</label>
              <textarea className="input-base min-h-[70px] text-sm" value={form.resultado} onChange={e => setForm(f => f ? { ...f, resultado: e.target.value } : f)} placeholder="Descreva o resultado que o cliente teve com seu produto/serviço…" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Depoimento do cliente</label>
              <textarea className="input-base min-h-[60px] text-sm" value={form.depoimento} onChange={e => setForm(f => f ? { ...f, depoimento: e.target.value } : f)} placeholder='"O resultado foi incrível…" — João, Proprietário' />
            </div>
            <div>
              <label className="label">Link externo</label>
              <input className="input-base" value={form.link_externo} onChange={e => setForm(f => f ? { ...f, link_externo: e.target.value } : f)} placeholder="https://..." />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-primary" checked={form.publico} onChange={e => setForm(f => f ? { ...f, publico: e.target.checked } : f)} />
                Visível para vendedores
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-primary" checked={form.destaque} onChange={e => setForm(f => f ? { ...f, destaque: e.target.checked } : f)} />
                <Star className="w-3.5 h-3.5 text-amber-500" /> Destaque
              </label>
            </div>

            {/* Métricas */}
            <div className="md:col-span-2">
              <label className="label mb-2">Métricas do resultado</label>
              {Object.entries(form.resultado_metricas).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-foreground w-32 truncate">{k}:</span>
                  <span className="text-xs text-muted-foreground flex-1">{v}</span>
                  <button onClick={() => removerMetrica(k)} className="text-destructive"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <input className="input-base !py-1 text-xs w-28" value={novaMetricaKey} onChange={e => setNovaMetricaKey(e.target.value)} placeholder="Métrica" />
                <input className="input-base !py-1 text-xs flex-1" value={novaMetricaVal} onChange={e => setNovaMetricaVal(e.target.value)} placeholder="Valor (ex: +30%)" />
                <button onClick={addMetrica} className="btn-secondary !py-1 !px-2 text-xs"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={salvar} disabled={pending} className="btn-primary gap-1.5">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
            </button>
            <button onClick={fechar} className="btn-ghost">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {cases.length === 0 && !form ? (
        <div className="card p-10 text-center border-dashed">
          <Briefcase className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-4">Nenhum case cadastrado ainda.</p>
          <button onClick={abrirNovo} className="btn-primary mx-auto gap-1.5"><Plus className="w-4 h-4" /> Adicionar primeiro case</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cases.map(c => (
            <div key={c.id} className={`card p-4 space-y-2 ${c.destaque ? "border-amber-500/30" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  {c.destaque && <Star className="w-3.5 h-3.5 text-amber-500 mb-0.5" />}
                  <div className="text-sm font-semibold leading-snug">{c.titulo}</div>
                  {c.cliente_nome && <div className="text-xs text-muted-foreground">{c.cliente_nome}{c.cliente_segmento ? ` · ${c.cliente_segmento}` : ""}</div>}
                  {c.produtos?.nome && <div className="text-[10px] text-primary mt-0.5">{c.produtos.nome}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {c.link_externo && <a href={c.link_externo} target="_blank" rel="noreferrer" className="btn-ghost !p-1.5"><ExternalLink className="w-3.5 h-3.5" /></a>}
                  <button onClick={() => abrirEditar(c)} className="btn-ghost !p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => excluir(c.id)} className="btn-ghost !p-1.5 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {c.resultado && <p className="text-xs text-muted-foreground line-clamp-2">{c.resultado}</p>}
              {c.depoimento && <p className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2 line-clamp-2">"{c.depoimento}"</p>}
              {Object.keys(c.resultado_metricas ?? {}).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(c.resultado_metricas!).map(([k, v]) => (
                    <span key={k} className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">{k}: {v}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
