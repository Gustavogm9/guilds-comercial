"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

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

  const supabase = createClient();
  const { data, error } = await supabase
    .from("ai_prompt_experiments")
    .insert({
      organizacao_id: orgId,
      feature_codigo: input.feature_codigo,
      variant_a_prompt_id: input.variant_a_prompt_id,
      variant_b_prompt_id: input.variant_b_prompt_id,
      traffic_split: input.traffic_split ?? 50,
      metrica_vitoria: input.metrica_vitoria ?? "taxa_aceite",
      amostra_minima: input.amostra_minima ?? 30,
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
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_prompt_experiments")
    .update({ status: "encerrado", winner_variant: winner ?? null, ended_at: new Date().toISOString() })
    .eq("id", experimentId);

  if (error) return { error: "Falha ao encerrar." };
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function pausarExperimento(experimentId: number, pausar: boolean) {
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_prompt_experiments")
    .update({ status: pausar ? "pausado" : "rodando" })
    .eq("id", experimentId);

  if (error) return { error: "Falha ao alterar status." };
  revalidatePath("/admin/ai");
  return { success: true };
}

export async function promoverVencedor(input: {
  experimentId: number;
  feature_codigo: string;
  prompt_id: number;
}) {
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };
  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem organização." };

  const supabase = createClient();

  // Desativa todos os prompts atuais da feature na org
  await supabase
    .from("ai_prompts")
    .update({ ativo: false })
    .eq("feature_codigo", input.feature_codigo)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`);

  // Ativa só o vencedor
  await supabase.from("ai_prompts").update({ ativo: true }).eq("id", input.prompt_id);

  // Encerra o experimento
  await supabase
    .from("ai_prompt_experiments")
    .update({ status: "encerrado", ended_at: new Date().toISOString() })
    .eq("id", input.experimentId);

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
