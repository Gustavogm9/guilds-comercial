/**
 * lib/prospeccao-lookalike.ts
 *
 * Engine de Look-alike para o Motor de Prospecção.
 *
 * Fluxo:
 *   1. computarFingerprint(orgId) → lê clientes ganhos do DB e extrai padrões
 *   2. gerarQueriesLookalike(fingerprint, opcoes) → monta queries Tavily otimizadas
 *   3. scoreSimilaridade(lead, fingerprint) → pontua 0-100 vs fingerprint
 *   4. calcularCompletude(lead) → score 0-100 de dados disponíveis
 *
 * "Clientes ganhos" = crm_stage='Fechado' OR (fit_icp=true AND pipeline).
 * Quanto mais clientes fechados, mais preciso o fingerprint.
 */

import { createClient } from "@/lib/supabase/server";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface FingerprintICP {
  /** Top 5 segmentos por frequência nos clientes ganhos */
  segmentos_top: Array<{ valor: string; frequencia: number; percentual: number }>;
  /** Top 5 cidades/estados */
  cidades_top:   Array<{ valor: string; frequencia: number; percentual: number }>;
  /** Top 5 cargos */
  cargos_top:    Array<{ valor: string; frequencia: number; percentual: number }>;
  /** Valor médio dos contratos fechados */
  valor_medio_brl: number;
  /** Percentual de clientes com cada dado */
  completude: {
    tem_email:     number; // 0-100%
    tem_whatsapp:  number;
    tem_linkedin:  number;
    tem_site:      number;
  };
  /** Total de clientes analisados */
  total_base: number;
  /** Total de clientes "ganhos" (fechados + fit) usados pro fingerprint */
  total_ganhos: number;
  /** Timestamp do cálculo */
  calculado_em: string;
}

export interface LeadParaScore {
  segmento?:  string | null;
  cidade_uf?: string | null;
  cargo?:     string | null;
  email?:     string | null;
  whatsapp?:  string | null;
  linkedin?:  string | null;
  instagram?: string | null;
  site?:      string | null;
  _confianca?: "alta" | "media" | "baixa";
}

export interface OpcoesBuscaLookalike {
  /** Regiões adicionais para incluir (UF ou cidade). Se vazio, usa top do fingerprint */
  regioes?: string[];
  /** Segmentos específicos para forçar (override do fingerprint) */
  segmentos?: string[];
  /** Número máximo de queries a gerar (cada query = 1 chamada Tavily) */
  maxQueries?: number;
  /** Resultados por query */
  maxResultadosPorQuery?: number;
}

// ─── 1. Fingerprint ──────────────────────────────────────────────────────────

export async function computarFingerprint(orgId: string): Promise<FingerprintICP> {
  const supabase = createClient();

  // Busca todos os leads não-demo da org
  const { data: todos } = await supabase
    .from("leads")
    .select("segmento, cidade_uf, cargo, email, whatsapp, linkedin, site, valor_potencial, crm_stage, fit_icp, funnel_stage")
    .eq("organizacao_id", orgId)
    .eq("is_demo", false);

  const base = todos ?? [];
  const ganhos = base.filter(l =>
    l.crm_stage === "Fechado" ||
    (l.fit_icp === true && l.funnel_stage === "pipeline")
  );

  // Se não há ganhos suficientes, usa toda a base como fallback
  const amostra = ganhos.length >= 3 ? ganhos : base;

  function topK<T extends Record<string, any>>(
    items: T[],
    campo: keyof T,
    k = 5,
  ): Array<{ valor: string; frequencia: number; percentual: number }> {
    const freq: Record<string, number> = {};
    for (const item of items) {
      const v = item[campo];
      if (v && typeof v === "string" && v.trim()) {
        const norm = v.trim();
        freq[norm] = (freq[norm] ?? 0) + 1;
      }
    }
    const total = items.length || 1;
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([valor, frequencia]) => ({
        valor,
        frequencia,
        percentual: Math.round((frequencia / total) * 100),
      }));
  }

  const valores = amostra.map(l => Number(l.valor_potencial) || 0).filter(v => v > 0);
  const valor_medio = valores.length
    ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
    : 0;

  const pct = (campo: keyof typeof amostra[0]) =>
    amostra.length
      ? Math.round((amostra.filter(l => !!(l as any)[campo]).length / amostra.length) * 100)
      : 0;

  return {
    segmentos_top: topK(amostra, "segmento"),
    cidades_top:   topK(amostra, "cidade_uf"),
    cargos_top:    topK(amostra, "cargo"),
    valor_medio_brl: valor_medio,
    completude: {
      tem_email:    pct("email"),
      tem_whatsapp: pct("whatsapp"),
      tem_linkedin: pct("linkedin"),
      tem_site:     pct("site"),
    },
    total_base:    base.length,
    total_ganhos:  ganhos.length,
    calculado_em:  new Date().toISOString(),
  };
}

