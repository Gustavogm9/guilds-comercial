"use client";
import { useEffect, useState, useTransition } from "react";
import { X, AlertCircle, Loader2, ListChecks, Check, MinusCircle, RotateCcw, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { marcarItemOnboarding, fecharChecklistManual } from "@/app/(app)/comunicacao/pos-venda/actions";
import type { OnboardingItem, OnboardingChecklist } from "@/lib/types";

/**
 * Modal pra editar items de um checklist de onboarding.
 *
 * Permite ao vendedor:
 *   - Marcar item como concluído
 *   - Marcar como pulado (com motivo)
 *   - Reabrir item já fechado
 *   - Fechar checklist inteiro manual
 *
 * Carrega lazy via supabase-js. Atualizações otimistas com rollback em erro.
 */
export default function OnboardingChecklistModal({
  checklistId,
  leadEmpresa,
  onClose,
}: {
  checklistId: number;
  leadEmpresa: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const sb = createClient();
    const [{ data: ck }, { data: itensData }] = await Promise.all([
      sb.from("onboarding_checklist").select("*").eq("id", checklistId).maybeSingle(),
      sb.from("onboarding_item").select("*").eq("checklist_id", checklistId).order("ordem", { ascending: true }),
    ]);
    setChecklist(ck as OnboardingChecklist);
    setItems((itensData ?? []) as OnboardingItem[]);
  }

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [checklistId]);

  function handleToggle(item: OnboardingItem, novoStatus: "pendente" | "concluido" | "pulado") {
    setErro(null);
    // Optimistic
    const original = items;
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, status: novoStatus } : i,
      ),
    );

    startTransition(async () => {
      try {
        await marcarItemOnboarding({
          item_id: item.id,
          status: novoStatus,
        });
        await reload();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
        setItems(original);
      }
    });
  }

  function handleFecharChecklist() {
    if (!confirm("Fechar checklist mesmo com items pendentes? Pode reabrir items individualmente depois.")) return;
    startTransition(async () => {
      try {
        await fecharChecklistManual(checklistId);
        onClose();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  const concluidos = items.filter((i) => i.status === "concluido").length;
  const pulados = items.filter((i) => i.status === "pulado").length;
  const pendentes = items.filter((i) => i.status === "pendente").length;
  const pct = items.length > 0 ? Math.round((concluidos / items.length) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Checklist de onboarding"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-semibold text-sm">Onboarding</div>
              {leadEmpresa && <div className="text-xs text-muted-foreground truncate">{leadEmpresa}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {checklist?.status === "em_andamento" && pendentes < items.length && (
              <button
                onClick={handleFecharChecklist}
                disabled={pending}
                className="btn-ghost text-xs text-muted-foreground"
                title="Fechar checklist (manual)"
              >
                Fechar checklist
              </button>
            )}
            <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {loading && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" aria-hidden="true" />
              <p className="text-xs mt-2">Carregando...</p>
            </div>
          )}

          {erro && (
            <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4" aria-hidden="true" /> {erro}
            </div>
          )}

          {!loading && checklist && (
            <>
              {/* Progresso */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">
                    {concluidos} de {items.length} concluído{items.length !== 1 ? "s" : ""}
                    {pulados > 0 && ` · ${pulados} pulado${pulados !== 1 ? "s" : ""}`}
                  </span>
                  <span className="font-semibold tabular-nums">{pct}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 80 ? "bg-success-500" :
                      pct >= 40 ? "bg-warning-500" :
                      "bg-primary"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {checklist.status === "concluido" && (
                  <div className="mt-2 text-[10px] uppercase tracking-[0.12em] font-semibold text-success-500 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" aria-hidden="true" /> Checklist concluído
                  </div>
                )}
              </div>

              {/* Items */}
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sem items neste checklist. Configure o template em /comunicacao/pos-venda → Templates.
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        item.status === "concluido" ? "border-success-500/30 bg-success-500/5" :
                        item.status === "pulado" ? "border-border bg-secondary/30 opacity-60" :
                        "border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          onClick={() =>
                            handleToggle(item, item.status === "concluido" ? "pendente" : "concluido")
                          }
                          disabled={pending}
                          aria-label={item.status === "concluido" ? "Reabrir item" : "Marcar como concluído"}
                          className={`shrink-0 w-5 h-5 rounded border transition-colors ${
                            item.status === "concluido"
                              ? "bg-success-500 border-success-500"
                              : "border-border hover:border-primary bg-card"
                          } grid place-items-center`}
                        >
                          {item.status === "concluido" && (
                            <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                          )}
                        </button>

                        {/* Texto */}
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${
                            item.status === "concluido" ? "line-through text-muted-foreground" :
                            "text-foreground"
                          }`}>
                            {item.titulo}
                          </div>
                          {item.descricao && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>
                          )}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                            {item.due_at && (
                              <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <Calendar className="w-3 h-3" aria-hidden="true" />
                                Vence {new Date(item.due_at).toLocaleDateString()}
                              </span>
                            )}
                            {item.responsavel_papel && (
                              <span className="text-[10px] uppercase tracking-[0.1em]">
                                {item.responsavel_papel}
                              </span>
                            )}
                            {item.status === "pulado" && (
                              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
                                pulado
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 shrink-0">
                          {item.status !== "pulado" && item.status !== "concluido" && (
                            <button
                              onClick={() => handleToggle(item, "pulado")}
                              disabled={pending}
                              className="btn-ghost text-[11px] text-muted-foreground"
                              title="Pular item"
                              aria-label="Pular"
                            >
                              <MinusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {(item.status === "concluido" || item.status === "pulado") && (
                            <button
                              onClick={() => handleToggle(item, "pendente")}
                              disabled={pending}
                              className="btn-ghost text-[11px] text-muted-foreground"
                              title="Reabrir"
                              aria-label="Reabrir"
                            >
                              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
