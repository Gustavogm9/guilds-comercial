"use client";

import { useTransition } from "react";
import { X, UserSquare2 } from "lucide-react";
import { encerrarImpersonificacao } from "@/app/(app)/gestao/equipe/impersonation-actions";
import { useRouter } from "next/navigation";

export function ImpersonationBanner({
  targetName
}: {
  targetName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleStop = () => {
    startTransition(async () => {
      try {
        await encerrarImpersonificacao();
        router.refresh();
      } catch (err: any) {
        alert(err.message || "Erro ao encerrar impersonificação");
      }
    });
  };

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-center sticky top-0 z-50 text-sm font-medium shadow-md">
      <UserSquare2 className="h-4 w-4 mr-2" />
      <span>
        Modo de Impersonificação: você está operando como <strong>{targetName}</strong>. 
        Suas ações serão registradas em nome deste usuário.
      </span>
      <button
        className="ml-4 h-7 px-3 rounded text-xs border border-white/20 hover:bg-white/10 text-white flex items-center justify-center transition-colors disabled:opacity-50"
        onClick={handleStop}
        disabled={isPending}
      >
        {isPending ? "Saindo..." : "Sair do modo"}
        {!isPending && <X className="h-3 w-3 ml-1" />}
      </button>
    </div>
  );
}
