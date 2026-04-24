"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import NovaLigacaoAIModal from "./nova-ligacao-ai-modal";

export default function LigacoesHeaderActions({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Bot className="w-4 h-4 mr-2" />
        Nova Ligação (Copiloto)
      </button>

      {open && (
        <NovaLigacaoAIModal 
          orgId={orgId} 
          onClose={() => setOpen(false)} 
          onSaved={() => window.location.reload()} 
        />
      )}
    </>
  );
}
