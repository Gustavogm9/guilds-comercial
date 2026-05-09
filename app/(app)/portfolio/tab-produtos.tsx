"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X, Loader2, Package, Tag, RefreshCw } from "lucide-react";
import { salvarProduto, deletarProduto } from "./actions";

const CATEGORIAS = ["SaaS", "Consultoria", "Serviço Avulso", "Produto Digital", "Assinatura", "Projeto", "Outro"];

type Produto = {
  id: number; nome: string; descricao?: string; categoria?: string;
  segmentos_alvo?: string[]; cargos_alvo?: string[];
  valor_base?: number; valor_max?: number; recorrente?: boolean; ativo?: boolean;
};

type Props = { produtos: Produto[] };

const EMPTY: Omit<Produto, "id"> = {
  nome: "", descricao: "", categoria: "", segmentos_alvo: [], cargos_alvo: [],
  valor_base: undefined, valor_max: undefined, recorrente: false, ativo: true,
};

export default function TabProdutos({ produtos: inicial }: Props) {
  const [produtos, setProdutos] = useState(inicial);
  const [form, setForm] = useState<Partial<Produto> | null>(null);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function abrirNovo() { setForm({ ...EMPTY }); setErro(null); }
  function abrirEditar(p: Produto) { setForm({ ...p }); setErro(null); }
  function fechar() { setForm(null); setErro(null); }

  function setField<K extends keyof Produto>(k: K, v: Produto[K]) {
    setForm(prev => prev ? { ...prev, [k]: v } : prev);
  }

  function setArrayField(k: "segmentos_alvo" | "cargos_alvo", raw: string) {
    setField(k, raw.split(",").map(s => s.trim()).filter(Boolean));
  }

  function salvar() {
    if (!form?.nome?.trim()) { setErro("Nome é obrigatório."); return; }
    start(async () => {
      const r = await salvarProduto(form as any);
      if (!r.ok) { setErro(r.erro ?? "Erro ao salvar."); return; }
      // Otimistic update
      if (form.id) {
        setProdutos(prev => prev.map(p => p.id === form.id ? { ...p, ...form } as Produto : p));
      } else {
        setProdutos(prev => [{ id: Date.now(), ...form } as Produto, ...prev]);
      }
      fechar();
    });
  }

  function excluir(id: number) {
    if (!confirm("Excluir este produto?")) return;
    start(async () => {
      await deletarProduto(id);
      setProdutos(prev => prev.filter(p => p.id !== id));
    });
  }

  return (
    <div className="space-y-4">
      {/* Header + botão novo */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            {produtos.length} produto{produtos.length !== 1 ? "s" : ""} cadastrado{produtos.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button onClick={abrirNovo} className="btn-primary gap-1.5">
          <Plus className="w-4 h-4" /> Novo produto
        </button>
      </div>

      {/* Form inline */}
      {form !== null && (
        <div className="card p-5 space-y-4 border-primary/30 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{form.id ? "Editar produto" : "Novo produto"}</span>
            <button onClick={fechar} className="text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>

          {erro && <div className="text-xs text-destructive">{erro}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome *</label>
              <input className="input-base" value={form.nome ?? ""} onChange={e => setField("nome", e.target.value)} placeholder="Ex: CRM Guilds Starter" />
            </div>
            <div>
              <label className="label">Categoria</label>
              <select className="input-base" value={form.categoria ?? ""} onChange={e => setField("categoria", e.target.value)}>
                <option value="">Selecionar…</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Descrição</label>
              <textarea className="input-base min-h-[70px] text-sm" value={form.descricao ?? ""} onChange={e => setField("descricao", e.target.value)} placeholder="O que este produto entrega?" />
            </div>
            <div>
              <label className="label">Segmentos-alvo <span className="text-muted-foreground font-normal">(separados por vírgula)</span></label>
              <input className="input-base" value={(form.segmentos_alvo ?? []).join(", ")} onChange={e => setArrayField("segmentos_alvo", e.target.value)} placeholder="Ex: Seguros, Imóveis, Saúde" />
            </div>
            <div>
              <label className="label">Cargos-alvo <span className="text-muted-foreground font-normal">(separados por vírgula)</span></label>
              <input className="input-base" value={(form.cargos_alvo ?? []).join(", ")} onChange={e => setArrayField("cargos_alvo", e.target.value)} placeholder="Ex: Proprietário, Diretor" />
            </div>
            <div>
              <label className="label">Valor base (R$)</label>
              <input type="number" className="input-base" value={form.valor_base ?? ""} onChange={e => setField("valor_base", Number(e.target.value) || undefined)} placeholder="0,00" />
            </div>
            <div>
              <label className="label">Valor máximo (R$)</label>
              <input type="number" className="input-base" value={form.valor_max ?? ""} onChange={e => setField("valor_max", Number(e.target.value) || undefined)} placeholder="0,00" />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-primary" checked={!!form.recorrente} onChange={e => setField("recorrente", e.target.checked)} />
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /> Recorrente (MRR)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-primary" checked={form.ativo !== false} onChange={e => setField("ativo", e.target.checked)} />
                Ativo
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={salvar} disabled={pending} className="btn-primary gap-1.5">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar
            </button>
            <button onClick={fechar} className="btn-ghost">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de produtos */}
      {produtos.length === 0 && !form ? (
        <div className="card p-10 text-center border-dashed">
          <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">Nenhum produto cadastrado</p>
          <p className="text-xs text-muted-foreground mb-4">Cadastre os produtos/serviços que você vende para enriquecer propostas e hipóteses ICP.</p>
          <button onClick={abrirNovo} className="btn-primary mx-auto gap-1.5">
            <Plus className="w-4 h-4" /> Cadastrar primeiro produto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {produtos.map(p => (
            <div key={p.id} className={`card p-4 space-y-2 ${!p.ativo ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm text-foreground">{p.nome}</div>
                  <div className="text-xs text-muted-foreground">{p.categoria ?? "Sem categoria"}{p.recorrente ? " · Recorrente" : ""}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => abrirEditar(p)} className="btn-ghost !p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => excluir(p.id)} className="btn-ghost !p-1.5 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {p.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{p.descricao}</p>}
              <div className="flex flex-wrap gap-1.5">
                {(p.segmentos_alvo ?? []).map(s => (
                  <span key={s} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{s}</span>
                ))}
                {p.valor_base && (
                  <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                    R$ {p.valor_base.toLocaleString("pt-BR")}
                    {p.valor_max ? ` – ${p.valor_max.toLocaleString("pt-BR")}` : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
