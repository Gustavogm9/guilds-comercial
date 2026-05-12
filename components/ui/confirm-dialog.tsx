"use client";
import { AlertCircle, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

/**
 * Modal de confirmação consistente com o design system.
 *
 * Substitui `confirm()` nativo (que quebra dark mode + iOS Safari + a11y).
 * Renderiza com z-index alto (10000) pra ficar acima de outros modais.
 *
 * Uso típico:
 *   const [confirmar, setConfirmar] = useState<{titulo: string; mensagem: string; onConfirm: () => void} | null>(null);
 *   <ConfirmDialog
 *     open={!!confirmar}
 *     titulo={confirmar?.titulo ?? ""}
 *     mensagem={confirmar?.mensagem ?? ""}
 *     onConfirm={() => confirmar?.onConfirm()}
 *     onCancel={() => setConfirmar(null)}
 *   />
 */
export default function ConfirmDialog({
  open,
  titulo,
  mensagem,
  tom = "warning",
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  titulo: string;
  mensagem: React.ReactNode;
  tom?: "warning" | "danger" | "success" | "info";
  textoConfirmar?: string;
  textoCancelar?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const iconConfig = {
    warning: { Icon: AlertTriangle, bg: "bg-warning-500/10", color: "text-warning-500", btn: "btn-primary" },
    danger:  { Icon: AlertCircle, bg: "bg-destructive/10", color: "text-destructive", btn: "btn-primary" },
    success: { Icon: CheckCircle2, bg: "bg-success-500/10", color: "text-success-500", btn: "btn-primary" },
    info:    { Icon: AlertCircle, bg: "bg-primary/10", color: "text-primary", btn: "btn-primary" },
  }[tom];

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4"
      onClick={() => !pending && onCancel()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-titulo"
    >
      <div
        className="bg-card text-foreground border border-border rounded-xl max-w-sm w-full p-6 shadow-stripe-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-12 h-12 rounded-full ${iconConfig.bg} ${iconConfig.color} grid place-items-center mx-auto mb-4`}>
          <iconConfig.Icon className="w-5 h-5" />
        </div>
        <h3
          id="confirm-titulo"
          className="text-base font-semibold text-foreground text-center"
          style={{ letterSpacing: "-0.24px" }}
        >
          {titulo}
        </h3>
        <div className="text-sm text-muted-foreground text-center mt-2">{mensagem}</div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={pending}
            className="btn-secondary text-sm flex-1"
            type="button"
          >
            {textoCancelar}
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className={`${iconConfig.btn} text-sm flex-1`}
            type="button"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
