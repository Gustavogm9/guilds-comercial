"use client";
import { useEffect, useState } from "react";
import { getTemplatesByLocale, aplicarTemplate, type CadenciaPasso } from "@/lib/cadencia-templates";
import { getClientLocale, type Locale } from "@/lib/i18n";
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
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  if (!open) return null;
  const isEN = locale === "en-US";
  const tpls = getTemplatesByLocale(locale).filter(t => t.passo === passo);

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card text-foreground border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold">{isEN ? "Cadence templates" : "Templates de cadência"}</div>
            <div className="text-xs text-muted-foreground">
              {isEN ? "For:" : "Para:"} {lead.nome || "—"} · {lead.empresa || "—"}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="w-4 h-4"/></button>
        </div>

        <div className="px-5 pt-3 flex gap-1 border-b border-border">
          {(["D0","D3","D7","D11","D16","D30"] as CadenciaPasso[]).map(p => (
            <button key={p} onClick={() => setPasso(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition ${
                passo === p ? "bg-primary/10 text-primary border-b-2 border-primary"
                            : "text-muted-foreground hover:text-foreground"
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
            const subjectLabel = isEN ? "Subject" : "Assunto";
            const fullText = (out.assunto ? `${subjectLabel}: ${out.assunto}\n\n` : "") + out.corpo;
            const key = `${t.passo}-${t.canal}-${i}`;
            return (
              <div key={key} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {t.canal === "Email"
                      ? <Mail className="w-4 h-4 text-muted-foreground"/>
                      : <MessageSquare className="w-4 h-4 text-muted-foreground"/>}
                    <span className="text-sm font-medium">{t.canal}</span>
                    <span className="text-xs text-muted-foreground">· {t.objetivo}</span>
                  </div>
                  <button onClick={() => copy(key, fullText)} className="btn-secondary text-xs">
                    {copied === key
                      ? <><Check className="w-3.5 h-3.5"/> {isEN ? "Copied" : "Copiado"}</>
                      : <><Copy className="w-3.5 h-3.5"/> {isEN ? "Copy" : "Copiar"}</>}
                  </button>
                </div>
                {out.assunto && (
                  <div className="text-xs text-muted-foreground mb-2">
                    <span className="uppercase tracking-wider">{subjectLabel}:</span> <span className="text-foreground">{out.assunto}</span>
                  </div>
                )}
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans bg-muted/40 rounded-lg p-3">{out.corpo}</pre>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
