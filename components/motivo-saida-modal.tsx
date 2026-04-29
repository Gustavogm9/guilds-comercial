"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle, Sparkles } from "lucide-react";
import { MOTIVOS_PERDA, type MotivoPerda, type CrmStage } from "@/lib/types";
import { moverEtapa } from "@/app/(app)/hoje/actions";
import { arquivarLead } from "@/app/(app)/base/actions";
import { sugerirMotivoPerda } from "@/lib/ai/actions";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

type Modo =
  | { tipo: "mover"; lead_id: number; destino: CrmStage }
  | { tipo: "arquivar"; lead_id: number };

/**
 * Modal obrigatório de motivo ao:
 *   - mover lead para Perdido ou Nutrição
 *   - arquivar lead da Base bruta
 *
 * Uso:
 *   const [modo, setModo] = useState<Modo | null>(null);
 *   <MotivoSaidaModal modo={modo} onClose={() => setModo(null)} />
 *   <button onClick={() => setModo({ tipo: "mover", lead_id: 1, destino: "Perdido" })}>
 */
export default function MotivoSaidaModal({
  modo,
  onClose,
}: {
  modo: Modo | null;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoPerda | "">("");
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sugerindo, setSugerindo] = useState(false);
  const [sugestao, setSugestao] = useState<{ motivo: MotivoPerda; confianca: number } | null>(null);
  const [textoLivre, setTextoLivre] = useState("");
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  async function sugerir() {
    if (!textoLivre.trim()) return;
    setSugerindo(true);
    setSugestao(null);
    try {
      const r = await sugerirMotivoPerda({
        texto_livre: textoLivre,
        leadId: modo?.lead_id,
      });
      if (r.ok && r.parsed) {
        const p = r.parsed as { motivo_padrao: string; confianca: number; detalhe_se_outro: string };
        if (MOTIVOS_PERDA.includes(p.motivo_padrao as MotivoPerda)) {
          setSugestao({ motivo: p.motivo_padrao as MotivoPerda, confianca: p.confianca });
          setMotivo(p.motivo_padrao as MotivoPerda);
          if (p.motivo_padrao === "Outro" && p.detalhe_se_outro) setDetalhe(p.detalhe_se_outro);
        }
      }
    } finally {
      setSugerindo(false);
    }
  }

  if (!modo) return null;

  const rotuloDestino =
    modo.tipo === "arquivar"
      ? t("modais.ms_acao_arquivar")
      : modo.destino === "Perdido"
      ? t("modais.ms_acao_perder")
      : t("modais.ms_acao_pausar_nutricao");

  const copy =
    modo.tipo === "arquivar"
      ? t("modais.ms_copy_arquivar")
      : modo.destino === "Perdido"
      ? t("modais.ms_copy_perdido")
      : t("modais.ms_copy_nutricao");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!motivo) {
      setErro(t("modais.ms_erro_motivo"));
      return;
    }
    if (motivo === "Outro" && !detalhe.trim()) {
      setErro(t("modais.ms_erro_detalhe"));
      return;
    }

    start(async () => {
      try {
        if (modo!.tipo === "mover") {
          await moverEtapa(modo!.lead_id, modo!.destino, motivo as MotivoPerda, detalhe);
        } else {
          await arquivarLead(modo!.lead_id, motivo as MotivoPerda, detalhe);
        }
        onClose();
        setMotivo("");
        setDetalhe("");
        router.refresh();
      } catch (err) {
        setErro(err instanceof Error ? err.message : t("modais.ms_erro_salvar"));
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 grid place-items-center">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div className="font-semibold text-base">{rotuloDestino}</div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t("modais.fechar")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-snug">{copy}</p>

          {/* Atalho com IA */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/25">
            <div className="text-[10px] uppercase tracking-[0.12em] text-primary font-semibold mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3"/> {t("modais.ms_ia_titulo")}
            </div>
            <div className="flex gap-1.5">
              <input
                type="text" value={textoLivre}
                onChange={(e) => setTextoLivre(e.target.value)}
                placeholder={t("modais.ms_ia_placeholder")}
                className="input-base text-xs flex-1"
              />
              <button type="button" onClick={sugerir} disabled={sugerindo || !textoLivre.trim()}
                className="btn-secondary text-xs shrink-0">
                {sugerindo ? "…" : t("modais.ms_sugerir")}
              </button>
            </div>
            {sugestao && (
              <div className="text-[11px] text-primary mt-1.5 tabular-nums">
                {t("modais.ms_sugerido")}: <b>{sugestao.motivo}</b> ({Math.round(sugestao.confianca * 100)}% {t("modais.ms_confianca")})
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold text-foreground uppercase tracking-[0.12em] block mb-2">
              {t("modais.ms_motivo_label")} <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {MOTIVOS_PERDA.map((m) => (
                <label
                  key={m}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${
                    motivo === m
                      ? "border-destructive/50 bg-destructive/10 text-destructive font-medium"
                      : "border-border hover:border-foreground/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={m}
                    checked={motivo === m}
                    onChange={() => setMotivo(m)}
                    className="w-3.5 h-3.5"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {motivo === "Outro" && (
            <div>
              <label className="text-[10px] font-semibold text-foreground uppercase tracking-[0.12em] block mb-1.5">
                {t("modais.ms_descreva_label")} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                placeholder={t("modais.ms_descreva_placeholder")}
                className="input-base w-full text-sm"
                autoFocus
                maxLength={140}
              />
            </div>
          )}

          {erro && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/25 rounded-lg px-3 py-2">
              {erro}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-sm"
              disabled={pending}
            >
              {t("comum.cancelar")}
            </button>
            <button
              type="submit"
              disabled={pending || !motivo}
              className="btn-primary text-sm !bg-destructive hover:!brightness-110"
            >
              {pending ? t("modais.ms_salvando") : `${t("modais.ms_confirmar")} ${rotuloDestino}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
