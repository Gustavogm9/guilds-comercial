"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Filter, Search, X } from "lucide-react";
import ExportCsvButton from "@/components/export-csv-button";
import type { LeadEnriched } from "@/lib/types";

interface Props {
  isGestor: boolean;
  membros: Array<{ profile_id: string; display_name: string }>;
  segmentos: string[];
  respFiltro: string;
  qFiltro: string;
  segFiltro: string;
  tempFiltro: string;
  leads: LeadEnriched[];
}

function PipelineToolbarInner(props: Props) {
  const { isGestor, membros, segmentos, respFiltro, qFiltro, segFiltro, tempFiltro, leads } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busca, setBusca] = useState(qFiltro);

  function aplicarFiltro(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/pipeline?${params.toString()}`);
  }

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    aplicarFiltro("q", busca.trim());
  }

  function limparBusca() {
    setBusca("");
    aplicarFiltro("q", "");
  }

  const temFiltros = qFiltro || segFiltro || tempFiltro || (isGestor && respFiltro !== "all");

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Busca (FR-CRM-07) */}
      <form onSubmit={buscar} className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar empresa, nome, email..."
          className="input-base !py-1.5 !text-xs pl-8 w-56"
        />
        {busca && (
          <button type="button" onClick={limparBusca}
            className="absolute right-2 text-slate-400 hover:text-slate-600">
            <X className="w-3 h-3" />
          </button>
        )}
      </form>

      {/* Filtro por responsável (gestor only) */}
      {isGestor && (
        <select
          value={respFiltro}
          onChange={(e) => aplicarFiltro("resp", e.target.value)}
          className="input-base !py-1.5 !text-xs w-36"
        >
          <option value="all">Todo o time</option>
          {membros.map(m => (
            <option key={m.profile_id} value={m.profile_id}>{m.display_name}</option>
          ))}
        </select>
      )}

      {/* Filtro por segmento (FR-CRM-05) */}
      {segmentos.length > 0 && (
        <select
          value={segFiltro}
          onChange={(e) => aplicarFiltro("seg", e.target.value)}
          className="input-base !py-1.5 !text-xs w-36"
        >
          <option value="">Segmento</option>
          {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}

      {/* Filtro por temperatura (FR-CRM-05) */}
      <select
        value={tempFiltro}
        onChange={(e) => aplicarFiltro("temp", e.target.value)}
        className="input-base !py-1.5 !text-xs w-28"
      >
        <option value="">Temperatura</option>
        <option value="Quente">🔥 Quente</option>
        <option value="Morno">🌤 Morno</option>
        <option value="Frio">❄ Frio</option>
      </select>

      {/* Indicador de filtros ativos */}
      {temFiltros && (
        <div className="flex items-center gap-1 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200">
          <Filter className="w-3 h-3" />
          {leads.length} leads filtrados
        </div>
      )}

      {/* FR-CRM-08 — Export CSV */}
      <ExportCsvButton
        data={csvData}
        filename={`pipeline_${new Date().toISOString().slice(0, 10)}`}
        label="Exportar CSV"
      />
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
