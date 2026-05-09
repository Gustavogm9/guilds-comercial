"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Clock, ChevronDown, ChevronUp, Check, X, RotateCcw } from "lucide-react";
import { criarTemplate, editarTemplate, deletarTemplate, restaurarVersaoTemplate, historicoTemplate } from "./actions";
import type { TemplateDB } from "./actions";
import type { CadenciaPasso, CadenciaCanal } from "@/lib/cadencia-templates";

// ─── Helpers ────────────────────────────────────────────────────────────────

const PASSOS: CadenciaPasso[] = ["D0","D3","D7","D11","D16","D30"];
const CANAIS: CadenciaCanal[] = ["Email","WhatsApp","Ligação"];

const PASSO_LABEL: Record<string, string> = {
  D0: "D0 — Primeiro contato",
  D3: "D3 — Follow-up 3 dias",
  D7: "D7 — Autoridade",
  D11: "D11 — Convite",
  D16: "D16 — Porta aberta",
  D30: "D30 — Retomada",
};

function TemplateBadge({ valor, cor }: { valor: string; cor: string }) {
  return (
    <span className={`text-[10px] uppercase tracking-[0.1em] font-semibold px-2 py-0.5 rounded border ${cor}`}>
      {valor}
    </span>
  );
}

// ─── Formulário de criação/edição ───────────────────────────────────────────

