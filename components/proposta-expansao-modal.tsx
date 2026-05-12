"use client";
import { useEffect, useState, useTransition } from "react";
import { X, Copy, Check, Loader2, AlertCircle, FileText, Mail, MessageCircle, PhoneCall } from "lucide-react";
import { gerarPropostaExpansao } from "@/app/(app)/comunicacao/pos-venda/proposta-expansao-actions";
import { trackFlywheelEvent } from "@/lib/analytics/flywheel";

type Versao = "email" | "whatsapp" | "call";

/**
 * Modal de proposta de expansão personalizada.
 *
 * Gera 3 versões (email assunto+corpo, whatsapp curto, call script) baseado em:
 *   - Tipo da expansão (upsell, cross_sell, expansao_seats, renovacao, etc.)
 *   - Contexto do cliente (meses como cliente, NPS recente, dor original)
 *   - Valores configurados (potencial + mensal)
 *
 * Sem IA externa — template estático parametrizado (cobre 80% do valor).
 *
 * Plugado em: card de cada expansão na tab Expansões de /comunicacao/pos-venda.
 */
export default function PropostaExpansaoModal({
  expansaoId,
  open,
  onClose,
}: {
  expansaoId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [proposta, setProposta] = useState<Awaited<ReturnType<typeof gerarPropostaExpansao>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<Versao | null>(null);
  const [versao, setVersao] = useState<Versao>("email");

  useEffect(() => {
    if (!open || expansaoId == null) return;
    trackFlywheelEvent("proposta_expansao_aberta", { expansao_id: expansaoId }).catch(() => {});
    setErro(null);
    setProposta(null);
    setVersao("email");
    let cancelado = false;
    startTransition(async () => {
      try {
        const r = await gerarPropostaExpansao({ expansao_id: expansaoId });
        if (!cancelado) setProposta(r);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
    return () => { cancelado = true; };
  }, [open, expansaoId]);

  async function copy(text: string, which: Versao) {
    try {
      await navigator.clipboard.writeText(text);
      trackFlywheelEvent("proposta_expansao_copiada", { expansao_id: expansaoId, versao: which }).catch(() => {});
      setCopiado(which);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      setErro("Falha ao copiar.");
    }
  }

  if (!open) return null;

  const textoAtual: string =
    versao === "email"
      ? proposta
        ? `Assunto: ${proposta.email_assunto}\n\n${proposta.email_corpo}`
        : ""
      : versao === "whatsapp"
        ? proposta?.whatsapp ?? ""
        : proposta?.call_script ?? "";

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Template de proposta de expansão"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
            Template de proposta
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs por canal */}
        <div className="px-5 pt-3 border-b border-border flex items-center gap-1">
          <TabBtn ativo={versao === "email"} onClick={() => setVersao("email")} icon={<Mail className="w-3.5 h-3.5" />}>
            Email
          </TabBtn>
          <TabBtn ativo={versao === "whatsapp"} onClick={() => setVersao("whatsapp")} icon={<MessageCircle className="w-3.5 h-3.5" />}>
            WhatsApp
          </TabBtn>
          <TabBtn ativo={versao === "call"} onClick={() => setVersao("call")} icon={<PhoneCall className="w-3.5 h-3.5" />}>
            Roteiro de call
          </TabBtn>
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          {pending && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" aria-hidden="true" />
              <p className="text-xs mt-2">Gerando proposta personalizada...</p>
            </div>
          )}

          {erro && (
            <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" aria-hidden="true" /> {erro}
            </div>
          )}

          {proposta && (
            <>
              <div className="flex items-center justify-end">
                <button
                  onClick={() => copy(textoAtual, versao)}
                  className="btn-ghost text-xs"
                  aria-label="Copiar"
                >
                  {copiado === versao ? (
                    <Check className="w-3.5 h-3.5 text-success-500" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {copiado === versao ? "Copiado" : "Copiar"}
                </button>
              </div>

              {versao === "email" && (
                <>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
                      Assunto
                    </div>
                    <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm">
                      {proposta.email_assunto}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
                      Corpo do email
                    </div>
                    <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm whitespace-pre-wrap">
                      {proposta.email_corpo}
                    </div>
                  </div>
                </>
              )}

              {versao === "whatsapp" && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
                    Mensagem (curto)
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm whitespace-pre-wrap">
                    {proposta.whatsapp}
                  </div>
                </div>
              )}

              {versao === "call" && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-1.5">
                    Roteiro de call (5 min)
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm whitespace-pre-wrap font-mono">
                    {proposta.call_script}
                  </div>
                </div>
              )}

              {proposta.contexto_usado.length > 0 && (
                <div className="text-[11px] text-muted-foreground italic pt-2 border-t border-border">
                  Personalizado usando: {proposta.contexto_usado.join(", ")}.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  ativo, onClick, icon, children,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
        ativo
          ? "border-primary text-primary font-semibold"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
