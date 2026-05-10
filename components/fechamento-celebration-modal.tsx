"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Sparkles, X, Loader2, ArrowRight, Plus, Trophy, CheckCircle2,
} from "lucide-react";
import {
  responderPedidoIndicacao,
  type NovaIndicacaoInput,
} from "@/app/(app)/growth/indicacoes/actions";

/**
 * Modal celebratório que aparece quando vendedor arrasta lead pra "Fechado".
 *
 * Dispara via prop `open=true` por algum dispatch externo (kanban-board, lead-detail).
 *
 * Conteúdo:
 *   - Título celebratório com animação
 *   - CTA principal: "Pedir indicação AGORA" (timing perfeito)
 *   - CTA secundário: "Mais tarde" (deixa pro card de /hoje)
 *
 * Importante: o trigger SQL trg_pedido_apos_fechamento já cria o pedido_indicacao
 * automático ao mudar pra Fechado. Esse modal é só pra UX — empurra o vendedor
 * a registrar a indicação JÁ enquanto fala com o cliente, antes de esfriar.
 */
export default function FechamentoCelebrationModal({
  pedidoId,
  leadEmpresa,
  leadNome,
  open,
  onClose,
}: {
  pedidoId: number | null;
  leadEmpresa: string | null;
  leadNome: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [mode, setMode] = useState<"celebra" | "form" | "success">("celebra");
  const [indicacoes, setIndicacoes] = useState<NovaIndicacaoInput[]>([
    { nome: "" },
  ]);
  const [obs, setObs] = useState("");
  const [enviadas, setEnviadas] = useState(0);

  // Reset quando reabre
  useEffect(() => {
    if (open) {
      setMode("celebra");
      setIndicacoes([{ nome: "" }]);
      setObs("");
      setErro(null);
      setEnviadas(0);
    }
  }, [open]);

  if (!open) return null;

  function update(i: number, patch: Partial<NovaIndicacaoInput>) {
    setIndicacoes(indicacoes.map((ind, idx) => (idx === i ? { ...ind, ...patch } : ind)));
  }
  function add() {
    if (indicacoes.length >= 5) return;
    setIndicacoes([...indicacoes, { nome: "" }]);
  }
  function remover(i: number) {
    if (indicacoes.length === 1) return;
    setIndicacoes(indicacoes.filter((_, idx) => idx !== i));
  }

  function handleSalvar() {
    if (!pedidoId) {
      setErro("Pedido ainda não foi criado pelo sistema. Tente em alguns segundos.");
      return;
    }
    const validas = indicacoes.filter((i) => i.nome?.trim());
    if (validas.length === 0) {
      setErro("Adicione ao menos 1 indicação com nome.");
      return;
    }
    setErro(null);

    startTransition(async () => {
      try {
        const r = await responderPedidoIndicacao({
          pedido_id: pedidoId,
          status: "respondido",
          observacoes: obs,
          indicacoes: validas,
        });
        setEnviadas(r.indicacoes_criadas);
        setMode("success");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  function handleSemIndicacoes() {
    if (!pedidoId) { onClose(); return; }
    startTransition(async () => {
      try {
        await responderPedidoIndicacao({ pedido_id: pedidoId, status: "negado" });
        onClose();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  const empresaLabel = leadEmpresa ?? leadNome ?? "cliente";

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Lead fechado — pedir indicação"
    >
      <div
        className="bg-card text-foreground border border-success-500/30 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(135deg, rgba(34,197,94,0.05) 0%, transparent 50%)",
        }}
      >
        {/* MODE: Celebração + CTA principal */}
        {mode === "celebra" && (
          <>
            <div className="relative px-6 pt-8 pb-4 text-center">
              <button
                onClick={onClose}
                className="absolute right-3 top-3 btn-ghost"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-500/15 mb-4">
                <Trophy className="w-8 h-8 text-success-500" aria-hidden="true" />
              </div>

              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2" style={{ letterSpacing: "-0.5px" }}>
                Parabéns! 🎉
              </h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-1">
                <strong className="text-foreground">{empresaLabel}</strong> fechou contrato com você.
              </p>
            </div>

            <div className="px-6 pb-6">
              <div className="rounded-xl bg-primary/5 border border-primary/25 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="font-semibold text-sm mb-1">
                      Aproveite o momento — peça indicação <em>agora</em>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cliente acabou de assinar, está animado e confia em você. É a melhor
                      janela pra perguntar: <em>"Você conhece outras pessoas que poderiam
                      se beneficiar?"</em> Cada cliente fechado pode trazer 2-3 leads novos.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("form")}
                  className="btn-primary text-sm py-3"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Pedir indicação agora
                </button>
                <button
                  onClick={handleSemIndicacoes}
                  disabled={pending}
                  className="btn-ghost text-sm py-3 text-muted-foreground"
                >
                  Cliente não tinha indicações
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Mais tarde (vai aparecer em /hoje)
              </button>

              {erro && (
                <p role="alert" className="text-xs text-destructive mt-3 text-center">
                  {erro}
                </p>
              )}
            </div>
          </>
        )}

        {/* MODE: Form de indicações */}
        {mode === "form" && (
          <>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">Quem ele indicou?</div>
                <div className="text-xs text-muted-foreground">{empresaLabel}</div>
              </div>
              <button onClick={onClose} className="btn-ghost" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Cada indicação vira um lead novo na base bruta com origem rastreada.
              </p>

              {indicacoes.map((ind, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-secondary/20 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between">
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
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Nome *"
                      value={ind.nome ?? ""}
                      onChange={(e) => update(i, { nome: e.target.value })}
                      className="input-base text-sm"
                      aria-label="Nome"
                    />
                    <input
                      placeholder="Empresa"
                      value={ind.empresa ?? ""}
                      onChange={(e) => update(i, { empresa: e.target.value })}
                      className="input-base text-sm"
                      aria-label="Empresa"
                    />
                    <input
                      placeholder="Email"
                      type="email"
                      value={ind.email ?? ""}
                      onChange={(e) => update(i, { email: e.target.value })}
                      className="input-base text-sm"
                      aria-label="Email"
                    />
                    <input
                      placeholder="WhatsApp"
                      value={ind.whatsapp ?? ""}
                      onChange={(e) => update(i, { whatsapp: e.target.value })}
                      className="input-base text-sm"
                      aria-label="WhatsApp"
                    />
                  </div>
                  <input
                    placeholder="Por que pensou nessa pessoa? (opcional)"
                    value={ind.contexto ?? ""}
                    onChange={(e) => update(i, { contexto: e.target.value })}
                    className="input-base text-xs"
                    aria-label="Contexto"
                  />
                </div>
              ))}

              <button
                onClick={add}
                disabled={indicacoes.length >= 5}
                className="btn-secondary text-xs"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                Adicionar mais alguém
              </button>

              <textarea
                placeholder="Observações da conversa (opcional)"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                className="input-base text-sm min-h-[60px]"
                aria-label="Observações"
              />

              {erro && (
                <p role="alert" className="text-xs text-destructive">{erro}</p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => setMode("celebra")} className="btn-ghost text-sm">
                Voltar
              </button>
              <button
                onClick={handleSalvar}
                disabled={pending}
                className="btn-primary text-sm"
              >
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Salvar indicações
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {/* MODE: Sucesso */}
        {mode === "success" && (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-success-500 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-xl font-semibold mb-1">
              {enviadas} {enviadas === 1 ? "lead novo criado" : "leads novos criados"} 🚀
            </h2>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              Aparecem agora na sua base bruta com origem rastreada como indicação de{" "}
              <strong>{empresaLabel}</strong>.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={onClose} className="btn-ghost text-sm">
                Continuar
              </button>
              <Link
                href="/vendas/base?tab=bruta"
                className="btn-primary text-sm"
                onClick={onClose}
              >
                Ver na base bruta
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
