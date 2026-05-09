"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, X, Clock, Loader2, ArrowRight, Plus } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import {
  responderPedidoIndicacao,
  adiarPedidoIndicacao,
  type NovaIndicacaoInput,
} from "@/app/(app)/indicacoes/actions";

/**
 * Banner mostrado no /pipeline/[id] quando há pedido de indicação pendente
 * para aquele lead. Renderiza-se inline e some quando o pedido é respondido.
 *
 * Recebe os pedidos pendentes da query do server. Renderiza só se houver.
 */
export interface PedidoBannerInput {
  pedido_id: number;
  data_pedido: string;
  momento: string;
  observacoes?: string | null;
}

export default function PedidoIndicacaoBanner({
  pedidos,
  empresaLead,
}: {
  pedidos: PedidoBannerInput[];
  empresaLead: string | null;
}) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  if (!pedidos || pedidos.length === 0) return null;

  return (
    <>
      {pedidos.map((p) => (
        <BannerCard key={p.pedido_id} pedido={p} t={t} empresaLead={empresaLead} locale={locale} />
      ))}
    </>
  );
}

function BannerCard({
  pedido, t, empresaLead, locale,
}: {
  pedido: PedidoBannerInput;
  t: (k: string) => string;
  empresaLead: string | null;
  locale: Locale;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function showErro(e: unknown) {
    setErro(e instanceof Error ? e.message : "Erro inesperado.");
    setTimeout(() => setErro(null), 4500);
  }

  function handleNegado() {
    startTransition(async () => {
      try {
        await responderPedidoIndicacao({ pedido_id: pedido.pedido_id, status: "negado" });
      } catch (e) { showErro(e); }
    });
  }

  function handleAdiar() {
    startTransition(async () => {
      try {
        await adiarPedidoIndicacao(pedido.pedido_id, 7);
      } catch (e) { showErro(e); }
    });
  }

  return (
    <>
      <div
        role="region"
        aria-label={t("indicacoes.banner_titulo")}
        className="card p-4 mb-4 border-primary/30 bg-primary/5"
      >
        <div className="flex items-start gap-3 flex-wrap">
          <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{t("indicacoes.banner_titulo")}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t("indicacoes.banner_sub")
                .replace("{{data}}", new Date(pedido.data_pedido).toLocaleDateString(locale, { day: "2-digit", month: "short" }))
                .replace("{{momento}}", t(`indicacoes.momento_${pedido.momento}`))}
            </div>
            {erro && (
              <p role="alert" className="text-xs text-destructive mt-1.5">{erro}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setModalOpen(true)}
              disabled={pending}
              className="btn-primary text-xs"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
              {t("indicacoes.banner_btn_responder")}
            </button>
            <button
              onClick={handleNegado}
              disabled={pending}
              className="btn-ghost text-xs text-muted-foreground"
            >
              {t("indicacoes.banner_btn_negado")}
            </button>
            <button
              onClick={handleAdiar}
              disabled={pending}
              className="btn-ghost text-xs text-muted-foreground"
              title={t("indicacoes.banner_btn_adiar")}
              aria-label={t("indicacoes.banner_btn_adiar")}
            >
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <ResponderModalInline
          pedido={pedido}
          empresaLead={empresaLead}
          t={t}
          onClose={() => setModalOpen(false)}
          onErro={showErro}
        />
      )}
    </>
  );
}

function ResponderModalInline({
  pedido, empresaLead, t, onClose, onErro,
}: {
  pedido: PedidoBannerInput;
  empresaLead: string | null;
  t: (k: string) => string;
  onClose: () => void;
  onErro: (e: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [obs, setObs] = useState("");
  const [indicacoes, setIndicacoes] = useState<NovaIndicacaoInput[]>([
    { nome: "" },
  ]);

  function update(i: number, patch: Partial<NovaIndicacaoInput>) {
    setIndicacoes(indicacoes.map((ind, idx) => idx === i ? { ...ind, ...patch } : ind));
  }
  function add() {
    if (indicacoes.length >= 10) return;
    setIndicacoes([...indicacoes, { nome: "" }]);
  }
  function remover(i: number) {
    if (indicacoes.length === 1) return;
    setIndicacoes(indicacoes.filter((_, idx) => idx !== i));
  }

  function handleSalvar() {
    const validas = indicacoes.filter((i) => i.nome?.trim());
    if (validas.length === 0) {
      onErro(new Error("Adicione ao menos 1 indicação com nome."));
      return;
    }
    startTransition(async () => {
      try {
        await responderPedidoIndicacao({
          pedido_id: pedido.pedido_id,
          status: "respondido",
          observacoes: obs,
          indicacoes: validas,
        });
        onClose();
      } catch (e) { onErro(e); }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">{t("indicacoes.modal_titulo")}</div>
            {empresaLead && <div className="text-xs text-muted-foreground">{empresaLead}</div>}
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label={t("indicacoes.modal_btn_cancelar")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-muted-foreground">{t("indicacoes.modal_sub")}</p>

          {indicacoes.map((ind, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-secondary/30 dark:bg-white/[0.02]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">
                  Indicação {i + 1}
                </span>
                {indicacoes.length > 1 && (
                  <button onClick={() => remover(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder={`${t("indicacoes.modal_field_nome")} *`}
                  value={ind.nome ?? ""}
                  onChange={(e) => update(i, { nome: e.target.value })}
                  required
                  className="input-base text-xs"
                  aria-label={t("indicacoes.modal_field_nome")}
                />
                <input
                  placeholder={t("indicacoes.modal_field_empresa")}
                  value={ind.empresa ?? ""}
                  onChange={(e) => update(i, { empresa: e.target.value })}
                  className="input-base text-xs"
                  aria-label={t("indicacoes.modal_field_empresa")}
                />
                <input
                  placeholder={t("indicacoes.modal_field_email")}
                  type="email"
                  value={ind.email ?? ""}
                  onChange={(e) => update(i, { email: e.target.value })}
                  className="input-base text-xs"
                  aria-label={t("indicacoes.modal_field_email")}
                />
                <input
                  placeholder={t("indicacoes.modal_field_whatsapp")}
                  value={ind.whatsapp ?? ""}
                  onChange={(e) => update(i, { whatsapp: e.target.value })}
                  className="input-base text-xs"
                  aria-label={t("indicacoes.modal_field_whatsapp")}
                />
              </div>
              <input
                placeholder={t("indicacoes.modal_field_contexto_placeholder")}
                value={ind.contexto ?? ""}
                onChange={(e) => update(i, { contexto: e.target.value })}
                className="input-base text-xs"
                aria-label={t("indicacoes.modal_field_contexto")}
              />
            </div>
          ))}

          <button onClick={add} disabled={indicacoes.length >= 10} className="btn-secondary text-xs">
            <Plus className="w-3 h-3" aria-hidden="true" />
            {t("indicacoes.modal_btn_adicionar")}
          </button>

          <textarea
            placeholder={t("indicacoes.modal_obs_placeholder")}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="input-base text-sm min-h-[60px] mt-2"
            aria-label={t("indicacoes.modal_obs")}
          />
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">
            {t("indicacoes.modal_btn_cancelar")}
          </button>
          <button onClick={handleSalvar} disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            {t("indicacoes.modal_btn_salvar")}
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
