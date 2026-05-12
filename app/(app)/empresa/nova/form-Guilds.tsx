"use client";
import { useState, useTransition } from "react";
import { Building2 } from "lucide-react";
import { criarNovaEmpresa } from "./actions";

export default function NovaEmpresaForm() {
  const [nome, setNome] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!nome.trim()) return;
        startTransition(async () => {
          try {
            await criarNovaEmpresa(nome);
          } catch (err) {
            setErro((err as Error).message);
          }
        });
      }}
      className="space-y-3"
    >
      <div>
        <div className="label mb-1">Nome da empresa</div>
        <div className="relative">
          <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/70"/>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Acme S.A."
            className="input-base !pl-9 text-sm w-full"
            autoFocus
            required
          />
        </div>
      </div>

      {erro && (
        <div className="bg-destructive/10 border border-destructive/25 rounded-lg p-3 text-xs text-destructive">{erro}</div>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || !nome.trim()} className="btn-primary text-sm">
          Criar empresa
        </button>
        <a href="/hoje" className="btn-ghost text-sm">Cancelar</a>
      </div>
    </form>
  );
}
