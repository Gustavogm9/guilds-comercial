"use client";
import { useEffect, useState, useTransition } from "react";
import { Sparkles, Copy, Check, ExternalLink, Loader2, Send } from "lucide-react";
import { gerarMensagemCadencia } from "@/lib/ai/actions";
import { salvarMensagemPassoEnviada } from "@/app/(app)/cadencia/actions";
import { normalizarTelefoneI18n } from "@/lib/utils/i18n-fiscal";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

interface CadenciaPassoCardProps {
  cadenciaId: number | null;
  passo: "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
  status: string;
  objetivo: string;
  canal: string;
  dataPrevista: string;
  /** Dados do lead para gerar mensagem via IA */
  leadId: number;
  empresa: string;
  nome: string;
  cargo?: string;
  dorPrincipal?: string;
  ultimaInteracao?: string;
  tomAnterior?: "positivo" | "neutro" | "negativo" | null;
  raioxStatus?: string;
  raioxScore?: number;
  vendedor: string;
  whatsapp?: string;
  /** Issue 8: país da org pra normalizar WhatsApp internacional */
  paisOrg?: string;
}

/**
 * Card de passo da cadência (D0/D3/D7/...) no detalhe do lead.
 *
 * Fixes desta rodada:
 *   - Issue 7: persiste mensagem ao copiar/enviar via `salvarMensagemPassoEnviada`
 *   - Issue 8: WhatsApp prefix internacional via `normalizarTelefoneI18n` (E.164)
 *   - Issue 19: i18n via getClientLocale + getT
 *   - Issue 44: ao copiar OU enviar, marca passo como "enviado" (consistente)
 */
export default function CadenciaPassoCard(props: CadenciaPassoCardProps) {
  const {
    passo, status: statusInicial, objetivo, canal, dataPrevista,
    leadId, empresa, nome, cargo, dorPrincipal,
    ultimaInteracao, tomAnterior, raioxStatus, raioxScore,
    vendedor, whatsapp, paisOrg,
  } = props;

  const [status, setStatus] = useState(statusInicial);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const tone =
    status === "enviado"   ? "bg-success-500/10 text-success-500 border-success-500/25"
    : status === "respondido" ? "bg-primary/10 text-primary border-primary/25"
    : status === "pular"     ? "bg-muted text-muted-foreground border-border opacity-70"
    :                         "bg-secondary/60 dark:bg-white/[0.03] text-foreground border-border";

  async function gerarComIA() {
    setGerando(true);
    setErro(null);
    try {
      const result = await gerarMensagemCadencia({
        leadId,
        empresa,
        nome,
        cargo,
        passo,
        canal: canal.includes("WhatsApp") ? "WhatsApp"
          : canal.includes("LinkedIn") ? "LinkedIn"
          : "Email",
        dor_principal: dorPrincipal,
        ultima_interacao: ultimaInteracao,
        tom_anterior: tomAnterior,
        raiox_status: raioxStatus,
        raiox_score: raioxScore,
        vendedor,
      });
      if (result.ok) {
        setMensagem(result.texto);
      } else {
        setErro(result.erro ?? t("pipeline.passo_erro_gerar"));
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setGerando(false);
    }
  }

  /**
   * Persiste a mensagem como "enviada" (server action). Otimista no UI.
   */
  function persistirEnvio() {
    if (!mensagem.trim()) return;
    setStatus("enviado");
    startSave(async () => {
      try {
        await salvarMensagemPassoEnviada({ leadId, passo, mensagem });
      } catch (err) {
        // Rollback otimista — se falhar, volta pra status original
        setStatus(statusInicial);
        setErro(err instanceof Error ? err.message : String(err));
      }
    });
  }

  async function copiar() {
    await navigator.clipboard.writeText(mensagem);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
    // Issue 44: ao copiar, marca passo como enviado (vendedor vai colar manualmente)
    if (status !== "enviado") persistirEnvio();
  }

  // Issue 8: WhatsApp internacional via libphonenumber-js → E.164 (sem `+`)
  function abrirWhatsApp() {
    if (!whatsapp) return;
    const e164 = normalizarTelefoneI18n(whatsapp, paisOrg ?? "BR"); // ex: "+5511987654321"
    const numero = e164.replace(/^\+/, ""); // wa.me espera só dígitos
    if (!numero) return;
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank");
    // Issue 44: ao abrir WhatsApp, marca passo como enviado
    if (status !== "enviado") persistirEnvio();
  }

  const fmt = (d: string) => {
    try { return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short" }); }
    catch { return d; }
  };

  return (
    <li className={`rounded-lg border p-3 text-xs ${tone} flex flex-col gap-2`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">{passo}</div>
        <span className="opacity-60 text-[10px]">{status}</span>
      </div>
      <div className="opacity-80 truncate">{objetivo}</div>
      <div className="opacity-60 text-[10px]">
        {dataPrevista ? `${fmt(dataPrevista)} · ` : ""}{canal}
      </div>

      {/* Botão Gerar com IA — só pra passos pendentes */}
      {status === "pendente" && (
        <button
          type="button"
          onClick={gerarComIA}
          disabled={gerando}
          className="btn-primary text-[11px] !py-1.5 !px-2.5 self-start"
        >
          {gerando ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> {t("pipeline.passo_gerando")}</>
          ) : (
            <><Sparkles className="w-3 h-3" /> {t("pipeline.passo_gerar_ia")}</>
          )}
        </button>
      )}

      {/* Erro */}
      {erro && (
        <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/25 rounded p-1.5 mt-1">
          {erro}
        </div>
      )}

      {/* Mensagem gerada */}
      {mensagem && (
        <div className="mt-1 space-y-2">
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={4}
            aria-label={t("pipeline.passo_marcar_enviado")}
            className="input-base text-xs resize-y"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={copiar}
              className="btn-secondary text-[11px] !py-1 !px-2"
              title={t("pipeline.passo_copiar")}
            >
              {copiado
                ? <><Check className="w-3 h-3" /> {t("pipeline.passo_copiado")}</>
                : <><Copy className="w-3 h-3" /> {t("pipeline.passo_copiar")}</>}
            </button>
            {whatsapp && (
              <button
                type="button"
                onClick={abrirWhatsApp}
                className="inline-flex items-center gap-1 text-[11px] font-medium
                  bg-success-500 text-white px-2 py-1 rounded hover:brightness-110 transition-all"
              >
                <ExternalLink className="w-3 h-3" /> {t("pipeline.passo_whatsapp")}
              </button>
            )}
            {/* Marcar enviado manual (sem copiar/WhatsApp) */}
            {status !== "enviado" && (
              <button
                type="button"
                onClick={persistirEnvio}
                className="btn-ghost text-[11px] !py-1 !px-2 text-success-500"
                title={t("pipeline.passo_marcar_enviado")}
              >
                <Send className="w-3 h-3" /> {t("pipeline.passo_marcar_enviado")}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