// ─── 2. Gerar queries look-alike ─────────────────────────────────────────────

export function gerarQueriesLookalike(
  fp: FingerprintICP,
  opcoes: OpcoesBuscaLookalike = {},
): string[] {
  const segmentos = opcoes.segmentos?.length
    ? opcoes.segmentos
    : fp.segmentos_top.slice(0, 3).map(s => s.valor);

  const regioes = opcoes.regioes?.length
    ? opcoes.regioes
    : fp.cidades_top.slice(0, 2).map(c => c.valor);

  const cargos = fp.cargos_top.slice(0, 2).map(c => c.valor.toLowerCase());
  const cargoStr = cargos.length ? cargos.join(" ou ") : "";

  const maxQ = opcoes.maxQueries ?? 6;
  const queries: string[] = [];

  // Combina segmento × região para gerar queries diversas
  for (const seg of segmentos) {
    for (const reg of regioes) {
      if (queries.length >= maxQ) break;
      const q = [seg, reg, cargoStr].filter(Boolean).join(" ");
      queries.push(q);
    }
    if (queries.length >= maxQ) break;
  }

  // Fallback: pelo menos 1 query genérica se não há base suficiente
  if (queries.length === 0 && fp.segmentos_top.length === 0) {
    queries.push("pequenas e médias empresas Brasil gestores comerciais");
  }

  return queries;
}

// ─── 3. Score de similaridade ────────────────────────────────────────────────

export function scoreSimilaridade(lead: LeadParaScore, fp: FingerprintICP): number {
  let score = 0;

  // Segmento (30 pts)
  if (lead.segmento && fp.segmentos_top.length) {
    const normLead = lead.segmento.toLowerCase();
    for (const s of fp.segmentos_top) {
      if (normLead.includes(s.valor.toLowerCase()) || s.valor.toLowerCase().includes(normLead)) {
        score += Math.round(30 * (s.percentual / 100) + 15);
        break;
      }
    }
  }

  // Região (20 pts)
  if (lead.cidade_uf && fp.cidades_top.length) {
    const normLead = lead.cidade_uf.toLowerCase();
    for (const c of fp.cidades_top) {
      if (normLead.includes(c.valor.toLowerCase()) || c.valor.toLowerCase().includes(normLead)) {
        score += Math.round(20 * (c.percentual / 100) + 10);
        break;
      }
    }
  }

  // Cargo (20 pts)
  if (lead.cargo && fp.cargos_top.length) {
    const normLead = lead.cargo.toLowerCase();
    for (const c of fp.cargos_top) {
      if (normLead.includes(c.valor.toLowerCase()) || c.valor.toLowerCase().includes(normLead)) {
        score += 20;
        break;
      }
    }
  }

  // Dados de contato (15 pts)
  if (lead.email || lead.whatsapp) score += 15;

  // Site (15 pts)
  if (lead.site) score += 15;

  return Math.min(100, score);
}

/** Badge visual baseado no score */
export function badgeSimilaridade(score: number): { label: string; emoji: string; classe: string } {
  if (score >= 80) return { label: "Excelente fit", emoji: "🔥", classe: "text-red-500" };
  if (score >= 60) return { label: "Bom fit",       emoji: "✨", classe: "text-amber-500" };
  if (score >= 40) return { label: "Fit médio",     emoji: "👀", classe: "text-blue-500" };
  return             { label: "Fit baixo",          emoji: "❄",  classe: "text-muted-foreground" };
}

