"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
}

const NIVEIS_VALIDOS = ["Alto", "Médio", "Baixo"] as const;

async function assertLeadDaOrg(supabase: ReturnType<typeof createClient>, lead_id: number, orgId: string) {
  const { data } = await supabase.from("leads").select("id")
    .eq("id", lead_id).eq("organizacao_id", orgId).maybeSingle();
  if (!data) throw new Error(`Lead ${lead_id} não encontrado nesta organização.`);
}

async function assertRaioXDaOrg(supabase: ReturnType<typeof createClient>, raio_x_id: number, orgId: string) {
  const { data } = await supabase.from("raio_x").select("id")
    .eq("id", raio_x_id).eq("organizacao_id", orgId).maybeSingle();
  if (!data) throw new Error(`Raio-X ${raio_x_id} não encontrado nesta organização.`);
}

/** Cria/oferta um Raio-X para um lead */
export async function ofertarRaioX(input: {
  lead_id: number;
  preco_lista?: number;
  voucher_desconto?: number;
  gratuito?: boolean;
  observacoes?: string;
}) {
  // Validação de input
  if (input.preco_lista !== undefined && (!Number.isFinite(input.preco_lista) || input.preco_lista < 0 || input.preco_lista > 1_000_000)) {
    throw new Error("Preço inválido.");
  }
  if (input.voucher_desconto !== undefined && (!Number.isFinite(input.voucher_desconto) || input.voucher_desconto < 0)) {
    throw new Error("Voucher inválido.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, input.lead_id, orgId);

  const { error } = await supabase.from("raio_x").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    responsavel_id: user?.id ?? null,
    preco_lista: input.preco_lista ?? 97,
    voucher_desconto: input.voucher_desconto ?? 0,
    gratuito: input.gratuito ?? false,
    nivel: "Pendente",
    observacoes: input.observacoes ?? null,
  });
  if (error) throw error;

  await supabase.from("leads").update({
    crm_stage: "Raio-X Ofertado",
    funnel_stage: "pipeline",
    proxima_acao: "Receber pagamento Raio-X",
  }).eq("id", input.lead_id).eq("organizacao_id", orgId);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    ator_id: user?.id ?? null,
    tipo: "raio_x",
    payload: { acao: "ofertado", preco: input.preco_lista ?? 97, gratuito: input.gratuito ?? false },
  });

  revalidatePath("/raio-x");
  revalidatePath(`/pipeline/${input.lead_id}`);
}

/** Marca Raio-X como pago */
export async function marcarPago(raio_x_id: number, lead_id: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertRaioXDaOrg(supabase, raio_x_id, orgId);
  await assertLeadDaOrg(supabase, lead_id, orgId);
  const hoje = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("raio_x").update({
    pago: true,
    data_pagamento: hoje,
  }).eq("id", raio_x_id).eq("organizacao_id", orgId);
  if (error) throw error;

  await supabase.from("leads").update({
    crm_stage: "Raio-X Feito",
    proxima_acao: "Agendar call de revisão",
  }).eq("id", lead_id).eq("organizacao_id", orgId);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "raio_x", payload: { acao: "pago" },
  });

  revalidatePath("/raio-x");
  revalidatePath(`/pipeline/${lead_id}`);
}

/** Salva resultado do diagnóstico */
export async function salvarResultado(input: {
  raio_x_id: number;
  lead_id: number;
  score: number;
  perda_anual_estimada: number;
  nivel: "Alto" | "Médio" | "Baixo";
  saida_recomendada: string;
  diagnostico_pago_sugerido: string;
  observacoes?: string;
}) {
  // Validação rigorosa
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
    throw new Error("Score deve estar entre 0 e 100.");
  }
  if (!Number.isFinite(input.perda_anual_estimada) || input.perda_anual_estimada < 0) {
    throw new Error("Perda anual estimada inválida.");
  }
  if (!NIVEIS_VALIDOS.includes(input.nivel)) {
    throw new Error("Nível inválido.");
  }
  if (!input.saida_recomendada?.trim() || !input.diagnostico_pago_sugerido?.trim()) {
    throw new Error("Saída recomendada e diagnóstico não podem ser vazios.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertRaioXDaOrg(supabase, input.raio_x_id, orgId);
  await assertLeadDaOrg(supabase, input.lead_id, orgId);
  const hoje = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("raio_x").update({
    score: input.score,
    perda_anual_estimada: input.perda_anual_estimada,
    nivel: input.nivel,
    saida_recomendada: input.saida_recomendada,
    diagnostico_pago_sugerido: input.diagnostico_pago_sugerido,
    observacoes: input.observacoes ?? null,
    call_revisao: true,
    data_call: hoje,
  }).eq("id", input.raio_x_id).eq("organizacao_id", orgId);
  if (error) throw error;

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id, ator_id: user?.id ?? null,
    tipo: "raio_x",
    payload: { acao: "resultado", score: input.score, nivel: input.nivel },
  });

  // Disparar Webhook
  try {
    const { data: raioXCompleto } = await supabase.from("raio_x").select("*").eq("id", input.raio_x_id).single();
    if (raioXCompleto) {
      const { dispatchWebhook } = await import("@/lib/webhooks");
      await dispatchWebhook(orgId, "raiox.completed", { raio_x: raioXCompleto });
    }
  } catch (err) {
    console.warn("[webhook] Falha ao disparar webhook em salvarResultado", err);
  }

  revalidatePath("/raio-x");
  revalidatePath(`/pipeline/${input.lead_id}`);
}

