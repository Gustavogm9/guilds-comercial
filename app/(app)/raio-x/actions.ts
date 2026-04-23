"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
}

/** Cria/oferta um Raio-X para um lead */
export async function ofertarRaioX(input: {
  lead_id: number;
  preco_lista?: number;
  voucher_desconto?: number;
  gratuito?: boolean;
  observacoes?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  await supabase.from("raio_x").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    responsavel_id: user?.id ?? null,
    preco_lista: input.preco_lista ?? 97,
    voucher_desconto: input.voucher_desconto ?? 0,
    gratuito: input.gratuito ?? false,
    nivel: "Pendente",
    observacoes: input.observacoes ?? null,
  });

  await supabase.from("leads").update({
    crm_stage: "Raio-X Ofertado",
    funnel_stage: "pipeline",
    proxima_acao: "Receber pagamento Raio-X",
  }).eq("id", input.lead_id);

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
  const hoje = new Date().toISOString().slice(0, 10);

  await supabase.from("raio_x").update({
    pago: true,
    data_pagamento: hoje,
  }).eq("id", raio_x_id);

  await supabase.from("leads").update({
    crm_stage: "Raio-X Feito",
    proxima_acao: "Agendar call de revisão",
  }).eq("id", lead_id);

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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const hoje = new Date().toISOString().slice(0, 10);

  await supabase.from("raio_x").update({
    score: input.score,
    perda_anual_estimada: input.perda_anual_estimada,
    nivel: input.nivel,
    saida_recomendada: input.saida_recomendada,
    diagnostico_pago_sugerido: input.diagnostico_pago_sugerido,
    observacoes: input.observacoes ?? null,
    call_revisao: true,
    data_call: hoje,
  }).eq("id", input.raio_x_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id, ator_id: user?.id ?? null,
    tipo: "raio_x",
    payload: { acao: "resultado", score: input.score, nivel: input.nivel },
  });

  revalidatePath("/raio-x");
  revalidatePath(`/pipeline/${input.lead_id}`);
}
