"use client";
import { useState, useTransition } from "react";
import { marcarPago, salvarResultado } from "@/app/(app)/raio-x/actions";
import { Check, FileText, X } from "lucide-react";

export default function RaioXRowActions({
  raioxId, leadId, jaPago, jaTemResultado,
}: {
  raioxId: number; leadId: number; jaPago: boolean; jaTemResultado: boolean;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<null | "result">(null);
  const [form, setForm] = useState({
    score: 50,
    perda: 0,
    nivel: "Médio" as "Alto" | "Médio" | "Baixo",
    saida: "Diagnóstico pago",
    diag_pago: "Sim",
    obs: "",
  });

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {!jaPago && (
        <button disabled={pending}
          onClick={() => start(async () => { await marcarPago(raioxId, leadId); })}
          className="btn-secondary text-xs">
          <Check className="w-3.5 h-3.5"/> Pago
        </button>
      )}
      {jaPago && !jaTemResultado && (
        <button onClick={() => setOpen("result")} className="btn-primary text-xs">
          <FileText className="w-3.5 h-3.5"/> Lançar resultado
        </button>
      )}
      {open === "result" && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
             onClick={() => setOpen(null)}>
          <form onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); start(async () => {
              await salvarResultado({
                raio_x_id: raioxId, lead_id: leadId,
                score: form.score, perda_anual_estimada: form.perda,
                nivel: form.nivel, saida_recomendada: form.saida,
                diagnostico_pago_sugerido: form.diag_pago,
                observacoes: form.obs || undefined,
              });
              setOpen(null);
            })}}
            className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Resultado do Raio-X</div>
              <button type="button" onClick={() => setOpen(null)} className="btn-ghost"><X className="w-4 h-4"/></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="label">Score (0-100)</label>
                <input type="number" min={0} max={100} value={form.score}
                  onChange={(e) => setForm({...form, score: parseInt(e.target.value || "0", 10)})}
                  className="input-base mt-1"/>
              </div>
              <div>
                <label className="label">Nível</label>
                <select value={form.nivel}
                  onChange={(e) => setForm({...form, nivel: e.target.value as any})}
                  className="input-base mt-1">
                  <option>Alto</option><option>Médio</option><option>Baixo</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Perda anual estimada (R$)</label>
                <input type="number" min={0} step={1000} value={form.perda}
                  onChange={(e) => setForm({...form, perda: parseFloat(e.target.value || "0")})}
                  className="input-base mt-1"/>
              </div>
              <div className="col-span-2">
                <label className="label">Saída recomendada</label>
                <input value={form.saida}
                  onChange={(e) => setForm({...form, saida: e.target.value})}
                  className="input-base mt-1"/>
              </div>
              <div className="col-span-2">
                <label className="label">Diagnóstico pago sugerido?</label>
                <select value={form.diag_pago}
                  onChange={(e) => setForm({...form, diag_pago: e.target.value})}
                  className="input-base mt-1">
                  <option>Sim</option><option>Talvez</option><option>Não</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Observações</label>
                <textarea value={form.obs}
                  onChange={(e) => setForm({...form, obs: e.target.value})}
                  className="input-base mt-1 min-h-[60px]"/>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(null)} className="btn-ghost text-sm">Cancelar</button>
              <button type="submit" disabled={pending} className="btn-primary text-sm">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
