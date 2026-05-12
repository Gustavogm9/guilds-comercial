"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, Tag, Loader2, Check, AlertCircle, Trash2, Save,
} from "lucide-react";
import { criarCustomField, atualizarCustomField, removerCustomField } from "./actions";

type Entidade = "lead" | "empresa" | "expansao";
type Tipo = "texto" | "numero" | "data" | "boolean" | "select" | "multi_select" | "url";

interface Campo {
  id: number;
  entidade: Entidade;
  chave: string;
  rotulo: string;
  tipo: Tipo;
  opcoes: string[];
  obrigatorio: boolean;
  visivel_em_listagem: boolean;
  ordem: number;
  descricao: string | null;
}

const ENTIDADE_LABEL: Record<Entidade, string> = {
  lead: "Leads",
  empresa: "Empresas (prospecção)",
  expansao: "Expansões",
};

const TIPO_LABEL: Record<Tipo, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  boolean: "Sim/Não",
  select: "Lista única",
  multi_select: "Multi-seleção",
  url: "URL",
};

export default function CamposClient({ campos }: { campos: Campo[] }) {
  const router = useRouter();
  const [showNovo, setShowNovo] = useState(false);
  const [editando, setEditando] = useState<Campo | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Agrupa por entidade
  const grupos: Record<Entidade, Campo[]> = { lead: [], empresa: [], expansao: [] };
  for (const c of campos) grupos[c.entidade].push(c);

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNovo(true)} className="btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" /> Novo campo
        </button>
      </div>

      {feedback && (
        <div role="alert" className={`card p-3 mb-4 text-sm flex items-center gap-2 ${
          feedback.tipo === "ok" ? "border-success-500/30 bg-success-500/5 text-success-500" :
          "border-destructive/30 bg-destructive/5 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.texto}
        </div>
      )}

      {campos.length === 0 ? (
        <div className="card p-12 text-center">
          <Tag className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum campo customizado ainda.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(grupos) as Entidade[]).map((ent) => {
            const lista = grupos[ent];
            if (lista.length === 0) return null;
            return (
              <section key={ent}>
                <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
                  {ENTIDADE_LABEL[ent]} ({lista.length})
                </h2>
                <ul className="space-y-1.5">
                  {lista.map((c) => (
                    <li key={c.id} className="card p-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{c.rotulo}</span>
                          <code className="text-[11px] text-muted-foreground font-mono">{c.chave}</code>
                          <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/30">
                            {TIPO_LABEL[c.tipo]}
                          </span>
                          {c.obrigatorio && (
                            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-warning-500/10 text-warning-500 px-1.5 py-0.5 rounded border border-warning-500/30">
                              obrigatório
                            </span>
                          )}
                          {c.visivel_em_listagem && (
                            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-secondary text-muted-foreground px-1.5 py-0.5 rounded border border-border">
                              na listagem
                            </span>
                          )}
                        </div>
                        {(c.tipo === "select" || c.tipo === "multi_select") && c.opcoes.length > 0 && (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            Opções: {c.opcoes.join(" · ")}
                          </div>
                        )}
                        {c.descricao && (
                          <p className="text-xs text-muted-foreground/80 mt-0.5 italic">{c.descricao}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setEditando(c)} className="btn-ghost text-xs">Editar</button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Remover campo "${c.rotulo}"? Valores existentes ficam mas o campo some da UI.`)) return;
                            try {
                              await removerCustomField(c.id);
                              router.refresh();
                            } catch (e) {
                              setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
                            }
                          }}
                          className="btn-ghost text-xs text-muted-foreground hover:text-destructive"
                          aria-label="Remover"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {(showNovo || editando) && (
        <CampoEditorModal
          campo={editando}
          onClose={() => { setShowNovo(false); setEditando(null); }}
          onSucesso={(texto: string) => {
            setFeedback({ tipo: "ok", texto });
            setShowNovo(false);
            setEditando(null);
            router.refresh();
            setTimeout(() => setFeedback(null), 3000);
          }}
          onErro={(texto: string) => setFeedback({ tipo: "erro", texto })}
        />
      )}
    </>
  );
}

