"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, CheckCircle2, Loader2, X } from "lucide-react";
import { ajustarDiaCadenciaLead } from "@/app/(app)/comunicacao/cadencia/actions";

const PASSOS_LEGADO = [
  { passo: "D0", dias: 0 },
  { passo: "D3", dias: 3 },
  { passo: "D7", dias: 7 },
  { passo: "D11", dias: 11 },
  { passo: "D16", dias: 16 },
  { passo: "D30", dias: 30 },
] as const satisfies ReadonlyArray<{ passo: string; dias: number }>;

type Feedback = { tipo: "sucesso" | "erro"; mensagem: string } | null;

export type AjustarCadenciaPasso = {
  id?: number | null;
  passo: string;
  dias?: number | null;
  ordem?: number | null;
  offsetDias?: number | null;
  dataPrevista?: string | null;
  status?: string | null;
  objetivo?: string | null;
};

type PassoNormalizado = {
  key: string;
  id: number | null;
  passo: string;
  dias: number;
  ordem: number | null;
  dataPrevista: string | null;
  status: string | null;
  objetivo: string | null;
};

export default function AjustarCadenciaButton({
  leadId,
  proximaAcao,
  dataProximaAcao,
  passos,
}: {
  leadId: number;
  proximaAcao: string | null;
  dataProximaAcao: string | null;
  passos?: AjustarCadenciaPasso[];
}) {
  const router = useRouter();
  const passosDisponiveis = useMemo(() => normalizarPassos(passos), [passos]);
  const initialKey = inferirPassoKey(proximaAcao, dataProximaAcao, passosDisponiveis);
  const initialSpec = passosDisponiveis.find((p) => p.key === initialKey) ?? passosDisponiveis[0];

  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [passoKey, setPassoKey] = useState(initialKey);
  const [dataPrevistaPasso, setDataPrevistaPasso] = useState(
    initialSpec?.dataPrevista ?? dataProximaAcao ?? hojeIsoLocal(),
  );
  const [feedback, setFeedback] = useState<Feedback>(null);

  const spec = passosDisponiveis.find((p) => p.key === passoKey) ?? passosDisponiveis[0];
  const dataInicioReal = dataPrevistaPasso ? addDaysIso(dataPrevistaPasso, -spec.dias) : null;
  const indiceAtual = spec.ordem ?? spec.dias;
  const passosPulados = passosDisponiveis
    .filter((p) => (p.ordem ?? p.dias) < indiceAtual)
    .map((p) => p.passo);

  function handleSelectPasso(key: string) {
    setPassoKey(key);
    const next = passosDisponiveis.find((p) => p.key === key);
    if (next?.dataPrevista) setDataPrevistaPasso(next.dataPrevista);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    start(async () => {
      try {
        await ajustarDiaCadenciaLead({
          leadId,
          cadenciaIdAtual: spec.id,
          passoAtual: spec.passo,
          dataPrevistaPasso,
        });
        setOpen(false);
        setFeedback({ tipo: "sucesso", mensagem: `Cadência ajustada para ${spec.passo}.` });
        router.refresh();
      } catch (err) {
        setFeedback({
          tipo: "erro",
          mensagem: err instanceof Error ? err.message : "Erro ao ajustar cadência.",
        });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="btn-ghost text-xs font-medium text-primary hover:bg-primary/10"
      >
        <CalendarClock className="w-3.5 h-3.5 mr-1" />
        Ajustar dia
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <form
            onSubmit={salvar}
            className="bg-card text-foreground border border-border rounded-xl max-w-md w-full p-5 shadow-stripe-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Ajustar dia da cadência</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Use quando a prospecção começou antes do cadastro no CRM.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="label">Dia atual</label>
                <select
                  value={passoKey}
                  onChange={(e) => handleSelectPasso(e.target.value)}
                  className="input-base mt-1"
                  disabled={pending}
                >
                  {passosDisponiveis.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.objetivo ? `${p.passo} - ${p.objetivo}` : p.passo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Data desse dia</label>
                <input
                  type="date"
                  value={dataPrevistaPasso}
                  onChange={(e) => setDataPrevistaPasso(e.target.value)}
                  className="input-base mt-1"
                  disabled={pending}
                  required
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              <div>
                Próxima ação:{" "}
                <span className="font-medium text-foreground">
                  {spec.objetivo || `Enviar ${spec.passo}`}
                </span>
              </div>
              {dataInicioReal && (
                <div className="mt-1">
                  Início real: <span className="font-medium text-foreground">{formatDate(dataInicioReal)}</span>
                </div>
              )}
              {passosPulados.length > 0 && (
                <div className="mt-1">Pulando: {passosPulados.join(", ")}</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="btn-secondary text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || !dataPrevistaPasso}
                className="btn-primary text-sm"
              >
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar ajuste
              </button>
            </div>
          </form>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 right-6 md:right-8 md:bottom-28 z-[100] max-w-sm card p-3 flex items-start gap-2.5 shadow-stripe-md animate-in fade-in slide-in-from-bottom-2 ${
            feedback.tipo === "sucesso"
              ? "border-success-500/30 bg-success-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          {feedback.tipo === "sucesso" ? (
            <CheckCircle2 className="w-4 h-4 text-success-500 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          )}
          <span className="text-sm text-foreground flex-1">{feedback.mensagem}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}

function normalizarPassos(passos?: AjustarCadenciaPasso[]): PassoNormalizado[] {
  const base: AjustarCadenciaPasso[] = passos?.length ? passos : [...PASSOS_LEGADO];
  const normalizados = base
    .filter((p) => p.passo.trim())
    .map((p, index) => {
      const id = p.id ?? null;
      return {
        key: id ? `id:${id}` : `passo:${p.passo}:${index}`,
        id,
        passo: p.passo,
        dias: p.offsetDias ?? p.dias ?? inferirDias(p.passo),
        ordem: p.ordem ?? null,
        dataPrevista: p.dataPrevista ?? null,
        status: p.status ?? null,
        objetivo: p.objetivo ?? null,
      };
    })
    .sort((a, b) => (a.ordem ?? a.dias) - (b.ordem ?? b.dias) || a.passo.localeCompare(b.passo));
  return normalizados.length > 0 ? normalizados : normalizarPassos();
}

function inferirPassoKey(
  proximaAcao: string | null,
  dataProximaAcao: string | null,
  passos: PassoNormalizado[],
): string {
  const porData = passos.find((p) => p.status === "pendente" && p.dataPrevista && p.dataPrevista === dataProximaAcao);
  if (porData) return porData.key;

  const acao = proximaAcao?.toLowerCase() ?? "";
  const porTexto = [...passos]
    .sort((a, b) => b.passo.length - a.passo.length)
    .find((p) => acao.includes(p.passo.toLowerCase()));
  if (porTexto) return porTexto.key;

  return passos[0]?.key ?? "passo:D0:0";
}

function inferirDias(passo: string) {
  const match = passo.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function hojeIsoLocal() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
