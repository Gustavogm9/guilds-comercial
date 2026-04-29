/**
 * Helpers internacionais — países, fusos, taxa fiscal, telefone.
 *
 * Substitui parcialmente `lib/utils/br-fiscal.ts` (que continua disponível
 * pra validações específicas do Brasil quando `pais === 'BR'`).
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { isValidCNPJ } from "./br-fiscal";

/**
 * Países suportados — top 50 por relevância de mercado pra Guilds.
 * ISO 3166-1 alpha-2. Adicionar novos é trivial.
 */
export const PAISES: Array<{
  code: string;
  nome_pt: string;
  nome_en: string;
  moeda_padrao: string;
  idioma_padrao: string;
}> = [
  { code: "BR", nome_pt: "Brasil", nome_en: "Brazil", moeda_padrao: "BRL", idioma_padrao: "pt-BR" },
  { code: "US", nome_pt: "Estados Unidos", nome_en: "United States", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "PT", nome_pt: "Portugal", nome_en: "Portugal", moeda_padrao: "EUR", idioma_padrao: "pt-BR" },
  { code: "ES", nome_pt: "Espanha", nome_en: "Spain", moeda_padrao: "EUR", idioma_padrao: "en-US" },
  { code: "MX", nome_pt: "México", nome_en: "Mexico", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "AR", nome_pt: "Argentina", nome_en: "Argentina", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "CL", nome_pt: "Chile", nome_en: "Chile", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "CO", nome_pt: "Colômbia", nome_en: "Colombia", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "PE", nome_pt: "Peru", nome_en: "Peru", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "UY", nome_pt: "Uruguai", nome_en: "Uruguay", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "PY", nome_pt: "Paraguai", nome_en: "Paraguay", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "CA", nome_pt: "Canadá", nome_en: "Canada", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "GB", nome_pt: "Reino Unido", nome_en: "United Kingdom", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "DE", nome_pt: "Alemanha", nome_en: "Germany", moeda_padrao: "EUR", idioma_padrao: "en-US" },
  { code: "FR", nome_pt: "França", nome_en: "France", moeda_padrao: "EUR", idioma_padrao: "en-US" },
  { code: "IT", nome_pt: "Itália", nome_en: "Italy", moeda_padrao: "EUR", idioma_padrao: "en-US" },
  { code: "NL", nome_pt: "Países Baixos", nome_en: "Netherlands", moeda_padrao: "EUR", idioma_padrao: "en-US" },
  { code: "AU", nome_pt: "Austrália", nome_en: "Australia", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "JP", nome_pt: "Japão", nome_en: "Japan", moeda_padrao: "USD", idioma_padrao: "en-US" },
  { code: "OUTRO", nome_pt: "Outro país", nome_en: "Other country", moeda_padrao: "USD", idioma_padrao: "en-US" },
];

export function getPais(code: string) {
  return PAISES.find((p) => p.code === code) ?? PAISES.find((p) => p.code === "OUTRO")!;
}

/**
 * Lista global de fusos — agrupados por região.
 * 30 fusos cobrindo 95% dos casos. Para mais granularidade, usar Intl.supportedValuesOf("timeZone").
 */
export const FUSOS_GLOBAIS: Array<{ value: string; label: string; group: string }> = [
  // Brasil
  { value: "America/Sao_Paulo", label: "(GMT-3) São Paulo, Rio, Brasília", group: "🇧🇷 Brasil" },
  { value: "America/Manaus", label: "(GMT-4) Manaus, Cuiabá", group: "🇧🇷 Brasil" },
  { value: "America/Rio_Branco", label: "(GMT-5) Rio Branco, Acre", group: "🇧🇷 Brasil" },
  { value: "America/Noronha", label: "(GMT-2) Fernando de Noronha", group: "🇧🇷 Brasil" },

  // Américas
  { value: "America/New_York", label: "(GMT-5) New York, Toronto", group: "Americas" },
  { value: "America/Chicago", label: "(GMT-6) Chicago, Mexico City", group: "Americas" },
  { value: "America/Denver", label: "(GMT-7) Denver, Phoenix", group: "Americas" },
  { value: "America/Los_Angeles", label: "(GMT-8) Los Angeles, Vancouver", group: "Americas" },
  { value: "America/Anchorage", label: "(GMT-9) Anchorage", group: "Americas" },
  { value: "America/Buenos_Aires", label: "(GMT-3) Buenos Aires", group: "Americas" },
  { value: "America/Santiago", label: "(GMT-4) Santiago, Asunción", group: "Americas" },
  { value: "America/Lima", label: "(GMT-5) Lima, Bogotá", group: "Americas" },
  { value: "America/Caracas", label: "(GMT-4) Caracas", group: "Americas" },

  // Europa
  { value: "Europe/London", label: "(GMT+0) London, Lisbon", group: "Europe" },
  { value: "Europe/Madrid", label: "(GMT+1) Madrid, Paris, Berlin", group: "Europe" },
  { value: "Europe/Athens", label: "(GMT+2) Athens, Helsinki", group: "Europe" },
  { value: "Europe/Moscow", label: "(GMT+3) Moscow, Istanbul", group: "Europe" },

  // África
  { value: "Africa/Lagos", label: "(GMT+1) Lagos, Algiers", group: "Africa" },
  { value: "Africa/Cairo", label: "(GMT+2) Cairo, Johannesburg", group: "Africa" },
  { value: "Africa/Nairobi", label: "(GMT+3) Nairobi, Addis Ababa", group: "Africa" },

  // Ásia
  { value: "Asia/Dubai", label: "(GMT+4) Dubai, Abu Dhabi", group: "Asia" },
  { value: "Asia/Karachi", label: "(GMT+5) Karachi", group: "Asia" },
  { value: "Asia/Kolkata", label: "(GMT+5:30) Mumbai, New Delhi", group: "Asia" },
  { value: "Asia/Bangkok", label: "(GMT+7) Bangkok, Jakarta", group: "Asia" },
  { value: "Asia/Shanghai", label: "(GMT+8) Beijing, Shanghai, Singapore", group: "Asia" },
  { value: "Asia/Tokyo", label: "(GMT+9) Tokyo, Seoul", group: "Asia" },

  // Oceania
  { value: "Australia/Sydney", label: "(GMT+10) Sydney, Melbourne", group: "Oceania" },
  { value: "Pacific/Auckland", label: "(GMT+12) Auckland", group: "Oceania" },
  { value: "Pacific/Honolulu", label: "(GMT-10) Honolulu", group: "Oceania" },
];

