"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Mail, Plus, Trash2 } from "lucide-react";
import { finalizarOnboarding } from "@/app/onboarding/actions";
import { formatCNPJ, isValidCNPJ } from "@/lib/utils/br-fiscal";
import { PAISES, getPais, validarTaxId, labelTaxId } from "@/lib/utils/i18n-fiscal";
import { getClientLocale, getT, type Locale } from "@/lib/i18n";
import type { Role } from "@/lib/types";

type InviteDraft = {
  email: string;
  role: Role;
};

export default function OnboardingWizard({ nome, empresa }: { nome: string; empresa: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [pais, setPais] = useState("BR");
  const paisInfo = useMemo(() => getPais(pais), [pais]);
  const [uiLocale, setUiLocale] = useState<Locale>("pt-BR");
  useEffect(() => setUiLocale(getClientLocale()), []);
  const t = getT(uiLocale);
  const [segmento, setSegmento] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [taxId, setTaxId] = useState("");
  const [dor, setDor] = useState("");
  const [cargo, setCargo] = useState("");
  const [convites, setConvites] = useState<InviteDraft[]>([{ email: "", role: "comercial" }]);
  const [habilitarIA, setHabilitarIA] = useState(true);
  const [gerarDemo, setGerarDemo] = useState(true);

  // Validação delegada por país: BR valida CNPJ por DV, outros aceitam livre.
  const taxIdValido = useMemo(() => validarTaxId(taxId, pais), [taxId, pais]);
  const taxIdErro = taxId.length > 0 && !taxIdValido.valid;
  const isBR = pais === "BR";

  const convitesValidos = convites
    .map((convite) => ({ ...convite, email: convite.email.trim().toLowerCase() }))
    .filter((convite) => convite.email.includes("@"));

  async function concluir() {
    setLoading(true);
    setErro(null);
    try {
      const taxIdLimpo = isBR ? taxId.replace(/\D/g, "") : taxId.trim();
      await finalizarOnboarding({
        pais,
        idioma_padrao: paisInfo.idioma_padrao,
        moeda_padrao: paisInfo.moeda_padrao,
        segmento,
        dor_principal: dor,
        cargo_foco: cargo,
        razao_social: razaoSocial.trim() || undefined,
        tax_id: taxIdLimpo || undefined,
        // CNPJ legado mantido apenas se for BR + 14 dígitos
        cnpj: isBR && taxIdLimpo.length === 14 ? taxIdLimpo : undefined,
        convites: convitesValidos,
        habilitarIA,
        gerarDemo,
      });
      router.push("/hoje");
      router.refresh();
    } catch (e: any) {
      setErro(e.message || "Erro inesperado");
      setLoading(false);
    }
  }

  function atualizarConvite(index: number, patch: Partial<InviteDraft>) {
    setConvites((atuais) => atuais.map((convite, i) => i === index ? { ...convite, ...patch } : convite));
  }

  function adicionarConvite() {
    setConvites((atuais) => atuais.length >= 5 ? atuais : [...atuais, { email: "", role: "comercial" }]);
  }

  function removerConvite(index: number) {
    setConvites((atuais) => atuais.length === 1 ? [{ email: "", role: "comercial" }] : atuais.filter((_, i) => i !== index));
  }

  return (
    <div className="w-full max-w-2xl card p-6 md:p-8 transition-all relative overflow-hidden">
      {loading && (
        <div className="absolute inset-0 bg-background/85 backdrop-blur flex flex-col items-center justify-center z-10">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4" />
          <p className="font-medium text-foreground animate-pulse">{t("onboarding.preparando")}</p>
          <p className="text-xs text-muted-foreground mt-2">{t("onboarding.preparando_sub")}</p>
        </div>
      )}

      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-foreground mb-2">{t("onboarding.bem_vindo")} {nome}.</h2>
          <p className="text-muted-foreground mb-8">
            {t("onboarding.ajustar_operacao")} <strong>{empresa}</strong> {t("onboarding.para_seu_mercado")}
          </p>
          <div className="space-y-4">
            <div>
              <label className="label mb-1">{t("onboarding.pais_country")}</label>
              <select className="input-base" value={pais} onChange={(e) => setPais(e.target.value)}>
                {PAISES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.nome_pt} · {p.nome_en}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1 normal-case">
                {t("onboarding.moeda_idioma_info")
                  .replace("{{moeda}}", paisInfo.moeda_padrao)
                  .replace("{{idioma}}", paisInfo.idioma_padrao)}
              </p>
            </div>
            <div>
              <label className="label mb-1">{t("onboarding.segmento_label")}</label>
              <select className="input-base" value={segmento} onChange={(e) => setSegmento(e.target.value)}>
                <option value="">{t("onboarding.segmento_placeholder")}</option>
                <option value="SaaS / Tecnologia">SaaS / Tecnologia</option>
                <option value="Servicos B2B">Servicos B2B</option>
                <option value="Saude / Clinicas">Saude / Clinicas</option>
                <option value="Imobiliario">Imobiliario</option>
                <option value="Industria">Industria</option>
                <option value="Educacao">Educacao</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="label mb-1">
                {t("onboarding.razao_social_label")} <span className="text-muted-foreground font-normal normal-case">{t("onboarding.razao_social_hint")}</span>
              </label>
              <input
                type="text"
                className="input-base"
                placeholder={isBR ? "Ex: Guilds Lab Consultoria LTDA" : "Ex: Guilds Lab LLC"}
                value={razaoSocial}
                onChange={(e) => setRazaoSocial(e.target.value)}
              />
            </div>
            <div>
              <label className="label mb-1">
                {labelTaxId(pais)} <span className="text-muted-foreground font-normal normal-case">(opcional)</span>
              </label>
              <input
                type="text"
                className="input-base"
                placeholder={isBR ? "00.000.000/0000-00" : "Ex: 12-3456789, RUT, NIF, etc."}
                value={taxId}
                onChange={(e) => setTaxId(isBR ? formatCNPJ(e.target.value) : e.target.value)}
                maxLength={isBR ? 18 : 30}
              />
              {taxIdErro && (
                <p className="text-xs text-urgent-500 mt-1">{taxIdValido.motivo ?? "Inválido."}</p>
              )}
            </div>
          </div>
          <button
            disabled={!segmento || taxIdErro}
            onClick={() => setStep(2)}
            className="btn-primary w-full mt-8"
          >
            {t("comum.continuar")}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-foreground mb-2">{t("onboarding.cliente_ideal")}</h2>
          <p className="text-muted-foreground mb-8">{t("onboarding.cliente_ideal_sub")}</p>
          <div className="space-y-4">
            <div>
              <label className="label mb-1">{t("onboarding.cargo_decisor")}</label>
              <input
                className="input-base"
                placeholder={t("onboarding.cargo_placeholder")}
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
            </div>
            <div>
              <label className="label mb-1">{t("onboarding.dor_principal")}</label>
              <textarea
                className="input-base min-h-[92px]"
                placeholder={t("onboarding.dor_placeholder")}
                value={dor}
                onChange={(e) => setDor(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1">{t("comum.voltar")}</button>
            <button disabled={!cargo || !dor} onClick={() => setStep(3)} className="btn-primary flex-1">
              {t("comum.continuar")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">{t("onboarding.convide_time")}</h2>
          </div>
          <p className="text-muted-foreground mb-6">{t("onboarding.convide_time_sub")}</p>

          <div className="space-y-3">
            {convites.map((convite, index) => (
              <div key={index} className="grid grid-cols-[1fr_132px_36px] gap-2 items-end">
                <div>
                  <label className="label mb-1">{t("onboarding.convite_email")}</label>
                  <input
                    type="email"
                    className="input-base"
                    placeholder="pessoa@empresa.com"
                    value={convite.email}
                    onChange={(e) => atualizarConvite(index, { email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label mb-1">{t("onboarding.convite_papel")}</label>
                  <select
                    className="input-base"
                    value={convite.role}
                    onChange={(e) => atualizarConvite(index, { role: e.target.value as Role })}
                  >
                    <option value="comercial">{t("papeis.comercial")}</option>
                    <option value="sdr">{t("papeis.sdr")}</option>
                    <option value="gestor">{t("papeis.gestor")}</option>
                  </select>
                </div>
                <button type="button" onClick={() => removerConvite(index)} className="btn-ghost h-10 px-0" aria-label="Remover convite">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={adicionarConvite} disabled={convites.length >= 5} className="btn-secondary mt-4 text-sm">
            <Plus className="w-4 h-4" /> {t("onboarding.convite_adicionar")}
          </button>

          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1">{t("comum.voltar")}</button>
            <button onClick={() => setStep(4)} className="btn-primary flex-1">{t("comum.continuar")}</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold text-foreground mb-2">{t("onboarding.setup_final")}</h2>
          <p className="text-muted-foreground mb-6">{t("onboarding.setup_final_sub")}</p>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-4 rounded-lg border border-border cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 text-primary rounded"
                checked={habilitarIA}
                onChange={(e) => setHabilitarIA(e.target.checked)}
              />
              <div>
                <div className="font-medium text-foreground flex items-center gap-1">
                  <Bot className="w-4 h-4" /> {t("onboarding.ativar_ia")}
                </div>
                <div className="text-sm text-muted-foreground">{t("onboarding.ativar_ia_sub")}</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-lg border border-border cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 text-primary rounded"
                checked={gerarDemo}
                onChange={(e) => setGerarDemo(e.target.checked)}
              />
              <div>
                <div className="font-medium text-foreground">{t("onboarding.gerar_demo")}</div>
                <div className="text-sm text-muted-foreground">{t("onboarding.gerar_demo_sub")}</div>
              </div>
            </label>
          </div>

          {erro && <div className="mt-4 text-sm text-urgent-500 bg-urgent-500/10 border border-urgent-500/30 rounded-lg p-2">{erro}</div>}

          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(3)} className="btn-secondary flex-1">{t("comum.voltar")}</button>
            <button onClick={concluir} className="btn-primary flex-[2]">
              {t("onboarding.finalizar")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
