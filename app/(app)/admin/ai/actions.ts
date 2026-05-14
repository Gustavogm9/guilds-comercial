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

/**
 * Valida limites de temperature/max_tokens/budgets pra evitar valores absurdos
 * que quebrariam invocações de IA ou custariam fortunas.
 */
function validarParametrosFeature(input: {
  temperature?: number;
  max_tokens?: number;
  limite_dia_org?: number;
  limite_dia_usuario?: number;
}) {
  if (input.temperature !== undefined) {
    if (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) {
      throw new Error("Temperature deve estar entre 0 e 2.");
    }
  }
  if (input.max_tokens !== undefined) {
    if (!Number.isInteger(input.max_tokens) || input.max_tokens < 1 || input.max_tokens > 200000) {
      throw new Error("Max tokens deve estar entre 1 e 200000.");
    }
  }
  if (input.limite_dia_org !== undefined) {
    if (!Number.isInteger(input.limite_dia_org) || input.limite_dia_org < 0) {
      throw new Error("Limite diário da org deve ser >= 0.");
    }
  }
  if (input.limite_dia_usuario !== undefined) {
    if (!Number.isInteger(input.limite_dia_usuario) || input.limite_dia_usuario < 0) {
      throw new Error("Limite diário por usuário deve ser >= 0.");
    }
  }
}

/**
 * Verifica se a env var da API key do provider está populada no servidor.
 * Não retorna o valor — apenas presença e últimos 4 chars (pra UX).
 *
 * Server-only: env vars não são expostas ao client. Esta action é a única
 * forma do client saber se um provider está configurado sem vazar a key.
 */
export async function checarApiKeyEnv(envVarName: string): Promise<{
  configured: boolean;
  lastChars: string | null;
  charCount: number;
}> {
  await requireGestor();
  if (!envVarName || !envVarName.trim()) {
    return { configured: false, lastChars: null, charCount: 0 };
  }
  // Sanitiza nome — só ENV-style (uppercase + underscore + digits)
  if (!/^[A-Z][A-Z0-9_]*$/.test(envVarName)) {
    return { configured: false, lastChars: null, charCount: 0 };
  }
  const value = process.env[envVarName];
  if (!value || value.length === 0) {
    return { configured: false, lastChars: null, charCount: 0 };
  }
  return {
    configured: true,
    lastChars: value.slice(-4),
    charCount: value.length,
  };
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
  // Bug 1: validação de ranges (antes negativos passavam direto pra DB)
  validarParametrosFeature(input);
  if (input.modelo !== undefined && (typeof input.modelo !== "string" || !input.modelo.trim())) {
    throw new Error("Modelo não pode ser vazio.");
  }

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
    const { error } = await supabase.from("ai_features").update(patch).eq("id", existente.id);
    if (error) throw error;
  } else {
    const { data: global } = await supabase
      .from("ai_features").select("*").is("organizacao_id", null)
      .eq("codigo", input.codigo).maybeSingle();
    if (!global) throw new Error("Feature não encontrada.");
    const { id: _, created_at: _c, updated_at: _u, ...rest } = global;
    const { error } = await supabase.from("ai_features").insert({ ...rest, ...patch, organizacao_id: orgId });
    if (error) throw error;
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
  // Bug 4+5: validação de input
  if (!input.system_prompt || !input.system_prompt.trim()) {
    throw new Error("System prompt não pode ser vazio.");
  }
  if (!input.user_template || !input.user_template.trim()) {
    throw new Error("User template não pode ser vazio.");
  }
  if (!Array.isArray(input.variaveis_esperadas)) {
    throw new Error("Variáveis esperadas deve ser uma lista.");
  }
  // Limite de tamanho — 50KB por prompt já é muito (200k tokens cobre uso real)
  if (input.system_prompt.length > 50000 || input.user_template.length > 50000) {
    throw new Error("Prompt muito longo (máx. 50KB cada).");
  }

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

  const { error } = await supabase.from("ai_prompts").insert({
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
  // Bug 3: race-condition — se outro admin criou simultaneamente a mesma versao,
  // a unique constraint (organizacao_id, feature_codigo, versao) levanta. Re-tenta uma vez.
  if (error) {
    if (error.code === "23505") {
      const { data: ultima2 } = await supabase
        .from("ai_prompts")
        .select("versao")
        .eq("organizacao_id", orgId)
        .eq("feature_codigo", input.feature_codigo)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      const retry = (ultima2?.versao ?? 0) + 1;
      const { error: e2 } = await supabase.from("ai_prompts").insert({
        organizacao_id: orgId,
        feature_codigo: input.feature_codigo,
        versao: retry,
        ativo: true,
        system_prompt: input.system_prompt,
        user_template: input.user_template,
        variaveis_esperadas: input.variaveis_esperadas,
        notas_editor: input.notas_editor ?? null,
        criado_por: user?.id ?? null,
      });
      if (e2) throw e2;
    } else {
      throw error;
    }
  }
  revalidatePath("/admin/ai");
}

/** Reverte pra uma versão anterior (marca ela como ativa). */
export async function reverterParaVersao(feature_codigo: AiFeatureCodigo, versao: number) {
  if (!Number.isInteger(versao) || versao < 1) {
    throw new Error("Versão inválida.");
  }
  const orgId = await requireGestor();
  const supabase = createClient();

  // Bug 7: confirma que a versão existe pra org antes de mexer no estado ativo
  const { data: alvo } = await supabase
    .from("ai_prompts")
    .select("id")
    .eq("organizacao_id", orgId)
    .eq("feature_codigo", feature_codigo)
    .eq("versao", versao)
    .maybeSingle();
  if (!alvo) throw new Error(`Versão ${versao} não encontrada para esta feature.`);

  await supabase.from("ai_prompts")
    .update({ ativo: false })
    .eq("organizacao_id", orgId)
    .eq("feature_codigo", feature_codigo)
    .eq("ativo", true);

  const { error } = await supabase.from("ai_prompts")
    .update({ ativo: true })
    .eq("id", alvo.id);
  if (error) throw error;

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
  // Bug 2+6: validação de input
  if (input.api_key_ref !== undefined && input.api_key_ref !== "") {
    // Aceita apenas nomes ENV-style (uppercase + digits + underscore) — evita injeção
    if (!/^[A-Z][A-Z0-9_]*$/.test(input.api_key_ref)) {
      throw new Error("api_key_ref deve ser nome de env-var válido (UPPER_SNAKE_CASE).");
    }
  }
  if (input.modelo_default !== undefined && (!input.modelo_default || !input.modelo_default.trim())) {
    throw new Error("Modelo default não pode ser vazio.");
  }
  if (input.base_url !== undefined && input.base_url !== "") {
    try {
      const u = new URL(input.base_url);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new Error("base_url deve usar http(s).");
      }
    } catch {
      throw new Error("base_url inválido.");
    }
  }
  for (const k of ["custo_input_1k", "custo_output_1k"] as const) {
    const v = input[k];
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1000)) {
      throw new Error(`${k} deve estar entre 0 e 1000.`);
    }
  }

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
    const { error } = await supabase.from("ai_providers").update(patch).eq("id", existente.id);
    if (error) throw error;
  } else {
    const { data: global } = await supabase
      .from("ai_providers").select("*").is("organizacao_id", null)
      .eq("codigo", input.codigo).maybeSingle();
    if (!global) throw new Error("Provider não encontrado.");
    const { id: _, created_at: _c, updated_at: _u, ...rest } = global;
    const { error } = await supabase.from("ai_providers").insert({ ...rest, ...patch, organizacao_id: orgId });
    if (error) throw error;
  }
  revalidatePath("/admin/ai");
}