function CampoEditorModal({ campo, onClose, onSucesso, onErro }: any) {
  const editando = !!campo;
  const [entidade, setEntidade] = useState<Entidade>(campo?.entidade ?? "lead");
  const [chave, setChave] = useState(campo?.chave ?? "");
  const [rotulo, setRotulo] = useState(campo?.rotulo ?? "");
  const [tipo, setTipo] = useState<Tipo>(campo?.tipo ?? "texto");
  const [opcoesRaw, setOpcoesRaw] = useState((campo?.opcoes ?? []).join(", "));
  const [obrigatorio, setObrigatorio] = useState(campo?.obrigatorio ?? false);
  const [visivelListagem, setVisivelListagem] = useState(campo?.visivel_em_listagem ?? false);
  const [descricao, setDescricao] = useState(campo?.descricao ?? "");
  const [pending, startTransition] = useTransition();

  function salvar() {
    if (!editando && (!chave.trim() || !rotulo.trim())) {
      onErro("Chave e rótulo obrigatórios.");
      return;
    }
    if (!editando && !/^[a-z][a-z0-9_]{0,40}$/.test(chave.trim().toLowerCase())) {
      onErro("Chave inválida (letras minúsculas, números, underscore, começa com letra).");
      return;
    }
    const opcoes = opcoesRaw.split(",").map((o: string) => o.trim()).filter(Boolean);

    startTransition(async () => {
      try {
        if (editando) {
          await atualizarCustomField({
            id: campo.id,
            rotulo: rotulo || undefined,
            opcoes: (tipo === "select" || tipo === "multi_select") ? opcoes : undefined,
            obrigatorio,
            visivel_em_listagem: visivelListagem,
            descricao: descricao,
          });
          onSucesso("Campo atualizado.");
        } else {
          await criarCustomField({
            entidade,
            chave: chave.trim().toLowerCase(),
            rotulo: rotulo.trim(),
            tipo,
            opcoes: (tipo === "select" || tipo === "multi_select") ? opcoes : [],
            obrigatorio,
            visivel_em_listagem: visivelListagem,
            descricao: descricao || undefined,
          });
          onSucesso("Campo criado.");
        }
      } catch (e) {
        onErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm">{editando ? "Editar campo" : "Novo campo customizado"}</div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Aplica em</label>
            <select value={entidade} onChange={(e) => setEntidade(e.target.value as Entidade)} disabled={editando} className="input-base text-sm">
              <option value="lead">Leads</option>
              <option value="empresa">Empresas (prospecção)</option>
              <option value="expansao">Expansões</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Chave (interna)</label>
              <input
                value={chave}
                onChange={(e) => setChave(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                disabled={editando}
                placeholder="lead_score_interno"
                className="input-base text-sm font-mono"
                maxLength={40}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Rótulo (exibido)</label>
              <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Score interno" className="input-base text-sm" maxLength={80} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} disabled={editando} className="input-base text-sm">
              {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
          </div>
          {(tipo === "select" || tipo === "multi_select") && (
            <div>
              <label className="block text-xs font-medium mb-1">Opções (separadas por vírgula)</label>
              <input value={opcoesRaw} onChange={(e) => setOpcoesRaw(e.target.value)} placeholder="Alta, Média, Baixa" className="input-base text-sm" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Descrição (opcional)</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Pra que serve este campo..." className="input-base text-sm min-h-[60px]" />
          </div>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={obrigatorio} onChange={(e) => setObrigatorio(e.target.checked)} />
              Obrigatório
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm ml-4">
              <input type="checkbox" checked={visivelListagem} onChange={(e) => setVisivelListagem(e.target.checked)} />
              Mostrar na listagem
            </label>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={salvar} disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Save className="w-3.5 h-3.5" />
            {editando ? "Salvar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
