"use client";
import { useState, useTransition } from "react";
import { Sparkles, Send, CheckCircle2, AlertCircle, Loader2, Plus, X } from "lucide-react";
import type { EmbaixadorPortalContext } from "@/lib/types";
import {
  criarIndicacaoPortalAction,
  type NovaIndicacaoPortalInput,
} from "./actions";

/**
 * Portal embaixador self-service. Cliente acessa via link compartilhado pelo
 * vendedor e registra indicações sem precisar de conta no CRM.
 *
 * Fluxo:
 *   1. Header com nome da org + saudação ao embaixador
 *   2. Stat cards: quantas você já indicou, quantas fecharam
 *   3. Form pra adicionar até max_indicacoes_por_acesso indicações
 *   4. Botão "Enviar" → cria via RPC → tela de sucesso
 */
export default function IndicarClient({
  token,
  ctx,
}: {
  token: string;
  ctx: EmbaixadorPortalContext;
}) {
  const [pending, startTransition] = useTransition();
  const [indicacoes, setIndicacoes] = useState<NovaIndicacaoPortalInput[]>([
    { token, indicado_nome: "", indicado_empresa: "", indicado_email: "", indicado_whatsapp: "", contexto: "" },
  ]);
  const [enviadas, setEnviadas] = useState<number>(0);
  const [erros, setErros] = useState<Array<string | null>>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const max = Math.max(1, Math.min(20, ctx.max_indicacoes_por_acesso ?? 5));
  const nomeEmbaixador = ctx.embaixador_nome?.split(" ")[0] ?? ctx.embaixador_empresa ?? "Embaixador";

  function update(i: number, patch: Partial<NovaIndicacaoPortalInput>) {
    setIndicacoes(indicacoes.map((ind, idx) => (idx === i ? { ...ind, ...patch } : ind)));
  }

  function add() {
    if (indicacoes.length >= max) return;
    setIndicacoes([
      ...indicacoes,
      { token, indicado_nome: "", indicado_empresa: "", indicado_email: "", indicado_whatsapp: "", contexto: "" },
    ]);
  }

  function remover(i: number) {
    if (indicacoes.length === 1) return;
    setIndicacoes(indicacoes.filter((_, idx) => idx !== i));
  }

  function handleEnviar() {
    const validas = indicacoes.filter((i) => i.indicado_nome?.trim());
    if (validas.length === 0) {
      setErros([
        "Adicione ao menos 1 indicação com nome.",
        ...indicacoes.slice(1).map(() => null),
      ]);
      return;
    }

    startTransition(async () => {
      const errosLocal: Array<string | null> = new Array(indicacoes.length).fill(null);
      let sucessos = 0;

      for (let i = 0; i < indicacoes.length; i++) {
        const ind = indicacoes[i];
        if (!ind.indicado_nome?.trim()) continue;

        const res = await criarIndicacaoPortalAction({ ...ind, token });
        if (res.ok) {
          sucessos += 1;
        } else {
          errosLocal[i] = res.erro;
        }
      }

      setErros(errosLocal);
      setEnviadas(sucessos);
      if (sucessos > 0) {
        setShowSuccess(true);
      }
    });
  }

  function novoLote() {
    setIndicacoes([
      { token, indicado_nome: "", indicado_empresa: "", indicado_email: "", indicado_whatsapp: "", contexto: "" },
    ]);
    setShowSuccess(false);
    setEnviadas(0);
    setErros([]);
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success-500/5 flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-success-500 mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            Obrigado, {nomeEmbaixador}!
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {enviadas === 1
              ? "Sua indicação foi enviada para o time da "
              : `${enviadas} indicações foram enviadas para o time da `}
            <strong className="text-foreground">{ctx.organizacao_nome}</strong>.
            Eles entram em contato direto.
          </p>
          <button onClick={novoLote} className="btn-secondary text-sm">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Indicar mais alguém
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/[0.02]">
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        {/* Header */}
        <header className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold uppercase tracking-[0.12em]">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Programa de indicações
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2" style={{ letterSpacing: "-0.5px" }}>
            Olá, {nomeEmbaixador}!
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Conhece alguém que se beneficiaria do trabalho da{" "}
            <strong className="text-foreground">{ctx.organizacao_nome}</strong>?
            Indique abaixo — eles entram em contato direto.
          </p>

          {ctx.mensagem_personalizada && (
            <div className="mt-4 p-3 rounded-lg bg-card border border-border max-w-md mx-auto text-sm text-foreground/90 italic">
              {ctx.mensagem_personalizada}
            </div>
          )}
        </header>

        {/* Stats */}
        {(ctx.qtd_minhas_indicacoes > 0 || ctx.qtd_minhas_que_fecharam > 0) && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="card p-4 text-center">
              <div className="text-3xl font-semibold text-primary tabular-nums">{ctx.qtd_minhas_indicacoes}</div>
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground mt-1">
                {ctx.qtd_minhas_indicacoes === 1 ? "Indicação dada" : "Indicações dadas"}
              </div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-3xl font-semibold text-success-500 tabular-nums">{ctx.qtd_minhas_que_fecharam}</div>
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground mt-1">
                {ctx.qtd_minhas_que_fecharam === 1 ? "Virou cliente" : "Viraram clientes"}
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="space-y-3">
          {indicacoes.map((ind, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
                  Indicação {i + 1}
                </span>
                {indicacoes.length > 1 && (
                  <button
                    onClick={() => remover(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label text-xs">Nome *</label>
                  <input
                    value={ind.indicado_nome}
                    onChange={(e) => update(i, { indicado_nome: e.target.value })}
                    placeholder="Maria da Silva"
                    className="input-base text-sm mt-1"
                    required
                  />
                </div>
                <div>
                  <label className="label text-xs">Empresa</label>
                  <input
                    value={ind.indicado_empresa ?? ""}
                    onChange={(e) => update(i, { indicado_empresa: e.target.value })}
                    placeholder="Empresa Exemplo"
                    className="input-base text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="label text-xs">Cargo</label>
                  <input
                    value={ind.indicado_cargo ?? ""}
                    onChange={(e) => update(i, { indicado_cargo: e.target.value })}
                    placeholder="CEO, Sócia, Diretora..."
                    className="input-base text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="label text-xs">Email</label>
                  <input
                    type="email"
                    value={ind.indicado_email ?? ""}
                    onChange={(e) => update(i, { indicado_email: e.target.value })}
                    placeholder="maria@empresa.com"
                    className="input-base text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="label text-xs">WhatsApp</label>
                  <input
                    value={ind.indicado_whatsapp ?? ""}
                    onChange={(e) => update(i, { indicado_whatsapp: e.target.value })}
                    placeholder="(11) 99999-0000"
                    className="input-base text-sm mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="label text-xs">Por que pensei nela/nele? (opcional)</label>
                  <textarea
                    value={ind.contexto ?? ""}
                    onChange={(e) => update(i, { contexto: e.target.value })}
                    placeholder="Sócio meu, está crescendo o time comercial..."
                    className="input-base mt-1 min-h-[60px] text-sm"
                  />
                </div>
              </div>

              {erros[i] && (
                <p role="alert" className="mt-2 text-xs text-destructive inline-flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" aria-hidden="true" />
                  {erros[i]}
                </p>
              )}
            </div>
          ))}

          <button
            onClick={add}
            disabled={indicacoes.length >= max}
            className="btn-secondary text-sm w-full"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Adicionar mais alguém
          </button>
          {indicacoes.length >= max && (
            <p className="text-[11px] text-muted-foreground text-center">
              Máximo de {max} indicações por envio.
            </p>
          )}
        </div>

        {/* Submit */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={handleEnviar}
            disabled={pending || indicacoes.every((i) => !i.indicado_nome?.trim())}
            className="btn-primary text-sm px-6 py-3"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
            {pending ? "Enviando..." : "Enviar indicações"}
          </button>
          <p className="text-[11px] text-muted-foreground text-center max-w-md">
            Suas indicações vão direto pro time da {ctx.organizacao_nome}.
            Os contatos não serão usados pra spam.
          </p>
        </div>

        <footer className="mt-8 text-center text-[11px] text-muted-foreground/70">
          Powered by Guilds Comercial
        </footer>
      </div>
    </div>
  );
}
