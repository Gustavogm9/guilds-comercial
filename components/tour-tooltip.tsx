"use client";

/**
 * TourTooltip — tooltip contextual que aparece uma vez por módulo.
 *
 * Usa o hook useTour internamente. O pai passa userId e modulo.
 * Quando dismissido, desaparece e persiste no localStorage.
 *
 * Posicionamento: fixed no canto inferior-direito por padrão (pode ser
 * sobrescrito via className). Animação fade-in + slide-up.
 *
 * Uso:
 *   <TourTooltip
 *     modulo="pipeline"
 *     userId={me.id}
 *     titulo="Kanban de Pipeline"
 *     descricao="Arraste leads entre as colunas para avançar no funil."
 *     link={{ href: "/docs/pipeline", label: "Saiba mais" }}
 *   />
 */

import { X, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useTour } from "@/hooks/use-tour";

type Props = {
  modulo: string;
  userId: string;
  titulo: string;
  descricao: string;
  link?: { href: string; label: string };
  /** Posicionamento CSS — default: canto inferior direito */
  position?: "bottom-right" | "bottom-left" | "top-right";
};

const POSITION_CLASS = {
  "bottom-right": "fixed bottom-6 right-6 z-50",
  "bottom-left":  "fixed bottom-6 left-6 z-50",
  "top-right":    "fixed top-20 right-6 z-50",
} as const;

export default function TourTooltip({
  modulo,
  userId,
  titulo,
  descricao,
  link,
  position = "bottom-right",
}: Props) {
  const { visible, dismiss } = useTour(modulo, userId);

  if (!visible) return null;

  return (
    <div
      className={`${POSITION_CLASS[position]} max-w-xs w-full animate-in fade-in slide-in-from-bottom-3`}
      role="dialog"
      aria-label={`Dica: ${titulo}`}
    >
      <div className="card shadow-stripe-md p-4 border-primary/25 bg-card">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center shrink-0 mt-0.5">
            <Lightbulb className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground mb-1" style={{ letterSpacing: "-0.13px" }}>
              {titulo}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{descricao}</p>
            {link && (
              <Link
                href={link.href}
                className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline"
                onClick={dismiss}
              >
                {link.label} →
              </Link>
            )}
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground shrink-0 -mt-0.5"
            aria-label="Fechar dica"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Dica — aparece só uma vez</span>
          <button onClick={dismiss} className="text-[10px] text-primary font-semibold hover:underline">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
