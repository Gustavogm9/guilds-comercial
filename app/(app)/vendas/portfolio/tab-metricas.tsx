"use client";

import { useState, useTransition } from "react";
import {
  BarChart3, TrendingUp, Users, FileText, Target, Percent,
  ChevronRight, Package, Clock,
} from "lucide-react";

type Metrica = {
  id: number; nome: string; categoria?: string; recorrente?: boolean;
  total_leads: number; em_negociacao: number; fechados: number; perdidos: number;
  taxa_conversao_pct?: number; ticket_medio?: number;
  total_cases: number; total_responsaveis: number;
};

type Props = {
  metricas: Metrica[];
  onSelecionarProduto?: (id: number) => void;
};

export default function TabMetricas({ metricas, onSelecionarProduto }: Props) {
  const [ordenar, setOrdenar] = useState<"total_leads" | "fechados" | "taxa_conversao_pct" | "ticket_medio">("total_leads");

  const ordenados = [...metricas].sort((a, b) =>
    ((b[ordenar] as number) ?? 0) - ((a[ordenar] as number) ?? 0)
  );

  const totalLeads   = metricas.reduce((s, m) => s + (m.total_leads ?? 0), 0);
  const totalFechos  = metricas.reduce((s, m) => s + (m.fechados ?? 0), 0);
  const ticketGeral  = metricas.filter(m => m.ticket_medio).reduce((s, m, _, arr) =>
    s + (m.ticket_medio ?? 0) / arr.length, 0);

  return (
    <div className="space-y-6">
      {/* KPIs globais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Produtos ativos", valor: metricas.length, icon: <Package className="w-4 h-4 text-primary" />, cor: "bg-primary/10" },
          { label: "Total de leads", valor: totalLeads, icon: <Users className="w-4 h-4 text-blue-600" />, cor: "bg-blue-500/10" },
          { label: "Fechamentos", valor: totalFechos, icon: <TrendingUp className="w-4 h-4 text-green-600" />, cor: "bg-green-500/10" },
          { label: "Ticket médio", valor: ticketGeral ? `R$ ${Math.round(ticketGeral).toLocaleString("pt-BR")}` : "—", icon: <BarChart3 className="w-4 h-4 text-amber-600" />, cor: "bg-amber-500/10" },
        ].map(k => (
          <div key={k.label} className="card p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${k.cor} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div>
              <div className="text-lg font-bold">{k.valor}</div>
              <div className="text-[11px] text-muted-foreground">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Ordenação */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Ordenar por:</span>
        {(["total_leads", "fechados", "taxa_conversao_pct", "ticket_medio"] as const).map(campo => (
          <button
            key={campo}
            onClick={() => setOrdenar(campo)}
            className={`px-2 py-1 rounded transition-colors ${ordenar === campo ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            {{ total_leads: "Leads", fechados: "Fechamentos", taxa_conversao_pct: "Conversão", ticket_medio: "Ticket" }[campo]}
          </button>
        ))}
      </div>

      {/* Lista de produtos com métricas */}
      {metricas.length === 0 ? (
        <div className="card p-10 text-center border-dashed">
          <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum dado disponível ainda.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastre produtos e vincule leads para ver as métricas de performance.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordenados.map((m, i) => {
            const conv = m.taxa_conversao_pct ?? 0;
            const convCor = conv >= 50 ? "text-green-600" : conv >= 25 ? "text-amber-600" : "text-muted-foreground";
            return (
              <div
                key={m.id}
                className="card p-4 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => onSelecionarProduto?.(m.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Ranking */}
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{m.nome}</span>
                      {m.categoria && <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{m.categoria}</span>}
                      {m.recorrente && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">MRR</span>}
                    </div>
                    {/* Barra de progresso funil */}
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Leads",        val: m.total_leads,    cor: "bg-blue-500" },
                        { label: "Negociando",   val: m.em_negociacao,  cor: "bg-amber-500" },
                        { label: "Fechados",     val: m.fechados,       cor: "bg-green-500" },
                        { label: "Perdidos",     val: m.perdidos,       cor: "bg-red-400" },
                      ].map(s => (
                        <div key={s.label}>
                          <div className="text-base font-bold">{s.val ?? 0}</div>
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                          <div className="h-1 rounded-full mt-1" style={{
                            background: s.cor.replace("bg-", ""),
                            opacity: (s.val ?? 0) > 0 ? 1 : 0.15,
                            width: `${Math.min(100, ((s.val ?? 0) / Math.max(m.total_leads ?? 1, 1)) * 100)}%`,
                          }} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <div className={`text-sm font-bold ${convCor}`}>
                      {conv > 0 ? `${conv}%` : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">conversão</div>
                    {m.ticket_medio && (
                      <div className="text-[10px] font-mono text-muted-foreground">
                        R$ {Math.round(m.ticket_medio).toLocaleString("pt-BR")}
                      </div>
                    )}
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{m.total_responsaveis} eq.</span>
                      <FileText className="w-3 h-3 text-muted-foreground ml-1" />
                      <span className="text-[10px] text-muted-foreground">{m.total_cases} cases</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0 self-center" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
