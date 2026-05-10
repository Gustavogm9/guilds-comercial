"use client";

import { FileText, CheckCircle, XCircle, Clock, Send, Eye } from "lucide-react";
import { atualizarStatusProposta } from "./actions";
import { useState, useTransition } from "react";

type Proposta = {
  id: number; lead_id?: number; variacao?: string;
  valor_total?: number; status?: string;
  data_envio?: string; data_resposta?: string; motivo_recusa?: string;
  produtos?: { nome: string } | null;
  leads?: { empresa?: string; nome?: string } | null;
  created_at?: string;
};

const STATUS_ICONE: Record<string, { icon: typeof FileText; cor: string; label: string }> = {
  rascunho:    { icon: FileText,    cor: "text-muted-foreground", label: "Rascunho" },
  enviada:     { icon: Send,        cor: "text-blue-500",         label: "Enviada" },
  visualizada: { icon: Eye,         cor: "text-amber-500",        label: "Visualizada" },
  aceita:      { icon: CheckCircle, cor: "text-green-500",        label: "Aceita" },
  recusada:    { icon: XCircle,     cor: "text-destructive",      label: "Recusada" },
  expirada:    { icon: Clock,       cor: "text-muted-foreground", label: "Expirada" },
};

type Props = { propostas: Proposta[] };

export default function TabPropostas({ propostas: inicial }: Props) {
  const [propostas, setPropostas] = useState(inicial);
  const [pending, start] = useTransition();

  function atualizarStatus(id: number, status: "aceita" | "recusada" | "visualizada") {
    start(async () => {
      await atualizarStatusProposta(id, status);
      setPropostas(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    });
  }

  if (propostas.length === 0) {
    return (
      <div className="card p-10 text-center border-dashed">
        <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground mb-1">Nenhuma proposta registrada</p>
        <p className="text-xs text-muted-foreground">As propostas geradas pela IA aparecerão aqui automaticamente.</p>
      </div>
    );
  }

  // Analytics rápido
  const stats = {
    total:    propostas.length,
    aceitas:  propostas.filter(p => p.status === "aceita").length,
    recusadas: propostas.filter(p => p.status === "recusada").length,
    conv:     propostas.length > 0
      ? Math.round((propostas.filter(p => p.status === "aceita").length / propostas.length) * 100)
      : 0,
  };

  return (
    <div className="space-y-5">
      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total enviadas",  val: stats.total,     cor: "" },
          { label: "Aceitas",         val: stats.aceitas,   cor: "text-green-600" },
          { label: "Recusadas",       val: stats.recusadas, cor: "text-destructive" },
          { label: "Conversão",       val: `${stats.conv}%`, cor: stats.conv >= 30 ? "text-green-600" : "" },
        ].map(({ label, val, cor }) => (
          <div key={label} className="card p-4 text-center">
            <div className={`text-2xl font-bold tracking-tight ${cor}`}>{val}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabela de propostas */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/20">
              <tr>
                {["Lead / Empresa", "Produto", "Variação", "Valor", "Status", "Data", "Ações"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {propostas.map(p => {
                const { icon: Icon, cor, label } = STATUS_ICONE[p.status ?? "enviada"] ?? STATUS_ICONE.enviada;
                return (
                  <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {p.leads?.empresa || p.leads?.nome || `Lead #${p.lead_id}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.produtos?.nome ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.variacao && (
                        <span className="text-[10px] capitalize bg-secondary px-1.5 py-0.5 rounded">{p.variacao}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {p.valor_total
                        ? p.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs ${cor}`}>
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.data_envio ?? p.created_at?.slice(0, 10) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {(p.status === "enviada" || p.status === "visualizada") && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => atualizarStatus(p.id, "aceita")}
                            className="text-[10px] bg-green-500/10 text-green-600 hover:bg-green-500/20 px-2 py-1 rounded transition-colors"
                          >
                            Aceita
                          </button>
                          <button
                            onClick={() => atualizarStatus(p.id, "recusada")}
                            className="text-[10px] bg-destructive/10 text-destructive hover:bg-destructive/20 px-2 py-1 rounded transition-colors"
                          >
                            Recusada
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
