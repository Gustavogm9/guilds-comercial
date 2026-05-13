"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, DollarSign, Loader2, Check, AlertCircle, FileText, User as UserIcon,
} from "lucide-react";
import { criarRegraComissao, arquivarRegra, atualizarStatusComissao } from "./actions";

interface Regra {
  id: number;
  nome: string;
  aplicar_em: string;
  tipo: string;
  percentual: number | null;
  valor_fixo: number | null;
  segmento_filtro: string | null;
  vendedor_id: string | null;
  vigente_de: string;
  vigente_ate: string | null;
}

interface Comissao {
  id: number;
  vendedor_id: string;
  vendedor: { display_name: string } | null;
  lead: { id: number; empresa: string | null; nome: string | null } | null;
  receita_base: number;
  percentual_aplicado: number | null;
  valor_comissao: number;
  competencia: string;
  status_pagamento: "pendente" | "aprovado" | "pago" | "cancelado";
  pago_em: string | null;
  observacao: string | null;
  created_at: string;
}

interface Membro {
  profile_id: string;
  display_name: string;
}

export default function ComissoesClient({
  regras, comissoes, membros, currency, resumo,
}: {
  regras: Regra[];
  comissoes: Comissao[];
  membros: Membro[];
  currency: string;
  resumo: { pendente: number; aprovado: number; pago: number };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"regras" | "historico">("regras");
  const [showNova, setShowNova] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 });

  function atualizarStatus(id: number, novo: "aprovado" | "pago" | "cancelado") {
    startTransition(async () => {
      try {
        await atualizarStatusComissao({ comissao_id: id, novo_status: novo });
        setFeedback({ tipo: "ok", texto: `Comissão marcada como ${novo}.` });
        router.refresh();
        setTimeout(() => setFeedback(null), 2500);
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  }

  return (
    <>
      {/* Resumo do mês */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-warning-500">Pendente</div>
          <div className="text-2xl font-semibold tabular-nums text-warning-500 mt-1">{fmt(resumo.pendente)}</div>
          <div className="text-xs text-muted-foreground">a aprovar</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Aprovado</div>
          <div className="text-2xl font-semibold tabular-nums text-primary mt-1">{fmt(resumo.aprovado)}</div>
          <div className="text-xs text-muted-foreground">a pagar</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-success-500">Pago</div>
          <div className="text-2xl font-semibold tabular-nums text-success-500 mt-1">{fmt(resumo.pago)}</div>
          <div className="text-xs text-muted-foreground">do mês corrente</div>
        </div>
      </section>

      {feedback && (
        <div role="alert" className={`card p-3 mb-4 text-sm flex items-center gap-2 ${
          feedback.tipo === "ok" ? "border-success-500/30 bg-success-500/5 text-success-500" :
          "border-destructive/30 bg-destructive/5 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.texto}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-border">
        <button
          onClick={() => setTab("regras")}
          className={`px-3 py-2 text-sm border-b-2 ${tab === "regras" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Regras ({regras.length})
        </button>
        <button
          onClick={() => setTab("historico")}
          className={`px-3 py-2 text-sm border-b-2 ${tab === "historico" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Histórico ({comissoes.length})
        </button>
        <div className="ml-auto">
          {tab === "regras" && (
            <button onClick={() => setShowNova(true)} className="btn-primary text-sm">
              <Plus className="w-3.5 h-3.5" /> Nova regra
            </button>
          )}
        </div>
      </div>

      {tab === "regras" && (
        <RegrasList regras={regras} membros={membros} currency={currency} onRefresh={() => router.refresh()} setFeedback={setFeedback} />
      )}
      {tab === "historico" && (
        <HistoricoList comissoes={comissoes} fmt={fmt} onMudarStatus={atualizarStatus} pending={pending} />
      )}

      {showNova && (
        <NovaRegraModal
          membros={membros}
          onClose={() => setShowNova(false)}
          onSucesso={(texto: string) => {
            setFeedback({ tipo: "ok", texto });
            setShowNova(false);
            router.refresh();
            setTimeout(() => setFeedback(null), 3000);
          }}
          onErro={(texto: string) => setFeedback({ tipo: "erro", texto })}
        />
      )}
    </>
  );
}

function RegrasList({
  regras, membros, currency, onRefresh, setFeedback,
}: any) {
  if (regras.length === 0) {
    return (
      <div className="card p-12 text-center">
        <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma regra ativa.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {regras.map((r: Regra) => {
        const vendedor = r.vendedor_id ? membros.find((m: any) => m.profile_id === r.vendedor_id) : null;
        return (
          <li key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                  {r.nome}
                  <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/30">
                    {r.aplicar_em.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.tipo === "percentual_fixo" && `${r.percentual}% sobre receita`}
                  {r.tipo === "valor_fixo_por_venda" && `${r.valor_fixo?.toLocaleString("pt-BR", { style: "currency", currency })} por venda`}
                  {r.tipo === "percentual_escalonado" && "Escalonado por atingimento"}
                  {r.segmento_filtro && <> · Apenas segmento "{r.segmento_filtro}"</>}
                  {vendedor && <> · Vendedor: {vendedor.display_name}</>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  Vigente: {new Date(r.vigente_de).toLocaleDateString("pt-BR")}
                  {r.vigente_ate && <> → {new Date(r.vigente_ate).toLocaleDateString("pt-BR")}</>}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!confirm("Arquivar regra?")) return;
                  try { await arquivarRegra(r.id); onRefresh(); }
                  catch (e) { setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." }); }
                }}
                className="btn-ghost text-xs text-muted-foreground hover:text-destructive"
              >
                Arquivar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function HistoricoList({ comissoes, fmt, onMudarStatus, pending }: any) {
  if (comissoes.length === 0) {
    return (
      <div className="card p-12 text-center">
        <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma comissão calculada ainda.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Comissões aparecem automaticamente quando lead vira "Fechado".</p>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Vendedor</th>
            <th className="text-left px-3 py-2 font-semibold">Lead</th>
            <th className="text-right px-3 py-2 font-semibold">Receita base</th>
            <th className="text-right px-3 py-2 font-semibold">Comissão</th>
            <th className="text-left px-3 py-2 font-semibold">Competência</th>
            <th className="text-left px-3 py-2 font-semibold">Status</th>
            <th className="text-right px-3 py-2 font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {comissoes.map((c: Comissao) => (
            <tr key={c.id} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
              <td className="px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <UserIcon className="w-3 h-3 text-muted-foreground" />
                  {c.vendedor?.display_name ?? "—"}
                </span>
              </td>
              <td className="px-3 py-2 text-xs">
                {c.lead ? <a href={`/vendas/pipeline/${c.lead.id}`} className="text-primary hover:underline">{c.lead.empresa ?? c.lead.nome}</a> : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(Number(c.receita_base))}</td>
              <td className="px-3 py-2 text-right tabular-nums text-sm font-semibold text-success-500">{fmt(Number(c.valor_comissao))}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                {new Date(c.competencia).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
              </td>
              <td className="px-3 py-2">
                <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border ${
                  c.status_pagamento === "pago" ? "text-success-500 bg-success-500/10 border-success-500/30" :
                  c.status_pagamento === "aprovado" ? "text-primary bg-primary/10 border-primary/30" :
                  c.status_pagamento === "cancelado" ? "text-muted-foreground bg-muted border-border" :
                  "text-warning-500 bg-warning-500/10 border-warning-500/30"
                }`}>
                  {c.status_pagamento}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                {c.status_pagamento === "pendente" && (
                  <>
                    <button onClick={() => onMudarStatus(c.id, "aprovado")} disabled={pending} className="btn-ghost text-xs text-primary">Aprovar</button>
                    <button onClick={() => onMudarStatus(c.id, "cancelado")} disabled={pending} className="btn-ghost text-xs text-muted-foreground hover:text-destructive">Cancelar</button>
                  </>
                )}
                {c.status_pagamento === "aprovado" && (
                  <button onClick={() => onMudarStatus(c.id, "pago")} disabled={pending} className="btn-primary text-xs">Marcar paga</button>
                )}
                {c.status_pagamento === "pago" && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {c.pago_em ? new Date(c.pago_em).toLocaleDateString("pt-BR") : "—"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NovaRegraModal({ membros, onClose, onSucesso, onErro }: any) {
  const [nome, setNome] = useState("");
  const [aplicarEm, setAplicarEm] = useState<"lead_fechado" | "expansao_fechada" | "renovacao">("lead_fechado");
  const [tipo, setTipo] = useState<"percentual_fixo" | "valor_fixo_por_venda" | "percentual_escalonado">("percentual_fixo");
  const [percentual, setPercentual] = useState("5");
  const [valorFixo, setValorFixo] = useState("");
  const [segmento, setSegmento] = useState("");
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [vigenteDe, setVigenteDe] = useState(new Date().toISOString().slice(0, 10));
  const [vigenteAte, setVigenteAte] = useState("");
  const [pending, startTransition] = useTransition();

  function salvar() {
    if (!nome.trim()) { onErro("Nome obrigatório."); return; }
    startTransition(async () => {
      try {
        await criarRegraComissao({
          nome,
          aplicar_em: aplicarEm,
          tipo,
          percentual: tipo === "percentual_fixo" ? Number(percentual) : null,
          valor_fixo: tipo === "valor_fixo_por_venda" ? Number(valorFixo) : null,
          segmento_filtro: segmento || null,
          vendedor_id: vendedorId === "all" ? null : vendedorId,
          vigente_de: vigenteDe,
          vigente_ate: vigenteAte || null,
        });
        onSucesso("Regra criada.");
      } catch (e) {
        onErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-card text-foreground border border-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-semibold text-sm">Nova regra de comissão</div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Padrão 5% sobre venda nova" className="input-base text-sm" maxLength={80} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Aplicar em</label>
            <select value={aplicarEm} onChange={(e) => setAplicarEm(e.target.value as any)} className="input-base text-sm">
              <option value="lead_fechado">Lead novo fechado</option>
              <option value="expansao_fechada">Expansão (upsell/cross-sell)</option>
              <option value="renovacao">Renovação</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="input-base text-sm">
              <option value="percentual_fixo">% Fixo sobre receita</option>
              <option value="valor_fixo_por_venda">Valor fixo por venda</option>
              <option value="percentual_escalonado">% Escalonado (faixas)</option>
            </select>
          </div>
          {tipo === "percentual_fixo" && (
            <div>
              <label className="block text-xs font-medium mb-1">Percentual (%)</label>
              <input type="number" value={percentual} onChange={(e) => setPercentual(e.target.value)} min="0" max="100" step="0.5" className="input-base text-sm tabular-nums" />
            </div>
          )}
          {tipo === "valor_fixo_por_venda" && (
            <div>
              <label className="block text-xs font-medium mb-1">Valor por venda (R$)</label>
              <input type="number" value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} min="0" className="input-base text-sm tabular-nums" />
            </div>
          )}
          {tipo === "percentual_escalonado" && (
            <p className="text-xs text-muted-foreground italic">
              Escalonamento por atingimento — edite faixas via SQL editor por enquanto (UI completo na próxima rodada).
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Segmento (opcional)</label>
              <input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Saúde, Tech..." className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Vendedor (opcional)</label>
              <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="input-base text-sm">
                <option value="all">Todos</option>
                {membros.map((m: any) => <option key={m.profile_id} value={m.profile_id}>{m.display_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1">Vigente de</label>
              <input type="date" value={vigenteDe} onChange={(e) => setVigenteDe(e.target.value)} className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Vigente até (opcional)</label>
              <input type="date" value={vigenteAte} onChange={(e) => setVigenteAte(e.target.value)} className="input-base text-sm" />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={salvar} disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Criar regra
          </button>
        </div>
      </div>
    </div>
  );
}
