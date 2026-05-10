"use client";
import { useEffect, useState, useTransition } from "react";
import { Calendar, Repeat, DollarSign, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import { definirRenovacao } from "@/app/(app)/pos-venda/renovacao-actions";

/**
 * Card no detalhe do lead pra setar/visualizar a configuração de renovação.
 * Aparece só pra leads em "Fechado" (renovação não faz sentido em outras etapas).
 *
 * Quando data_renovacao está setada e <= 90d, o cron diário automaticamente
 * cria uma expansão tipo='renovacao' que aparece em /hoje pro vendedor.
 */
export interface RenovacaoConfigInput {
  lead_id: number;
  crm_stage: string | null;
  data_renovacao: string | null;
  ciclo_renovacao_meses: number | null;
  valor_renovacao: number | null;
  valor_potencial: number | null;
}

export default function RenovacaoConfigCard({ lead }: { lead: RenovacaoConfigInput }) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  // Form state
  const [dataRenovacao, setDataRenovacao] = useState(lead.data_renovacao ?? "");
  const [ciclo, setCiclo] = useState(lead.ciclo_renovacao_meses ?? 12);
  const [valor, setValor] = useState(lead.valor_renovacao ?? lead.valor_potencial ?? 0);

  // Só mostra pra clientes fechados
  if (lead.crm_stage !== "Fechado") return null;

  function handleSalvar() {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      try {
        await definirRenovacao({
          lead_id: lead.lead_id,
          data_renovacao: dataRenovacao || null,
          ciclo_renovacao_meses: dataRenovacao ? ciclo : null,
          valor_renovacao: dataRenovacao ? valor : null,
        });
        setSalvo(true);
        setEditing(false);
        setTimeout(() => setSalvo(false), 2000);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  function handleRemover() {
    if (!confirm("Remover a configuração de renovação? O cron deixa de criar expansões automáticas pra esse cliente.")) return;
    setErro(null);
    startTransition(async () => {
      try {
        await definirRenovacao({
          lead_id: lead.lead_id,
          data_renovacao: null,
          ciclo_renovacao_meses: null,
          valor_renovacao: null,
        });
        setDataRenovacao("");
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro.");
      }
    });
  }

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const diasAteRenov = lead.data_renovacao
    ? Math.ceil((new Date(lead.data_renovacao).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const urgencia =
    diasAteRenov == null ? null :
    diasAteRenov < 0 ? "vencida" :
    diasAteRenov <= 30 ? "urgente" :
    diasAteRenov <= 90 ? "proxima" :
    "futura";

  const urgenciaTone = {
    vencida: "border-destructive/30 bg-destructive/[0.04] text-destructive",
    urgente: "border-warning-500/30 bg-warning-500/[0.04] text-warning-500",
    proxima: "border-primary/25 bg-primary/[0.03] text-primary",
    futura: "border-border bg-card text-muted-foreground",
  }[urgencia ?? "futura"];

  // Sem data = vista de configuração
  if (!lead.data_renovacao && !editing) {
    return (
      <div className="card p-4 mt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-semibold text-sm">Renovação automática</div>
              <p className="text-xs text-muted-foreground">
                Configure a data e o cron cria expansão automática quando estiver perto.
              </p>
            </div>
          </div>
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            Configurar
          </button>
        </div>
      </div>
    );
  }

  // Vista de edição
  if (editing) {
    return (
      <div className="card p-4 mt-4 border-primary/30">
        <div className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Repeat className="w-4 h-4 text-primary" aria-hidden="true" />
          Configurar renovação
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label text-xs">Data de vencimento</label>
            <input
              type="date"
              value={dataRenovacao}
              onChange={(e) => setDataRenovacao(e.target.value)}
              className="input-base text-sm mt-1"
              aria-label="Data de renovação"
            />
          </div>
          <div>
            <label className="label text-xs">Ciclo (meses)</label>
            <select
              value={ciclo}
              onChange={(e) => setCiclo(parseInt(e.target.value, 10))}
              className="input-base !text-sm mt-1"
              aria-label="Ciclo de renovação em meses"
            >
              <option value={1}>1 (mensal)</option>
              <option value={3}>3 (trimestral)</option>
              <option value={6}>6 (semestral)</option>
              <option value={12}>12 (anual)</option>
              <option value={24}>24 (bianual)</option>
            </select>
          </div>
          <div>
            <label className="label text-xs">Valor previsto (R$)</label>
            <input
              type="number"
              min={0}
              value={valor}
              onChange={(e) => setValor(parseFloat(e.target.value || "0"))}
              className="input-base text-sm mt-1"
              aria-label="Valor previsto da renovação"
            />
          </div>
        </div>
        {erro && <p role="alert" className="text-xs text-destructive mt-2">{erro}</p>}
        <div className="flex items-center justify-end gap-2 mt-3">
          <button onClick={() => { setEditing(false); setErro(null); }} className="btn-ghost text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={pending || !dataRenovacao}
            className="btn-primary text-sm"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            Salvar
          </button>
        </div>
      </div>
    );
  }

  // Vista de display
  return (
    <div className={`card p-4 mt-4 border ${urgenciaTone}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4" aria-hidden="true" />
          <div>
            <div className="font-semibold text-sm text-foreground">Renovação configurada</div>
            <div className="text-xs flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-3 h-3" aria-hidden="true" />
                <span className="tabular-nums">
                  {new Date(lead.data_renovacao!).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                {diasAteRenov != null && (
                  <span className="font-semibold">
                    ({diasAteRenov < 0 ? `${Math.abs(diasAteRenov)}d vencida` : `em ${diasAteRenov}d`})
                  </span>
                )}
              </span>
              {lead.ciclo_renovacao_meses && (
                <span className="text-muted-foreground">· ciclo {lead.ciclo_renovacao_meses}m</span>
              )}
              {lead.valor_renovacao != null && (
                <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                  <DollarSign className="w-3 h-3" aria-hidden="true" />
                  <span className="tabular-nums">{fmtBRL(lead.valor_renovacao)}</span>
                </span>
              )}
            </div>
            {urgencia === "vencida" && (
              <p className="text-xs mt-1.5 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                Renovação vencida — entre em contato urgente
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {salvo && (
            <span className="inline-flex items-center gap-1 text-xs text-success-500">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Salvo
            </span>
          )}
          <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
            Editar
          </button>
          <button onClick={handleRemover} disabled={pending} className="btn-ghost text-xs text-muted-foreground">
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}
