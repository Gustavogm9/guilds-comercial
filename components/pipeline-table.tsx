"use client";

import EditableLeadRow from "@/components/editable-lead-row";
import type { LeadEnriched } from "@/lib/types";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import { useEffect, useState } from "react";

export default function PipelineTable({
  leads,
  profiles,
}: {
  leads: LeadEnriched[];
  profiles: { id: string; display_name: string }[];
}) {
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);

  return (
    <div className="card overflow-hidden mx-4 md:mx-8 mb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 dark:bg-white/[0.02] text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b border-border dark:border-white/[0.06]">
            <tr>
              <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-secondary/60 dark:bg-[#1a1b1e] border-r border-border/40 z-20 min-w-[200px]">Empresa</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Nome</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Cargo</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[180px]">Email</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[130px]">WhatsApp</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">LinkedIn</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Instagram</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Segmento</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Cidade/UF</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Site</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Fonte</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Responsável</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[120px]">Temperatura</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[100px]">Prioridade</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Estágio CRM</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[120px]">V. Potencial</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[120px]">V. Setup</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[120px]">V. Mensal</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[100px]">Prob. (%)</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[120px]">R. Ponderada</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[140px]">Data Entrada</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[140px]">Data Proposta</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[140px]">Data Fechou</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Motivo Perda</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[150px]">Link Proposta</th>
              <th className="text-left px-3 py-2.5 font-semibold min-w-[200px]">Observações</th>
              <th className="text-right px-3 py-2.5 font-semibold sticky right-0 bg-secondary/60 dark:bg-[#1a1b1e] border-l border-border/40 z-20 min-w-[80px]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 dark:divide-white/[0.05]">
            {leads.length === 0 && (
              <tr>
                <td colSpan={27} className="text-center py-12 text-muted-foreground/70 italic">
                  {t("pipeline.card_vazio")}
                </td>
              </tr>
            )}
            {leads.map(l => (
              <EditableLeadRow key={l.id} lead={l} profiles={profiles} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
