"use client";
import { useState, useTransition } from "react";
import { Star, CheckCircle2, AlertCircle, Loader2, Send } from "lucide-react";
import { responderNpsAction } from "./actions";

interface NpsContext {
  nps_id: number;
  organizacao_id: string;
  organizacao_nome: string;
  cliente_empresa: string | null;
  cliente_nome: string | null;
  ja_respondido: boolean;
}

/**
 * Portal público de NPS (item 1 do polish do flywheel).
 *
 * Cliente recebeu email D+7 com link "Responder em 30 segundos" → cai aqui.
 * Sem login. Slider 0-10 + comentário opcional + Enviar.
 *
 * Já respondido → tela de obrigado bloqueia novo envio.
 *
 * Após salvar:
 *   - score >= 9 → trigger SQL cria pedido_indicacao 'pos_resultado'
 *   - score <= 6 → grava lead_evento detrator_alerta
 */
export default function NpsClient({
  token,
  ctx,
}: {
  token: string;
  ctx: NpsContext;
}) {
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [success, setSuccess] = useState(ctx.ja_respondido);

  const orgNome = ctx.organizacao_nome ?? "a empresa";
  const nomeCliente = ctx.cliente_nome?.split(" ")[0] ?? null;

  function handleEnviar() {
    if (score == null) {
      setErro("Selecione um número de 0 a 10.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await responderNpsAction({ token, score, comentario });
      if (r.ok) {
        setSuccess(true);
      } else {
        setErro(r.erro);
      }
    });
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-success-500/5 via-background to-primary/5 flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-success-500 mb-4" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            Obrigado{nomeCliente ? `, ${nomeCliente}` : ""}!
          </h1>
          <p className="text-sm text-muted-foreground">
            Sua resposta chegou direto pro time da{" "}
            <strong className="text-foreground">{orgNome}</strong>.
          </p>
          {!ctx.ja_respondido && score != null && score <= 6 && (
            <p className="text-xs text-muted-foreground/70 mt-4">
              Estamos acompanhando — alguém vai falar com você em breve pra entender o que pode melhorar.
            </p>
          )}
          {!ctx.ja_respondido && score != null && score >= 9 && (
            <p className="text-xs text-muted-foreground/70 mt-4">
              Que ótimo! Se conhecer alguém que se beneficiaria do nosso trabalho, em breve a gente vai mandar um link
              pra você indicar direto 💙
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/[0.02] flex items-center justify-center p-4">
      <div className="card max-w-lg w-full p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold uppercase tracking-[0.12em]">
            <Star className="w-3 h-3" aria-hidden="true" />
            Pesquisa rápida
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2" style={{ letterSpacing: "-0.5px" }}>
            Olá{nomeCliente ? `, ${nomeCliente}` : ""}!
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            De 0 a 10, qual a chance de você recomendar a{" "}
            <strong className="text-foreground">{orgNome}</strong> pra um amigo ou colega?
          </p>
        </div>

        {/* Score 0-10 */}
        <div className="mb-6">
          <div className="grid grid-cols-11 gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const tone =
                n <= 6 ? "bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/30" :
                n <= 8 ? "bg-warning-500/10 hover:bg-warning-500/20 text-warning-500 border-warning-500/30" :
                "bg-success-500/10 hover:bg-success-500/20 text-success-500 border-success-500/30";
              const selected = score === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setScore(n); setErro(null); }}
                  aria-pressed={selected}
                  aria-label={`Score ${n}`}
                  className={`aspect-square rounded-md border font-semibold tabular-nums text-base md:text-lg transition ${tone} ${
                    selected ? "ring-2 ring-primary scale-105" : ""
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground mt-2 px-1">
            <span>Não recomendaria</span>
            <span>Recomendaria com certeza</span>
          </div>
        </div>

        {/* Comentário */}
        <div className="mb-4">
          <label className="label text-xs">Comentário (opcional)</label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="O que mais influenciou sua nota?"
            maxLength={1000}
            className="input-base mt-1 min-h-[80px] text-sm"
            aria-label="Comentário"
          />
        </div>

        {erro && (
          <p role="alert" className="text-xs text-destructive mb-3 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" aria-hidden="true" /> {erro}
          </p>
        )}

        {/* Submit */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleEnviar}
            disabled={pending || score == null}
            className="btn-primary text-sm px-6 py-3 w-full md:w-auto"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
            {pending ? "Enviando..." : "Enviar resposta"}
          </button>
          <p className="text-[11px] text-muted-foreground/70 text-center max-w-md">
            Sua resposta é anônima pra fora do time da {orgNome}.
            Não usamos seus dados pra spam.
          </p>
        </div>

        <footer className="mt-6 pt-4 border-t border-border text-center text-[10px] text-muted-foreground/70">
          Powered by Guilds Comercial
        </footer>
      </div>
    </div>
  );
}
