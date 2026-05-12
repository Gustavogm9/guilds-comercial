"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import {
  gerarEmbedding,
  textoEmpresaPraEmbedding,
  textoLeadPraEmbedding,
  calcularCentroide,
} from "@/lib/embeddings";
import { revalidatePath } from "next/cache";

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Gera embedding pra UMA empresa (preenche prospeccao_empresa.embedding).
 * Idempotente: se hash do texto não mudou, pula.
 */
export async function gerarEmbeddingEmpresa(empresa_id: number): Promise<{ ok: true; cached: boolean }> {
  if (!Number.isInteger(empresa_id) || empresa_id <= 0) throw new Error("ID inválido.");

  const supa = service();
  const { data: emp } = await supa
    .from("prospeccao_empresa")
    .select("id, razao_social, nome_fantasia, cnae_descricao, cnae_normalizado, descricao_negocio, porte, cidade, uf, embedding_texto_hash")
    .eq("id", empresa_id)
    .maybeSingle();

  if (!emp) throw new Error("Empresa não encontrada.");

  const texto = textoEmpresaPraEmbedding(emp as any);
  if (!texto) throw new Error("Empresa sem texto pra embedar.");

  const { embedding, hash } = await gerarEmbedding(texto);

  if (emp.embedding_texto_hash === hash) {
    return { ok: true, cached: true };
  }

  // Salva vector como string pgvector (formato: [0.1, 0.2, ...])
  const embeddingStr = `[${embedding.join(",")}]`;
  await supa
    .from("prospeccao_empresa")
    .update({
      embedding: embeddingStr as any,
      embedding_texto_hash: hash,
    })
    .eq("id", empresa_id);

  return { ok: true, cached: false };
}

/**
 * Recalcula centroide ICP da org corrente.
 * Pega N leads "Fechado" mais recentes, gera embeddings, calcula média.
 * Gestor-only (custa $0.001 × N tokens OpenAI).
 */
export async function recalcularCentroideIcp(input?: {
  limit?: number;          // default 50
}): Promise<{
  ok: true;
  total_clientes: number;
  custo_estimado_usd: number;
}> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores podem recalcular ICP.");

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const limit = Math.max(5, Math.min(200, input?.limit ?? 50));
  const supabase = createClient();

  // Pega clientes fechados (com texto útil pra embedding)
  const { data: clientes } = await supabase
    .from("leads")
    .select("empresa, segmento, dor_principal, cargo, cidade_uf, observacoes, data_fechamento")
    .eq("organizacao_id", orgId)
    .eq("crm_stage", "Fechado")
    .not("empresa", "is", null)
    .order("data_fechamento", { ascending: false })
    .limit(limit);

  const lista = (clientes ?? []) as any[];
  if (lista.length < 3) {
    throw new Error(`Poucos clientes fechados (${lista.length}). Mínimo 3 pra ICP fingerprint significativo.`);
  }

  // Gera embeddings em paralelo (batches de 5 pra não estourar rate limit OpenAI)
  const embeddings: number[][] = [];
  const amostraTextos: string[] = [];
  for (let i = 0; i < lista.length; i += 5) {
    const batch = lista.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((c) => {
        const texto = textoLeadPraEmbedding(c);
        amostraTextos.push(texto.slice(0, 200));
        return gerarEmbedding(texto);
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") embeddings.push(r.value.embedding);
    }
  }

  if (embeddings.length < 3) {
    throw new Error("Falha ao gerar embeddings suficientes (provavelmente OpenAI rate-limit).");
  }

  const centroide = calcularCentroide(embeddings);
  const centroideStr = `[${centroide.join(",")}]`;

  const supa = service();
  await supa
    .from("org_icp_centroide")
    .upsert({
      organizacao_id: orgId,
      centroide: centroideStr as any,
      amostra_textos: amostraTextos.slice(0, 10),
      total_clientes: embeddings.length,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "organizacao_id" });

  revalidatePath("/vendas/prospeccao/icp-fit");
  return {
    ok: true,
    total_clientes: embeddings.length,
    custo_estimado_usd: embeddings.length * 0.000001,  // ~$0.000001 por embedding
  };
}

/**
 * Gera embeddings em massa pra empresas sem embedding ainda (top 50).
 * Gestor-only. Custo: ~$0.00005 (5 milésimos de centavo).
 */
export async function gerarEmbeddingsLote(input?: { limit?: number }): Promise<{
  ok: true;
  processadas: number;
  custo_estimado_usd: number;
}> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");

  const limit = Math.max(1, Math.min(200, input?.limit ?? 50));
  const supa = service();

  const { data: empresas } = await supa
    .from("prospeccao_empresa")
    .select("id")
    .is("embedding", null)
    .eq("situacao", "ATIVA")
    .order("updated_at", { ascending: false })
    .limit(limit);

  const lista = (empresas ?? []) as any[];
  let processadas = 0;

  for (let i = 0; i < lista.length; i += 5) {
    const batch = lista.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((e) => gerarEmbeddingEmpresa(e.id)),
    );
    processadas += results.filter((r) => r.status === "fulfilled").length;
  }

  revalidatePath("/vendas/prospeccao/icp-fit");
  return {
    ok: true,
    processadas,
    custo_estimado_usd: processadas * 0.000001,
  };
}
