"use client";

/**
 * LeadProdutosWidget — exibido na página de detalhe do lead.
 * Permite vincular/desvincular produtos e atualizar o status de negociação.
 */

import { useState, useTransition } from "react";
import {
  Package, Plus, X, ChevronDown, Check, Loader2, Tag,
} from "lucide-react";
import {
  vincularProdutoLead,
  desvincularProdutoLead,
  atualizarStatusLeadProduto,
} from "@/app/(app)/vendas/portfolio/actions-sprint10";

const STATUS_OPTS = [
  { key: "interesse",  label: "Interesse",  cor: "bg-blue-500/10 text-blue-700" },
  { key: "negociando", label: "Negociando", cor: "bg-amber-500/10 text-amber-700" },
  { key: "fechado",    label: "Fechado",    cor: "bg-green-500/10 text-green-700" },
  { key: "perdido",    label: "Perdido",    cor: "bg-red-500/10 text-red-700" },
];

type LeadProduto = {
  lead_id: number; produto_id: number; status: string;
  produtos?: { nome: string; categoria?: string; recorrente?: boolean } | null;
};

type Produto = { id: number; nome: string; categoria?: string };

type Props = {
  leadId: number;
  leadProdutosIniciais: LeadProduto[];
  produtos: Produto[]; // todos os produtos da org
};

export default function LeadProdutosWidget({ leadId, leadProdutosIniciais, produtos }: Props) {
  const [leadProdutos, setLeadProdutos] = useState(leadProdutosIniciais);
  const [adicionando, setAdicionando] = useState(false);
  const [produtoSel, setProdutoSel] = useState("");
  const [pending, start] = useTransition();

  const disponiveis = produtos.filter(p => !leadProdutos.some(lp => lp.produto_id === p.id));

  function vincular() {
    if (!produtoSel) return;
    const pid = Number(produtoSel);
    start(async () => {
      await vincularProdutoLead(leadId, pid);
      const prod = produtos.find(p => p.id === pid);
      setLeadProdutos(prev => [
        ...prev,
        { lead_id: leadId, produto_id: pid, status: "interesse", produtos: prod ?? null },
      ]);
      setProdutoSel("");
      setAdicionando(false);
    });
  }

  function desvincular(produtoId: number) {
    start(async () => {
      await desvincularProdutoLead(leadId, produtoId);
      setLeadProdutos(prev => prev.filter(lp => lp.produto_id !== produtoId));
    });
  }

  function mudarStatus(produtoId: number, novoStatus: string) {
    start(async () => {
      await atualizarStatusLeadProduto(leadId, produtoId, novoStatus);
      setLeadProdutos(prev =>
        prev.map(lp => lp.produto_id === produtoId ? { ...lp, status: novoStatus } : lp)
      );
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" /> Produtos de interesse
        </div>
        {disponiveis.length > 0 && (
          <button
            onClick={() => setAdicionando(v => !v)}
            className="btn-ghost !py-0.5 !px-1.5 text-[10px] gap-1"
          >
            <Plus className="w-3 h-3" /> Vincular
          </button>
        )}
      </div>

      {/* Seletor */}
      {adicionando && (
        <div className="flex gap-2 animate-in fade-in">
          <select
            className="input-base flex-1 text-xs"
            value={produtoSel}
            onChange={e => setProdutoSel(e.target.value)}
          >
            <option value="">Selecionar produto…</option>
            {disponiveis.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <button onClick={vincular} disabled={!produtoSel || pending} className="btn-primary !py-1 !px-2 text-xs gap-1">
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            OK
          </button>
          <button onClick={() => setAdicionando(false)} className="btn-ghost !py-1 !px-2 text-xs">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Lista de produtos vinculados */}
      {leadProdutos.length === 0 && !adicionando ? (
        <div className="text-xs text-muted-foreground p-2 border border-dashed rounded-lg text-center">
          Nenhum produto vinculado ainda.
          {disponiveis.length > 0 && (
            <button onClick={() => setAdicionando(true)} className="ml-1 text-primary hover:underline">Vincular</button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {leadProdutos.map(lp => {
            const st = STATUS_OPTS.find(s => s.key === lp.status) ?? STATUS_OPTS[0];
            return (
              <div key={lp.produto_id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {lp.produtos?.nome ?? `Produto #${lp.produto_id}`}
                  </div>
                  {lp.produtos?.categoria && (
                    <div className="text-[10px] text-muted-foreground">{lp.produtos.categoria}</div>
                  )}
                </div>
                {/* Status selector */}
                <div className="relative group">
                  <button className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${st.cor}`}>
                    {st.label}
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  <div className="absolute right-0 top-6 z-50 bg-card border border-border rounded-lg shadow-lg hidden group-hover:block min-w-[110px]">
                    {STATUS_OPTS.map(s => (
                      <button
                        key={s.key}
                        onClick={() => mudarStatus(lp.produto_id, s.key)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-secondary flex items-center gap-2 ${lp.status === s.key ? "font-semibold" : ""}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${s.cor.split(" ")[0]}`} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => desvincular(lp.produto_id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
