"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

/**
 * Forecast IA: análise histórica + estado atual → previsão semanal.
 *
 * Heurística + sinais:
 *   - Pipeline_ponderado atual
 *   - Taxa de conversão histórica por etapa (últimas 12 sem.)
 *   - Velocity: dias médios entre etapas
 *   - Eventos de engajamento últimos 7d (subindo/caindo)
 *   - Score médio dos leads ativos
 *
 * Output: forecast baixo/provável/alto (p25/p50/p75) + confiança 0-1 +
 * fatores que influenciam.
 *
 * NÃO é ML treinado. É heurística rica que vai melhorar com features novas.
 * Pra ML real, precisaria histórico 6+ meses + framework (LightGBM/etc).
 */

interface ForecastResult {
  pipeline_total: number;
  pipeline_ponderado: number;
  forecast_baixo: number;
  forecast_provavel: number;
  forecast_alto: number;
  confianca: number;
  fatores: {
    taxa_conversao_historica: number;
    velocity_media_dias: number;
    engagement_30d_score: number;
    sinais: string[];
  };
}

export async function calcularForecastAi(): Promise<ForecastResult> {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");
  const supabase = createClient();

  // 1. Pipeline atual ponderado por score
  const { data: pipeline } = await supabase
    .from("v_top_oportunidades")
    .select("valor_potencial, valor_esperado, score")
    .eq("organizacao_id", orgId);

  const ativos = (pipeline ?? []) as any[];
  const pipeline_total = ativos.reduce((s, l) => s + Number(l.valor_potencial ?? 0), 0);
  const pipeline_ponderado = ativos.reduce((s, l) => s + Number(l.valor_esperado ?? 0), 0);

  // 2. Taxa de conversão histórica (% leads ativos virou fechado nas últimas 12 sem)
  const dozeSemanasAtras = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: criadosHist } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organizacao_id", orgId)
    .gte("created_at", dozeSemanasAtras);
  const { count: fechadosHist } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organizacao_id", orgId)
    .eq("crm_stage", "Fechado")
    .gte("data_fechamento", dozeSemanasAtras);

  const taxaConversao = criadosHist && criadosHist > 0
    ? (fechadosHist ?? 0) / criadosHist
    : 0.1;

  // 3. Velocity: dias médios entre created e fechamento
  const { data: fechadosRecentes } = await supabase
    .from("leads")
    .select("created_at, data_fechamento")
    .eq("organizacao_id", orgId)
    .eq("crm_stage", "Fechado")
    .not("data_fechamento", "is", null)
    .gte("data_fechamento", dozeSemanasAtras);

  let velocityDias = 30;
  if (fechadosRecentes && fechadosRecentes.length > 0) {
    const dias = fechadosRecentes.map((l: any) => {
      const diff = new Date(l.data_fechamento).getTime() - new Date(l.created_at).getTime();
      return diff / (1000 * 60 * 60 * 24);
    }).filter((d) => d > 0 && d < 365);
    if (dias.length > 0) {
      velocityDias = Math.round(dias.reduce((a, b) => a + b, 0) / dias.length);
    }
  }

  // 4. Engagement últimos 30d (proxy de "mercado quente")
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: engagement } = await supabase
    .from("lead_engagement_evento")
    .select("pontos")
    .eq("organizacao_id", orgId)
    .gte("created_at", trintaDiasAtras);
  const engagementScore = (engagement ?? []).reduce((s: number, e: any) => s + (e.pontos ?? 0), 0);

  // 5. Score médio dos leads ativos
  const { data: scoresLeads } = await supabase
    .from("leads")
    .select("score_total")
    .eq("organizacao_id", orgId)
    .not("score_total", "is", null)
    .in("crm_stage", ["Qualificação", "Proposta", "Negociação"]);
  const scoreMedio = scoresLeads && scoresLeads.length > 0
    ? scoresLeads.reduce((s: number, l: any) => s + Number(l.score_total ?? 0), 0) / scoresLeads.length
    : 50;

  // ─── Calcula forecast ──────────────────────────────────────
  // Provável = pipeline_ponderado (já reflete taxa por score)
  const provavel = pipeline_ponderado;
  // Baixo = só Proposta+Negociação com score >= 50, sem ponderar
  const conservador = ativos
    .filter((l) => l.score >= 50)
    .reduce((s, l) => s + Number(l.valor_esperado ?? 0), 0);
  const baixo = Math.round(conservador * 0.6);
  // Alto = pipeline_total × taxa_conversao_historica (upside cenário)
  const alto = Math.round(pipeline_total * taxaConversao);

  // Confiança baseada em: quantidade de leads ativos + histórico
  let confianca = 0.5;
  if (ativos.length >= 20 && (fechadosRecentes?.length ?? 0) >= 5) confianca = 0.75;
  if (ativos.length >= 50 && (fechadosRecentes?.length ?? 0) >= 15) confianca = 0.9;
  if (ativos.length < 5) confianca = 0.3;

  // Sinais qualitativos
  const sinais: string[] = [];
  if (taxaConversao > 0.2) sinais.push(`Taxa de conversão alta (${Math.round(taxaConversao * 100)}%) — mercado responde bem`);
  if (taxaConversao < 0.05) sinais.push(`Taxa de conversão baixa (${Math.round(taxaConversao * 100)}%) — revisar qualificação`);
  if (velocityDias < 30) sinais.push(`Velocity rápido (~${velocityDias}d) — ciclos curtos`);
  if (velocityDias > 90) sinais.push(`Velocity longo (~${velocityDias}d) — pipeline travado?`);
  if (engagementScore > 200) sinais.push("Engajamento alto últimos 30d — leads ativos");
  if (engagementScore < 30 && ativos.length > 10) sinais.push("Engajamento baixo — risco de churn de pipeline");
  if (scoreMedio >= 70) sinais.push(`Score médio dos ativos alto (${Math.round(scoreMedio)}/100)`);
  if (scoreMedio < 40 && ativos.length > 10) sinais.push(`Score médio baixo (${Math.round(scoreMedio)}/100) — leads frios`);

  return {
    pipeline_total: Math.round(pipeline_total),
    pipeline_ponderado: Math.round(pipeline_ponderado),
    forecast_baixo: baixo,
    forecast_provavel: Math.round(provavel),
    forecast_alto: alto,
    confianca,
    fatores: {
      taxa_conversao_historica: Number((taxaConversao * 100).toFixed(1)),
      velocity_media_dias: velocityDias,
      engagement_30d_score: engagementScore,
      sinais,
    },
  };
}

/**
 * Salva snapshot semanal (cron domingo)
 */
export async function salvarSnapshotForecast() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const forecast = await calcularForecastAi();
  const supabase = createClient();
  const hoje = new Date();
  // Domingo da semana corrente
  const domingo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - hoje.getDay());

  await supabase.from("forecast_ai_snapshot").upsert({
    organizacao_id: orgId,
    semana: domingo.toISOString().slice(0, 10),
    pipeline_total: forecast.pipeline_total,
    pipeline_ponderado: forecast.pipeline_ponderado,
    forecast_baixo: forecast.forecast_baixo,
    forecast_provavel: forecast.forecast_provavel,
    forecast_alto: forecast.forecast_alto,
    confianca: forecast.confianca,
    fatores: forecast.fatores,
    modelo_usado: "heuristica_multi_sinal_v1",
  }, { onConflict: "organizacao_id,semana" });

  return forecast;
}