export async function salvarPropostaSkillConfig(input: {
  id?: number;
  nome: string;
  formato: "proposta_comercial" | "escopo_tecnico" | "email_executivo" | "whatsapp_resumo";
  skill_chain: string;
  modelo_referencia?: string;
  ativo?: boolean;
  padrao?: boolean;
}) {
  const orgId = await requireGestor();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const nome = input.nome.trim().slice(0, 120);
  const skillChain = input.skill_chain.trim().slice(0, 12000);
  if (!nome) throw new Error("Nome da configuracao e obrigatorio.");
  if (!skillChain) throw new Error("Sequencia de skills e obrigatoria.");

  const payload = {
    nome,
    formato: input.formato,
    skill_chain: skillChain,
    modelo_referencia: input.modelo_referencia?.trim().slice(0, 12000) || null,
    ativo: input.ativo ?? true,
    padrao: input.padrao ?? false,
    updated_at: new Date().toISOString(),
  };

  if (payload.padrao) {
    await supabase
      .from("proposta_skill_configs")
      .update({ padrao: false })
      .eq("organizacao_id", orgId)
      .eq("formato", payload.formato);
  }

  if (input.id) {
    const { error } = await supabase
      .from("proposta_skill_configs")
      .update(payload)
      .eq("id", input.id)
      .eq("organizacao_id", orgId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("proposta_skill_configs").insert({
      ...payload,
      organizacao_id: orgId,
      criado_por: user?.id ?? null,
    });
    if (error) throw error;
  }

  revalidatePath("/admin/ai");
  revalidatePath("/vendas/propostas");
}

export async function salvarContratoSkillConfig(input: {
  id?: number;
  nome: string;
  modo: "contrato_template" | "briefing_juridico" | "revisao_juridica";
  template_docx_nome?: string;
  template_docx_ref?: string;
  skill_chain: string;
  modelo_referencia?: string;
  ativo?: boolean;
  padrao?: boolean;
}) {
  const orgId = await requireGestor();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const nome = input.nome.trim().slice(0, 120);
  const skillChain = input.skill_chain.trim().slice(0, 12000);
  if (!nome) throw new Error("Nome da configuracao e obrigatorio.");
  if (!skillChain) throw new Error("Sequencia de skills e obrigatoria.");

  const payload = {
    nome,
    modo: input.modo,
    template_docx_nome: input.template_docx_nome?.trim().slice(0, 240) || null,
    template_docx_ref: input.template_docx_ref?.trim().slice(0, 500) || null,
    skill_chain: skillChain,
    modelo_referencia: input.modelo_referencia?.trim().slice(0, 12000) || null,
    ativo: input.ativo ?? true,
    padrao: input.padrao ?? false,
    updated_at: new Date().toISOString(),
  };

  if (payload.padrao) {
    await supabase
      .from("contrato_skill_configs")
      .update({ padrao: false })
      .eq("organizacao_id", orgId)
      .eq("modo", payload.modo);
  }

  if (input.id) {
    const { error } = await supabase
      .from("contrato_skill_configs")
      .update(payload)
      .eq("id", input.id)
      .eq("organizacao_id", orgId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("contrato_skill_configs").insert({
      ...payload,
      organizacao_id: orgId,
      criado_por: user?.id ?? null,
    });
    if (error) throw error;
  }

  revalidatePath("/admin/ai");
  revalidatePath("/vendas/contratos");
}
