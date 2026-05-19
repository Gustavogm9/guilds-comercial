"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, AlertCircle, Loader2, Check, X, FileText,
  Clock, CheckCircle2, XCircle, Hourglass,
} from "lucide-react";
import { criarBulkJob, cancelarBulkJob } from "./bulk-import-actions";

interface Job {
  id: number;
  status: "pendente" | "processando" | "concluido" | "erro" | "cancelado";
  total: number;
  processados: number;
  enriquecidos: number;
  duplicados: number;
  erros: number;
  ativar_como_lead: boolean;
  iniciar_cadencia: boolean;
  created_at: string;
  finished_at: string | null;
  ultimo_erro: string | null;
}

export default function BulkImportClient({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [ativarLead, setAtivarLead] = useState(true);
  const [iniciarCadencia, setIniciarCadencia] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      setRaw(text);
    };
    reader.readAsText(file);
  }

  function importar() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const r = await criarBulkJob({
          cnpjs_raw: raw,
          ativar_como_lead: ativarLead,
          iniciar_cadencia: iniciarCadencia,
        });
        setFeedback({
          tipo: "ok",
          texto: `Job #${r.job_id} criado: ${r.total_validos} CNPJ(s) válidos${r.total_invalidos > 0 ? ` (${r.total_invalidos} inválidos descartados)` : ""}. Worker começa em até 2 min.`,
        });
        setRaw("");
        router.refresh();
      } catch (e) {
        setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  }

  async function cancelar(jobId: number) {
    if (!confirm("Cancelar este job?")) return;
    try {
      await cancelarBulkJob(jobId);
      router.refresh();
    } catch (e) {
      setFeedback({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro." });
    }
  }

  return (
    <div className="space-y-6">
      {/* Form de upload */}
      <section className="card p-5">
        <h2 className="font-semibold text-foreground mb-3">Novo import</h2>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Cole CNPJs (um por linha) ou faça upload de CSV
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="12.345.678/0001-90&#10;98.765.432/0001-10&#10;ou cole CSV — o sistema extrai os CNPJs"
            className="input-base min-h-[140px] text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Máximo 500 CNPJs por job. Worker processa em ~3/s respeitando rate-limit da BrasilAPI.
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="file"
            accept=".csv,.txt"
            id="csv-upload"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <label htmlFor="csv-upload" className="btn-secondary text-xs cursor-pointer">
            <FileText className="w-3 h-3" />
            Escolher arquivo
          </label>
          {raw && (
            <button onClick={() => setRaw("")} className="btn-ghost text-xs text-muted-foreground">
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer p-2 rounded border border-border hover:bg-secondary/40">
            <input
              type="checkbox"
              checked={ativarLead}
              onChange={(e) => setAtivarLead(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">Ativar cada CNPJ como lead na base bruta</div>
              <div className="text-xs text-muted-foreground">
                Sem isso, só popula a base de empresas pra consulta futura.
              </div>
            </div>
          </label>
          <label className={`flex items-start gap-2 cursor-pointer p-2 rounded border border-border hover:bg-secondary/40 ${!ativarLead ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={iniciarCadencia}
              onChange={(e) => setIniciarCadencia(e.target.checked)}
              disabled={!ativarLead}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">+ Iniciar cadência configurada em cada lead criado</div>
              <div className="text-xs text-muted-foreground">
                Cuidado: dispara cadência massa. Garanta que CNPJs são qualificados.
              </div>
            </div>
          </label>
        </div>

        {feedback && (
          <div
            role="alert"
            className={`mt-3 p-2.5 rounded-lg text-sm flex items-start gap-2 ${
              feedback.tipo === "ok" ? "bg-success-500/10 border border-success-500/30 text-success-500" :
              "bg-destructive/10 border border-destructive/30 text-destructive"
            }`}
          >
            {feedback.tipo === "ok" ? <Check className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
            <span className="flex-1">{feedback.texto}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={importar}
            disabled={pending || !raw.trim()}
            className="btn-primary text-sm"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Upload className="w-3.5 h-3.5" />
            Importar
          </button>
        </div>
      </section>

      {/* Histórico */}
      <section>
        <h2 className="font-semibold text-foreground mb-3">Últimos imports</h2>
        {jobs.length === 0 ? (
          <p className="card p-6 text-sm text-muted-foreground text-center italic">
            Nenhum import ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => <JobRow key={j.id} job={j} onCancel={cancelar} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function JobRow({ job, onCancel }: { job: Job; onCancel: (id: number) => void }) {
  const pct = job.total > 0 ? Math.round((job.processados / job.total) * 100) : 0;
  const statusConfig = {
    pendente: { Icon: Clock, label: "Pendente", color: "text-warning-500 bg-warning-500/10 border-warning-500/30" },
    processando: { Icon: Hourglass, label: "Processando", color: "text-primary bg-primary/10 border-primary/30" },
    concluido: { Icon: CheckCircle2, label: "Concluído", color: "text-success-500 bg-success-500/10 border-success-500/30" },
    erro: { Icon: XCircle, label: "Erro", color: "text-destructive bg-destructive/10 border-destructive/30" },
    cancelado: { Icon: X, label: "Cancelado", color: "text-muted-foreground bg-muted border-border" },
  }[job.status];

  const ativo = job.status === "pendente" || job.status === "processando";

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">Job #{job.id}</span>
            <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border ${statusConfig.color} inline-flex items-center gap-1`}>
              <statusConfig.Icon className="w-3 h-3" />
              {statusConfig.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(job.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            {job.processados} / {job.total} processados · {job.enriquecidos} enriquecidos · {job.duplicados} duplicados · {job.erros} erros
          </div>
          {ativo && (
            <div className="mt-2">
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{pct}%</div>
            </div>
          )}
          {job.ultimo_erro && (
            <p className="text-xs text-destructive mt-1 italic line-clamp-2">{job.ultimo_erro}</p>
          )}
          <div className="text-[11px] text-muted-foreground mt-1.5">
            {job.ativar_como_lead ? "Ativa como leads" : "Só enriquece"}
            {job.iniciar_cadencia ? " · Inicia cadência configurada" : ""}
          </div>
        </div>
        {ativo && (
          <button onClick={() => onCancel(job.id)} className="btn-ghost text-xs text-muted-foreground hover:text-destructive">
            Cancelar
          </button>
        )}
      </div>
    </li>
  );
}
