"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, ChevronUp, ChevronDown, Save, Loader2, Check, AlertCircle,
  Mail, MessageCircle, Phone, Linkedin as LinkedinIcon, MessageSquare, ClipboardList,
} from "lucide-react";
import { atualizarFluxoPassos, publicarFluxo, marcarFluxoDefault, arquivarFluxo } from "../actions";

type Canal = "email" | "whatsapp" | "call" | "linkedin" | "sms" | "task_manual";
type Condicao =
  | "sempre"
  | "se_passo_anterior_aberto"
  | "se_passo_anterior_clicado"
  | "se_score_engajamento_gte_30"
  | "se_score_engajamento_gte_60"
  | "se_nao_respondeu_em_3d"
  | "se_nao_respondeu_em_7d";

interface Passo {
  id?: number;
  ordem: number;
  offset_dias: number;
  canal: Canal;
  nome_passo: string;
  assunto?: string | null;
  corpo?: string | null;
  pular_se_respondeu: boolean;
  pular_se_clicou_link: boolean;
  condicao_para_executar?: Condicao;
}

const CONDICOES: Array<{ value: Condicao; label: string }> = [
  { value: "sempre", label: "Sempre (sem condição)" },
  { value: "se_passo_anterior_aberto", label: "Só se passo anterior foi aberto" },
  { value: "se_passo_anterior_clicado", label: "Só se passo anterior teve clique" },
  { value: "se_score_engajamento_gte_30", label: "Só se score engajamento ≥ 30" },
  { value: "se_score_engajamento_gte_60", label: "Só se score engajamento ≥ 60 (quente)" },
  { value: "se_nao_respondeu_em_3d", label: "Só se não respondeu em 3d" },
  { value: "se_nao_respondeu_em_7d", label: "Só se não respondeu em 7d" },
];

interface Fluxo {
  id: number;
  nome: string;
  descricao: string | null;
  status: "draft" | "publicado" | "arquivado";
  default_template: boolean;
  trigger: string;
  trigger_valor: string | null;
  passos: Passo[];
}

