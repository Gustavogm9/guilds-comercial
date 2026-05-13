"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, X, Clock, Loader2 } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import {
  responderPedidoIndicacao,
  adiarPedidoIndicacao,
} from "@/app/(app)/growth/indicacoes/actions";

/**
 * Card de pedidos de indicação pendentes em /hoje.
 *
 * Aparece quando há pedidos não-respondidos do vendedor (gestor vê só os
 * próprios por padrão; quando "Ver todos" tá ativo, vê do time).
 *
 * UX: 3 ações por pedido — "Pedir agora" (abre /pipeline/[id] que tem o
 * banner), "Não tinha", "Adiar 7d". Mostra até 3 pedidos; resto via link.
 */
export interface PedidoPendenteHoje {
  pedido_id: number;
  lead_id: number;
  lead_empresa: string | null;
  lead_nome: string | null;
  data_pedido: string;
  dias_pendente: number;
}

export default function PedidosIndicacaoAlert({
  pedidos,
}: {
  pedidos: PedidoPendenteHoje[];
}) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Lista local pra remover otimisticamente os respondidos
  const [items, setItems] = useState(pedidos);
  useEffect(() => setItems(pedidos), [pedidos]);

  if (!items || items.length === 0) return null;

  const visiveis = items.slice(0, 3);
  const restantes = items.length - 3;

  function handleNegado(pedido_id: number) {
    setErro(null);
    setItems((prev) => prev.filter((p) => p.pedido_id !== pedido_id));
    startTransition(async () => {
      try {
        await responderPedidoIndicacao({ pedido_id, status: "negado" });
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro");
        // Restaura
        setItems(pedidos);
      }
    });
  }

  function handleAdiar(pedido_id: number) {
    setErro(null);
    setItems((prev) => prev.filter((p) => p.pedido_id !== pedido_id));
    startTransition(async () => {
      try {
        await adiarPedidoIndicacao(pedido_id, 7);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro");
        setItems(pedidos);
      }
    });
  }

  return (
    <div
      role="region"
      aria-label={t("indicacoes.banner_titulo")}
      className="mb-6 p-4 rounded-xl border border-primary/25 bg-primary/[0.04] animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-start gap-3 mb-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">
            {items.length === 1
              ? "Pedido de indicação pendente"
              : `${items.length} pedidos de indicação pendentes`}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cliente fechado é cliente que confia. Peça a indicação enquanto a memória do
            sucesso tá fresca.
          </p>
          {erro && <p role="alert" className="text-xs text-destructive mt-1.5">{erro}</p>}
        </div>
        <Link href="/growth/indicacoes" className="btn-ghost text-xs whitespace-nowrap" prefetch>
          Ver todos <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <ul className="space-y-1.5">
        {visiveis.map((p) => (
          <li
            key={p.pedido_id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border"
          >
            <div className="flex-1 min-w-0">
              <Link href={`/vendas/pipeline/${p.lead_id}`} className="text-sm font-medium hover:text-primary transition-colors truncate block">
                {p.lead_empresa ?? p.lead_nome ?? `Lead #${p.lead_id}`}
              </Link>
              <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                Pedido há {p.dias_pendente}d
              </div>
            </div>
            <Link
              href={`/vendas/pipeline/${p.lead_id}`}
              className="btn-primary text-xs"
              prefetch
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3 h-3" aria-hidden="true" />}
              Pedir agora
            </Link>
            <button
              onClick={() => handleNegado(p.pedido_id)}
              disabled={pending}
              className="btn-ghost text-xs text-muted-foreground"
              title="Cliente não tinha indicações"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              onClick={() => handleAdiar(p.pedido_id)}
              disabled={pending}
              className="btn-ghost text-xs text-muted-foreground"
              title="Adiar 7 dias"
              aria-label="Adiar 7 dias"
            >
              <Clock className="w-3 h-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {restantes > 0 && (
        <Link href="/growth/indicacoes" className="text-xs text-primary hover:underline mt-2 inline-block">
          + {restantes} pedido{restantes > 1 ? "s" : ""} pendente{restantes > 1 ? "s" : ""}
        </Link>
      )}
    </div>
  );
}
