import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createClient } from "@/lib/supabase/server";
import {
  computarFingerprint,
  gerarQueriesLookalike,
  scoreSimilaridade,
  calcularCompletude,
  type FingerprintICP,
} from "@/lib/prospeccao-lookalike";
import { buscarEmpresasPorNicho, estimarCusto } from "@/lib/prospeccao";
import type { EmpresaBuscada } from "@/lib/prospeccao";

export const runtime = "nodejs";
export const maxDuration = 60;

import { mapIcpToFingerprint } from "@/lib/prospeccao-lookalike";

/**
 * GET /api/prospeccao/lookalike/fingerprint
 * Retorna o fingerprint ICP da organização sem executar buscas.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const url = new URL(req.url);
  const produtoId = url.searchParams.get("produtoId");

  try {
    if (produtoId) {
      const supabase = createClient();
      const { data: p } = await supabase.from("produtos").select("icp_extraido").eq("id", produtoId).single();
      if (p?.icp_extraido) {
        return NextResponse.json({ ok: true, fingerprint: mapIcpToFingerprint(p.icp_extraido, p.icp_extraido.amostras_usadas || 0) });
      }
    }
    const fp = await computarFingerprint(orgId);
    return NextResponse.json({ ok: true, fingerprint: fp });
  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}

/**
 * POST /api/prospeccao/lookalike
 * Body: { regioes?: string[]; segmentos?: string[]; maxQueries?: number }
 * Executa look-alike: lê fingerprint → gera queries → busca Tavily → retorna com scores.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const { regioes = [], segmentos = [], maxQueries = 4, maxResultadosPorQuery = 5, produtoId } = body;

    const supabase = createClient();

    // 1. Computa fingerprint
    let fingerprint: FingerprintICP;
    if (produtoId) {
      const { data: p } = await supabase.from("produtos").select("icp_extraido").eq("id", produtoId).single();
      if (p?.icp_extraido) {
        fingerprint = mapIcpToFingerprint(p.icp_extraido, p.icp_extraido.amostras_usadas || 0);
      } else {
        fingerprint = await computarFingerprint(orgId);
      }
    } else {
      fingerprint = await computarFingerprint(orgId);
    }

    // 2. Gera queries
    const queries = gerarQueriesLookalike(fingerprint, { regioes, segmentos, maxQueries });

    if (!queries.length) {
      return NextResponse.json({
        ok: true,
        fingerprint,
        queries: [],
        resultados: [],
        aviso: "Base insuficiente para gerar look-alike. Adicione mais leads qualificados ao pipeline.",
      });
    }

    // Registra job
    const { data: job } = await supabase.from("prospeccao_jobs").insert({
      organizacao_id: orgId,
      criado_por: me.id,
      tipo: "busca",
      status: "processando",
      input: { tipo: "lookalike", queries, regioes, segmentos },
    }).select("id").single();

    const jobId = job?.id;

    // 3. Executa buscas em paralelo (max 4 simultâneas)
    const resultadosBrutos: EmpresaBuscada[] = [];
    for (let i = 0; i < queries.length; i += 2) {
      const lote = queries.slice(i, i + 2);
      const respostas = await Promise.allSettled(
        lote.map(q => buscarEmpresasPorNicho({ query: q, maxResults: maxResultadosPorQuery }))
      );
      for (const r of respostas) {
        if (r.status === "fulfilled") resultadosBrutos.push(...r.value);
      }
    }

    // 4. Deduplication por domínio
    const vistos = new Set<string>();
    const unicos = resultadosBrutos.filter(r => {
      if (vistos.has(r.dominio)) return false;
      vistos.add(r.dominio);
      return true;
    });

    // 5. Score de similaridade para cada resultado
    const comScores = unicos.map(r => {
      // Tenta extrair dados básicos do snippet
      const leadBasico = {
        site: r.url,
        segmento: undefined as string | undefined,
        cidade_uf: undefined as string | undefined,
        cargo: undefined as string | undefined,
        email: undefined as string | undefined,
        whatsapp: undefined as string | undefined,
        linkedin: r.url.includes("linkedin.com") ? r.url : undefined,
      };
      const sim = scoreSimilaridade(leadBasico, fingerprint);
      const completude = calcularCompletude(leadBasico);
      return { ...r, _similaridade: sim, _completude: completude };
    });

    // Ordena por similaridade desc
    comScores.sort((a, b) => b._similaridade - a._similaridade);

    // Atualiza job
    await supabase.from("prospeccao_jobs").update({
      status: "concluido",
      output: { fingerprint, queries, total: comScores.length } as any,
      custo_usd: estimarCusto("busca") * queries.length,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      fingerprint,
      queries,
      resultados: comScores,
      total: comScores.length,
    });
  } catch (err: any) {
    console.error("[prospeccao/lookalike]", err);
    return NextResponse.json({ erro: err.message || "Erro interno." }, { status: 500 });
  }
}
