"use client";

import { useState, useTransition } from "react";
import {
  FolderOpen, Plus, Pencil, Trash2, Check, X, Loader2,
  Star, Globe, Code2, ExternalLink, Tag,
} from "lucide-react";
import { salvarProjetoProprio } from "./actions-sprint10";

type Projeto = {
  id: number; titulo: string; produto_id?: number | null;
  resultado?: string; descricao?: string; tecnologias?: string[];
  data_conclusao?: string; link_externo?: string;
  publico?: boolean; destaque?: boolean;
  produtos?: { nome: string } | null;
};

type Produto = { id: number; nome: string };

type Props = { projetos: Projeto[]; produtos: Produto[] };

const EMPTY: Partial<Projeto> = {
  titulo: "", descricao: "", resultado: "", tecnologias: [],
  link_externo: "", publico: false, destaque: false,
};

export default function TabProjetos({ projetos: inicial, produtos }: Props) {
  const [projetos, setProjetos] = useState(inicial);
  const [form, setForm] = useState<Partial<Projeto> | null>(null);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function abrirNovo() { setForm({ ...EMPTY }); setErro(null); }
  function abrirEditar(p: Projeto) { setForm({ ...p, tecnologias: p.tecnologias ?? [] }); setErro(null); }
  function fechar() { setForm(null); setErro(null); }
  function set<K extends keyof Projeto>(k: K, v: Projeto[K]) { setForm(p => p ? { ...p, [k]: v } : p); }

  function salvar() {
    if (!form?.titulo?.trim()) { setErro("Título é obrigatório."); return; }
    start(async () => {
      const r = await salvarProjetoProprio({
        ...form as any,
        tecnologias: form?.tecnologias ?? [],
      });
      if (!r.ok) { setErro("Erro ao salvar."); return; }
      if (form.id) {
        setProjetos(prev => prev.map(p => p.id === form.id
          ? { ...p, ...form, produtos: produtos.find(pr => pr.id === form.produto_id) ? { nome: produtos.find(pr => pr.id === form.produto_id)!.nome } : p.produtos } as Projeto : p));
      } else {
        const prod = produtos.find(p => p.id === form.produto_id);
        setProjetos(prev => [{ id: Date.now(), ...form, produtos: prod ? { nome: prod.nome } : null } as Projeto, ...prev]);
      }
      fechar();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {projetos.length} projeto{projetos.length !== 1 ? "s" : ""} próprio{projetos.length !== 1 ? "s" : ""}
        </div>
        <button onClick={abrirNovo} className="btn-primary gap-1.5">
          <Plus className="w-4 h-4" /> Novo projeto
        </button>
      </div>

      {form !== null && (
        <div className="card p-5 space-y-4 border-primary/30 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{form.id ? "Editar projeto" : "Novo projeto próprio"}</span>
            <button onClick={fechar}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {erro && <div className="text-xs text-destructive">{erro}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="label">Título *</label>
              <input className="input-base" value={form.titulo ?? ""} onChange={e => set("titulo", e.target.value)} placeholder="Nome do projeto" />
            </div>
            <div>
              <label className="label">Produto relacionado</label>
              <select className="input-base" value={form.produto_id ?? ""} onChange={e => set("produto_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Nenhum</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Data de conclusão</label>
              <input type="date" className="input-base" value={form.data_conclusao ?? ""} onChange={e => set("data_conclusao", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Descrição</label>
              <textarea className="input-base min-h-[70px] text-sm" value={form.descricao ?? ""} onChange={e => set("descricao", e.target.value)} placeholder="Do que se trata o projeto?" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Resultado / Impacto</label>
              <textarea className="input-base min-h-[60px] text-sm" value={form.resultado ?? ""} onChange={e => set("resultado", e.target.value)} placeholder="Ex: Reduziu 40% do tempo de vendas, gerou R$120k em contratos…" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Tecnologias/Ferramentas <span className="text-muted-foreground font-normal">(separadas por vírgula)</span></label>
              <input className="input-base" value={(form.tecnologias ?? []).join(", ")} onChange={e => set("tecnologias", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="Next.js, Supabase, n8n, IA generativa…" />
            </div>
            <div>
              <label className="label">Link externo (opcional)</label>
              <input className="input-base" value={form.link_externo ?? ""} onChange={e => set("link_externo", e.target.value)} placeholder="https://..." />
            </div>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-primary" checked={!!form.publico} onChange={e => set("publico", e.target.checked)} />
                <Globe className="w-3.5 h-3.5 text-muted-foreground" /> Público
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="accent-primary" checked={!!form.destaque} onChange={e => set("destaque", e.target.checked)} />
                <Star className="w-3.5 h-3.5 text-muted-foreground" /> Destaque
              </label>
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

      {projetos.length === 0 && !form ? (
        <div className="card p-10 text-center border-dashed">
          <FolderOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">Nenhum projeto próprio cadastrado</p>
          <p className="text-xs text-muted-foreground mb-4">
            Cadastre os projetos da sua empresa para usar como demonstrações e portfolio de vendas.
          </p>
          <button onClick={abrirNovo} className="btn-primary mx-auto gap-1.5">
            <Plus className="w-4 h-4" /> Cadastrar primeiro projeto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {projetos.map(p => (
            <div key={p.id} className="card p-4 space-y-2 relative group">
              {p.destaque && <Star className="w-3.5 h-3.5 text-amber-400 absolute top-3 right-10" />}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{p.titulo}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    {p.produtos?.nome && <><Tag className="w-3 h-3" />{p.produtos.nome}</>}
                    {p.data_conclusao && <> · {new Date(p.data_conclusao).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</>}
                    {p.publico && <><Globe className="w-3 h-3 ml-1" />público</>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => abrirEditar(p)} className="btn-ghost !p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {p.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{p.descricao}</p>}
              {p.resultado && (
                <div className="text-xs bg-green-500/5 border border-green-500/20 rounded p-2 text-green-800">
                  <span className="font-medium">Resultado: </span>{p.resultado}
                </div>
              )}
              {p.tecnologias && p.tecnologias.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.tecnologias.map(t => (
                    <span key={t} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground flex items-center gap-0.5">
                      <Code2 className="w-2.5 h-2.5" />{t}
                    </span>
                  ))}
                </div>
              )}
              {p.link_externo && (
                <a href={p.link_externo} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                  <ExternalLink className="w-3 h-3" /> Ver projeto
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

