/**
 * Cron domingo 23:00 UTC: snapshot semanal de forecast pra cada org ativa.
 *
 * Usa lib/ai/forecasting com heurística multi-sinal.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Pega todas as orgs ativas
  const { data: orgs } = await supa
    .from("organizacoes")
    .select("id, nome")
    .eq("ativa", true);

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const hoje = new Date();
  const domingo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - hoje.getDay());
  const domingoStr = domingo.toISOString().slice(0, 10);

  let processadas = 0;

  for (const org of orgs as any[]) {
    try {
      // Roda heurística inline (não usa lib/ai/forecasting pois precisa getCurrentOrgId)
      // Adaptação: passamos orgId direto

      // Pipeline atual
      const { data: top } = await supa
        .from("v_top_oportunidades")
        .select("valor_potencial, valor_esperado, score")
        .eq("organizacao_id", org.id);

      const ativos = (top ?? []) as any[];
      const pipeline_total = ativos.reduce((s, l) => s + Number(l.valor_potencial ?? 0), 0);
      const pipeline_ponderado = ativos.reduce((s, l) => s + Number(l.valor_esperado ?? 0), 0);

      // Taxa hist
      const dozeSemanas = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: criados } = await supa
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organizacao_id", org.id)
        .gte("created_at", dozeSemanas);
      const { count: fechados } = await supa
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organizacao_id", org.id)
        .eq("crm_stage", "Fechado")
        .gte("data_fechamento", dozeSemanas);
      const taxa = criados && criados > 0 ? (fechados ?? 0) / criados : 0.1;

      // Forecast cenários
      const provavel = pipeline_ponderado;
      const conservador = ativos.filter((l) => l.score >= 50).reduce((s, l) => s + Number(l.valor_esperado ?? 0), 0);
      const baixo = Math.round(conservador * 0.6);
      const alto = Math.round(pipeline_total * taxa);

      // Confiança
      let confianca = 0.5;
      if (ativos.length >= 50 && (fechados ?? 0) >= 15) confianca = 0.9;
      else if (ativos.length >= 20 && (fechados ?? 0) >= 5) confianca = 0.75;
      else if (ativos.length < 5) confianca = 0.3;

      await supa.from("forecast_ai_snapshot").upsert({
        organizacao_id: org.id,
        semana: domingoStr,
        pipeline_total: Math.round(pipeline_total),
        pipeline_ponderado: Math.round(pipeline_ponderado),
        forecast_baixo: baixo,
        forecast_provavel: Math.round(provavel),
        forecast_alto: alto,
        confianca,
        fatores: {
          taxa_conversao_historica: Number((taxa * 100).toFixed(1)),
          leads_ativos: ativos.length,
          fechados_12sem: fechados ?? 0,
        },
        modelo_usado: "heuristica_multi_sinal_v1",
      }, { onConflict: "organizacao_id,semana" });

      processadas += 1;
    } catch (e) {
      console.warn(`[forecast org ${org.id}]`, e);
    }
  }

  return NextResponse.json({ ok: true, processadas, semana: domingoStr });
}
