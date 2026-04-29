"use client";
import { useTransition } from "react";
import { alterarStatusNews, marcarEnvio } from "@/app/(app)/newsletter/actions";
import { Send, Pause, Trash2, Play } from "lucide-react";

export default function NewsletterRowActions({
  id, leadId, status,
}: {
  id: number; leadId: number; status: "Ativo" | "Pausado" | "Remover";
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1.5 justify-end">
      {status === "Ativo" && (
        <>
          <button disabled={pending}
            onClick={() => start(async () => { await marcarEnvio(id, leadId); })}
            className="btn-secondary text-xs">
            <Send className="w-3.5 h-3.5"/> Enviei
          </button>
          <button disabled={pending}
            onClick={() => start(async () => { await alterarStatusNews(id, "Pausado"); })}
            className="btn-ghost text-xs">
            <Pause className="w-3.5 h-3.5"/>
          </button>
        </>
      )}
      {status === "Pausado" && (
        <button disabled={pending}
          onClick={() => start(async () => { await alterarStatusNews(id, "Ativo"); })}
          className="btn-secondary text-xs">
          <Play className="w-3.5 h-3.5"/> Reativar
        </button>
      )}
      <button disabled={pending}
        onClick={() => start(async () => { await alterarStatusNews(id, "Remover"); })}
        className="btn-ghost text-xs text-muted-foreground/70 hover:text-destructive">
        <Trash2 className="w-3.5 h-3.5"/>
      </button>
    </div>
  );
}
