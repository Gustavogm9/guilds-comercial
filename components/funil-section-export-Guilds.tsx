"use client";
import ExportCsvButton from "@/components/export-csv-button";

/**
 * Wrapper que adiciona um botão de export CSV a qualquer seção.
 * Usado no funil para cada widget (conversão, tempo, valor, cohort, motivos, forecast).
 */
export default function FunilSectionExport({ data, filename }: {
  data: Record<string, unknown>[];
  filename: string;
}) {
  return (
    <ExportCsvButton data={data} filename={filename} label="CSV" />
  );
}
