"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle, Sparkles } from "lucide-react";
import { MOTIVOS_PERDA, type MotivoPerda, type CrmStage } from "@/lib/types";
import { moverEtapa } from "@/app/(app)/hoje/actions";
import { arquivarLead } from "@/app/(app)/base/actions";
import { sugerirMotivoPerda } from "@/lib/ai/actions";

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
    modo.tipo === "arquivar" ? "Arquivar" : modo.destino === "Perdido" ? "Perder" : "Pausar em Nutrição";

  const copy =
    modo.tipo === "arquivar"
      ? "Este lead sai da base e vai para Arquivados. Para melhorar o funil, marque o motivo:"
      : modo.destino === "Perdido"
      ? "Este lead sai do pipeline como perdido. O motivo vai para o ranking de 'Motivos de perda' no Funil:"
      : "Este lead vai para Nutrição. Registre por que — para reengajar na hora certa:";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!motivo) {
      setErro("Selecione um motivo.");
      return;
    }
    if (motivo === "Outro" && !detalhe.trim()) {
      setErro("Descreva o motivo.");
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
        setErro(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 grid place-items-center">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="font-semibold text-base">{rotuloDestino}</div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-slate-600 leading-snug">{copy}</p>

          {/* Atalho com IA */}
          <div className="p-3 rounded-lg bg-violet-50/60 border border-violet-200">
            <div className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3"/> Não sabe qual escolher? Descreve e a IA sugere
            </div>
            <div className="flex gap-1.5">
              <input
                type="text" value={textoLivre}
                onChange={(e) => setTextoLivre(e.target.value)}
                placeholder="ex: cliente sumiu após proposta"
                className="input-base text-xs flex-1"
              />
              <button type="button" onClick={sugerir} disabled={sugerindo || !textoLivre.trim()}
                className="btn-secondary text-xs shrink-0">
                {sugerindo ? "…" : "Sugerir"}
              </button>
            </div>
            {sugestao && (
              <div className="text-[11px] text-violet-700 mt-1.5">
                Sugerido: <b>{sugestao.motivo}</b> ({Math.round(sugestao.confianca * 100)}% confiança)
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Motivo <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {MOTIVOS_PERDA.map((m) => (
                <label
                  key={m}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${
                    motivo === m
                      ? "border-rose-500 bg-rose-50 text-rose-800 font-medium"
                      : "border-slate-200 hover:border-slate-300"
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
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
                Descreva <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                placeholder="Ex: cliente sumiu depois de enviar proposta revisada"
                className="input-base w-full text-sm"
                autoFocus
                maxLength={140}
              />
            </div>
          )}

          {erro && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {erro}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-sm"
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !motivo}
              className="btn-primary text-sm bg-rose-600 hover:bg-rose-700 border-rose-600"
            >
              {pending ? "Salvando…" : `Confirmar ${rotuloDestino}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
