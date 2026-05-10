import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import type { EmpresaEnriquecida } from "@/lib/prospeccao";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/prospeccao/ativar
 *
 * Salva um ou mais leads enriquecidos na tabela `leads`.
 * Sprint 7: deduplicação fuzzy via pg_trgm + incremento de métricas de hipótese ICP.
 *
 * Body: {
 *   leads: EmpresaEnriquecida[];
 *   job_id?: number;
 *   hipotese_id?: number;
 *   iniciar_cadencia?: boolean;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentProfile();
    if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ erro: "Sem organização ativa." }, { status: 403 });

    const { leads, job_id, hipotese_id, produto_id, iniciar_cadencia = false } = await req.json() as {
      leads: EmpresaEnriquecida[];
      job_id?: number;
      hipotese_id?: number;
      produto_id?: number;
      iniciar_cadencia?: boolean;
    };

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ erro: "Nenhum lead para ativar." }, { status: 400 });
    }

    const supabase = createClient();
    const agora = new Date().toISOString();
    let criados = 0;
    let duplicados = 0;
    const idsGerados: number[] = [];
    const detalheDuplicados: Array<{ empresa: string; motivo: string }> = [];

    for (const empresa of leads) {
      // ── Deduplicação fuzzy via pg_trgm ────────────────────────────────────
      const { data: dups } = await supabase.rpc("buscar_lead_duplicado", {
        p_org_id:   orgId,
        p_empresa:  empresa.empresa ?? null,
        p_whatsapp: empresa.whatsapp ?? null,
        p_email:    empresa.email ?? null,
        p_site:     empresa.site ?? null,
      });

      if (dups && dups.length > 0 && (dups[0] as any).similaridade > 0.45) {
        duplicados++;
        detalheDuplicados.push({
          empresa: empresa.empresa ?? empresa.site ?? "—",
          motivo: `similar a "${(dups[0] as any).empresa}" (${Math.round((dups[0] as any).similaridade * 100)}%)`,
        });
        continue;
      }

      // ── Cria o lead ────────────────────────────────────────────────────────
      const { data: novo } = await supabase.from("leads").insert({
        organizacao_id: orgId,
        nome:           empresa.nome,
        empresa:        empresa.empresa,
        cargo:          empresa.cargo,
        email:          empresa.email,
        whatsapp:       empresa.whatsapp,
        site:           empresa.site,
        linkedin:       empresa.linkedin,
        segmento:       empresa.segmento,
        cidade_uf:      empresa.cidade_uf,
        observacoes:    empresa.descricao,
        responsavel_id: me.id,
        funnel_stage:   "base_bruta",
        crm_stage:      "Base",
        temperatura:    "Frio",
        prioridade:     "C",
        fonte:          "motor_prospeccao",
        data_entrada:   agora,
        hipotese_id:    hipotese_id ?? null,
        origem_prospeccao: {
          job_id:     job_id ?? null,
          hipotese_id: hipotese_id ?? null,
          fonte:      "firecrawl",
          url_origem: empresa._fonte_url,
          confianca:  empresa._confianca,
        },
      }).select("id").single();

      if (novo?.id) {
        idsGerados.push(novo.id);
        criados++;

        // Inicia cadência D0 se solicitado
        if (iniciar_cadencia) {
          await supabase.from("cadencia").insert({
            organizacao_id: orgId,
            lead_id:        novo.id,
            passo:          "D0",
            canal:          "WhatsApp",
            objetivo:       "Primeiro contato",
            data_prevista:  agora.slice(0, 10),
            status:         "pendente",
          });
        }

        // Vincula ao pipeline do produto se campanha for de produto
        if (produto_id) {
          await supabase.from("lead_produtos").insert({
            lead_id: novo.id,
            produto_id: produto_id,
            status: "ativo",
            atribuido_em: agora,
            atribuido_por: me.id,
          });
        }
      }
    }

    // ── Atualiza job ─────────────────────────────────────────────────────────
    if (job_id) {
      await supabase.from("prospeccao_jobs").update({
        leads_criados: criados,
        status:        "concluido",
        tipo:          "ativacao",
      }).eq("id", job_id);
    }

    // ── Incrementa métricas da hipótese ──────────────────────────────────────
    if (hipotese_id && criados > 0) {
      await supabase.rpc("incrementar_hipotese", {
        p_hipotese_id: hipotese_id,
        p_campo:       "leads_prospectados",
        p_valor:       criados,
      });
    }

    return NextResponse.json({
      ok: true,
      criados,
      duplicados,
      ignorados: leads.length - criados - duplicados,
      ids: idsGerados,
      detalhe_duplicados: detalheDuplicados,
    });
  } catch (err: any) {
    console.error("[prospeccao/ativar]", err);
    return NextResponse.json({ erro: err.message || "Erro interno." }, { status: 500 });
  }
}
