"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const METRICAS_VALIDAS = ["taxa_aceite", "taxa_resposta_lead", "taxa_conversao"] as const;
const WINNERS_VALIDOS = ["a", "b", "empate"] as const;
const EVENTOS_VALIDOS = ["aceito", "recusado", "copiado", "convertido"] as const;

export async function criarExperimento(input: {
  feature_codigo: string;
  variant_a_prompt_id: number;
  variant_b_prompt_id: number;
  traffic_split?: number;
  metrica_vitoria?: "taxa_aceite" | "taxa_resposta_lead" | "taxa_conversao";
  amostra_minima?: number;
}) {
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };
  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem organização." };

  if (input.variant_a_prompt_id === input.variant_b_prompt_id) {
    return { error: "Variants A e B precisam ser prompts diferentes." };
  }
  // Bug 3: validação de tipos
  if (!Number.isInteger(input.variant_a_prompt_id) || !Number.isInteger(input.variant_b_prompt_id)) {
    return { error: "IDs de prompt inválidos." };
  }
  // Bug 3: traffic_split 1..99 (0 ou 100 = experimento sem sentido)
  const split = input.traffic_split ?? 50;
  if (!Number.isFinite(split) || split < 1 || split > 99) {
    return { error: "Traffic split deve estar entre 1 e 99." };
  }
  const amostra = input.amostra_minima ?? 30;
  if (!Number.isInteger(amostra) || amostra < 1 || amostra > 100000) {
    return { error: "Amostra mínima deve estar entre 1 e 100000." };
  }
  const metrica = input.metrica_vitoria ?? "taxa_aceite";
  if (!METRICAS_VALIDAS.includes(metrica)) {
    return { error: "Métrica inválida." };
  }

  const supabase = createClient();

  // Bug 4: defense-in-depth — confirma que ambos os prompts pertencem à org (ou são globais)
  const { data: promptsValidos } = await supabase
    .from("ai_prompts")
    .select("id")
    .in("id", [input.variant_a_prompt_id, input.variant_b_prompt_id])
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`);
  if (!promptsValidos || promptsValidos.length !== 2) {
    return { error: "Um dos prompts não existe ou não pertence à organização." };
  }

  const { data, error } = await supabase
    .from("ai_prompt_experiments")
    .insert({
      organizacao_id: orgId,
      feature_codigo: input.feature_codigo,
      variant_a_prompt_id: input.variant_a_prompt_id,
      variant_b_prompt_id: input.variant_b_prompt_id,
      traffic_split: split,
      metrica_vitoria: metrica,
      amostra_minima: amostra,
      status: "rodando",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[experimento criar]", error);
    if (error.message?.includes("idx_ai_prompt_exp_unico_rodando")) {
      return { error: "Já existe um experimento rodando para essa feature. Encerre antes de criar novo." };
    }
    return { error: "Falha ao criar experimento." };
  }

  revalidatePath("/admin/ai");
  return { success: true, experimentoId: data.id };
}

export async function encerrarExperimento(experimentId: number, winner?: "a" | "b" | "empate") {
  if (!Number.isInteger(experimentId) || experimentId <= 0) return { error: "ID inválido." };
  if (winner !== undefined && !WINNERS_VALIDOS.includes(winner)) return { error: "Vencedor inválido." };
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };
  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem organização." };

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_prompt_experiments")
    .update({ status: "encerrado", winner_variant: winner ?? null, ended_at: new Date().toISOString() })
    .eq("id", experimentId)
    .eq("organizacao_id", orgId);

  if (error) return { error: "Falha ao encerrar." };
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function pausarExperimento(experimentId: number, pausar: boolean) {
  if (!Number.isInteger(experimentId) || experimentId <= 0) return { error: "ID inválido." };
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };
  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem organização." };

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_prompt_experiments")
    .update({ status: pausar ? "pausado" : "rodando" })
    .eq("id", experimentId)
    .eq("organizacao_id", orgId);

  if (error) return { error: "Falha ao alterar status." };
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function promoverVencedor(input: {
  experimentId: number;
  feature_codigo: string;
  prompt_id: number;
}) {
  if (!Number.isInteger(input.experimentId) || !Number.isInteger(input.prompt_id)) {
    return { error: "IDs inválidos." };
  }
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };
  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem organização." };

  const supabase = createClient();

  // Bug 2 critical: NUNCA tocar em prompts globais (organizacao_id IS NULL).
  // Antes o .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`) podia
  // desativar prompts globais — multi-tenant data leak.
  await supabase
    .from("ai_prompts")
    .update({ ativo: false })
    .eq("feature_codigo", input.feature_codigo)
    .eq("organizacao_id", orgId);

  // Ativa só o vencedor — confirma que pertence à org/é global antes
  const { data: alvo } = await supabase
    .from("ai_prompts")
    .select("id, organizacao_id")
    .eq("id", input.prompt_id)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`)
    .maybeSingle();
  if (!alvo) return { error: "Prompt vencedor não encontrado para esta organização." };

  // Se for global, copia pra org primeiro (override) ao invés de mexer no global
  if (alvo.organizacao_id === null) {
    const { data: full } = await supabase
      .from("ai_prompts").select("*").eq("id", input.prompt_id).maybeSingle();
    if (full) {
      const { id: _, created_at: _c, ...rest } = full;
      await supabase.from("ai_prompts").insert({ ...rest, organizacao_id: orgId, ativo: true });
    }
  } else {
    await supabase.from("ai_prompts").update({ ativo: true })
      .eq("id", input.prompt_id).eq("organizacao_id", orgId);
  }

  // Encerra o experimento
  await supabase
    .from("ai_prompt_experiments")
    .update({ status: "encerrado", ended_at: new Date().toISOString() })
    .eq("id", input.experimentId)
    .eq("organizacao_id", orgId);

  revalidatePath("/admin/ai");
  return { success: true };
}

/**
 * Marca evento de sucesso/recusa para uma invocação que faz parte de experimento.
 * Chamado pela UI quando vendedor copia output, aceita, ou recusa.
 */
export async function registrarEventoExperimento(
  invocationId: number,
  evento: "aceito" | "recusado" | "copiado" | "convertido"
) {
  if (!Number.isInteger(invocationId) || invocationId <= 0) return { error: "" };
  if (!EVENTOS_VALIDOS.includes(evento)) return { error: "Evento inválido." };
  const supabase = createClient();
  const { error } = await supabase.rpc("registrar_evento_experimento", {
    _invocation_id: invocationId,
    _evento: evento,
  });
  if (error) {
    console.warn("[experimento evento]", error);
    return { error: "" };
  }
  return { success: true };
}