import { dispatchWebhook } from "@/lib/webhooks";

/** 
 * Conclui um Raio-X Dinâmico: 
 * - Usa a IA para avaliar as respostas
 * - Salva o resultado final 
 */
export async function concluirRaioXDinamico(leadId: number, templateId: number) {
  const supabase = createClient();
  const orgId = await requireOrg();

  // 1. Fetch respostas
  const { data: respostaData, error: respError } = await supabase
    .from("raiox_respostas")
    .select("id, respostas_json")
    .eq("lead_id", leadId)
    .eq("template_id", templateId)
    .single();

  if (respError || !respostaData) {
    throw new Error("Respostas do Raio-X não encontradas.");
  }

  // 2. Fetch or create `raio_x` legacy tracking row
  let { data: raioXLegacy } = await supabase
    .from("raio_x")
    .select("id")
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!raioXLegacy) {
    const { data: { user } } = await supabase.auth.getUser();
    // Creates a new one if the lead didn't have one
    const { data: novoRaioX, error: insertError } = await supabase
      .from("raio_x")
      .insert({
        organizacao_id: orgId,
        lead_id: leadId,
        responsavel_id: user?.id ?? null,
        preco_lista: 0,
        gratuito: true, // Dinâmico executado direto no board assume-se gratuito
        pago: true,     // Já que foi executado, pula a etapa de pagamento
        nivel: "Pendente",
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    raioXLegacy = novoRaioX;
  }

  // 3. Invocar IA para avaliar o Raio-X
  const { invokeAI } = await import("@/lib/ai/dispatcher");
  const result = await invokeAI({
    feature: "avaliar_raiox" as any, // Adicionar essa feature no banco
    vars: { 
      respostas: JSON.stringify(respostaData.respostas_json)
    },
    leadId: leadId,
    outputMode: "json"
  });

  if (!result.ok || !result.parsed) {
    throw new Error(`Falha na IA: ${result.erro || "Sem resposta JSON"}`);
  }

  // Espera-se que a IA retorne:
  // { score: number, nivel: "Alto"|"Médio"|"Baixo", perda_anual: number, saida: string, diagnostico: string, observacoes: string }
  const iaParsed = result.parsed as any;

  // 4. Salvar Resultado
  await salvarResultado({
    raio_x_id: raioXLegacy.id,
    lead_id: leadId,
    score: typeof iaParsed.score === "number" ? iaParsed.score : 0,
    nivel: NIVEIS_VALIDOS.includes(iaParsed.nivel) ? iaParsed.nivel : "Médio",
    perda_anual_estimada: typeof iaParsed.perda_anual === "number" ? iaParsed.perda_anual : 0,
    saida_recomendada: iaParsed.saida || "Saída recomendada pela IA",
    diagnostico_pago_sugerido: iaParsed.diagnostico || "Diagnóstico sugerido",
    observacoes: iaParsed.observacoes || "",
  });

  // Marca na tabela dinâmica que foi concluído
  await supabase
    .from("raiox_respostas")
    .update({ concluido: true })
    .eq("id", respostaData.id);

  // 5. Disparar Webhook
  await dispatchWebhook(orgId, "raiox.completed", {
    lead_id: leadId,
    raio_x_id: raioXLegacy.id,
    template_id: templateId,
    score: iaParsed.score,
    nivel: iaParsed.nivel,
    perda_anual_estimada: iaParsed.perda_anual
  }).catch(err => {
    console.error("Erro ao disparar webhook raiox.completed:", err);
  });

  return { sucesso: true, raioXLegacyId: raioXLegacy.id };
}
