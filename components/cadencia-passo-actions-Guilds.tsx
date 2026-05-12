"use client";

import { useState, useTransition } from "react";
import { Check, X, ExternalLink, Clock, ChevronDown, MessageSquare, Sparkles } from "lucide-react";
import Link from "next/link";
import { marcarPassoCadencia, adiarPassoCadencia } from "@/app/(app)/comunicacao/cadencia/actions";

/**
 * Botões de ação rápida em cada card de cadência (na rota /cadencia).
 * Permite marcar enviado / respondido / pular / adiar sem abrir o lead.
 *
 * Quando marcado como "respondido", exibe popover sugerindo qualificação imediata.
 */
export default function CadenciaPassoActions({
  cadenciaId,
  whatsapp,
}: {
  cadenciaId: number;
  whatsapp: string | null;
}) {
  const [pending, start] = useTransition();
  const [adiarOpen, setAdiarOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Estado da sugestão de qualificação pós-resposta
  const [sugestaoLeadId, setSugestaoLeadId] = useState<number | null>(null);

  function abrirWhatsApp() {
    if (!whatsapp) return;
    const num = whatsapp.replace(/\D/g, "");
    const final = num.startsWith("55") ? num : `55${num}`;
    window.open(`https://wa.me/${final}`, "_blank");
  }

  function marcar(status: "enviado" | "respondido" | "pular") {
    setErro(null);
    setSugestaoLeadId(null);
    start(async () => {
      try {
        const res = await marcarPassoCadencia(cadenciaId, status);
        // Se o lead respondeu, exibe sugestão de qualificação
        if (res.sugerirQualificacao && res.leadId) {
          setSugestaoLeadId(res.leadId);
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  function adiar(dias: number) {
    setErro(null);
    setAdiarOpen(false);
    start(async () => {
      try {
        await adiarPassoCadencia(cadenciaId, dias);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 pt-1.5 border-t border-border/60 dark:border-white/[0.05]">
        <button
          onClick={() => marcar("enviado")}
          disabled={pending}
          className="btn-ghost text-[10px] !px-1.5 !py-1 text-success-500 hover:bg-success-500/10"
          title="Marcar enviado"
        >
          <Check className="w-3 h-3" /> Enviei
        </button>

        <button
          onClick={() => marcar("respondido")}
          disabled={pending}
          className="btn-ghost text-[10px] !px-1.5 !py-1 text-primary hover:bg-primary/10"
          title="Marcar respondido"
        >
          <MessageSquare className="w-3 h-3" /> Resp
        </button>

        <div className="relative">
          <button
            onClick={() => setAdiarOpen((v) => !v)}
            disabled={pending}
            className="btn-ghost text-[10px] !px-1.5 !py-1 text-muted-foreground hover:text-foreground"
            title="Adiar"
          >
            <Clock className="w-3 h-3" /> Adiar
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {adiarOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-30 w-32 bg-popover text-popover-foreground border border-border rounded-md py-1 shadow-stripe-md dark:bg-[hsl(220_5%_10%)] dark:border-white/[0.08]"
            >
              {[1, 3, 7].map((d) => (
                <button
                  key={d}
                  onClick={() => adiar(d)}
                  disabled={pending}
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-secondary dark:hover:bg-white/[0.04] transition-colors"
                >
                  +{d} {d === 1 ? "dia" : "dias"}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => marcar("pular")}
          disabled={pending}
          className="btn-ghost text-[10px] !px-1.5 !py-1 text-muted-foreground hover:text-destructive ml-auto"
          title="Pular este passo"
        >
          <X className="w-3 h-3" />
        </button>

        {whatsapp && (
          <button
            onClick={abrirWhatsApp}
            disabled={pending}
            className="btn-ghost text-[10px] !px-1.5 !py-1 text-success-500 hover:bg-success-500/10"
            title="Abrir WhatsApp"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}

        {erro && (
          <span className="text-[10px] text-destructive truncate ml-1">{erro}</span>
        )}
      </div>

      {/* Sugestão de qualificação pós-resposta */}
      {sugestaoLeadId && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/8 border border-primary/20 animate-in fade-in slide-in-from-top-1">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[10px] text-foreground flex-1">
            Lead respondeu! Quer qualificá-lo agora?
          </span>
          <Link
            href={`/pipeline/${sugestaoLeadId}`}
            className="text-[10px] font-semibold text-primary hover:underline shrink-0"
            onClick={() => setSugestaoLeadId(null)}
          >
            Ir ao lead →
          </Link>
          <button
            onClick={() => setSugestaoLeadId(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Fechar sugestão"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
