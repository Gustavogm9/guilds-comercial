"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, Users, User, Calendar, TrendingUp, Loader2, AlertCircle, Check,
} from "lucide-react";
import { criarMeta, arquivarMeta } from "./actions";

interface Meta {
  id: number;
  vendedor_id: string | null;
  periodo: "semanal" | "mensal" | "trimestral";
  data_inicio: string;
  data_fim: string;
  metrica: string;
  meta_valor: number;
  realizado: number;
  pct_atingimento: number;
}

interface Membro {
  profile_id: string;
  display_name: string;
  role: string;
}

const METRICAS: Record<string, { label: string; tipo: "moeda" | "numero" }> = {
  receita_fechada: { label: "Receita fechada (R$)", tipo: "moeda" },
  qtd_leads_fechados: { label: "Qtd. leads fechados", tipo: "numero" },
  qtd_propostas: { label: "Qtd. propostas ativas", tipo: "numero" },
  qtd_atividades: { label: "Qtd. atividades", tipo: "numero" },
  qtd_reunioes: { label: "Qtd. reuniões", tipo: "numero" },
  receita_expansao: { label: "Receita expansão (R$)", tipo: "moeda" },
};

export default function MetasClient({
  metas,
  membros,
  currency,
}: {
  metas: Meta[];
  membros: Membro[];
  currency: string;
}) {
  const router = useRouter();
  const [showNova, setShowNova] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  function fmt(v: number, tipo: "moeda" | "numero") {
    if (tipo === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 });
    return v.toLocaleString("pt-BR");
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNova(true)} className="btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" /> Nova meta
        </button>
      </div>

      {feedback && (
        <div role="alert" className={`card p-3 mb-4 text-sm flex items-center gap-2 ${
          feedback.tipo === "ok" ? "border-success-500/30 bg-success-500/5 text-success-500" :
          "border-destructive/30 bg-destructive/5 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.texto}
        </div>
      )}

      {metas.length === 0 ? (
        <div className="card p-12 text-center">
          <Target className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma meta ativa.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Nova meta" pra começar.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {metas.map((m) => {
            const config = METRICAS[m.metrica];
            const vendedor = m.vendedor_id ? membros.find((mb) => mb.profile_id === m.vendedor_id) : null;
            const pct = Number(m.pct_atingimento ?? 0);
            const corPct = pct >= 100 ? "text-success-500" : pct >= 70 ? "text-warning-500" : "text-destructive";
            const corBar = pct >= 100 ? "bg-success-500" : pct >= 70 ? "bg-warning-500" : "bg-destructive";

            const diasAteFim = Math.ceil((new Date(m.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            return (
              <li key={m.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{config?.label ?? m.metrica}</span>
                      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/30">
                        {m.periodo}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {vendedor ? <><User className="w-3 h-3" /> {vendedor.display_name}</> : <><Users className="w-3 h-3" /> Time todo</>}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 tabular-nums inline-flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(m.data_inicio).toLocaleDateString("pt-BR")} → {new Date(m.data_fim).toLocaleDateString("pt-BR")}
                      {diasAteFim > 0 && <span className="text-primary">· {diasAteFim} dias restantes</span>}
                      {diasAteFim < 0 && <span className="text-muted-foreground/70">· encerrada</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold tabular-nums ${corPct}`} style={{ letterSpacing: "-0.5px" }}>
                      {pct.toFixed(0)}%
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">atingimento</div>
                  </div>
                </div>

                {/* Burndown bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="tabular-nums">
                      <strong className="text-foreground">{fmt(Number(m.realizado), config?.tipo ?? "numero")}</strong>
                      <span className="text-muted-foreground"> de {fmt(Number(m.meta_valor), config?.tipo ?? "numero")}</span>
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirm("Arquivar esta meta?")) return;
                        try {
                          await arquivarMeta(m.id);
                          router.refresh();
                        } catch (e) {
                          setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
                        }
                      }}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Arquivar
                    </button>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${corBar} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showNova && (
        <NovaMetaModal
          membros={membros}
          onClose={() => setShowNova(false)}
          onSucesso={(texto) => {
            setFeedback({ tipo: "ok", texto });
            setShowNova(false);
            router.refresh();
            setTimeout(() => setFeedback(null), 3000);
          }}
          onErro={(texto) => setFeedback({ tipo: "erro", texto })}
        />
      )}
    </>
  );
}

function NovaMetaModal({
  membros, onClose, onSucesso, onErro,
}: {
  membros: Membro[];
  onClose: () => void;
  onSucesso: (texto: string) => void;
  onErro: (texto: string) => void;
}) {
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [periodo, setPeriodo] = useState<"semanal" | "mensal" | "trimestral">("mensal");
  const [metrica, setMetrica] = useState<keyof typeof METRICAS>("receita_fechada");
  const [valor, setValor] = useState<string>("10000");
  const [pending, startTransition] = useTransition();

  // Calcula datas baseado no período
  const hoje = new Date();
  let dataInicio: string;
  let dataFim: string;
  if (periodo === "semanal") {
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() - hoje.getDay() + 1);
    dataInicio = segunda.toISOString().slice(0, 10);
    const domingo = new Date(segunda);
    domingo.setDate(segunda.getDate() + 6);
    dataFim = domingo.toISOString().slice(0, 10);
  } else if (periodo === "mensal") {
    dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  } else {
    const qStart = Math.floor(hoje.getMonth() / 3) * 3;
    dataInicio = new Date(hoje.getFullYear(), qStart, 1).toISOString().slice(0, 10);
    dataFim = new Date(hoje.getFullYear(), qStart + 3, 0).toISOString().slice(0, 10);
  }

  function salvar() {
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      onErro("Informe um valor válido pra meta.");
      return;
    }
    startTransition(async () => {
      try {
        await criarMeta({
          vendedor_id: vendedorId === "all" ? null : vendedorId,
          periodo,
          data_inicio: dataInicio,
          data_fim: dataFim,
          metrica: metrica as any,
          meta_valor: valorNum,
        });
        onSucesso("Meta criada.");
      } catch (e) {
        onErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm">Nova meta</div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Para quem</label>
            <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="input-base text-sm">
              <option value="all">Time todo</option>
              {membros.map((m) => <option key={m.profile_id} value={m.profile_id}>{m.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Período</label>
            <div className="grid grid-cols-3 gap-2">
              {(["semanal","mensal","trimestral"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`p-2 rounded-lg border text-xs ${periodo === p ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:bg-secondary/40"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {new Date(dataInicio).toLocaleDateString("pt-BR")} → {new Date(dataFim).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Métrica</label>
            <select value={metrica} onChange={(e) => setMetrica(e.target.value as any)} className="input-base text-sm">
              {Object.entries(METRICAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Valor da meta</label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="input-base text-sm tabular-nums"
              min={1}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={salvar} disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <TrendingUp className="w-3.5 h-3.5" /> Criar meta
          </button>
        </div>
      </div>
    </div>
  );
}

function Target({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
}
