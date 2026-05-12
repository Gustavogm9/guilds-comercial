"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Sparkles, Copy, Check, Loader2, AlertCircle, Send, Mail, MessageCircle, Linkedin as LinkedinIcon } from "lucide-react";
import { gerarMensagemSdr, marcarMensagemCopiada, marcarMensagemEnviada, type Objetivo, type Canal } from "@/lib/ai/sdr-copilot";

const OBJETIVOS: Array<{ value: Objetivo; label: string; descricao: string }> = [
  { value: "abertura", label: "Abertura (cold)", descricao: "Primeira mensagem pra lead novo" },
  { value: "follow_up_apos_silencio", label: "Follow-up", descricao: "Lead parou de responder" },
  { value: "reengajar_detrator", label: "Reengajar detrator", descricao: "Cliente NPS baixo — pedir feedback" },
  { value: "pedido_indicacao", label: "Pedir indicação", descricao: "Cliente fechado pode indicar" },
  { value: "reativacao_perdido", label: "Reativar perdido", descricao: "Lead caiu de etapa, tentar de volta" },
  { value: "expansao", label: "Propor expansão", descricao: "Upsell/cross-sell pra cliente atual" },
];

const CANAIS: Array<{ value: Canal; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { value: "email", label: "Email", Icon: Mail },
  { value: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { value: "linkedin", label: "LinkedIn", Icon: LinkedinIcon },
];

export default function AiSdrModal({
  leadId,
  leadEmpresa,
  open,
  onClose,
}: {
  leadId: number;
  leadEmpresa: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [canal, setCanal] = useState<Canal>("email");
  const [objetivo, setObjetivo] = useState<Objetivo>("abertura");
  const [tom, setTom] = useState<"formal" | "amigavel" | "consultivo">("consultivo");
  const [instrucoes, setInstrucoes] = useState("");
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof gerarMensagemSdr>> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"assunto" | "corpo" | "all" | null>(null);

  useEffect(() => {
    if (!open) {
      setResultado(null);
      setErro(null);
      setInstrucoes("");
    }
  }, [open]);

  if (!open) return null;

  function gerar() {
    setErro(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const r = await gerarMensagemSdr({ lead_id: leadId, canal, objetivo, tom, instrucoes_extra: instrucoes });
        setResultado(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  async function copiar(qual: "assunto" | "corpo" | "all") {
    if (!resultado) return;
    let texto = "";
    if (qual === "assunto") texto = resultado.assunto ?? "";
    else if (qual === "corpo") texto = resultado.corpo;
    else texto = (resultado.assunto ? `${resultado.assunto}\n\n` : "") + resultado.corpo;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 1500);
      // Marca como copiada no DB
      marcarMensagemCopiada(resultado.mensagem_id).catch(() => {});
    } catch {/* ignore */}
  }

  function marcarComoEnviada() {
    if (!resultado) return;
    marcarMensagemEnviada(resultado.mensagem_id).catch(() => {});
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AI SDR Copilot"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI SDR · {leadEmpresa ?? `Lead #${leadId}`}
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Setup */}
          {!resultado && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5">Canal</label>
                <div className="grid grid-cols-3 gap-2">
                  {CANAIS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      onClick={() => setCanal(value)}
                      className={`p-2.5 rounded-lg border text-sm flex items-center justify-center gap-1.5 ${
                        canal === value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border bg-card hover:bg-secondary/40"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5">Objetivo</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {OBJETIVOS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setObjetivo(o.value)}
                      className={`p-2.5 rounded-lg border text-left ${
                        objetivo === o.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-secondary/40"
                      }`}
                    >
                      <div className="text-xs font-medium">{o.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{o.descricao}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5">Tom</label>
                <select value={tom} onChange={(e) => setTom(e.target.value as any)} className="input-base text-sm">
                  <option value="consultivo">Consultivo (default)</option>
                  <option value="amigavel">Amigável (mais casual)</option>
                  <option value="formal">Formal</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5">Instruções extras (opcional)</label>
                <textarea
                  value={instrucoes}
                  onChange={(e) => setInstrucoes(e.target.value)}
                  placeholder="Ex.: mencione que nosso cliente Y do mesmo setor reduziu X% de custo"
                  className="input-base text-sm min-h-[60px]"
                  maxLength={500}
                />
              </div>

              {erro && (
                <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> {erro}
                </div>
              )}
            </>
          )}

          {/* Resultado */}
          {resultado && (
            <>
              {resultado.assunto && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Assunto</div>
                    <button onClick={() => copiar("assunto")} className="btn-ghost text-xs">
                      {copiado === "assunto" ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                      {copiado === "assunto" ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm">{resultado.assunto}</div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">Mensagem</div>
                  <button onClick={() => copiar("corpo")} className="btn-ghost text-xs">
                    {copiado === "corpo" ? <Check className="w-3 h-3 text-success-500" /> : <Copy className="w-3 h-3" />}
                    {copiado === "corpo" ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="rounded-lg bg-secondary/40 border border-border p-3 text-sm whitespace-pre-wrap">{resultado.corpo}</div>
              </div>
              <div className="text-[11px] text-muted-foreground italic">
                Personalizado usando: {resultado.contexto_usado.join(", ")}. Custo: ~{resultado.custo_tokens} tokens.
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          {!resultado ? (
            <>
              <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={gerar} disabled={pending} className="btn-primary text-sm">
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Sparkles className="w-3.5 h-3.5" />
                {pending ? "Gerando..." : "Gerar mensagem"}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setResultado(null)} className="btn-ghost text-sm">Gerar nova versão</button>
              <button onClick={() => copiar("all")} className="btn-secondary text-sm">
                <Copy className="w-3.5 h-3.5" /> Copiar tudo
              </button>
              <button onClick={marcarComoEnviada} className="btn-primary text-sm">
                <Send className="w-3.5 h-3.5" /> Marcar como enviada
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
