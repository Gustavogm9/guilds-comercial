"use server";

import { invokeAI } from "@/lib/ai/dispatcher";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getCurrentProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const VARIACOES_VALIDAS = ["conservadora", "recomendada", "premium"] as const;
const FORMATOS_VALIDOS = ["proposta_comercial", "escopo_tecnico", "email_executivo", "whatsapp_resumo"] as const;

type CamposProposta = {
  formato?: typeof FORMATOS_VALIDOS[number];
  objetivo?: string;
  escopo?: string;
  entregas?: string;
  cronograma?: string;
  investimento?: string;
  condicoes?: string;
  observacoes?: string;
  validade?: string;
};

function clean(value?: string | null, max = 1200) {
  return String(value ?? "").trim().slice(0, max);
}

function labelFormato(formato?: string | null) {
  if (formato === "escopo_tecnico") return "Escopo tecnico / SOW";
  if (formato === "email_executivo") return "Email executivo de envio";
  if (formato === "whatsapp_resumo") return "Resumo para WhatsApp";
  return "Proposta comercial consultiva";
}

export async function gerarPropostaAction(input: {
  leadId: number;
  variacao: "conservadora" | "recomendada" | "premium";
  produtoId?: number | null;
  campos?: CamposProposta;
}) {
  // Validação de input
  if (!Number.isInteger(input.leadId) || input.leadId <= 0) {
    return { ok: false, texto: "", erro: "Lead inválido" };
  }
  if (!VARIACOES_VALIDAS.includes(input.variacao)) {
    return { ok: false, texto: "", erro: "Variação inválida" };
  }

  const formato = input.campos?.formato && FORMATOS_VALIDOS.includes(input.campos.formato)
    ? input.campos.formato
    : "proposta_comercial";

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

  const campos = input.campos ?? {};
  const briefingComercial = [
    `Formato escolhido: ${labelFormato(formato)}`,
    `Objetivo da proposta: ${clean(campos.objetivo) || "nao informado"}`,
    `Escopo desejado: ${clean(campos.escopo) || "nao informado"}`,
    `Entregas combinadas: ${clean(campos.entregas) || "nao informado"}`,
    `Cronograma/prazo: ${clean(campos.cronograma, 500) || "nao informado"}`,
    `Investimento/ancoragem: ${clean(campos.investimento, 500) || "usar valor potencial e portfolio"}`,
    `Condicoes comerciais: ${clean(campos.condicoes, 700) || "nao informado"}`,
    `Validade: ${clean(campos.validade, 120) || "nao informado"}`,
    `Observacoes do vendedor: ${clean(campos.observacoes) || "nao informado"}`,
  ].join("\n");

  const result = await invokeAI({
    feature: "gerar_proposta",
    leadId: input.leadId,
    outputMode: "texto",
    vars: {
      empresa: lead.empresa ?? "não informado",
      nome: lead.nome ?? "não informado",
      segmento: lead.segmento ?? "não informado",
      dorPrincipal: lead.dor_principal ?? "não informado",
      dor_principal: lead.dor_principal ?? "não informado",
      observacoes: lead.observacoes ?? "",
      valorPotencial: lead.valor_potencial ?? 0,
      valor_potencial: lead.valor_potencial ?? 0,
      raiox_score: 0,
      perda_anual: 0,
      variacao: input.variacao,
      formato_proposta: labelFormato(formato),
      briefing_comercial: briefingComercial,
      preferencias: [
        lead.observacoes ?? "",
        briefingComercial,
      ].filter(Boolean).join("\n\n"),
      // Contexto enriquecido com portfólio
      produtos_disponiveis: produtoCtx || "Não configurados ainda.",
      cases_relevantes: casesCtx || "Nenhum case cadastrado ainda.",
    },
  });

  // Persiste proposta no histórico (mesmo em caso de sucesso parcial)
  const hoje = new Date().toISOString().slice(0, 10);
  const dataFollowUp = new Date();
  dataFollowUp.setDate(dataFollowUp.getDate() + 3);
  const propostaLink = `/proposta/${input.leadId}`;

  if (result.ok && me) {
    const { error: propostaError } = await supabase.from("propostas").insert({
      organizacao_id: orgId,
      lead_id: input.leadId,
      produto_id: input.produtoId ?? null,
      criado_por: me.id,
      variacao: input.variacao,
      status: "rascunho",
      texto_proposta: result.texto,
      link_proposta: propostaLink,
      data_envio: hoje,
    });
    if (propostaError) {
      return { ok: false, texto: result.texto, erro: propostaError.message, invocationId: result.invocationId };
    }

    const { error: leadError } = await supabase
      .from("leads")
      .update({
        funnel_stage: "pipeline",
        crm_stage: "Proposta",
        data_proposta: hoje,
        link_proposta: propostaLink,
        proxima_acao: "Fazer follow-up da proposta",
        data_proxima_acao: dataFollowUp.toISOString().slice(0, 10),
      })
      .eq("id", input.leadId)
      .eq("organizacao_id", orgId);
    if (leadError) {
      return { ok: false, texto: result.texto, erro: leadError.message, invocationId: result.invocationId };
    }

    revalidatePath(`/proposta/${input.leadId}`);
    revalidatePath(`/vendas/pipeline/${input.leadId}`);
    revalidatePath("/vendas/pipeline");
    revalidatePath("/vendas/base");
    revalidatePath("/vendas/portfolio");
    revalidatePath("/vendas/propostas");
    revalidatePath("/hoje");
  }

  return { ok: result.ok, texto: result.texto, erro: result.erro, invocationId: result.invocationId };
}
