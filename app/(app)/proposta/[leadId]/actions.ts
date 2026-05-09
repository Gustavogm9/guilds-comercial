"use server";

import { invokeAI } from "@/lib/ai/dispatcher";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getCurrentProfile } from "@/lib/supabase/server";

const VARIACOES_VALIDAS = ["conservadora", "recomendada", "premium"] as const;

export async function gerarPropostaAction(input: {
  leadId: number;
  variacao: "conservadora" | "recomendada" | "premium";
  produtoId?: number | null;
}) {
  // Validação de input
  if (!Number.isInteger(input.leadId) || input.leadId <= 0) {
    return { ok: false, texto: "", erro: "Lead inválido" };
  }
  if (!VARIACOES_VALIDAS.includes(input.variacao)) {
    return { ok: false, texto: "", erro: "Variação inválida" };
  }

  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId) return { ok: false, texto: "", erro: "Sem organização" };

  // Buscar contexto do lead
  const { data: lead } = await supabase
    .from("v_leads_enriched")
    .select("empresa, nome, segmento, dor_principal, observacoes, valor_potencial, crm_stage")
    .eq("organizacao_id", orgId)
    .eq("id", input.leadId)
    .maybeSingle();

  if (!lead) return { ok: false, texto: "", erro: "Lead não encontrado" };

  // Busca produtos da org para enriquecer o contexto da proposta
  const { data: produtos } = await supabase
    .from("produtos")
    .select("nome, descricao, categoria, valor_base, valor_max, recorrente, segmentos_alvo")
    .eq("organizacao_id", orgId)
    .eq("ativo", true)
    .order("ordem");

  // Busca cases relevantes para o segmento do lead
  const { data: cases } = await supabase
    .from("portfolio_cases")
    .select("titulo, cliente_segmento, resultado, resultado_metricas, depoimento")
    .eq("organizacao_id", orgId)
    .eq("publico", true)
    .limit(3);

  const produtoCtx = (produtos ?? []).map(p =>
    `- ${p.nome} (${p.categoria ?? "—"}): ${p.descricao ?? "sem descrição"} | R$ ${p.valor_base ?? "?"} ${p.recorrente ? "[recorrente]" : "[único]"}`
  ).join("\n");

  const casesCtx = (cases ?? []).map(c =>
    `- Case: ${c.titulo} | Segmento: ${c.cliente_segmento ?? "—"} | Resultado: ${c.resultado ?? "—"}`
  ).join("\n");

  const result = await invokeAI({
    feature: "gerar_proposta",
    leadId: input.leadId,
    outputMode: "texto",
    vars: {
      empresa: lead.empresa ?? "não informado",
      nome: lead.nome ?? "não informado",
      segmento: lead.segmento ?? "não informado",
      dorPrincipal: lead.dor_principal ?? "não informado",
      observacoes: lead.observacoes ?? "",
      valorPotencial: lead.valor_potencial ?? 0,
      variacao: input.variacao,
      // Contexto enriquecido com portfólio
      produtos_disponiveis: produtoCtx || "Não configurados ainda.",
      cases_relevantes: casesCtx || "Nenhum case cadastrado ainda.",
    },
  });

  // Persiste proposta no histórico (mesmo em caso de sucesso parcial)
  if (result.ok && me) {
    await supabase.from("propostas").insert({
      organizacao_id: orgId,
      lead_id: input.leadId,
      produto_id: input.produtoId ?? null,
      criado_por: me.id,
      variacao: input.variacao,
      status: "rascunho",
      texto_proposta: result.texto,
      data_envio: new Date().toISOString().slice(0, 10),
    });
  }

  return { ok: result.ok, texto: result.texto, erro: result.erro, invocationId: result.invocationId };
}
