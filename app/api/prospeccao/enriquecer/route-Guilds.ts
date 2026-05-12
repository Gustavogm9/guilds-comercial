import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { enriquecerEmpresa, estimarCusto } from "@/lib/prospeccao";

export const runtime = "nodejs";
export const maxDuration = 60; // Firecrawl pode levar até 45s

/**
 * POST /api/prospeccao/enriquecer
 * Body: { url: string }
 * Retorna: EmpresaEnriquecida + job_id
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentProfile();
    if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ erro: "Sem organização ativa." }, { status: 403 });

    const body = await req.json();
    const { url, cnpj } = body as { url?: string; cnpj?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ erro: "URL inválida." }, { status: 400 });
    }
    const cnpjLimpo = typeof cnpj === "string" ? cnpj.replace(/\D/g, "") : "";
    const temCnpj = cnpjLimpo.length === 14;

    // Normaliza URL
    let urlNormalizada = url.trim();
    if (!urlNormalizada.startsWith("http")) urlNormalizada = "https://" + urlNormalizada;

    const supabase = createClient();

    // Registra job
    const { data: job } = await supabase.from("prospeccao_jobs").insert({
      organizacao_id: orgId,
      criado_por: me.id,
      tipo: "enriquecimento",
      status: "processando",
      input: { url: urlNormalizada, cnpj: temCnpj ? cnpjLimpo : null },
    }).select("id").single();

    const jobId = job?.id;

    try {
      const resultado = await enriquecerEmpresa(urlNormalizada);

      // Atualiza job como concluído
      await supabase.from("prospeccao_jobs").update({
        status: "concluido",
        output: resultado as any,
        custo_usd: estimarCusto("enriquecimento"),
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);

      // Se CNPJ informado, atualiza prospeccao_empresa com dados web (Firecrawl complementa BrasilAPI)
      if (temCnpj) {
        try {
          await supabase
            .from("prospeccao_empresa")
            .update({
              site: urlNormalizada,
              linkedin_url: resultado.linkedin ?? null,
              email_enriquecido: resultado.email ?? null,
              whatsapp_enriquecido: resultado.whatsapp ?? null,
              descricao_negocio: resultado.descricao ?? null,
              raw_firecrawl: resultado as any,
              ultima_consulta_em: new Date().toISOString(),
            })
            .eq("cnpj", cnpjLimpo);
        } catch (persistErr) {
          console.warn("[prospeccao/enriquecer] persist failed:", persistErr);
        }
      }

      return NextResponse.json({ ok: true, job_id: jobId, empresa: resultado });
    } catch (err: any) {
      await supabase.from("prospeccao_jobs").update({
        status: "erro",
        output: { erro: err.message },
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
      throw err;
    }
  } catch (err: any) {
    console.error("[prospeccao/enriquecer]", err);
    return NextResponse.json({ erro: err.message || "Erro interno." }, { status: 500 });
  }
}
