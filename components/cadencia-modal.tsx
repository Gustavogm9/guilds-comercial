"use client";
import { useState } from "react";
import { TEMPLATES, aplicarTemplate, type CadenciaPasso } from "@/lib/cadencia-templates";
import { Copy, X, Check, MessageSquare, Mail } from "lucide-react";

export default function CadenciaModal({
  open, onClose, lead, vendedor,
}: {
  open: boolean;
  onClose: () => void;
  lead: { nome?: string|null; empresa?: string|null; dor_principal?: string|null };
  vendedor: string;
}) {
  const [passo, setPasso] = useState<CadenciaPasso>("D0");
  const [copied, setCopied] = useState<string | null>(null);
  if (!open) return null;
  const tpls = TEMPLATES.filter(t => t.passo === passo);

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <div className="font-semibold">Templates de cadência</div>
            <div className="text-xs text-slate-500">
              Para: {lead.nome || "—"} · {lead.empresa || "—"}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4"/></button>
        </div>

        <div className="px-5 pt-3 flex gap-1 border-b">
          {(["D0","D3","D7","D11","D16","D30"] as CadenciaPasso[]).map(p => (
            <button key={p} onClick={() => setPasso(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition ${
                passo === p ? "bg-guild-50 text-guild-700 border-b-2 border-guild-600"
                            : "text-slate-500 hover:text-slate-800"
              }`}>{p}</button>
          ))}
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {tpls.map((t, i) => {
            const out = aplicarTemplate(t, {
              nome: lead.nome ?? undefined,
              empresa: lead.empresa ?? undefined,
              dor: lead.dor_principal ?? undefined,
              vendedor,
            });
            const fullText = (out.assunto ? `Assunto: ${out.assunto}\n\n` : "") + out.corpo;
            const key = `${t.passo}-${t.canal}-${i}`;
            return (
              <div key={key} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {t.canal === "Email"
                      ? <Mail className="w-4 h-4 text-slate-400"/>
                      : <MessageSquare className="w-4 h-4 text-slate-400"/>}
                    <span className="text-sm font-medium">{t.canal}</span>
                    <span className="text-xs text-slate-500">· {t.objetivo}</span>
                  </div>
                  <button onClick={() => copy(key, fullText)} className="btn-secondary text-xs">
                    {copied === key ? <><Check className="w-3.5 h-3.5"/> Copiado</> : <><Copy className="w-3.5 h-3.5"/> Copiar</>}
                  </button>
                </div>
                {out.assunto && (
                  <div className="text-xs text-slate-500 mb-2">
                    <span className="uppercase tracking-wider">Assunto:</span> <span className="text-slate-800">{out.assunto}</span>
                  </div>
                )}
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans bg-slate-50 rounded-lg p-3">{out.corpo}</pre>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
