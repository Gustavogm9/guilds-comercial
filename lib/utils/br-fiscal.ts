/**
 * Utilitários para dados fiscais brasileiros — validação e formatação.
 *
 * Tudo é função pura, testável (ver tests/unit/br-fiscal.test.ts).
 */

export function onlyDigits(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/\D/g, "");
}

/** Validação de CNPJ por DVs (algoritmo módulo 11). Aceita formatado ou não. */
export function isValidCNPJ(input: string): boolean {
  const cnpj = onlyDigits(input);
  if (cnpj.length !== 14) return false;
  // Rejeita repetidos (ex: 00000000000000) — válido pelo algoritmo mas inexistente
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (slice: string, weights: number[]): number => {
    const sum = weights.reduce((acc, w, i) => acc + Number(slice[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const dv1 = calc(cnpj.slice(0, 12), w1);
  if (dv1 !== Number(cnpj[12])) return false;
  const dv2 = calc(cnpj.slice(0, 13), w2);
  return dv2 === Number(cnpj[13]);
}

export function formatCNPJ(input: string): string {
  const d = onlyDigits(input);
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatTelefoneBR(input: string): string {
  const d = onlyDigits(input);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return input;
}

export function formatCEP(input: string): string {
  const d = onlyDigits(input);
  if (d.length !== 8) return input;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Lista de regimes tributários brasileiros para selects. */
export const REGIMES_TRIBUTARIOS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  { value: "mei", label: "MEI" },
  { value: "isento", label: "Isento" },
] as const;

/** Fusos brasileiros mais relevantes (cobre 99% dos clientes). */
export const FUSOS_BRASIL = [
  { value: "America/Sao_Paulo", label: "(GMT-3) Brasília, São Paulo, Rio" },
  { value: "America/Manaus", label: "(GMT-4) Manaus, Cuiabá" },
  { value: "America/Rio_Branco", label: "(GMT-5) Rio Branco, Acre" },
  { value: "America/Noronha", label: "(GMT-2) Fernando de Noronha" },
] as const;

/** UFs brasileiras. */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
