"use client";

import { useState } from "react";
import { Linkedin, Copy, Check, Sparkles, X, ExternalLink, Search } from "lucide-react";
import { gerarMensagemSdr } from "@/lib/ai/sdr-copilot";

/**
 * Helper de outreach LinkedIn — substitui necessidade de extensão Chrome.
 *
 * Fluxo:
 *   1. Vendedor cola URL do perfil LinkedIn do prospect (ou tem do enriquecimento)
 *   2. Sistema gera mensagem (300 chars max — limite InMail/connection)
 *   3. Vendedor copia + abre LinkedIn (botão deep-link)
 *   4. Cola no LinkedIn manualmente
 *
 * Não é automação (LinkedIn bane automation). É **copy/paste assistido**.
 * Mensagem é otimizada pra <300 chars + sem clichês + personalizada.
 */
export default function LinkedinOutreachHelper({
  leadId,
  leadNome,
  leadEmpresa,
  linkedinUrl,
  open,
  onClose,
}: {
  leadId: number;
  leadNome: string | null;
  leadEmpresa: string | null;
  linkedinUrl: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [linkedinUrlEdit, setLinkedinUrlEdit] = useState(linkedinUrl ?? "");
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (!open) return null;

  async function gerar() {
    setPending(true);
    setErro(null);
    try {
      const r = await gerarMensagemSdr({
        lead_id: leadId,
        canal: "linkedin",
        objetivo: "abertura",
        tom: "consultivo",
        instrucoes_extra: "Limite 300 caracteres. Não use o nome 'LinkedIn'. Fim com pergunta aberta.",
      });
      // Trunca em 300 chars se necessário (LinkedIn connection note limit)
      const msg = r.corpo.slice(0, 300);
      setMensagem(msg);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!mensagem) return;
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {/* ignore */}
  }

  function abrirLinkedinSearch() {
    // Se temos URL direta, abre. Senão, busca pelo nome+empresa
    if (linkedinUrlEdit) {
      window.open(linkedinUrlEdit, "_blank", "noopener,noreferrer");
    } else {
      const query = encodeURIComponent(`${leadNome ?? ""} ${leadEmpresa ?? ""}`.trim());
      window.open(`https://www.linkedin.com/search/results/people/?keywords=${query}`, "_blank", "noopener,noreferrer");
    }
  }

  const charCount = mensagem?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Linkedin className="w-4 h-4 text-primary" />
            LinkedIn outreach · {leadEmpresa ?? leadNome ?? `Lead #${leadId}`}
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">URL do perfil LinkedIn (opcional)</label>
            <input
              type="url"
              value={linkedinUrlEdit}
              onChange={(e) => setLinkedinUrlEdit(e.target.value)}
              placeholder="https://linkedin.com/in/usuario"
              className="input-base text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se não tiver, abrimos LinkedIn search por nome+empresa.
            </p>
          </div>

          {!mensagem ? (
            <button
              onClick={gerar}
              disabled={pending}
              className="btn-primary w-full text-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {pending ? "Gerando..." : "Gerar mensagem de conexão (300 chars)"}
            </button>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
                    Mensagem ({charCount}/300)
                  </div>
                  <button onClick={() => setMensagem(null)} className="btn-ghost text-xs">
                    <Sparkles className="w-3 h-3" /> Refazer
                  </button>
                </div>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value.slice(0, 300))}
                  rows={6}
                  className={`input-base text-sm ${charCount > 280 ? "border-warning-500/50" : ""}`}
                />
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button onClick={copy} className="btn-secondary text-sm w-full">
                  {copiado ? <Check className="w-3.5 h-3.5 text-success-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiado ? "Copiada!" : "1. Copiar mensagem"}
                </button>
                <button onClick={abrirLinkedinSearch} className="btn-primary text-sm w-full">
                  {linkedinUrlEdit ? <ExternalLink className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                  2. {linkedinUrlEdit ? "Abrir perfil LinkedIn" : "Buscar no LinkedIn"} (cola no campo de mensagem)
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground italic">
                LinkedIn não permite automação. Fluxo: copia → abre → cola no campo de "Mensagem com solicitação de conexão". 300 chars é o limite.
              </p>
            </>
          )}

          {erro && (
            <p role="alert" className="text-xs text-destructive">{erro}</p>
          )}
        </div>
      </div>
    </div>
  );
}
