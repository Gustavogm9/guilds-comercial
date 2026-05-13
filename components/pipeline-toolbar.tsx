"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useTransition } from "react";
import { Filter, Search, X, Loader2, Kanban, LayoutList } from "lucide-react";
import ExportCsvButton from "@/components/export-csv-button";
import type { LeadEnriched } from "@/lib/types";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

interface Props {
  isGestor: boolean;
  membros: Array<{ profile_id: string; display_name: string }>;
  segmentos: string[];
  produtos: Array<{ id: number; nome: string }>;
  respFiltro: string;
  qFiltro: string;
  segFiltro: string;
  tempFiltro: string;
  prodFiltro: string;
  viewMode?: "list" | "kanban";
  leads: LeadEnriched[];
}

/**
 * Toolbar do /pipeline — busca + filtros + export CSV + toggle de visão.
 *
 * Fixes desta rodada:
 *   - Bug 4: sanitiza `q` removendo `,()*` antes de mandar pra URL
 *     (impede quebra do parser PostgREST no server-side)
 *   - i18n 17: todas as strings via t()
 *   - UX 29: botão "Limpar" remove TODOS os filtros de uma vez
 *   - UX 30: labels permanentes acima dos selects
 *   - A11y: `aria-label` em search e selects
 */
function PipelineToolbarInner(props: Props) {
  const { isGestor, membros, segmentos, produtos, respFiltro, qFiltro, segFiltro, tempFiltro, prodFiltro, viewMode = "kanban", leads } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busca, setBusca] = useState(qFiltro);
  const [pending, startTransition] = useTransition();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  function aplicarFiltro(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`/vendas/pipeline?${params.toString()}`, { scroll: false });
    });
  }

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    // Bug 4: sanitiza chars que quebram parser PostgREST .or()
    const limpo = busca.replace(/[,()]/g, " ").replace(/\*/g, "_").trim();
    aplicarFiltro("q", limpo);
  }

  function limparBusca() {
    setBusca("");
    aplicarFiltro("q", "");
  }

  // UX 29: limpar TODOS filtros ativos (busca, segmento, temperatura, responsável)
  function limparTodos() {
    setBusca("");
    startTransition(() => {
      router.push("/vendas/pipeline", { scroll: false });
    });
  }

  const temFiltros = qFiltro || segFiltro || tempFiltro || prodFiltro || (isGestor && respFiltro !== "all");

  // Dados para export CSV
  const csvData = leads.map(l => ({
    empresa: l.empresa ?? "",
    nome: l.nome ?? "",
    email: l.email ?? "",
    whatsapp: l.whatsapp ?? "",
    segmento: l.segmento ?? "",
    temperatura: l.temperatura ?? "",
    etapa: l.crm_stage ?? "",
    responsavel: l.responsavel_nome ?? "",
    valor_potencial: l.valor_potencial ?? 0,
    score: l.raiox_score ?? 0,
    proxima_acao: l.proxima_acao ?? "",
    data_proxima_acao: l.data_proxima_acao ?? "",
  }));

  const segmentoLabel = t("pipeline.toolbar_segmento_label");
  const temperaturaLabel = t("pipeline.toolbar_temperatura_label");
  const respLabel = t("sidebar.equipe");

  return (
    <div
      className="flex flex-wrap items-end gap-2"
      style={pending ? { opacity: 0.6, pointerEvents: "none" } : undefined}
    >
      {/* Busca (FR-CRM-07) */}
      <form onSubmit={buscar} className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("pipeline.toolbar_buscar_placeholder")}
          aria-label={t("pipeline.toolbar_buscar_placeholder")}
          className="input-base !py-1.5 !text-xs pl-8 w-56"
          disabled={pending}
        />
        {busca && (
          <button
            type="button"
            onClick={limparBusca}
            disabled={pending}
            className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("comum.cancelar")}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </form>

      {/* Filtro por responsável (gestor only) */}
      {isGestor && (
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70">
            {respLabel}
          </label>
          <select
            value={respFiltro}
            onChange={(e) => aplicarFiltro("resp", e.target.value)}
            disabled={pending}
            aria-label={respLabel}
            className="input-base !py-1.5 !text-xs w-36"
          >
            <option value="all">{t("pipeline.toolbar_todo_time")}</option>
            {membros.map(m => (
              <option key={m.profile_id} value={m.profile_id}>{m.display_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Filtro por segmento — UX 30: label permanente acima */}
      {segmentos.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70">
            {segmentoLabel}
          </label>
          <select
            value={segFiltro}
            onChange={(e) => aplicarFiltro("seg", e.target.value)}
            disabled={pending}
            aria-label={segmentoLabel}
            className="input-base !py-1.5 !text-xs w-36"
          >
            <option value="">— {segmentoLabel.toLowerCase()} —</option>
            {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Filtro por temperatura */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[9px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70">
          {temperaturaLabel}
        </label>
        <select
          value={tempFiltro}
          onChange={(e) => aplicarFiltro("temp", e.target.value)}
          disabled={pending}
          aria-label={temperaturaLabel}
          className="input-base !py-1.5 !text-xs w-32"
        >
          <option value="">— {temperaturaLabel.toLowerCase()} —</option>
          <option value="Quente">{t("pipeline.toolbar_temp_quente")}</option>
          <option value="Morno">{t("pipeline.toolbar_temp_morno")}</option>
          <option value="Frio">{t("pipeline.toolbar_temp_frio")}</option>
        </select>
      </div>

      {/* Filtro por produto */}
      {produtos.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/70">
            Produto
          </label>
          <select
            value={prodFiltro}
            onChange={(e) => aplicarFiltro("prod", e.target.value)}
            disabled={pending}
            aria-label="Filtrar por produto"
            className="input-base !py-1.5 !text-xs w-40"
          >
            <option value="">— produto —</option>
            {produtos.map(p => (
              <option key={p.id} value={String(p.id)}>{p.nome}</option>
            ))}
          </select>
        </div>
      )}

      {/* Indicador de filtros ativos OU pending */}
      {pending ? (
        <div className="flex items-center gap-1 text-[11px] text-primary bg-primary/10 px-2 py-1 rounded-md border border-primary/25 font-medium">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("pipeline.toolbar_filtrando")}
        </div>
      ) : temFiltros && (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-[11px] text-primary bg-primary/10 px-2 py-1 rounded-md border border-primary/25 font-medium tabular-nums">
            <Filter className="w-3 h-3" />
            {t("pipeline.toolbar_filtros_ativos").replace("{{n}}", String(leads.length))}
          </div>
          {/* UX 29: botão limpar todos */}
          <button
            type="button"
            onClick={limparTodos}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            {t("pipeline.toolbar_limpar")}
          </button>
        </div>
      )}

      {/* FR-CRM-08 — Export CSV & View Toggle */}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex bg-secondary/50 rounded-md p-1 border border-border">
          <button
            type="button"
            onClick={() => aplicarFiltro("view", "kanban")}
            className={`p-1.5 rounded-sm transition-colors ${
              viewMode === "kanban" 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Ver como Kanban"
          >
            <Kanban className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => aplicarFiltro("view", "list")}
            className={`p-1.5 rounded-sm transition-colors ${
              viewMode === "list" 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Ver como Lista"
          >
            <LayoutList className="w-4 h-4" />
          </button>
        </div>
        <ExportCsvButton
          data={csvData}
          filename={`pipeline_${new Date().toISOString().slice(0, 10)}`}
          label={t("pipeline.toolbar_export_csv")}
        />
      </div>
    </div>
  );
}

export default function PipelineToolbar(props: Props) {
  return (
    <Suspense fallback={<div className="h-8" />}>
      <PipelineToolbarInner {...props} />
    </Suspense>
  );
}