// ─── 4. Score de completude de dados ────────────────────────────────────────

export function calcularCompletude(lead: LeadParaScore): number {
  let score = 0;
  if (lead.email)     score += 25;
  if (lead.whatsapp)  score += 25;
  if (lead.linkedin)  score += 20;
  if (lead.instagram) score += 10;
  if (lead.site)      score += 10;
  if (lead.cargo)     score += 10;
  return Math.min(100, score);
}

/** Label de completude */
export function labelCompletude(score: number): string {
  if (score >= 80) return "Completo";
  if (score >= 50) return "Parcial";
  if (score >= 25) return "Básico";
  return "Incompleto";
}

// ─── 5. Filtros avançados ───────────────────────────────────────────────────

export interface FiltrosProspeccao {
  regioes?: string[];              // UF ou cidade (substring match)
  segmentos?: string[];
  confianca?: ("alta" | "media" | "baixa")[];
  tem_email?: boolean;
  tem_whatsapp?: boolean;
  tem_linkedin?: boolean;
  tem_site?: boolean;
  cargo_contains?: string;
  completude_min?: number;         // 0-100
  similaridade_min?: number;       // 0-100
}

/** Aplica filtros sobre uma lista de leads enriquecidos */
export function aplicarFiltros<T extends LeadParaScore & {
  _confianca?: "alta" | "media" | "baixa";
  _completude?: number;
  _similaridade?: number;
}>(leads: T[], filtros: FiltrosProspeccao): T[] {
  return leads.filter(l => {
    // Região
    if (filtros.regioes?.length) {
      const uf = (l.cidade_uf ?? "").toLowerCase();
      const match = filtros.regioes.some(r => uf.includes(r.toLowerCase()));
      if (!match) return false;
    }
    // Segmento
    if (filtros.segmentos?.length) {
      const seg = (l.segmento ?? "").toLowerCase();
      const match = filtros.segmentos.some(s => seg.includes(s.toLowerCase()));
      if (!match) return false;
    }
    // Confiança IA
    if (filtros.confianca?.length && l._confianca) {
      if (!filtros.confianca.includes(l._confianca)) return false;
    }
    // Completude social
    if (filtros.tem_email    && !l.email)     return false;
    if (filtros.tem_whatsapp && !l.whatsapp)  return false;
    if (filtros.tem_linkedin && !l.linkedin)  return false;
    if (filtros.tem_site     && !l.site)      return false;
    // Cargo
    if (filtros.cargo_contains) {
      const cargo = (l.cargo ?? "").toLowerCase();
      if (!cargo.includes(filtros.cargo_contains.toLowerCase())) return false;
    }
    // Score mínimos
    if (filtros.completude_min  != null && (l._completude  ?? 0) < filtros.completude_min)  return false;
    if (filtros.similaridade_min != null && (l._similaridade ?? 0) < filtros.similaridade_min) return false;
    return true;
  });
}

/**
 * Mapeia um ICP extraído via IA (JSON) para o formato FingerprintICP
 */
export function mapIcpToFingerprint(icp: any, totalGanhos: number): FingerprintICP {
  const segs = typeof icp.segmento === "string" ? icp.segmento.split(/[,/]+/).map((s: string) => s.trim()) : [];
  const cargos = Array.isArray(icp.cargos_decisores) ? icp.cargos_decisores : [];
  
  return {
    segmentos_top: segs.map((s: string) => ({ valor: s, frequencia: 1, percentual: 100 })),
    cidades_top: [], // ICP do produto geralmente foca em nicho/cargo
    cargos_top: cargos.map((c: string) => ({ valor: c, frequencia: 1, percentual: 100 })),
    valor_medio_brl: 0,
    completude: { tem_email: 0, tem_whatsapp: 0, tem_linkedin: 0, tem_site: 0 },
    total_base: 0,
    total_ganhos: totalGanhos,
    calculado_em: icp.ultimo_calculo || new Date().toISOString()
  };
}
