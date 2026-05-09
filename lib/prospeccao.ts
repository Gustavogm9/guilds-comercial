/**
 * lib/prospeccao.ts
 *
 * Utilitários para o Motor de Prospecção:
 *   - Firecrawl Extract: enriquece um site e retorna dados estruturados de lead
 *   - Tavily Search: descobre empresas por nicho/cidade
 *   - Helpers de schema e tipos
 *
 * Chaves via env vars (configuradas pelo gestor em /configuracoes/desenvolvedores):
 *   FIRECRAWL_API_KEY
 *   TAVILY_API_KEY
 */

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface EmpresaEnriquecida {
  nome: string | null;
  empresa: string | null;
  cargo: string | null;
  email: string | null;
  whatsapp: string | null;
  site: string | null;
  linkedin: string | null;
  segmento: string | null;
  cidade_uf: string | null;
  descricao: string | null;
  /** Fonte bruta do Firecrawl para auditoria */
  _fonte_url: string;
  _confianca: "alta" | "media" | "baixa";
}

export interface EmpresaBuscada {
  titulo: string;
  url: string;
  snippet: string;
  dominio: string;
  /** Conteúdo markdown completo (quando disponível via Firecrawl) */
  conteudo?: string;
}

// ─── Schema Firecrawl para extração de lead ──────────────────────────────────

const LEAD_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    nome_responsavel: { type: "string" },
    empresa:          { type: "string" },
    cargo:            { type: "string" },
    email:            { type: "string" },
    whatsapp:         { type: "string" },
    linkedin_url:     { type: "string" },
    segmento:         { type: "string" },
    cidade_uf:        { type: "string" },
    descricao:        { type: "string",
      description: "Resumo do que a empresa faz, em 1-2 frases" },
  },
} as const;

const LEAD_EXTRACT_PROMPT = `
Você está enriquecendo dados de um lead B2B para um CRM comercial.
Extraia do site: nome do responsável ou decisor principal, nome da empresa,
cargo do decisor, email de contato, WhatsApp ou telefone, URL do LinkedIn,
segmento de atuação, cidade/estado, e uma breve descrição da empresa.
Priorize informações de páginas como "Sobre", "Contato", "Equipe", "Quem Somos".
Se não encontrar um campo, deixe null — não invente dados.
`.trim();

// ─── Firecrawl: enriquecer URL ───────────────────────────────────────────────

export async function enriquecerEmpresa(url: string): Promise<EmpresaEnriquecida> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY não configurada. Vá em Configurações → Desenvolvedores.");

  const response = await fetch("https://api.firecrawl.dev/v1/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      urls: [`${url}/*`, url],
      prompt: LEAD_EXTRACT_PROMPT,
      schema: LEAD_EXTRACT_SCHEMA,
      enableWebSearch: true,
    }),
    // Firecrawl pode demorar até 30s para sites grandes
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Firecrawl erro ${response.status}: ${err}`);
  }

  const data = await response.json();

  // Firecrawl retorna job assíncrono se status=processing → polling
  if (data.status === "processing") {
    return await _pollFirecrawlExtract(data.id, apiKey, url);
  }

  return _mapFirecrawlToLead(data.data ?? data, url);
}

async function _pollFirecrawlExtract(
  jobId: string,
  apiKey: string,
  sourceUrl: string,
  maxAttempts = 10,
): Promise<EmpresaEnriquecida> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`https://api.firecrawl.dev/v1/extract/${jobId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const data = await res.json();
    if (data.status === "completed") return _mapFirecrawlToLead(data.data, sourceUrl);
    if (data.status === "failed") throw new Error("Extração Firecrawl falhou: " + (data.error ?? "desconhecido"));
  }
  throw new Error("Timeout aguardando extração Firecrawl.");
}

function _mapFirecrawlToLead(raw: any, sourceUrl: string): EmpresaEnriquecida {
  // raw pode ser objeto ou array com 1 item
  const d = Array.isArray(raw) ? raw[0] : raw;
  const hasEmail = !!d?.email;
  const hasPhone = !!d?.whatsapp;
  const hasName  = !!d?.nome_responsavel;

  const confianca: EmpresaEnriquecida["_confianca"] =
    hasEmail && hasName ? "alta" :
    hasPhone || hasName ? "media" : "baixa";

  return {
    nome:     d?.nome_responsavel ?? null,
    empresa:  d?.empresa ?? null,
    cargo:    d?.cargo ?? null,
    email:    d?.email ?? null,
    whatsapp: d?.whatsapp ?? null,
    site:     sourceUrl,
    linkedin: d?.linkedin_url ?? null,
    segmento: d?.segmento ?? null,
    cidade_uf: d?.cidade_uf ?? null,
    descricao: d?.descricao ?? null,
    _fonte_url: sourceUrl,
    _confianca: confianca,
  };
}

// ─── Tavily: descobrir empresas por nicho ────────────────────────────────────

export interface TavilyBuscaParams {
  query: string;
  maxResults?: number;
  /** Ex: ["linkedin.com", "google.com.br"] — deixar vazio para busca geral */
  includeDomains?: string[];
  excludeDomains?: string[];
}

export async function buscarEmpresasPorNicho(
  params: TavilyBuscaParams,
): Promise<EmpresaBuscada[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY não configurada. Vá em Configurações → Desenvolvedores.");

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: params.query,
      search_depth: "advanced",
      max_results: params.maxResults ?? 10,
      include_domains: params.includeDomains ?? [],
      exclude_domains: params.excludeDomains ?? [],
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Tavily erro ${response.status}: ${err}`);
  }

  const data = await response.json();
  const results: any[] = data.results ?? [];

  return results.map(r => ({
    titulo:   r.title ?? "",
    url:      r.url ?? "",
    snippet:  r.content ?? "",
    dominio:  _extrairDominio(r.url ?? ""),
    conteudo: r.raw_content ?? undefined,
  }));
}

function _extrairDominio(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

// ─── Helper: estimar custo ──────────────────────────────────────────────────

/** Estimativa conservadora de custo em USD por operação. */
export function estimarCusto(tipo: "busca" | "enriquecimento" | "qualificacao"): number {
  return { busca: 0.002, enriquecimento: 0.015, qualificacao: 0.003 }[tipo];
}
