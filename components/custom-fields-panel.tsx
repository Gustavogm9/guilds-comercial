"use client";

import { useEffect, useState, useTransition } from "react";
import { Tag, Edit2, X, Save, Loader2, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarCustomFieldsLead } from "@/app/(app)/vendas/pipeline/[id]/custom-fields-actions";

interface CustomField {
  id: number;
  chave: string;
  rotulo: string;
  tipo: "texto" | "numero" | "data" | "boolean" | "select" | "multi_select" | "url";
  opcoes: string[];
  obrigatorio: boolean;
  descricao: string | null;
}

/**
 * Painel de custom fields no detalhe lead/empresa.
 *
 * - Lista campos definidos pela org pra entidade
 * - Mostra valores atuais (de leads.custom_fields)
 * - Modo edição inline
 */
export default function CustomFieldsPanel({
  entidade,
  entidadeId,
  valoresIniciais,
}: {
  entidade: "lead" | "empresa";
  entidadeId: number;
  valoresIniciais: Record<string, any>;
}) {
  const [campos, setCampos] = useState<CustomField[]>([]);
  const [valores, setValores] = useState<Record<string, any>>(valoresIniciais ?? {});
  const [editando, setEditando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const sb = createClient();
    sb.from("custom_field_def")
      .select("id, chave, rotulo, tipo, opcoes, obrigatorio, descricao")
      .eq("entidade", entidade)
      .eq("ativo", true)
      .order("ordem")
      .then(({ data }) => {
        setCampos(((data ?? []) as any[]).map((c) => ({
          ...c,
          opcoes: c.opcoes ?? [],
        })));
      });
  }, [entidade]);

  function salvar() {
    if (entidade !== "lead") return;  // empresa edit não exposto agora
    startTransition(async () => {
      try {
        await salvarCustomFieldsLead(entidadeId, valores);
        setFeedback({ tipo: "ok", texto: "Campos salvos." });
        setEditando(false);
        setTimeout(() => setFeedback(null), 2500);
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  }

  function renderValor(c: CustomField) {
    const v = valores[c.chave];
    if (v == null || v === "") return <span className="text-muted-foreground/60 italic">—</span>;
    if (c.tipo === "boolean") return v ? "Sim" : "Não";
    if (c.tipo === "data") return new Date(v).toLocaleDateString("pt-BR");
    if (c.tipo === "url") return <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{v}</a>;
    if (c.tipo === "multi_select" && Array.isArray(v)) return v.join(", ");
    return String(v);
  }

  function renderInput(c: CustomField) {
    const v = valores[c.chave] ?? "";
    if (c.tipo === "texto") {
      return <input value={v} onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} className="input-base text-sm" />;
    }
    if (c.tipo === "numero") {
      return <input type="number" value={v} onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} className="input-base text-sm tabular-nums" />;
    }
    if (c.tipo === "data") {
      return <input type="date" value={v} onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} className="input-base text-sm" />;
    }
    if (c.tipo === "url") {
      return <input type="url" value={v} onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} className="input-base text-sm" />;
    }
    if (c.tipo === "boolean") {
      return (
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={!!v} onChange={(e) => setValores({ ...valores, [c.chave]: e.target.checked })} />
          Sim
        </label>
      );
    }
    if (c.tipo === "select") {
      return (
        <select value={v} onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })} className="input-base text-sm">
          <option value="">—</option>
          {c.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (c.tipo === "multi_select") {
      const current = Array.isArray(v) ? v : [];
      return (
        <div className="flex flex-wrap gap-1">
          {c.opcoes.map((o) => {
            const checked = current.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  const novo = checked ? current.filter((x: string) => x !== o) : [...current, o];
                  setValores({ ...valores, [c.chave]: novo });
                }}
                className={`text-xs px-2 py-0.5 rounded border ${
                  checked ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-secondary/40"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    return null;
  }

  if (campos.length === 0) return null;

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.12em] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Tag className="w-3 h-3" /> Campos customizados
        </h3>
        {entidade === "lead" && !editando && (
          <button onClick={() => setEditando(true)} className="btn-ghost text-xs">
            <Edit2 className="w-3 h-3" /> Editar
          </button>
        )}
      </div>

      {feedback && (
        <div role="alert" className={`p-2 rounded mb-3 text-xs flex items-center gap-1.5 ${
          feedback.tipo === "ok" ? "bg-success-500/10 border border-success-500/30 text-success-500" :
          "bg-destructive/10 border border-destructive/30 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {feedback.texto}
        </div>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {campos.map((c) => (
          <div key={c.id} className="flex flex-col">
            <dt className="text-xs text-muted-foreground flex items-center gap-1">
              {c.rotulo}
              {c.obrigatorio && <span className="text-destructive">*</span>}
            </dt>
            <dd className="mt-0.5">
              {editando ? renderInput(c) : <div className="text-sm">{renderValor(c)}</div>}
            </dd>
          </div>
        ))}
      </dl>

      {editando && (
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
          <button
            onClick={() => { setEditando(false); setValores(valoresIniciais ?? {}); }}
            disabled={pending}
            className="btn-ghost text-xs"
          >
            <X className="w-3 h-3" /> Cancelar
          </button>
          <button onClick={salvar} disabled={pending} className="btn-primary text-xs">
            {pending && <Loader2 className="w-3 h-3 animate-spin" />}
            <Save className="w-3 h-3" /> Salvar
          </button>
        </div>
      )}
    </section>
  );
}
