"use client";
import Image from "next/image";
import { useState, useTransition } from "react";
import {
  Sparkles, Send, CheckCircle2, AlertCircle, Loader2, Plus, X,
  QrCode, Trophy, Clock, Award, Gift,
} from "lucide-react";
import type { EmbaixadorPortalContext, ProgramaRecompensaPortal } from "@/lib/types";
import {
  criarIndicacaoPortalAction,
  type NovaIndicacaoPortalInput,
} from "./actions";

interface MinhaIndicacaoPortal {
  indicado_nome: string;
  indicado_empresa: string | null;
  status: string;
  data_recebida: string;
  data_fechado: string | null;
  data_perdido: string | null;
  recompensa_paga: boolean;
}

interface BrandingPortal {
  organizacao_nome: string;
  logo_url: string | null;
  cor_primaria: string | null;
}

/**
 * Portal embaixador self-service. Cliente acessa via link compartilhado pelo
 * vendedor e registra indicações sem precisar de conta no CRM.
 *
 * Bloco F do polish:
 *   - Lista de indicações que o cliente deu, com status (item #5)
 *   - QR code pra compartilhar facilmente (item #15)
 *   - Branding custom (logo + cor primária) da org (item #16)
 *   - Programa de recompensas explícito quando ativo
 */
export default function IndicarClient({
  token,
  ctx,
  minhasIndicacoes,
  programa,
  branding,
}: {
  token: string;
  ctx: EmbaixadorPortalContext;
  minhasIndicacoes: MinhaIndicacaoPortal[];
  programa: ProgramaRecompensaPortal | null;
  branding: BrandingPortal | null;
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

  // Branding custom (#16): aplica cor primária da org se setada
  const corCustom = branding?.cor_primaria;
  const bgStyle = corCustom
    ? { background: `linear-gradient(135deg, ${corCustom}10 0%, transparent 50%, ${corCustom}05 100%)` }
    : undefined;

  return (
    <div
      className={corCustom ? "min-h-screen" : "min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/[0.02]"}
      style={bgStyle}
    >
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        {/* Logo da org (se configurado — branding) */}
        {branding?.logo_url && (
          <div className="text-center mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- origem do logo e dinamica por cliente */}
            <img
              src={branding.logo_url}
              alt={branding.organizacao_nome ?? "Logo"}
              className="h-12 mx-auto"
              style={{ maxWidth: "200px", objectFit: "contain" }}
            />
          </div>
        )}
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

          {/* Programa de recompensa — quando ativo */}
          {programa?.programa_ativo && (programa.valor_virou_lead > 0 || programa.valor_fechado > 0) && (
            <div className="mt-4 p-3 rounded-lg bg-success-500/5 border border-success-500/30 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <Gift className="w-4 h-4 text-success-500" aria-hidden="true" />
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-success-500">
                  Programa de recompensas ativo
                </span>
              </div>
              <p className="text-xs text-foreground/90 text-center">
                {programa.valor_fechado > 0 && (
                  <>
                    Você ganha <strong>R$ {programa.valor_fechado}</strong> a cada indicação que vira cliente.
                  </>
                )}
                {programa.valor_virou_lead > 0 && programa.valor_fechado === 0 && (
                  <>
                    Você ganha <strong>R$ {programa.valor_virou_lead}</strong> a cada indicação que vira lead novo.
                  </>
                )}
              </p>
              {programa.mensagem_recompensa && (
                <p className="text-[11px] text-muted-foreground italic mt-1.5 text-center">
                  {programa.mensagem_recompensa}
                </p>
              )}
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

        {/* Lista de indicações dadas (Bloco F #5) */}
        {minhasIndicacoes.length > 0 && (
          <div className="card p-4 mb-6">
            <details>
              <summary className="cursor-pointer select-none flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-primary" aria-hidden="true" />
                  Suas indicações ({minhasIndicacoes.length})
                </span>
                <span className="text-[11px] text-muted-foreground">Clique para expandir</span>
              </summary>
              <ul className="mt-3 space-y-1.5">
                {minhasIndicacoes.map((ind, idx) => (
                  <IndicacaoStatusRow key={idx} ind={ind} />
                ))}
              </ul>
            </details>
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

        {/* QR code pra compartilhar (Bloco F #15) */}
        {typeof window !== "undefined" && (
          <details className="card p-3 mt-6">
            <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
              <QrCode className="w-3 h-3" aria-hidden="true" />
              Compartilhar este link via QR code
            </summary>
            <div className="mt-3 text-center">
              <Image
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.href)}`}
                alt="QR code do link de indicação"
                className="mx-auto rounded-lg border border-border bg-card p-2"
                width={200}
                height={200}
              />
              <p className="text-[11px] text-muted-foreground mt-2 max-w-md mx-auto">
                Outras pessoas podem escanear este QR code (com a câmera do celular) pra abrir o portal de indicação.
              </p>
            </div>
          </details>
        )}

        <footer className="mt-8 text-center text-[11px] text-muted-foreground/70">
          {branding?.logo_url ? (
            <span>by {branding.organizacao_nome}</span>
          ) : (
            <span>Powered by Guilds Comercial</span>
          )}
        </footer>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function IndicacaoStatusRow({ ind }: { ind: MinhaIndicacaoPortal }) {
  const config = {
    recebida: { label: "Recebida", tone: "text-muted-foreground", icon: <Clock className="w-3 h-3" /> },
    contactado: { label: "Em conversa", tone: "text-primary", icon: <Sparkles className="w-3 h-3" /> },
    virou_lead: { label: "Em conversa", tone: "text-primary", icon: <Sparkles className="w-3 h-3" /> },
    fechado: { label: "Virou cliente!", tone: "text-success-500", icon: <Trophy className="w-3 h-3" /> },
    perdido: { label: "Não rolou", tone: "text-muted-foreground/60", icon: <X className="w-3 h-3" /> },
    descartado: { label: "Descartada", tone: "text-muted-foreground/60", icon: <X className="w-3 h-3" /> },
  } as const;
  const c = (config as any)[ind.status] ?? config.recebida;

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border text-xs">
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate block">{ind.indicado_nome}</span>
        {ind.indicado_empresa && (
          <span className="text-[11px] text-muted-foreground truncate block">{ind.indicado_empresa}</span>
        )}
      </div>
      <span className={`inline-flex items-center gap-1 ${c.tone} font-semibold whitespace-nowrap`}>
        {c.icon} {c.label}
        {ind.recompensa_paga && <Award className="w-3 h-3 text-warning-500" aria-label="Recompensa paga" />}
      </span>
    </li>
  );
}
