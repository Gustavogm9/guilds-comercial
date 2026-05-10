"use client";

import { useState, useTransition } from "react";
import { Brain, Sparkles, Target, AlertCircle } from "lucide-react";
import { gerarIcpProduto, calcularLookAlikeProduto } from "./actions-ia";
import { useRouter } from "next/navigation";

export function IcpProdutoWidget({ produtoId, icpAtual }: { produtoId: number; icpAtual: any }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  const handleGerar = () => {
    setError("");
    startTransition(async () => {
      const res = await gerarIcpProduto(produtoId);
      if (!res.ok) setError(res.error || "Erro desconhecido");
      else router.refresh();
    });
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-primary" /> Perfil de Cliente Ideal (ICP)
        </div>
        <button
          onClick={handleGerar}
          disabled={isPending}
          className="text-[10px] btn-ghost px-2 py-1 h-auto"
        >
          {isPending ? "Processando..." : (icpAtual ? "Atualizar com IA" : "Gerar com IA")}
        </button>
      </div>

      {error && <div className="text-xs text-red-500 mb-2">{error}</div>}

      {!icpAtual ? (
        <div className="text-xs text-muted-foreground bg-secondary/50 p-3 rounded text-center">
          Nenhum ICP gerado ainda. A IA analisará os clientes ganhos deste produto para extrair o perfil ideal.
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">Segmento</div>
            <div className="font-medium">{icpAtual.segmento || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">Porte</div>
            <div className="font-medium">{icpAtual.porte || "—"}</div>
          </div>
          {(icpAtual.dores_comuns?.length > 0) && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">Dores Comuns</div>
              <ul className="list-disc pl-4 text-muted-foreground">
                {icpAtual.dores_comuns.map((d: string, i: number) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
          {icpAtual.dicas_abordagem && (
            <div className="bg-primary/5 p-2 rounded border border-primary/10">
              <div className="text-[10px] font-semibold text-primary mb-0.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Dica de Abordagem
              </div>
              <div className="text-muted-foreground leading-relaxed">{icpAtual.dicas_abordagem}</div>
            </div>
          )}
          <div className="text-[9px] text-muted-foreground text-right mt-2">
            Baseado em {icpAtual.amostras_usadas || "?"} clientes fechados.
          </div>
        </div>
      )}
    </div>
  );
}

export function LookalikeWidget({ produtoId, temIcp }: { produtoId: number; temIcp: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");
  const router = useRouter();

  const handleCalcular = () => {
    setError("");
    setSucesso("");
    startTransition(async () => {
      const res = await calcularLookAlikeProduto(produtoId);
      if (!res.ok) setError(res.error || "Erro desconhecido");
      else {
        setSucesso(`Scores atualizados para ${res.atualizados} leads.`);
        router.refresh();
      }
    });
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-blue-500" /> Look-alike na Base
        </div>
        <button
          onClick={handleCalcular}
          disabled={isPending || !temIcp}
          className="text-[10px] btn-ghost px-2 py-1 h-auto"
        >
          {isPending ? "Calculando..." : "Calcular Fit"}
        </button>
      </div>

      {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
      {sucesso && <div className="text-xs text-green-600 mb-2">{sucesso}</div>}

      {!temIcp && (
        <div className="flex items-start gap-2 p-2 bg-amber-500/10 text-amber-700 text-[10px] rounded border border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Gere o ICP primeiro para poder calcular o Look-alike dos leads ativos.</span>
        </div>
      )}
      
      <div className="text-xs text-muted-foreground mt-2">
        A IA pontuará os leads ativos da sua base comparando com o perfil deste produto.
        Os resultados aparecerão na barra lateral de leads ou no motor de prospecção.
      </div>
    </div>
  );
}
