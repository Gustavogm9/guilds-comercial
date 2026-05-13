"use client";

/**
 * ActivationChecklist — banner de ativação por role exibido no /hoje.
 *
 * Mostra os marcos de adoção do sistema por papel:
 *   - Gestor:    1º lead importado, 1 membro convidado, 1 cadência iniciada
 *   - Comercial: 1ª qualificação, 1º pipeline move, 1ª ligação registrada
 *   - SDR:       1ª prospecção, 1 lead qualificado, 1 resposta cadência
 *
 * Uma vez que todos os marcos estejam concluídos, o banner some automaticamente.
 * O usuário também pode dispensar manualmente (persiste no localStorage).
 */

import { X, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

export type Marco = {
  id: string;
  label: string;
  feito: boolean;
  /** Link para a ação, se o marco não estiver feito */
  href?: string;
  hrefLabel?: string;
};

type Props = {
  role: "gestor" | "comercial" | "sdr";
  marcos: Marco[];
  userId: string;
};

export default function ActivationChecklist({ role, marcos, userId }: Props) {
  const DISMISS_KEY = `guilds-activation-dismissed-${userId}`;
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, [DISMISS_KEY]);

  const totalFeitos = marcos.filter((m) => m.feito).length;
  const total = marcos.length;
  const tudo = totalFeitos === total;

  function dispensar() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignora */ }
    setDismissed(true);
  }

  function retomar() {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch { /* ignora */ }
    setDismissed(false);
  }

  // Se tudo completo, some silenciosamente
  if (tudo) return null;

  const roleLabel =
    role === "gestor" ? "Gestor" :
    role === "comercial" ? "Comercial" :
    "SDR";

  const progress = Math.round((totalFeitos / total) * 100);

  if (dismissed === null) return null;

  if (dismissed) {
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Setup incompleto: <strong className="text-foreground">{totalFeitos}/{total}</strong> marcos concluÃ­dos
        </span>
        <button
          type="button"
          onClick={retomar}
          className="font-semibold text-primary hover:underline whitespace-nowrap"
        >
          Retomar setup
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4 mb-6 border-primary/20 bg-primary/[0.03] animate-in fade-in slide-in-from-top-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 grid place-items-center shrink-0">
            <span className="text-base leading-none">🚀</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground" style={{ letterSpacing: "-0.13px" }}>
              Primeiros passos — {roleLabel}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {totalFeitos} de {total} concluídos
            </div>
          </div>
        </div>
        <button
          onClick={dispensar}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          aria-label="Dispensar checklist de ativação"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Marcos */}
      <ul className="space-y-2">
        {marcos.map((marco) => (
          <li key={marco.id} className="flex items-center gap-2.5 text-sm">
            {marco.feito ? (
              <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            )}
            <span className={marco.feito ? "text-muted-foreground line-through" : "text-foreground"}>
              {marco.label}
            </span>
            {!marco.feito && marco.href && (
              <Link
                href={marco.href}
                className="ml-auto text-[10px] font-semibold text-primary hover:underline shrink-0"
              >
                {marco.hrefLabel ?? "Fazer agora →"}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
