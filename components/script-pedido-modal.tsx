"use client";
import { useEffect, useState, useTransition } from "react";
import { X, Copy, Check, Loader2, AlertCircle, MessageCircle, Mail } from "lucide-react";
import { gerarScriptPedidoIndicacao } from "@/app/(app)/growth/indicacoes/script-actions";

/**
 * Modal que mostra script personalizado de pedido de indicação pro vendedor.
 *
 * Gera 2 versões (curto pra WhatsApp, longo pra email) baseado em:
 *   - Nome / empresa / cargo / dor do lead
 *   - Último NPS (se promotor, mensagem mais direta)
 *
 * Sem IA externa — template estático parametrizado (cobre 80% do valor).
 *
 * Plugado em: FechamentoCelebrationModal, banner em /pipeline/[id],
 * e card de /hoje. Reutilizável onde fizer sentido.
 */
export default function ScriptPedidoModal({
  leadId,
  open,
  onClose,
}: {
  leadId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [script, setScript] = useState<Awaited<ReturnType<typeof gerarScriptPedidoIndicacao>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"curto" | "longo" | null>(null);

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setScript(null);
    startTransition(async () => {
      try {
        const r = await gerarScriptPedidoIndicacao(leadId);
        setScript(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }, [open, leadId]);

  async function copy(text: string, which: "curto" | "longo") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiado(which);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      setErro("Falha ao copiar.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" aria-hidden="true" />
            Script de pedido de indicação
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {pending && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" aria-hidden="true" />
              <p className="text-xs mt-2">Gerando script personalizado...</p>
            </div>
          )}

          {erro && (
            <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" aria-hidden="true" /> {erro}
            </div>
          )}

          {script && (
            <>
              {/* Versão curta */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground inline-flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" aria-hidden="true" /> Curto (WhatsApp)
                  </div>
                  <button
                    onClick={() => copy(script.script_curto, "curto")}
                    className="btn-ghost text-xs"
                    aria-label="Copiar script curto"
                  >
                    {copiado === "curto" ? (
                      <Check className="w-3 h-3 text-success-500" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3 h-3" aria-hidden="true" />
                    )}
                    {copiado === "curto" ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm whitespace-pre-wrap">
                  {script.script_curto}
                </div>
              </div>

              {/* Versão longa */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground inline-flex items-center gap-1">
                    <Mail className="w-3 h-3" aria-hidden="true" /> Longo (email)
                  </div>
                  <button
                    onClick={() => copy(script.script_longo, "longo")}
                    className="btn-ghost text-xs"
                    aria-label="Copiar script longo"
                  >
                    {copiado === "longo" ? (
                      <Check className="w-3 h-3 text-success-500" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3 h-3" aria-hidden="true" />
                    )}
                    {copiado === "longo" ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm whitespace-pre-wrap">
                  {script.script_longo}
                </div>
              </div>

              {/* Contexto usado */}
              {script.contexto_usado.length > 0 && (
                <div className="text-[11px] text-muted-foreground italic">
                  Personalizado usando: {script.contexto_usado.join(", ")}.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
