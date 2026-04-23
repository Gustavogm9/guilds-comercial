"use client";
import { useState, useTransition } from "react";
import { criarLead } from "@/app/(app)/base/actions";
import { SEGMENTOS, FONTES } from "@/lib/lists";
import { X, Plus } from "lucide-react";

export default function NovoLeadModal({ profiles, variant = "button" }: {
  profiles: { id: string; display_name: string }[];
  variant?: "button" | "fab";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    empresa: "", nome: "", cargo: "",
    email: "", whatsapp: "", linkedin: "",
    segmento: "", cidade_uf: "", fonte: "",
    responsavel_id: "", observacoes: "",
    newsletter_optin: false,
    direto_pipeline: false,
  });

  function reset() {
    setForm({
      empresa: "", nome: "", cargo: "",
      email: "", whatsapp: "", linkedin: "",
      segmento: "", cidade_uf: "", fonte: "",
      responsavel_id: "", observacoes: "",
      newsletter_optin: false,
      direto_pipeline: false,
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      await criarLead({
        nome: form.nome || undefined,
        empresa: form.empresa || undefined,
        cargo: form.cargo || undefined,
        email: form.email || undefined,
        whatsapp: form.whatsapp || undefined,
        linkedin: form.linkedin || undefined,
        segmento: form.segmento || undefined,
        cidade_uf: form.cidade_uf || undefined,
        fonte: form.fonte || undefined,
        observacoes: form.observacoes || undefined,
        responsavel_id: form.responsavel_id || undefined,
        newsletter_optin: form.newsletter_optin,
        direto_pipeline: form.direto_pipeline,
      });
      reset();
      setOpen(false);
    });
  }

  const triggerClass = variant === "fab"
    ? "flex items-center gap-2 bg-guild-600 hover:bg-guild-700 text-white font-semibold rounded-full px-5 py-3 shadow-xl shadow-guild-900/20 transition"
    : "btn-primary text-xs";
  const triggerLabel = variant === "fab" ? "Novo lead" : "Novo lead";

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClass} title="Adicionar lead">
        <Plus className={variant === "fab" ? "w-5 h-5" : "w-3.5 h-3.5"}/> {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
             onClick={() => setOpen(false)}>
          <form onSubmit={submit}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="font-semibold">Novo lead na base</div>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                <X className="w-4 h-4"/>
              </button>
            </div>

            <div className="overflow-y-auto p-5 grid md:grid-cols-2 gap-3 text-sm">
              <Field label="Empresa *" value={form.empresa} onChange={(v) => setForm({...form, empresa: v})} required />
              <Field label="Nome do contato" value={form.nome} onChange={(v) => setForm({...form, nome: v})} />
              <Field label="Cargo" value={form.cargo} onChange={(v) => setForm({...form, cargo: v})} />
              <Field label="Cidade/UF" value={form.cidade_uf} onChange={(v) => setForm({...form, cidade_uf: v})} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({...form, email: v})} />
              <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm({...form, whatsapp: v})} />
              <Field label="LinkedIn" value={form.linkedin} onChange={(v) => setForm({...form, linkedin: v})} />

              <div>
                <label className="label">Segmento</label>
                <select value={form.segmento} onChange={(e) => setForm({...form, segmento: e.target.value})}
                  className="input-base mt-1">
                  <option value="">—</option>
                  {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Fonte</label>
                <select value={form.fonte} onChange={(e) => setForm({...form, fonte: e.target.value})}
                  className="input-base mt-1">
                  <option value="">—</option>
                  {FONTES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Responsável</label>
                <select value={form.responsavel_id} onChange={(e) => setForm({...form, responsavel_id: e.target.value})}
                  className="input-base mt-1">
                  <option value="">— eu —</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="label">Observações</label>
                <textarea value={form.observacoes} onChange={(e) => setForm({...form, observacoes: e.target.value})}
                  className="input-base mt-1 min-h-[60px]"/>
              </div>

              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.newsletter_optin}
                  onChange={(e) => setForm({...form, newsletter_optin: e.target.checked})}/>
                Adicionar à newsletter (opt-in)
              </label>

              <label className="md:col-span-2 flex items-start gap-2 text-sm p-2 rounded-lg bg-guild-50 border border-guild-100">
                <input type="checkbox" checked={form.direto_pipeline}
                  onChange={(e) => setForm({...form, direto_pipeline: e.target.checked})}
                  className="mt-0.5"/>
                <span>
                  <b>Já qualificado — pular triagem e ir direto para o pipeline</b>
                  <span className="block text-xs text-slate-500">Entra em <b>Prospecção</b> e cria cadência D0–D30 automática. Use para indicações quentes ou leads já conhecidos.</span>
                </span>
              </label>
            </div>

            <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-sm">Cancelar</button>
              <button type="submit" disabled={pending || !form.empresa}
                className={form.direto_pipeline ? "btn-primary text-sm bg-guild-700" : "btn-primary text-sm"}>
                {pending
                  ? "Criando…"
                  : form.direto_pipeline ? "Criar e ir ao pipeline" : "Criar lead"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="input-base mt-1"/>
    </div>
  );
}
