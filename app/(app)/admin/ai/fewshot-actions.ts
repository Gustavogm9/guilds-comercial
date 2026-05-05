"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

/**
 * Promove uma invocação a exemplo manual (score 80).
 * Chamada da UI quando gestor marca um output como "perfeito" no /admin/ai.
 */
export async function promoverInvocacaoAExemplo(invocationId: number) {
  if (!Number.isInteger(invocationId) || invocationId <= 0) {
    return { error: "ID de invocação inválido." };
  }
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores podem promover exemplos." };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("registrar_fewshot_de_invocacao", {
    _invocation_id: invocationId,
    _fonte: "manual",
  });

  if (error) {
    console.error("[fewshot] promover", error);
    return { error: "Falha ao registrar exemplo." };
  }

  revalidatePath("/admin/ai");
  return { success: true, exemploId: data };
}

/**
 * Desativa um exemplo (não apaga histórico).
 * Defense-in-depth: filtra por organizacao_id mesmo confiando em RLS.
 */
export async function desativarFewshotExemplo(exemploId: number) {
  if (!Number.isInteger(exemploId) || exemploId <= 0) {
    return { error: "ID inválido." };
  }
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores." };
  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem organização ativa." };

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_fewshot_exemplos")
    .update({ ativo: false })
    .eq("id", exemploId)
    .eq("organizacao_id", orgId);

  if (error) return { error: "Falha ao desativar." };
  revalidatePath("/admin/ai");
  return { success: true };
}

/**
 * Auto-coleta: chamada quando a UI detecta que o vendedor copiou ou usou
 * o output de uma invocação (score 60).
 */
export async function registrarUsoOutput(invocationId: number) {
  if (!Number.isInteger(invocationId) || invocationId <= 0) {
    return { error: "" };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado." };

  const { data, error } = await supabase.rpc("registrar_fewshot_de_invocacao", {
    _invocation_id: invocationId,
    _fonte: "auto_clicado",
  });

  if (error) {
    console.warn("[fewshot] uso_output", error);
    return { error: "" }; // silencioso pro user
  }

  return { success: true, exemploId: data };
}