const CANAL_CONFIG: Record<Canal, { icon: React.ComponentType<{ className?: string }>; label: string; cor: string }> = {
  email: { icon: Mail, label: "Email", cor: "text-primary bg-primary/10 border-primary/30" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", cor: "text-success-500 bg-success-500/10 border-success-500/30" },
  call: { icon: Phone, label: "Call", cor: "text-warning-500 bg-warning-500/10 border-warning-500/30" },
  linkedin: { icon: LinkedinIcon, label: "LinkedIn", cor: "text-primary bg-primary/10 border-primary/30" },
  sms: { icon: MessageSquare, label: "SMS", cor: "text-muted-foreground bg-muted border-border" },
  task_manual: { icon: ClipboardList, label: "Tarefa", cor: "text-muted-foreground bg-muted border-border" },
};

const PRESETS: Record<string, Omit<Passo, "ordem">> = {
  email_abertura: { offset_dias: 0, canal: "email", nome_passo: "Email D0 — Abertura", assunto: "Posso te ajudar com {{dor}}?", corpo: "Olá {{nome}},\n\n...", pular_se_respondeu: true, pular_se_clicou_link: false },
  whatsapp_reforco: { offset_dias: 3, canal: "whatsapp", nome_passo: "WhatsApp D3 — Reforço", assunto: null, corpo: "Oi {{nome}}, segui aqui — mandei um email tem alguns dias...", pular_se_respondeu: true, pular_se_clicou_link: false },
  call_followup: { offset_dias: 7, canal: "call", nome_passo: "Call D7 — Follow-up", assunto: null, corpo: "Roteiro: apresentar valor, qualificar, oferecer 5min na agenda.", pular_se_respondeu: true, pular_se_clicou_link: false },
};

export default function FluxoEditor({ fluxo }: { fluxo: Fluxo }) {
  const router = useRouter();
  const [passos, setPassos] = useState<Passo[]>(
    (fluxo.passos ?? []).sort((a, b) => a.ordem - b.ordem),
  );
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function moverCima(idx: number) {
    if (idx === 0) return;
    const novo = [...passos];
    [novo[idx - 1], novo[idx]] = [novo[idx], novo[idx - 1]];
    setPassos(novo);
  }

  function moverBaixo(idx: number) {
    if (idx === passos.length - 1) return;
    const novo = [...passos];
    [novo[idx], novo[idx + 1]] = [novo[idx + 1], novo[idx]];
    setPassos(novo);
  }

  function remover(idx: number) {
    setPassos(passos.filter((_, i) => i !== idx));
  }

  function adicionar(preset?: keyof typeof PRESETS) {
    const novo: Passo = preset
      ? { ...PRESETS[preset], ordem: passos.length + 1 }
      : {
        ordem: passos.length + 1,
        offset_dias: passos.length === 0 ? 0 : passos[passos.length - 1].offset_dias + 3,
        canal: "email",
        nome_passo: `Passo ${passos.length + 1}`,
        assunto: null,
        corpo: null,
        pular_se_respondeu: true,
        pular_se_clicou_link: false,
      };
    setPassos([...passos, novo]);
  }

  function atualizar(idx: number, patch: Partial<Passo>) {
    setPassos(passos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function salvar() {
    setFeedback(null);
    startTransition(async () => {
      try {
        await atualizarFluxoPassos({ fluxo_id: fluxo.id, passos });
        setFeedback({ tipo: "ok", texto: "Passos salvos." });
        router.refresh();
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      } finally {
        setTimeout(() => setFeedback(null), 2500);
      }
    });
  }

  function publicar() {
    if (passos.length === 0) {
      setFeedback({ tipo: "erro", texto: "Adicione pelo menos 1 passo antes de publicar." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      try {
        // Salva mudanças primeiro
        await atualizarFluxoPassos({ fluxo_id: fluxo.id, passos });
        await publicarFluxo(fluxo.id);
        setFeedback({ tipo: "ok", texto: "Fluxo publicado." });
        router.refresh();
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      } finally {
        setTimeout(() => setFeedback(null), 2500);
      }
    });
  }

  function marcarDefault() {
    startTransition(async () => {
      try {
        await marcarFluxoDefault(fluxo.id);
        setFeedback({ tipo: "ok", texto: "Marcado como default." });
        router.refresh();
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  }

  function arquivar() {
    if (!confirm("Arquivar este fluxo? Leads em cadência atual continuam funcionando, mas o fluxo não pode mais ser iniciado.")) return;
    startTransition(async () => {
      try {
        await arquivarFluxo(fluxo.id);
        router.push("/configuracoes/cadencia/fluxos");
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  }

  return (
    <div>
      <header className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">{fluxo.nome}</h1>
          {fluxo.default_template && (
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded border border-primary/30">default</span>
          )}
          <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border ${
            fluxo.status === "publicado" ? "text-success-500 bg-success-500/10 border-success-500/30" :
            "text-warning-500 bg-warning-500/10 border-warning-500/30"
          }`}>
            {fluxo.status}
          </span>
        </div>
        {fluxo.descricao && <p className="text-sm text-muted-foreground">{fluxo.descricao}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          Trigger: <strong>{fluxo.trigger}</strong>{fluxo.trigger_valor ? ` · ${fluxo.trigger_valor}` : ""}
        </p>
      </header>

      {/* Timeline visual dos passos */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Sequência ({passos.length} passo{passos.length !== 1 ? "s" : ""})</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => adicionar("email_abertura")} className="btn-ghost text-[11px]">+ Email D0</button>
            <button onClick={() => adicionar("whatsapp_reforco")} className="btn-ghost text-[11px]">+ WhatsApp</button>
            <button onClick={() => adicionar("call_followup")} className="btn-ghost text-[11px]">+ Call</button>
            <button onClick={() => adicionar()} className="btn-primary text-xs">
              <Plus className="w-3 h-3" /> Passo
            </button>
          </div>
        </div>

        {passos.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-6">
            Adicione o primeiro passo acima.
          </p>
        ) : (
          <ol className="space-y-3">
            {passos.map((p, idx) => {
              const config = CANAL_CONFIG[p.canal];
              const Icon = config.icon;
              return (
                <li key={`${p.id ?? "new"}-${idx}`} className="border border-border rounded-lg p-3 bg-background">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <button onClick={() => moverCima(idx)} disabled={idx === 0} className="btn-ghost p-1 disabled:opacity-30" aria-label="Mover acima">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground tabular-nums">
                        D{p.offset_dias}
                      </span>
                      <button onClick={() => moverBaixo(idx)} disabled={idx === passos.length - 1} className="btn-ghost p-1 disabled:opacity-30" aria-label="Mover abaixo">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">Dia (offset)</label>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            value={p.offset_dias}
                            onChange={(e) => atualizar(idx, { offset_dias: Math.max(0, Number(e.target.value) || 0) })}
                            className="input-base text-sm tabular-nums"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">Canal</label>
                          <select value={p.canal} onChange={(e) => atualizar(idx, { canal: e.target.value as Canal })} className="input-base text-sm">
                            {(Object.keys(CANAL_CONFIG) as Canal[]).map((c) => (
                              <option key={c} value={c}>{CANAL_CONFIG[c].label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-7">
                          <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">Nome do passo</label>
                          <input
                            type="text"
                            value={p.nome_passo}
                            onChange={(e) => atualizar(idx, { nome_passo: e.target.value })}
                            className="input-base text-sm"
                            maxLength={80}
                          />
                        </div>
                      </div>

                      {p.canal === "email" && (
                        <div>
                          <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">Assunto do email</label>
                          <input
                            type="text"
                            value={p.assunto ?? ""}
                            onChange={(e) => atualizar(idx, { assunto: e.target.value })}
                            placeholder="Use {{empresa}}, {{nome}}, {{dor}}, {{segmento}}"
                            className="input-base text-sm"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">
                          {p.canal === "call" || p.canal === "task_manual" ? "Roteiro/observações" : "Corpo da mensagem"}
                        </label>
                        <textarea
                          value={p.corpo ?? ""}
                          onChange={(e) => atualizar(idx, { corpo: e.target.value })}
                          placeholder="Use {{nome}}, {{empresa}}, {{dor}}, {{segmento}} pra personalizar"
                          className="input-base text-sm min-h-[80px]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">
                          Condição pra executar
                        </label>
                        <select
                          value={p.condicao_para_executar ?? "sempre"}
                          onChange={(e) => atualizar(idx, { condicao_para_executar: e.target.value as Condicao })}
                          className="input-base text-xs"
                        >
                          {CONDICOES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-xs">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={p.pular_se_respondeu}
                            onChange={(e) => atualizar(idx, { pular_se_respondeu: e.target.checked })}
                          />
                          Pular se respondeu
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={p.pular_se_clicou_link}
                            onChange={(e) => atualizar(idx, { pular_se_clicou_link: e.target.checked })}
                          />
                          Pular se clicou link
                        </label>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold px-1.5 py-0.5 rounded border ${config.cor}`}>
                        <Icon className="w-3 h-3" /> {config.label}
                      </span>
                      <button onClick={() => remover(idx)} className="btn-ghost text-xs text-muted-foreground hover:text-destructive" aria-label="Remover passo">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {feedback && (
        <div role="alert" className={`card p-3 mb-3 text-sm flex items-center gap-2 ${
          feedback.tipo === "ok" ? "border-success-500/30 bg-success-500/5 text-success-500" :
          "border-destructive/30 bg-destructive/5 text-destructive"
        }`}>
          {feedback.tipo === "ok" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.texto}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {fluxo.status === "publicado" && !fluxo.default_template && (
            <button onClick={marcarDefault} disabled={pending} className="btn-ghost text-xs">
              Marcar como default
            </button>
          )}
          <button onClick={arquivar} disabled={pending} className="btn-ghost text-xs text-muted-foreground hover:text-destructive">
            Arquivar
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={salvar} disabled={pending} className="btn-secondary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Save className="w-3.5 h-3.5" /> Salvar rascunho
          </button>
          {fluxo.status !== "publicado" && (
            <button onClick={publicar} disabled={pending} className="btn-primary text-sm">
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Publicar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
