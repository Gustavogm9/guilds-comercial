"use client";
import { useEffect, useState, useTransition } from "react";
import { criarLead } from "@/app/(app)/base/actions";
import { SEGMENTOS, FONTES } from "@/lib/lists";
import { X, Plus } from "lucide-react";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";

export default function NovoLeadModal({ profiles, variant = "button" }: {
  profiles: { id: string; display_name: string }[];
  variant?: "button" | "fab";
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [locale, setLocale] = useState<Locale>("pt-BR");
  useEffect(() => setLocale(getClientLocale()), []);
  const t = getT(locale);
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
    ? "flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full px-5 py-3 shadow-xl transition"
    : "btn-primary text-xs";
  const triggerLabel = t("modais.novo_lead");

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClass} title={triggerLabel}>
        <Plus className={variant === "fab" ? "w-5 h-5" : "w-3.5 h-3.5"}/> {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
             onClick={() => setOpen(false)}>
          <form onSubmit={submit}
            className="bg-card text-foreground border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="font-semibold">{t("modais.novo_lead_titulo")}</div>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                <X className="w-4 h-4"/>
              </button>
            </div>

            <div className="overflow-y-auto p-5 grid md:grid-cols-2 gap-3 text-sm">
              <Field label={`${t("modais.campo_empresa")} *`} value={form.empresa} onChange={(v) => setForm({...form, empresa: v})} required />
              <Field label={t("modais.campo_nome")} value={form.nome} onChange={(v) => setForm({...form, nome: v})} />
              <Field label={t("modais.campo_cargo")} value={form.cargo} onChange={(v) => setForm({...form, cargo: v})} />
              <Field label={t("modais.campo_cidade_uf")} value={form.cidade_uf} onChange={(v) => setForm({...form, cidade_uf: v})} />
              <Field label={t("modais.campo_email")} type="email" value={form.email} onChange={(v) => setForm({...form, email: v})} />
              <Field label={t("modais.campo_whatsapp")} value={form.whatsapp} onChange={(v) => setForm({...form, whatsapp: v})} />
              <Field label={t("modais.campo_linkedin")} value={form.linkedin} onChange={(v) => setForm({...form, linkedin: v})} />

              <div>
                <label className="label">{t("modais.campo_segmento")}</label>
                <select value={form.segmento} onChange={(e) => setForm({...form, segmento: e.target.value})}
                  className="input-base mt-1">
                  <option value="">—</option>
                  {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="label">{t("modais.campo_fonte")}</label>
                <select value={form.fonte} onChange={(e) => setForm({...form, fonte: e.target.value})}
                  className="input-base mt-1">
                  <option value="">—</option>
                  {FONTES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="label">{t("modais.campo_responsavel")}</label>
                <select value={form.responsavel_id} onChange={(e) => setForm({...form, responsavel_id: e.target.value})}
                  className="input-base mt-1">
                  <option value="">{t("modais.responsavel_eu")}</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="label">{t("modais.campo_observacoes")}</label>
                <textarea value={form.observacoes} onChange={(e) => setForm({...form, observacoes: e.target.value})}
                  className="input-base mt-1 min-h-[60px]"/>
              </div>

              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.newsletter_optin}
                  onChange={(e) => setForm({...form, newsletter_optin: e.target.checked})}/>
                {t("modais.newsletter_optin")}
              </label>

              <label className="md:col-span-2 flex items-start gap-2 text-sm p-2 rounded-lg bg-primary/10 border border-primary/20">
                <input type="checkbox" checked={form.direto_pipeline}
                  onChange={(e) => setForm({...form, direto_pipeline: e.target.checked})}
                  className="mt-0.5"/>
                <span>
                  <b>{t("modais.direto_pipeline_titulo")}</b>
                  <span className="block text-xs text-muted-foreground">{t("modais.direto_pipeline_sub")}</span>
                </span>
              </label>
            </div>

            <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-sm">{t("comum.cancelar")}</button>
              <button type="submit" disabled={pending || !form.empresa}
                className={form.direto_pipeline ? "btn-primary text-sm bg-primary/90" : "btn-primary text-sm"}>
                {pending
                  ? t("modais.criando")
                  : form.direto_pipeline ? t("modais.criar_e_pipeline") : t("modais.criar_lead")}
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
