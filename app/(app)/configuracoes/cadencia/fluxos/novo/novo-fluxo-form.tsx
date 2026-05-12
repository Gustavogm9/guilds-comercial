"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { criarFluxo } from "../actions";

export default function NovoFluxoForm() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [trigger, setTrigger] = useState<"manual" | "lead_criado" | "lead_segmento" | "lead_fonte">("manual");
  const [triggerValor, setTriggerValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) { setErro("Nome obrigatório."); return; }
    startTransition(async () => {
      try {
        const r = await criarFluxo({
          nome,
          descricao: descricao || undefined,
          trigger,
          trigger_valor: trigger === "manual" ? undefined : triggerValor.trim() || undefined,
          passos: [],
        });
        router.push(`/configuracoes/cadencia/fluxos/${r.fluxo_id}`);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro.");
      }
    });
  }

  return (
    <form onSubmit={criar} className="space-y-4 card p-5">
      <div>
        <label className="label text-sm">Nome do fluxo</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Cold outbound · Pós-evento · Re-engajamento"
          className="input-base"
          maxLength={80}
          required
        />
      </div>
      <div>
        <label className="label text-sm">Descrição (opcional)</label>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Quando este fluxo deve ser usado, qual o tom, qual o objetivo..."
          className="input-base min-h-[80px]"
        />
      </div>
      <div>
        <label className="label text-sm">Quando aplicar</label>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value as any)} className="input-base">
          <option value="manual">Manual (vendedor clica iniciar)</option>
          <option value="lead_criado">Automático em todo lead novo</option>
          <option value="lead_segmento">Automático se segmento do lead = X</option>
          <option value="lead_fonte">Automático se fonte do lead = X</option>
        </select>
      </div>
      {trigger !== "manual" && (
        <div>
          <label className="label text-sm">Valor do trigger</label>
          <input
            value={triggerValor}
            onChange={(e) => setTriggerValor(e.target.value)}
            placeholder={trigger === "lead_segmento" ? "Ex.: Saúde, Tecnologia" : "Ex.: indicacao, evento, organico"}
            className="input-base"
          />
        </div>
      )}

      {erro && (
        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {erro}
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Criar e adicionar passos
        </button>
      </div>
    </form>
  );
}
