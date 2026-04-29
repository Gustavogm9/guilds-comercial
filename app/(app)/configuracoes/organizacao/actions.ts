"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { onlyDigits } from "@/lib/utils/br-fiscal";
import { validarTaxId, normalizarTelefoneI18n, isValidTelefoneI18n, PAISES } from "@/lib/utils/i18n-fiscal";
import type { EnderecoOrg, RegimeTributario } from "@/lib/types";

const REGIMES = ["simples_nacional", "lucro_presumido", "lucro_real", "mei", "isento"] as const;
const PAIS_CODES = new Set(PAISES.map((p) => p.code));

export async function updateOrganization(formData: FormData) {
  const role = await getCurrentRole();
  if (role !== "gestor") {
    return { error: "Apenas gestores podem alterar a organização." };
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return { error: "Organização não identificada." };
  }

  const nome = formData.get("nome")?.toString().trim();
  if (!nome || nome.length < 2) {
    return { error: "Nome muito curto." };
  }

  const pais          = (formData.get("pais")?.toString().trim().toUpperCase() || "BR");
  const isBR          = pais === "BR";
  const idioma_padrao = formData.get("idioma_padrao")?.toString().trim() || "pt-BR";
  const moeda_padrao  = (formData.get("moeda_padrao")?.toString().trim().toUpperCase() || "BRL");
  const razao_social  = formData.get("razao_social")?.toString().trim() || null;
  const taxIdRaw      = formData.get("tax_id")?.toString() ?? "";
  const tax_id        = taxIdRaw.trim() || null;
  // CNPJ legado: só persiste se BR e formato válido
  const cnpjRaw       = formData.get("cnpj")?.toString() ?? "";
  const cnpj          = isBR && cnpjRaw ? onlyDigits(cnpjRaw) : null;
  const inscricao     = isBR ? (formData.get("inscricao_estadual")?.toString().trim() || null) : null;
  const regimeRaw     = formData.get("regime_tributario")?.toString() || null;
  const regime        = isBR ? (regimeRaw as RegimeTributario | null) : null;
  const telefoneRaw   = formData.get("telefone")?.toString() ?? "";
  const telefone      = telefoneRaw ? normalizarTelefoneI18n(telefoneRaw, pais) : null;
  const site          = formData.get("site")?.toString().trim() || null;
  const timezone      = formData.get("timezone")?.toString() || null;
  const logo_url      = formData.get("logo_url")?.toString().trim() || null;

  const endereco: EnderecoOrg = {
    pais,
    cep:         isBR ? (onlyDigits(formData.get("cep")?.toString() ?? "") || undefined) : undefined,
    postal_code: !isBR ? (formData.get("postal_code")?.toString().trim() || undefined) : undefined,
    logradouro:  formData.get("logradouro")?.toString().trim() || undefined,
    numero:      formData.get("numero")?.toString().trim() || undefined,
    complemento: formData.get("complemento")?.toString().trim() || undefined,
    bairro:      formData.get("bairro")?.toString().trim() || undefined,
    cidade:      formData.get("cidade")?.toString().trim() || undefined,
    uf:          isBR ? (formData.get("uf")?.toString().trim().toUpperCase() || undefined) : undefined,
    regiao:      !isBR ? (formData.get("regiao")?.toString().trim() || undefined) : undefined,
  };
  const enderecoVazio = Object.values(endereco).filter((v) => v !== pais).every((v) => !v);

  // Validações
  if (!PAIS_CODES.has(pais)) return { error: "País inválido." };
  if (tax_id) {
    const v = validarTaxId(tax_id, pais);
    if (!v.valid) return { error: v.motivo ?? "Tax ID inválido." };
  }
  if (telefone && !isValidTelefoneI18n(telefoneRaw, pais)) {
    return { error: "Telefone inválido para o país selecionado." };
  }
  if (isBR && regime && !REGIMES.includes(regime as any)) return { error: "Regime tributário inválido." };
  if (isBR && endereco.cep && endereco.cep.length !== 8) return { error: "CEP deve ter 8 dígitos." };
  if (isBR && endereco.uf && endereco.uf.length !== 2) return { error: "UF deve ter 2 letras." };

  const supabase = createClient();
  const { error } = await supabase
    .from("organizacoes")
    .update({
      nome,
      pais,
      idioma_padrao,
      moeda_padrao,
      razao_social,
      cnpj,
      tax_id,
      inscricao_estadual: inscricao,
      regime_tributario: regime,
      telefone,
      site,
      timezone,
      logo_url,
      endereco: enderecoVazio ? null : endereco,
    })
    .eq("id", orgId);

  if (error) {
    console.error("Erro ao atualizar org:", error);
    return { error: "Falha ao salvar as configurações." };
  }

  revalidatePath("/configuracoes/organizacao");
  revalidatePath("/", "layout");
  return { success: true };
}