function TemplateForm({
  initial,
  onSave,
  onCancel,
  isNew,
}: {
  initial?: Partial<TemplateDB>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [passo, setPasso] = useState<CadenciaPasso>(initial?.passo ?? "D0");
  const [canal, setCanal] = useState<CadenciaCanal>(initial?.canal ?? "WhatsApp");
  const [objetivo, setObjetivo] = useState(initial?.objetivo ?? "");
  const [assunto, setAssunto] = useState(initial?.assunto ?? "");
  const [corpo, setCorpo] = useState(initial?.corpo ?? "");
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [segmento, setSegmento] = useState(initial?.segmento ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    start(async () => {
      try {
        await onSave({ passo, canal, objetivo, assunto: canal === "Email" ? assunto : undefined, corpo, nome, segmento: segmento || null });
      } catch (err: any) {
        setErro(err.message || "Erro inesperado.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-border/60 mt-3">
      {isNew && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1">Passo</label>
            <select className="input-base" value={passo} onChange={e => setPasso(e.target.value as CadenciaPasso)}>
              {PASSOS.map(p => <option key={p} value={p}>{PASSO_LABEL[p] ?? p}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1">Canal</label>
            <select className="input-base" value={canal} onChange={e => setCanal(e.target.value as CadenciaCanal)}>
              {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label mb-1">Nome do template <span className="text-muted-foreground font-normal normal-case">(opcional)</span></label>
          <input className="input-base" value={nome} onChange={e => setNome(e.target.value)} placeholder={`${passo} · ${canal}`} />
        </div>
        <div>
          <label className="label mb-1">Segmento <span className="text-muted-foreground font-normal normal-case">(vazio = genérico)</span></label>
          <input className="input-base" value={segmento} onChange={e => setSegmento(e.target.value)} placeholder="Ex: Seguros, Imóveis…" />
        </div>
      </div>
      <div>
        <label className="label mb-1">Objetivo</label>
        <input className="input-base" value={objetivo} onChange={e => setObjetivo(e.target.value)} placeholder="Ex: Contexto / dor" />
      </div>
      {canal === "Email" && (
        <div>
          <label className="label mb-1">Assunto do email</label>
          <input className="input-base" value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Ex: {{empresa}} — uma observação rápida" />
        </div>
      )}
      <div>
        <label className="label mb-1">
          Corpo da mensagem <span className="text-muted-foreground font-normal normal-case">— variáveis: {"{{nome}}"} {"{{empresa}}"} {"{{dor}}"} {"{{vendedor}}"}</span>
        </label>
        <textarea
          className="input-base min-h-[140px] font-mono text-xs"
          value={corpo}
          onChange={e => setCorpo(e.target.value)}
          placeholder="Olá {{nome}}, aqui é o {{vendedor}}…"
          required
        />
      </div>
      {erro && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">{erro}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm" disabled={pending}>Cancelar</button>
        <button type="submit" className="btn-primary text-sm" disabled={pending}>
          {pending ? "Salvando…" : isNew ? "Criar template" : "Salvar nova versão"}
        </button>
      </div>
    </form>
  );
}

// ─── Card de template ────────────────────────────────────────────────────────

function TemplateCard({ template, onRefresh }: { template: TemplateDB; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<TemplateDB[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await historicoTemplate(template.passo, template.canal, template.segmento);
      setHistory(data);
    } catch { /* ignora */ }
    finally { setLoadingHistory(false); }
  }

  function toggleHistory() {
    if (!showHistory) loadHistory();
    setShowHistory(v => !v);
  }

  function handleEdit(data: any) {
    return new Promise<void>((resolve, reject) => {
      start(async () => {
        try {
          await editarTemplate(template.id, data);
          setEditing(false);
          onRefresh();
          resolve();
        } catch (err: any) {
          reject(err);
        }
      });
    });
  }

  function handleDelete() {
    start(async () => {
      try {
        await deletarTemplate(template.passo, template.canal, template.segmento);
        onRefresh();
      } catch (err: any) {
        setErro(err.message);
      }
    });
  }

  function handleRestore(id: number) {
    start(async () => {
      try {
        await restaurarVersaoTemplate(id);
        onRefresh();
        await loadHistory();
      } catch (err: any) {
        setErro(err.message);
      }
    });
  }

  return (
    <div className="card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TemplateBadge valor={template.passo} cor="text-primary bg-primary/10 border-primary/20" />
            <TemplateBadge valor={template.canal} cor="text-muted-foreground bg-muted border-border" />
            {template.segmento && (
              <TemplateBadge valor={template.segmento} cor="text-amber-600 bg-amber-100/60 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/25" />
            )}
            <span className="text-[10px] text-muted-foreground">v{template.versao}</span>
          </div>
          <div className="text-sm font-medium text-foreground mt-1" style={{ letterSpacing: "-0.13px" }}>
            {template.nome || `${template.passo} · ${template.canal}`}
          </div>
          {template.objetivo && (
            <div className="text-xs text-muted-foreground">{template.objetivo}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleHistory}
            className="btn-ghost !p-1.5 text-muted-foreground"
            title="Histórico de versões"
            disabled={pending}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setEditing(v => !v); setConfirmDelete(false); }}
            className="btn-ghost !p-1.5 text-muted-foreground"
            title="Editar"
            disabled={pending}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {confirmDelete ? (
            <>
              <button onClick={handleDelete} className="btn-ghost !p-1.5 text-destructive" title="Confirmar exclusão" disabled={pending}>
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost !p-1.5" disabled={pending}>
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="btn-ghost !p-1.5 text-muted-foreground hover:text-destructive" title="Excluir" disabled={pending}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preview do corpo */}
      {!editing && (
        <pre className="text-xs text-muted-foreground bg-secondary/40 border border-border/40 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed max-h-28 overflow-y-auto">
          {template.corpo}
        </pre>
      )}

      {/* Formulário de edição */}
      {editing && (
        <TemplateForm
          initial={template}
          onSave={handleEdit}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Histórico de versões */}
      {showHistory && (
        <div className="mt-2 border-t border-border/50 pt-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Histórico de versões
          </div>
          {loadingHistory && <p className="text-xs text-muted-foreground">Carregando…</p>}
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.id} className={`flex items-center gap-2 p-2 rounded text-xs ${h.ativo ? "bg-primary/5 border border-primary/15" : "bg-muted/40 opacity-70"}`}>
                <span className="font-mono font-semibold w-8">v{h.versao}</span>
                <span className="flex-1 truncate text-muted-foreground">{h.nome || "—"}</span>
                {h.ativo ? (
                  <span className="text-success-500 font-medium">Ativa</span>
                ) : (
                  <button
                    onClick={() => handleRestore(h.id)}
                    className="btn-ghost !py-0.5 !px-1.5 text-[10px] text-primary"
                    disabled={pending}
                  >
                    <RotateCcw className="w-3 h-3 mr-0.5 inline" /> Restaurar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

// ─── Client principal ────────────────────────────────────────────────────────

export default function TemplatesClient({ initial }: { initial: TemplateDB[] }) {
  const [templates, setTemplates] = useState<TemplateDB[]>(initial);
  const [showNew, setShowNew] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // Re-renderização após mutações — em RSC, revalidatePath faz o work
  // mas aqui usamos refresh simples pra feedback imediato no cliente
  function handleRefresh() {
    setRefresh(v => v + 1);
    // Sem fetch local — RSC vai recarregar via revalidatePath no server action
  }

  async function handleCreate(data: any) {
    await criarTemplate(data);
    setShowNew(false);
    handleRefresh();
  }

  return (
    <div className="space-y-4">
      {/* Header + botão novo */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? "s" : ""} ativos · Editar cria nova versão automaticamente.
          </p>
        </div>
        <button onClick={() => setShowNew(v => !v)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          {showNew ? "Cancelar" : "Novo template"}
        </button>
      </div>

      {/* Formulário de criação */}
      {showNew && (
        <TemplateForm
          isNew
          onSave={handleCreate}
          onCancel={() => setShowNew(false)}
        />
      )}

      {/* Lista de templates */}
      {templates.length === 0 && !showNew && (
        <div className="card p-10 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Nenhum template personalizado ainda. Crie o primeiro ou aguarde — os templates padrão da biblioteca são usados como fallback.
          </p>
          <button onClick={() => setShowNew(true)} className="btn-secondary text-sm">
            <Plus className="w-4 h-4" /> Criar primeiro template
          </button>
        </div>
      )}

      {/* Agrupa por passo para melhor legibilidade */}
      {PASSOS.map(passo => {
        const dosPasso = templates.filter(t => t.passo === passo);
        if (dosPasso.length === 0) return null;
        return (
          <div key={passo}>
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
              {PASSO_LABEL[passo] ?? passo}
            </div>
            <div className="space-y-3">
              {dosPasso.map(t => (
                <TemplateCard key={`${t.id}-${refresh}`} template={t} onRefresh={handleRefresh} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
