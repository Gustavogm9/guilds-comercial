"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type { AiFeatureCodigo, AiProviderCodigo } from "@/lib/types";

async function requireGestor() {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Acesso restrito a gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa.");
  return orgId;
}

/** Ativa ou desativa uma feature de IA para a org. */
export async function toggleFeature(codigo: AiFeatureCodigo, ativo: boolean) {
  const orgId = await requireGestor();
  const supabase = createClient();

  // Se não existe override da org, cria copiando do global
  const { data: existente } = await supabase
    .from("ai_features")
    .select("id")
    .eq("organizacao_id", orgId)
    .eq("codigo", codigo)
    .maybeSingle();

  if (existente) {
    await supabase.from("ai_features")
      .update({ ativo, updated_at: new Date().toISOString() })
      .eq("id", existente.id);
  } else {
    const { data: global } = await supabase
      .from("ai_features")
      .select("*")
      .is("organizacao_id", null)
      .eq("codigo", codigo)
      .maybeSingle();
    if (!global) throw new Error(`Feature '${codigo}' não encontrada.`);
    const { id: _, created_at: _c, updated_at: _u, ...rest } = global;
    await supabase.from("ai_features").insert({ ...rest, organizacao_id: orgId, ativo });
  }
  revalidatePath("/admin/ai");
}

/** Atualiza modelo, temperature, max_tokens, provider, budgets de uma feature. */
export async function atualizarFeatureConfig(input: {
  codigo: AiFeatureCodigo;
  provider_codigo?: AiProviderCodigo;
  modelo?: string;
  temperature?: number;
  max_tokens?: number;
  limite_dia_org?: number;
  limite_dia_usuario?: number;
}) {
  const orgId = await requireGestor();
  const supabase = createClient();

  // Garante override da org
  const { data: existente } = await supabase
    .from("ai_features")
    .select("id")
    .eq("organizacao_id", orgId)
    .eq("codigo", input.codigo)
    .maybeSingle();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(input)) {
    if (k !== "codigo" && v !== undefined) patch[k] = v;
  }

  if (existente) {
    await supabase.from("ai_features").update(patch).eq("id", existente.id);
  } else {
    const { data: global } = await supabase
      .from("ai_features").select("*").is("organizacao_id", null)
      .eq("codigo", input.codigo).maybeSingle();
    if (!global) throw new Error("Feature não encontrada.");
    const { id: _, created_at: _c, updated_at: _u, ...rest } = global;
    await supabase.from("ai_features").insert({ ...rest, ...patch, organizacao_id: orgId });
  }
  revalidatePath("/admin/ai");
}

/** Cria nova versão do prompt e marca como ativa (desativa as demais). */
export async function criarVersaoPrompt(input: {
  feature_codigo: AiFeatureCodigo;
  system_prompt: string;
  user_template: string;
  variaveis_esperadas: string[];
  notas_editor?: string;
}) {
  const orgId = await requireGestor();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Desativa versões ativas da org (global continua ativo pra orgs sem override)
  await supabase.from("ai_prompts")
    .update({ ativo: false })
    .eq("organizacao_id", orgId)
    .eq("feature_codigo", input.feature_codigo)
    .eq("ativo", true);

  // Próxima versão = max+1 da org (ou 1 se for primeira)
  const { data: ultima } = await supabase
    .from("ai_prompts")
    .select("versao")
    .eq("organizacao_id", orgId)
    .eq("feature_codigo", input.feature_codigo)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  const novaVersao = (ultima?.versao ?? 0) + 1;

  await supabase.from("ai_prompts").insert({
    organizacao_id: orgId,
    feature_codigo: input.feature_codigo,
    versao: novaVersao,
    ativo: true,
    system_prompt: input.system_prompt,
    user_template: input.user_template,
    variaveis_esperadas: input.variaveis_esperadas,
    notas_editor: input.notas_editor ?? null,
    criado_por: user?.id ?? null,
  });
  revalidatePath("/admin/ai");
}

/** Reverte pra uma versão anterior (marca ela como ativa). */
export async function reverterParaVersao(feature_codigo: AiFeatureCodigo, versao: number) {
  const orgId = await requireGestor();
  const supabase = createClient();

  await supabase.from("ai_prompts")
    .update({ ativo: false })
    .eq("organizacao_id", orgId)
    .eq("feature_codigo", feature_codigo)
    .eq("ativo", true);

  await supabase.from("ai_prompts")
    .update({ ativo: true })
    .eq("organizacao_id", orgId)
    .eq("feature_codigo", feature_codigo)
    .eq("versao", versao);

  revalidatePath("/admin/ai");
}

/** Configura provider (troca modelo default, liga/desliga, muda API key ref). */
export async function atualizarProvider(input: {
  codigo: AiProviderCodigo;
  ativo?: boolean;
  modelo_default?: string;
  api_key_ref?: string;
  base_url?: string;
  custo_input_1k?: number;
  custo_output_1k?: number;
}) {
  const orgId = await requireGestor();
  const supabase = createClient();

  const { data: existente } = await supabase
    .from("ai_providers")
    .select("id")
    .eq("organizacao_id", orgId)
    .eq("codigo", input.codigo)
    .maybeSingle();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(input)) {
    if (k !== "codigo" && v !== undefined) patch[k] = v;
  }

  if (existente) {
    await supabase.from("ai_providers").update(patch).eq("id", existente.id);
  } else {
    const { data: global } = await supabase
      .from("ai_providers").select("*").is("organizacao_id", null)
      .eq("codigo", input.codigo).maybeSingle();
    if (!global) throw new Error("Provider não encontrado.");
    const { id: _, created_at: _c, updated_at: _u, ...rest } = global;
    await supabase.from("ai_providers").insert({ ...rest, ...patch, organizacao_id: orgId });
  }
  revalidatePath("/admin/ai");
}
