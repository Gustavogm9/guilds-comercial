/**
 * Utilitários puros para CSV import — testáveis sem deps externas.
 *
 * - `parseCsv(text)` retorna { headers, rows } (rows como Record<string,string>)
 * - `inferirMapping(headers)` propõe mapeamento source-col → field-destino
 *   usando fuzzy matching de sinônimos comuns (Pipedrive, RD, HubSpot)
 * - `normalizarTelefone(s)` deixa só dígitos pra dedup
 */

export type CampoLead =
  | "empresa"
  | "nome"
  | "cargo"
  | "email"
  | "whatsapp"
  | "linkedin"
  | "segmento"
  | "cidade_uf"
  | "fonte"
  | "observacoes"
  | "valor_potencial"
  | "site";

export const CAMPOS_LEAD: { value: CampoLead; label: string }[] = [
  { value: "empresa", label: "Empresa (obrigatório)" },
  { value: "nome", label: "Nome do contato" },
  { value: "cargo", label: "Cargo" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp/Telefone" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "segmento", label: "Segmento" },
  { value: "cidade_uf", label: "Cidade/UF" },
  { value: "fonte", label: "Fonte" },
  { value: "site", label: "Site" },
  { value: "valor_potencial", label: "Valor potencial (R$)" },
  { value: "observacoes", label: "Observações" },
];

/**
 * Parser de CSV simples. Trata aspas duplas escapadas, separador vírgula
 * ou ponto-e-vírgula (auto-detect), e \r\n.
 *
 * Retorna headers normalizados (lower-case, espaços→underscore) e rows
 * como Record<header, valor>.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!text || text.trim().length === 0) return { headers: [], rows: [] };

  // Detecta separador: se a 1ª linha tem mais ; do que , usa ;
  const linhaTeste = text.split(/\r?\n/, 1)[0] ?? "";
  const sepCount = { ",": (linhaTeste.match(/,/g) ?? []).length, ";": (linhaTeste.match(/;/g) ?? []).length };
  const sep = sepCount[";"] > sepCount[","] ? ";" : ",";

  const linhas: string[][] = [];
  let cur: string[] = [];
  let campo = "";
  let dentroAspas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (dentroAspas) {
      if (c === '"' && next === '"') { campo += '"'; i++; continue; }
      if (c === '"') { dentroAspas = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { dentroAspas = true; continue; }
    if (c === sep) { cur.push(campo); campo = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      cur.push(campo); campo = "";
      if (cur.some((x) => x.length > 0)) linhas.push(cur);
      cur = []; continue;
    }
    campo += c;
  }
  if (campo.length > 0 || cur.length > 0) {
    cur.push(campo);
    if (cur.some((x) => x.length > 0)) linhas.push(cur);
  }
  if (linhas.length === 0) return { headers: [], rows: [] };

  const headers = linhas[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < linhas.length; r++) {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (linhas[r][idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}

/**
 * Sinônimos comuns por exportadores conhecidos. Lower-case, sem acento.
 * Match é por equivalência ou inclusão (parcial) — case-insensitive.
 */
const SINONIMOS: Record<CampoLead, string[]> = {
  empresa: ["empresa", "organization", "organização", "organizacao", "company", "razão social", "razao social", "conta", "account"],
  nome: ["nome", "name", "contact", "contato", "first name", "primeiro nome", "lead name"],
  cargo: ["cargo", "title", "job title", "função", "role", "position"],
  email: ["email", "e-mail", "endereco de email", "endereço de email"],
  whatsapp: ["whatsapp", "telefone", "phone", "phone number", "celular", "mobile", "tel"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile", "li"],
  segmento: ["segmento", "segment", "indústria", "industria", "industry", "setor", "vertical"],
  cidade_uf: ["cidade", "city", "cidade/uf", "cidade_uf", "uf", "estado", "location", "localização"],
  fonte: ["fonte", "source", "origem", "lead source", "campaign"],
  site: ["site", "website", "url", "site web"],
  valor_potencial: ["valor", "deal value", "valor potencial", "ticket", "amount", "value"],
  observacoes: ["observações", "observacoes", "notes", "obs", "comments", "comentários"],
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Para cada header do CSV, tenta inferir qual campo destino é. Retorna
 * { headerOriginal: campoLead | null }. Match em ordem:
 *   1. Igualdade exata (após normalize)
 *   2. Inclusão (header contém sinônimo)
 *   3. null (usuário decide)
 */
export function inferirMapping(headers: string[]): Record<string, CampoLead | null> {
  const mapping: Record<string, CampoLead | null> = {};
  const usados = new Set<CampoLead>();

  for (const h of headers) {
    const n = normalize(h);
    let melhor: CampoLead | null = null;

    // Pass 1: match exato
    for (const [campo, sins] of Object.entries(SINONIMOS) as [CampoLead, string[]][]) {
      if (usados.has(campo)) continue;
      if (sins.some((s) => normalize(s) === n)) {
        melhor = campo;
        break;
      }
    }

    // Pass 2: inclusão
    if (!melhor) {
      for (const [campo, sins] of Object.entries(SINONIMOS) as [CampoLead, string[]][]) {
        if (usados.has(campo)) continue;
        if (sins.some((s) => n.includes(normalize(s)) || normalize(s).includes(n))) {
          melhor = campo;
          break;
        }
      }
    }

    if (melhor) usados.add(melhor);
    mapping[h] = melhor;
  }

  return mapping;
}

/**
 * Normaliza telefone/whatsapp para dedup.
 * Remove tudo não-numérico. Se começa com 55 e tem 12-13 dígitos, mantém.
 * Se tem 10-11 dígitos (sem DDI), prefixa "55".
 */
export function normalizarTelefone(s: string | null | undefined): string {
  if (!s) return "";
  const d = String(s).replace(/\D/g, "");
  if (d.length === 0) return "";
  if (d.length === 12 || d.length === 13) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

/**
 * Parse de "R$ 1.500,00" → 1500. Retorna 0 se não bater formato.
 */
export function parseValorBR(s: string | null | undefined): number {
  if (!s) return 0;
  const trimmed = String(s).replace(/[^\d,.\-]/g, "").trim();
  if (!trimmed) return 0;
  // Se tem vírgula e ponto, assume "1.234,56" (BR). Senão, aceita como JS Number.
  let normalizado = trimmed;
  if (trimmed.includes(",") && trimmed.includes(".")) {
    normalizado = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (trimmed.includes(",")) {
    normalizado = trimmed.replace(",", ".");
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Dado um row source + mapping, retorna o objeto destino com campos do schema.
 */
export function aplicarMapping(
  row: Record<string, string>,
  mapping: Record<string, CampoLead | null>
): Partial<Record<CampoLead, string | number>> {
  const out: Partial<Record<CampoLead, string | number>> = {};
  for (const [src, dst] of Object.entries(mapping)) {
    if (!dst) continue;
    const valor = row[src];
    if (valor === undefined || valor === "") continue;
    if (dst === "valor_potencial") {
      out[dst] = parseValorBR(valor);
    } else {
      out[dst] = valor;
    }
  }
  return out;
}
