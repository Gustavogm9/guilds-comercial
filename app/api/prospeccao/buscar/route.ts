import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { buscarEmpresasPorNicho, estimarCusto } from "@/lib/prospeccao";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/prospeccao/buscar
 * Body: { query: string; maxResults?: number }
 * Retorna: EmpresaBuscada[]
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentProfile();
    if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ erro: "Sem organização ativa." }, { status: 403 });

    const { query, maxResults = 10 } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return NextResponse.json({ erro: "Query muito curta. Mínimo 3 caracteres." }, { status: 400 });
    }

    const supabase = createClient();

    // Registra job
    const { data: job } = await supabase.from("prospeccao_jobs").insert({
      organizacao_id: orgId,
      criado_por: me.id,
      tipo: "busca",
      status: "processando",
      input: { query, maxResults },
    }).select("id").single();

    const jobId = job?.id;

    try {
      const resultados = await buscarEmpresasPorNicho({
        query: query.trim(),
        maxResults: Math.min(maxResults, 20),
      });

      await supabase.from("prospeccao_jobs").update({
        status: "concluido",
        output: { resultados } as any,
        custo_usd: estimarCusto("busca"),
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);

      return NextResponse.json({ ok: true, job_id: jobId, resultados });
    } catch (err: any) {
      await supabase.from("prospeccao_jobs").update({
        status: "erro",
        output: { erro: err.message },
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
      throw err;
    }
  } catch (err: any) {
    console.error("[prospeccao/buscar]", err);
    return NextResponse.json({ erro: err.message || "Erro interno." }, { status: 500 });
  }
}