/**
 * Idiomas suportados pela app.
 */
export const IDIOMAS = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "en-US", label: "English (United States)" },
] as const;

/**
 * Moedas suportadas (Stripe + display).
 */
export const MOEDAS = [
  { code: "BRL", symbol: "R$", nome_pt: "Real Brasileiro", nome_en: "Brazilian Real" },
  { code: "USD", symbol: "$", nome_pt: "Dólar Americano", nome_en: "US Dollar" },
  { code: "EUR", symbol: "€", nome_pt: "Euro", nome_en: "Euro" },
] as const;

// ============================================================
// Tax ID validation (delegado por país)
// ============================================================

/**
 * Valida tax_id de acordo com o país. Para BR, valida CNPJ por DV.
 * Para outros países, aceita qualquer string não-vazia (V1 — validação
 * por país pode ser adicionada incrementalmente).
 */
export function validarTaxId(value: string, pais: string): { valid: boolean; motivo?: string } {
  if (!value || value.trim().length === 0) return { valid: true }; // tax_id é opcional
  if (pais === "BR") {
    return isValidCNPJ(value)
      ? { valid: true }
      : { valid: false, motivo: "CNPJ inválido — confira os dígitos." };
  }
  // Outros países: aceita qualquer texto não-vazio com tamanho razoável
  if (value.trim().length < 3 || value.trim().length > 30) {
    return { valid: false, motivo: "Tax ID precisa ter entre 3 e 30 caracteres." };
  }
  return { valid: true };
}

/**
 * Label do campo de tax_id por país.
 */
export function labelTaxId(pais: string, locale: "pt-BR" | "en-US" = "pt-BR"): string {
  if (pais === "BR") return "CNPJ";
  if (pais === "US") return "EIN / Tax ID";
  if (pais === "MX") return "RFC";
  if (pais === "AR") return "CUIT";
  if (pais === "CL") return "RUT";
  if (pais === "PT") return "NIF";
  if (pais === "ES") return "NIF / CIF";
  if (["DE", "FR", "IT", "NL", "GB"].includes(pais)) return "VAT Number";
  return locale === "en-US" ? "Tax ID" : "Identificador fiscal";
}

// ============================================================
// Telefone — wrapper sobre libphonenumber-js
// ============================================================

/**
 * Formata telefone usando o país como hint.
 * - Em sucesso, retorna formato internacional ("+55 11 98765-4321")
 * - Em fallback, retorna o input original
 */
export function formatTelefoneI18n(value: string, pais?: string): string {
  if (!value) return "";
  try {
    const parsed = parsePhoneNumberFromString(value, (pais as CountryCode) ?? undefined);
    if (parsed && parsed.isValid()) {
      return parsed.formatInternational();
    }
  } catch {
    // ignora
  }
  return value;
}

/**
 * Normaliza telefone pra E.164 (formato internacional sem espaços/símbolos).
 * Retorna string vazia se não conseguir parsear.
 */
export function normalizarTelefoneI18n(value: string, pais?: string): string {
  if (!value) return "";
  try {
    const parsed = parsePhoneNumberFromString(value, (pais as CountryCode) ?? undefined);
    if (parsed && parsed.isValid()) {
      return parsed.format("E.164");
    }
  } catch {
    // ignora
  }
  // Fallback: só dígitos
  return value.replace(/\D/g, "");
}

/**
 * Valida telefone pra um país específico.
 */
export function isValidTelefoneI18n(value: string, pais?: string): boolean {
  if (!value) return false;
  try {
    const parsed = parsePhoneNumberFromString(value, (pais as CountryCode) ?? undefined);
    return parsed?.isValid() ?? false;
  } catch {
    return false;
  }
}
