import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import type { EmpresaEnriquecida } from "@/lib/prospeccao";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/prospeccao/ativar
 *
 * Salva um ou mais leads enriquecidos na tabela `leads` (funnel_stage: base_bruta).
 * Opcionalmente inicia a cadência D0 para cada lead.
 *
 * Body: {
 *   leads: EmpresaEnriquecida[];
 *   job_id?: number;
 *   iniciar_cadencia?: boolean;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentProfile();
    if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ erro: "Sem organização ativa." }, { status: 403 });

    const { leads, job_id, iniciar_cadencia = false } = await req.json() as {
      leads: EmpresaEnriquecida[];
      job_id?: number;
      iniciar_cadencia?: boolean;
    };

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ erro: "Nenhum lead para ativar." }, { status: 400 });
    }

    const supabase = createClient();
    const agora = new Date().toISOString();
    let criados = 0;
    const idsGerados: number[] = [];

    for (const empresa of leads) {
      // Evita duplicata por site
      const { data: existente } = await supabase
        .from("leads")
        .select("id")
        .eq("organizacao_id", orgId)
        .eq("site", empresa.site ?? "")
        .maybeSingle();

      if (existente) continue;

      const { data: novo } = await supabase.from("leads").insert({
        organizacao_id: orgId,
        nome:            empresa.nome,
        empresa:         empresa.empresa,
        cargo:           empresa.cargo,
        email:           empresa.email,
        whatsapp:        empresa.whatsapp,
        site:            empresa.site,
        linkedin:        empresa.linkedin,
        segmento:        empresa.segmento,
        cidade_uf:       empresa.cidade_uf,
        observacoes:     empresa.descricao,
        responsavel_id:  me.id,
        funnel_stage:    "base_bruta",
        crm_stage:       "Base",
        temperatura:     "Frio",
        prioridade:      "C",
        fonte:           "motor_prospeccao",
        data_entrada:    agora,
        origem_prospeccao: {
          job_id: job_id ?? null,
          fonte:  "firecrawl",
          url_origem: empresa._fonte_url,
          confianca: empresa._confianca,
        },
      }).select("id").single();

      if (novo?.id) {
        idsGerados.push(novo.id);
        criados++;

        // Inicia cadência D0 se solicitado
        if (iniciar_cadencia) {
          const dataHoje = agora.slice(0, 10);
          await supabase.from("cadencia").insert({
            organizacao_id: orgId,
            lead_id:        novo.id,
            passo:          "D0",
            canal:          "WhatsApp",
            objetivo:       "Primeiro contato",
            data_prevista:  dataHoje,
            status:         "pendente",
          });
        }
      }
    }

    // Atualiza job com quantidade de leads criados
    if (job_id) {
      await supabase.from("prospeccao_jobs").update({
        leads_criados: criados,
        status:        "concluido",
        tipo:          "ativacao",
      }).eq("id", job_id);
    }

    return NextResponse.json({
      ok: true,
      criados,
      ignorados: leads.length - criados,
      ids: idsGerados,
    });
  } catch (err: any) {
    console.error("[prospeccao/ativar]", err);
    return NextResponse.json({ erro: err.message || "Erro interno." }, { status: 500 });
  }
}
