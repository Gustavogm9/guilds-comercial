"use client";

import { useState, useTransition } from "react";
import {
  Layers, Plus, Check, X, Loader2, Pencil, Trash2, RefreshCw,
  DollarSign, Package,
} from "lucide-react";
import { salvarVariacao, deletarVariacao } from "./actions-sprint10";

type Variacao = {
  id: number; produto_id: number; nome: string; descricao?: string;
  valor?: number; recorrente?: boolean; ativo?: boolean; ordem?: number;
};

type Props = { produtoId: number; variacoesIniciais: Variacao[]; nomeProduto: string };

const EMPTY = { nome: "", descricao: "", valor: undefined, recorrente: false, ativo: true };

export default function VariacoesManager({ produtoId, variacoesIniciais, nomeProduto }: Props) {
  const [variacoes, setVariacoes] = useState(variacoesIniciais);
  const [form, setForm] = useState<Partial<Variacao> | null>(null);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function abrir(v?: Variacao) { setForm(v ? { ...v } : { produto_id: produtoId, ...EMPTY }); setErro(null); }
  function fechar() { setForm(null); setErro(null); }
  function set<K extends keyof Variacao>(k: K, v: Variacao[K]) { setForm(p => p ? { ...p, [k]: v } : p); }

  function salvar() {
    if (!form?.nome?.trim()) { setErro("Nome é obrigatório."); return; }
    start(async () => {
      const r = await salvarVariacao({ ...form as any, produto_id: produtoId });
      if (!r.ok) { setErro(r.erro ?? "Erro."); return; }
      if (form.id) setVariacoes(p => p.map(v => v.id === form.id ? { ...v, ...form } as Variacao : v));
      else setVariacoes(p => [{ id: Date.now(), produto_id: produtoId, ...form } as Variacao, ...p]);
      fechar();
    });
  }

  function excluir(id: number) {
    if (!confirm("Remover esta variação?")) return;
    start(async () => {
      await deletarVariacao(id);
      setVariacoes(p => p.filter(v => v.id !== id));
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{variacoes.length} plano(s)/variação(ões)</div>
        <button onClick={() => abrir()} className="btn-primary !py-1 !px-2.5 text-xs gap-1">
          <Plus className="w-3.5 h-3.5" /> Adicionar plano
        </button>
      </div>

      {form && (
        <div className="card p-4 space-y-3 border-primary/25 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{form.id ? "Editar plano" : "Novo plano"}</span>
            <button onClick={fechar}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
          </div>
          {erro && <div className="text-xs text-destructive">{erro}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Nome *</label>
              <input className="input-base" value={form.nome ?? ""} onChange={e => set("nome", e.target.value)} placeholder='Ex: Starter, Pro, Enterprise' />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <input type="number" className="input-base" value={form.valor ?? ""} onChange={e => set("valor", Number(e.target.value) || undefined)} placeholder="0,00" />
            </div>
            <div className="flex items-end gap-3 pb-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input type="checkbox" className="accent-primary" checked={!!form.recorrente} onChange={e => set("recorrente", e.target.checked)} />
                <RefreshCw className="w-3 h-3 text-muted-foreground" /> MRR
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input type="checkbox" className="accent-primary" checked={form.ativo !== false} onChange={e => set("ativo", e.target.checked)} />
                Ativo
              </label>
            </div>
            <div className="col-span-2">
              <label className="label">Descrição do plano</label>
              <textarea className="input-base text-xs min-h-[56px]" value={form.descricao ?? ""} onChange={e => set("descricao", e.target.value)} placeholder="O que está incluso..." />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={salvar} disabled={pending} className="btn-primary !py-1 gap-1 text-xs">
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salvar
            </button>
            <button onClick={fechar} className="btn-ghost text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {variacoes.length === 0 && !form && (
        <div className="p-6 border border-dashed rounded-lg text-center">
          <Layers className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">Nenhuma variação/plano cadastrado.</p>
          <p className="text-[10px] text-muted-foreground">Adicione planos como Starter, Pro ou pacotes de serviço.</p>
        </div>
      )}

      <div className="space-y-2">
        {variacoes.map(v => (
          <div key={v.id} className={`flex items-center gap-3 p-3 rounded-lg border ${!v.ativo ? "opacity-50" : "border-border"}`}>
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{v.nome}</div>
              {v.descricao && <div className="text-xs text-muted-foreground line-clamp-1">{v.descricao}</div>}
            </div>
            {v.valor && (
              <div className="text-xs font-mono text-muted-foreground shrink-0">
                R$ {v.valor.toLocaleString("pt-BR")}{v.recorrente ? "/mês" : ""}
              </div>
            )}
            <div className="flex gap-1 shrink-0">
              <button onClick={() => abrir(v)} className="btn-ghost !p-1.5"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => excluir(v.id)} className="btn-ghost !p-1.5 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

