/**
 * Embeddings via OpenAI text-embedding-3-small (1536 dim).
 *
 * Custo: $0.02 / 1M tokens. ~1 token por palavra. Pra uma empresa típica
 * (razão + descrição + CNAE ~50 palavras), são ~50 tokens = $0.000001.
 * Mesmo prospectando 10k empresas o custo é ~$0.01.
 *
 * Cache via hash: prospeccao_empresa.embedding_texto_hash guarda md5 do
 * texto. Se gerar de novo com mesmo texto, pula chamada API.
 */
import "server-only";
import crypto from "crypto";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;

interface EmbeddingResult {
  embedding: number[];
  hash: string;
  cached: boolean;
}

function hashTexto(texto: string): string {
  return crypto.createHash("md5").update(texto).digest("hex");
}

/**
 * Gera embedding pra um texto. Não cacheia aqui — caller é responsável
 * por persistir + checar hash antes de chamar.
 */
export async function gerarEmbedding(texto: string): Promise<EmbeddingResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  const textoNormalizado = texto.trim().slice(0, 8000);  // ~2k tokens max
  if (!textoNormalizado) throw new Error("Texto vazio.");

  const hash = hashTexto(textoNormalizado);

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: textoNormalizado,
      dimensions: DIMENSIONS,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const erro = await res.text().catch(() => "erro desconhecido");
    throw new Error(`OpenAI embeddings ${res.status}: ${erro.slice(0, 200)}`);
  }

  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== DIMENSIONS) {
    throw new Error("Resposta de embedding inválida.");
  }

  return { embedding, hash, cached: false };
}

/**
 * Monta texto representativo de uma empresa pra gerar embedding.
 * Combina campos mais informativos sobre o negócio.
 */
export function textoEmpresaPraEmbedding(empresa: {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnae_descricao?: string | null;
  cnae_normalizado?: string | null;
  descricao_negocio?: string | null;
  porte?: string | null;
  cidade?: string | null;
  uf?: string | null;
}): string {
  const partes = [
    empresa.nome_fantasia ?? empresa.razao_social,
    empresa.cnae_descricao ?? empresa.cnae_normalizado,
    empresa.descricao_negocio,
    empresa.porte ? `Porte ${empresa.porte}` : null,
    empresa.cidade && empresa.uf ? `${empresa.cidade}/${empresa.uf}` : null,
  ].filter(Boolean);
  return partes.join(" — ");
}

/**
 * Monta texto representativo de um lead/cliente pra embedding.
 * Usado pra calcular o centroide ICP da org.
 */
export function textoLeadPraEmbedding(lead: {
  empresa?: string | null;
  segmento?: string | null;
  dor_principal?: string | null;
  cargo?: string | null;
  cidade_uf?: string | null;
  observacoes?: string | null;
}): string {
  const partes = [
    lead.empresa,
    lead.segmento,
    lead.dor_principal,
    lead.cargo ? `Cargo: ${lead.cargo}` : null,
    lead.cidade_uf,
    lead.observacoes?.slice(0, 200),
  ].filter(Boolean);
  return partes.join(" — ");
}

/**
 * Calcula centroide (média) de N embeddings. Retorna vetor de mesma dim.
 */
export function calcularCentroide(embeddings: number[][]): number[] {
  if (embeddings.length === 0) throw new Error("Sem embeddings.");
  const dim = embeddings[0].length;
  const soma = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) soma[i] += emb[i];
  }
  return soma.map((v) => v / embeddings.length);
}
