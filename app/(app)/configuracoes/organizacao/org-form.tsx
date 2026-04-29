"use client";

import { useTransition, useState, useMemo } from "react";
import { updateOrganization } from "./actions";
import { Loader2, Check } from "lucide-react";
import {
  formatCNPJ,
  formatCEP,
  REGIMES_TRIBUTARIOS,
  UFS,
} from "@/lib/utils/br-fiscal";
import {
  PAISES, FUSOS_GLOBAIS, IDIOMAS, MOEDAS, getPais, labelTaxId, formatTelefoneI18n,
} from "@/lib/utils/i18n-fiscal";
import type { Organizacao } from "@/lib/types";

export default function OrgForm({ org }: { org: Organizacao }) {
  const [isPending, startTransition] = useTransition();
  const [salvouRecente, setSalvouRecente] = useState(false);
  const [pais, setPais] = useState(org.pais ?? "BR");
  const isBR = pais === "BR";
  const paisInfo = useMemo(() => getPais(pais), [pais]);
  const [taxId, setTaxId] = useState(
    isBR && org.cnpj ? formatCNPJ(org.cnpj) : (org.tax_id ?? "")
  );
  const [telefone, setTelefone] = useState(
    org.telefone ? formatTelefoneI18n(org.telefone, pais) : ""
  );
  const [cep, setCep] = useState(org.endereco?.cep ? formatCEP(org.endereco.cep) : "");

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const res = await updateOrganization(formData);
      if (res.error) {
        alert(res.error);
      } else {
        setSalvouRecente(true);
        setTimeout(() => setSalvouRecente(false), 2500);
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* IDENTIDADE */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Identidade
        </legend>
        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-foreground mb-1">
            Nome fantasia
          </label>
          <input
            id="nome"
            name="nome"
            type="text"
            defaultValue={org.nome}
            required
            className="input-base w-full"
            placeholder="Ex: Guilds"
          />
          <p className="text-xs text-muted-foreground mt-1">Visível para o time na barra lateral.</p>
        </div>
        <div>
          <label htmlFor="razao_social" className="block text-sm font-medium text-foreground mb-1">
            Razão social <span className="text-muted-foreground font-normal">(necessária para emitir nota)</span>
          </label>
          <input
            id="razao_social"
            name="razao_social"
            type="text"
            defaultValue={org.razao_social ?? ""}
            className="input-base w-full"
            placeholder="Ex: Guilds Lab Consultoria LTDA"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="telefone" className="block text-sm font-medium text-foreground mb-1">Telefone</label>
            <input
              id="telefone"
              name="telefone"
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              onBlur={(e) => setTelefone(formatTelefoneI18n(e.target.value, pais))}
              className="input-base w-full"
              placeholder={isBR ? "(11) 3322-4455" : "+1 202 555 1234"}
              maxLength={24}
            />
          </div>
          <div>
            <label htmlFor="site" className="block text-sm font-medium text-foreground mb-1">Site</label>
            <input
              id="site"
              name="site"
              type="url"
              defaultValue={org.site ?? ""}
              className="input-base w-full"
              placeholder="https://"
            />
          </div>
        </div>
        <div>
          <label htmlFor="logo_url" className="block text-sm font-medium text-foreground mb-1">
            Logo (URL pública) <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <input
            id="logo_url"
            name="logo_url"
            type="url"
            defaultValue={org.logo_url ?? ""}
            className="input-base w-full"
            placeholder="https://exemplo.com/logo.png"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="pais" className="block text-sm font-medium text-foreground mb-1">País / Country</label>
            <select
              id="pais"
              name="pais"
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              className="input-base w-full"
            >
              {PAISES.map((p) => (
                <option key={p.code} value={p.code}>{p.nome_pt}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="idioma_padrao" className="block text-sm font-medium text-foreground mb-1">Idioma / Language</label>
            <select
              id="idioma_padrao"
              name="idioma_padrao"
              defaultValue={org.idioma_padrao ?? paisInfo.idioma_padrao}
              className="input-base w-full"
            >
              {IDIOMAS.map((i) => (
                <option key={i.code} value={i.code}>{i.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="moeda_padrao" className="block text-sm font-medium text-foreground mb-1">Moeda / Currency</label>
            <select
              id="moeda_padrao"
              name="moeda_padrao"
              defaultValue={org.moeda_padrao ?? paisInfo.moeda_padrao}
              className="input-base w-full"
            >
              {MOEDAS.map((m) => (
                <option key={m.code} value={m.code}>{m.symbol} {m.code} · {m.nome_pt}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-foreground mb-1">Fuso horário / Timezone</label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={org.timezone ?? "America/Sao_Paulo"}
            className="input-base w-full"
          >
            {FUSOS_GLOBAIS.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.group} · {tz.label}</option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* DADOS FISCAIS */}
      <fieldset className="space-y-4 pt-2 border-t border-border/50">
        <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-4">
          Dados fiscais
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="tax_id" className="block text-sm font-medium text-foreground mb-1">{labelTaxId(pais)}</label>
            <input
              id="tax_id"
              name={isBR ? "cnpj" : "tax_id"}
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(isBR ? formatCNPJ(e.target.value) : e.target.value)}
              className="input-base w-full"
              placeholder={isBR ? "00.000.000/0000-00" : "Ex: 12-3456789, RUT, NIF, etc."}
              maxLength={isBR ? 18 : 30}
            />
            {!isBR && (
              <input type="hidden" name="tax_id" value={taxId} />
            )}
          </div>
          {isBR && (
            <div>
              <label htmlFor="inscricao_estadual" className="block text-sm font-medium text-foreground mb-1">
                Inscrição estadual
              </label>
              <input
                id="inscricao_estadual"
                name="inscricao_estadual"
                type="text"
                defaultValue={org.inscricao_estadual ?? ""}
                className="input-base w-full"
                placeholder='ou "Isento"'
              />
            </div>
          )}
        </div>
        {isBR && (
          <div>
            <label htmlFor="regime_tributario" className="block text-sm font-medium text-foreground mb-1">Regime tributário</label>
            <select
              id="regime_tributario"
              name="regime_tributario"
              defaultValue={org.regime_tributario ?? ""}
              className="input-base w-full"
            >
              <option value="">— selecione —</option>
              {REGIMES_TRIBUTARIOS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      {/* ENDERECO */}
      <fieldset className="space-y-4 pt-2 border-t border-border/50">
        <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-4">
          Endereço
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label htmlFor="cep" className="block text-sm font-medium text-foreground mb-1">
              {isBR ? "CEP" : "Postal code / ZIP"}
            </label>
            {isBR ? (
              <input
                id="cep"
                name="cep"
                type="text"
                value={cep}
                onChange={(e) => setCep(formatCEP(e.target.value))}
                className="input-base w-full"
                placeholder="00000-000"
                maxLength={9}
              />
            ) : (
              <input
                id="postal_code"
                name="postal_code"
                type="text"
                defaultValue={org.endereco?.postal_code ?? ""}
                className="input-base w-full"
                placeholder="Ex: 10001, SW1A 1AA, etc."
                maxLength={20}
              />
            )}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="logradouro" className="block text-sm font-medium text-foreground mb-1">
              {isBR ? "Logradouro" : "Address line"}
            </label>
            <input
              id="logradouro"
              name="logradouro"
              type="text"
              defaultValue={org.endereco?.logradouro ?? ""}
              className="input-base w-full"
              placeholder={isBR ? "Rua / Av." : "Street, Avenue, Road..."}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="numero" className="block text-sm font-medium text-foreground mb-1">Número</label>
            <input
              id="numero"
              name="numero"
              type="text"
              defaultValue={org.endereco?.numero ?? ""}
              className="input-base w-full"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="complemento" className="block text-sm font-medium text-foreground mb-1">Complemento</label>
            <input
              id="complemento"
              name="complemento"
              type="text"
              defaultValue={org.endereco?.complemento ?? ""}
              className="input-base w-full"
              placeholder="Sala, andar, etc"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label htmlFor="bairro" className="block text-sm font-medium text-foreground mb-1">Bairro</label>
            <input
              id="bairro"
              name="bairro"
              type="text"
              defaultValue={org.endereco?.bairro ?? ""}
              className="input-base w-full"
            />
          </div>
          <div className="sm:col-span-1">
            <label htmlFor="cidade" className="block text-sm font-medium text-foreground mb-1">Cidade</label>
            <input
              id="cidade"
              name="cidade"
              type="text"
              defaultValue={org.endereco?.cidade ?? ""}
              className="input-base w-full"
            />
          </div>
          <div>
            <label htmlFor={isBR ? "uf" : "regiao"} className="block text-sm font-medium text-foreground mb-1">
              {isBR ? "UF" : "Estado / Província"}
            </label>
            {isBR ? (
              <select
                id="uf"
                name="uf"
                defaultValue={org.endereco?.uf ?? ""}
                className="input-base w-full"
              >
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            ) : (
              <input
                id="regiao"
                name="regiao"
                type="text"
                defaultValue={org.endereco?.regiao ?? ""}
                className="input-base w-full"
                placeholder="Ex: California, Ontario..."
                maxLength={50}
              />
            )}
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end items-center gap-3 pt-4 border-t border-border/50">
        {salvouRecente && (
          <span className="text-sm text-success-500 flex items-center gap-1">
            <Check className="w-4 h-4" /> Salvo
          </span>
        )}
        <button type="submit" disabled={isPending} className="btn-primary min-w-[140px]">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Salvar Alterações"}
        </button>
      </div>
    </form>
  );
}
