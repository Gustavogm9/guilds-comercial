"use client";
import { Download } from "lucide-react";

interface ExportCsvButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  label?: string;
  className?: string;
}

/**
 * Botão reutilizável para exportar dados como CSV.
 * Gera o arquivo client-side a partir de dados já renderizados na tela.
 */
export default function ExportCsvButton({ data, filename, label = "CSV", className = "" }: ExportCsvButtonProps) {
  function exportar() {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(";"),
      ...data.map(row =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val).replace(/"/g, '""');
          return str.includes(";") || str.includes('"') || str.includes("\n")
            ? `"${str}"`
            : str;
        }).join(";")
      ),
    ];

    const bom = "\uFEFF"; // BOM para Excel reconhecer UTF-8
    const blob = new Blob([bom + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={!data || data.length === 0}
      className={`inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700
        disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${className}`}
      title={`Exportar ${filename}.csv`}
    >
      <Download className="w-3 h-3" />
      {label}
    </button>
  );
}
