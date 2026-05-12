"use client";
import { useEffect, useState, useTransition } from "react";
import { Link2, Copy, Check, X, RefreshCw, Loader2, AlertCircle, Send } from "lucide-react";
import {
  gerarTokenEmbaixador, revogarTokenEmbaixador, atualizarMensagemToken,
} from "@/app/(app)/growth/indicacoes/token-actions";
import type { EmbaixadorToken } from "@/lib/types";

/**
 * Componente reutilizável pra gerar/copiar/revogar token de portal embaixador.
 * Usado em /indicacoes (tab Top Embaixadores) com 1 botão por linha.
 *
 * Estados:
 *   - sem token: botão "Gerar link"
 *   - com token: mostra URL, botão Copiar, link "Editar mensagem", "Revogar"
 *   - revelar token "novo" só uma vez no momento da geração (alerta visual)
 */
export default function EmbaixadorTokenManager({
  leadId,
  empresaLead,
  tokenAtual,
  baseUrl,
}: {
  leadId: number;
  empresaLead: string | null;
  tokenAtual: EmbaixadorToken | null;
  baseUrl: string; // "https://crm.guilds.com.br"
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [editandoMsg, setEditandoMsg] = useState(false);
  const [mensagem, setMensagem] = useState(tokenAtual?.mensagem_personalizada ?? "");

  useEffect(() => {
    setMensagem(tokenAtual?.mensagem_personalizada ?? "");
  }, [tokenAtual?.mensagem_personalizada]);

  const tokenAtivo = tokenAtual?.token ?? tokenNovo;
  const url = tokenAtivo ? `${baseUrl}/indicar/${tokenAtivo}` : null;

  function handleGerar() {
    setErro(null);
    setTokenNovo(null);
    startTransition(async () => {
      try {
        const r = await gerarTokenEmbaixador({
          lead_id: leadId,
          mensagem_personalizada: mensagem || undefined,
        });
        setTokenNovo(r.token);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao gerar.");
      }
    });
  }

  function handleRevogar() {
    if (!tokenAtual) return;
    if (!confirm("Revogar o link? Quem já tem o link não consegue mais indicar.")) return;
    setErro(null);
    startTransition(async () => {
      try {
        await revogarTokenEmbaixador(tokenAtual.id);
        setTokenNovo(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao revogar.");
      }
    });
  }

  function handleSalvarMensagem() {
    if (!tokenAtual) return;
    startTransition(async () => {
      try {
        await atualizarMensagemToken({
          token_id: tokenAtual.id,
          mensagem_personalizada: mensagem,
        });
        setEditandoMsg(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch (e) {
      setErro("Falha ao copiar — copie manual.");
    }
  }

  function compartilharWhatsapp() {
    if (!url) return;
    const msg = encodeURIComponent(
      `Oi! Conhece alguém que se beneficiaria do nosso trabalho? ` +
      `Indique direto neste link: ${url}`,
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  // Sem token — só botão "Gerar"
  if (!tokenAtual && !tokenNovo) {
    return (
      <div className="text-xs">
        <button onClick={handleGerar} disabled={pending} className="btn-secondary text-xs">
          {pending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Link2 className="w-3 h-3" aria-hidden="true" />}
          Gerar link
        </button>
        {erro && (
          <p role="alert" className="text-[11px] text-destructive mt-1 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" aria-hidden="true" /> {erro}
          </p>
        )}
      </div>
    );
  }

  // Com token — exibe URL + ações
  return (
    <div className="text-xs space-y-1.5 min-w-[260px]">
      <div className="flex items-center gap-1.5">
        <code className="flex-1 text-[10px] bg-muted/50 border border-border rounded px-2 py-1 truncate" title={url ?? ""}>
          {url}
        </code>
        <button
          onClick={copiar}
          className="btn-ghost text-xs"
          aria-label="Copiar link"
          title="Copiar link"
        >
          {copiado ? <Check className="w-3 h-3 text-success-500" aria-hidden="true" /> : <Copy className="w-3 h-3" aria-hidden="true" />}
        </button>
        <button
          onClick={compartilharWhatsapp}
          className="btn-ghost text-xs"
          aria-label="Compartilhar via WhatsApp"
          title="Compartilhar via WhatsApp"
        >
          <Send className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      {tokenAtual && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
          {tokenAtual.total_acessos > 0 && (
            <span>{tokenAtual.total_acessos} {tokenAtual.total_acessos === 1 ? "acesso" : "acessos"}</span>
          )}
          {tokenAtual.total_indicacoes_recebidas > 0 && (
            <>
              {tokenAtual.total_acessos > 0 && <span>·</span>}
              <span className="text-success-500 font-semibold">
                {tokenAtual.total_indicacoes_recebidas} {tokenAtual.total_indicacoes_recebidas === 1 ? "indicação" : "indicações"}
              </span>
            </>
          )}
        </div>
      )}

      {editandoMsg ? (
        <div className="space-y-1">
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Mensagem personalizada (aparece no topo do portal)…"
            maxLength={500}
            className="input-base text-xs min-h-[50px]"
            aria-label="Mensagem personalizada"
          />
          <div className="flex items-center gap-1">
            <button onClick={handleSalvarMensagem} disabled={pending} className="btn-primary text-[11px]">
              {pending && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
              Salvar
            </button>
            <button onClick={() => { setEditandoMsg(false); setMensagem(tokenAtual?.mensagem_personalizada ?? ""); }} className="btn-ghost text-[11px]">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px]">
          <button onClick={() => setEditandoMsg(true)} className="text-muted-foreground hover:text-foreground">
            {tokenAtual?.mensagem_personalizada ? "Editar mensagem" : "+ Mensagem personalizada"}
          </button>
          <span className="text-muted-foreground/50">·</span>
          <button onClick={handleGerar} disabled={pending} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
            <RefreshCw className="w-2.5 h-2.5" aria-hidden="true" /> Regenerar
          </button>
          {tokenAtual && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <button onClick={handleRevogar} disabled={pending} className="text-destructive hover:underline inline-flex items-center gap-0.5">
                <X className="w-2.5 h-2.5" aria-hidden="true" /> Revogar
              </button>
            </>
          )}
        </div>
      )}

      {tokenNovo && (
        <div className="text-[10px] bg-success-500/10 border border-success-500/30 text-success-500 rounded px-2 py-1">
          ✓ Novo link gerado. Compartilhe com {empresaLead ?? "o cliente"}.
        </div>
      )}

      {erro && (
        <p role="alert" className="text-[11px] text-destructive inline-flex items-center gap-1">
          <AlertCircle className="w-3 h-3" aria-hidden="true" /> {erro}
        </p>
      )}
    </div>
  );
}
