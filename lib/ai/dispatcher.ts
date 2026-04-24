/**
 * Dispatcher central da camada de IA.
 *
 * Uso:
 *   const out = await invokeAI({
 *     feature: "gerar_mensagem_cadencia",
 *     vars: { empresa: "NEOPSICO", nome: "Paula", ... },
 *     leadId: 42,
 *   });
 *
 * Responsabilidades:
 *   1. Carrega ai_feature (config — modelo, temp, max_tokens, toggle, budget).
 *   2. Verifica permissão (papel_minimo) e budget (limite_dia_*).
 *   3. Carrega ai_prompt ativo + resolve {{variaveis}}.
 *   4. Despacha pro adapter do provider (Anthropic/OpenAI/Google).
 *   5. Registra ai_invocations com status/custo/latência.
 *   6. Tenta parsing JSON quando aplicável (via outputMode).
 */

"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import type {
  AiFeatureCodigo, AiFeature, AiPrompt, AiProvider, AiProviderCodigo,
} from "@/lib/types";

import { anthropicAdapter } from "./providers/anthropic";
import { openaiAdapter } from "./providers/openai";
import { googleAdapter } from "./providers/google";
import type { ProviderAdapter } from "./providers/types";

const ADAPTERS: Record<AiProviderCodigo, ProviderAdapter | null> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  local: null,
};

const ROLE_RANK: Record<string, number> = { gestor: 3, comercial: 2, sdr: 1 };

export interface InvokeAIInput {
  feature: AiFeatureCodigo;
  vars: Record<string, unknown>;
  leadId?: number | null;
  /** Parse JSON do output? Se true, tenta JSON.parse e joga erro se falhar. */
  outputMode?: "texto" | "json";
  /** Timeout sobrescrito pro adapter. */
  timeoutMs?: number;
}

export interface InvokeAIResult {
  ok: boolean;
  texto: string;
  parsed?: unknown;
  invocationId: number | null;
  /** Estimativa de custo em USD. */
  custoUsd: number;
  latenciaMs: number;
  erro?: string;
}

/** Substitui `{{chave}}` pelas vars. Chaves não preenchidas viram string vazia. */
function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });
}

/** Pega API key do env. api_key_ref do provider é o NOME do env var. */
function resolveApiKey(provider: AiProvider): string | null {
  if (!provider.api_key_ref) return null;
  const val = process.env[provider.api_key_ref];
  return val && val.length > 0 ? val : null;
}

function estimarCusto(
  provider: AiProvider,
  tokensIn: number,
  tokensOut: number,
): number {
  return Number(
    ((tokensIn / 1000) * Number(provider.custo_input_1k ?? 0)
    + (tokensOut / 1000) * Number(provider.custo_output_1k ?? 0)).toFixed(6)
  );
}

export async function invokeAI(input: InvokeAIInput): Promise<InvokeAIResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: "Sem organização ativa" };
  }
  const role = (await getCurrentRole()) ?? "comercial";

  // 1. Carrega feature — primeiro procura org-specific, senão pega o template global (organizacao_id IS NULL)
  const { data: featureRows } = await supabase
    .from("ai_features")
    .select("*")
    .eq("codigo", input.feature)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`)
    .order("organizacao_id", { ascending: false, nullsFirst: false })
    .limit(1);
  const feature = featureRows?.[0] as AiFeature | undefined;

  if (!feature) {
    return logErro(supabase, orgId, input, null, null, 0, "Feature não cadastrada");
  }
  if (!feature.ativo) {
    return logErro(supabase, orgId, input, null, null, 0, "Feature desativada pelo admin");
  }

  // 2. Permissão
  const needed = ROLE_RANK[feature.papel_minimo] ?? 2;
  const have = ROLE_RANK[role] ?? 0;
  if (have < needed) {
    return logErro(supabase, orgId, input, null, null, 0, `Permissão insuficiente (precisa ${feature.papel_minimo})`);
  }

  // 3. Budget check (últimas 24h)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: countOrg } = await supabase
    .from("ai_invocations")
    .select("id", { count: "exact", head: true })
    .eq("organizacao_id", orgId)
    .eq("feature_codigo", input.feature)
    .gte("created_at", since)
    .eq("status", "sucesso");

  if ((countOrg ?? 0) >= feature.limite_dia_org) {
    await registrarInvocacao(supabase, orgId, input, feature, null, null, 0, 0, 0, "bloqueado_budget", "Limite diário da org atingido");
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: "Limite diário da organização atingido" };
  }

  if (user?.id) {
    const { count: countUser } = await supabase
      .from("ai_invocations")
      .select("id", { count: "exact", head: true })
      .eq("organizacao_id", orgId)
      .eq("feature_codigo", input.feature)
      .eq("ator_id", user.id)
      .gte("created_at", since)
      .eq("status", "sucesso");
    if ((countUser ?? 0) >= feature.limite_dia_usuario) {
      await registrarInvocacao(supabase, orgId, input, feature, null, null, 0, 0, 0, "bloqueado_budget", "Limite diário do usuário atingido");
      return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: "Seu limite diário atingido" };
    }
  }

  // 4. Carrega prompt ativo — org-specific antes do global
  const { data: promptRows } = await supabase
    .from("ai_prompts")
    .select("*")
    .eq("feature_codigo", input.feature)
    .eq("ativo", true)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`)
    .order("organizacao_id", { ascending: false, nullsFirst: false })
    .limit(1);
  const prompt = promptRows?.[0] as AiPrompt | undefined;
  if (!prompt) {
    return logErro(supabase, orgId, input, feature, null, 0, "Prompt ativo não encontrado");
  }

  // 5. Resolve provider
  const { data: providerRows } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("codigo", feature.provider_codigo)
    .eq("ativo", true)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`)
    .order("organizacao_id", { ascending: false, nullsFirst: false })
    .limit(1);
  const provider = providerRows?.[0] as AiProvider | undefined;
  if (!provider) {
    return logErro(supabase, orgId, input, feature, prompt, 0, `Provider '${feature.provider_codigo}' não configurado`);
  }

  const adapter = ADAPTERS[provider.codigo];
  if (!adapter) {
    return logErro(supabase, orgId, input, feature, prompt, 0, `Adapter '${provider.codigo}' não implementado`);
  }

  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    return logErro(supabase, orgId, input, feature, prompt, 0, `API key ausente (env ${provider.api_key_ref})`);
  }

  // 6. Renderiza prompt e chama adapter
  const userPrompt = renderTemplate(prompt.user_template, input.vars);

  let texto = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let latenciaMs = 0;
  let status: "sucesso" | "erro" | "timeout" = "sucesso";
  let erroMsg: string | null = null;

  try {
    const result = await adapter.call({
      apiKey,
      baseUrl: provider.base_url ?? undefined,
      modelo: feature.modelo,
      systemPrompt: prompt.system_prompt ?? undefined,
      userPrompt,
      temperature: Number(feature.temperature),
      maxTokens: feature.max_tokens,
      timeoutMs: input.timeoutMs,
    });
    texto = result.texto;
    tokensIn = result.tokensInput;
    tokensOut = result.tokensOutput;
    latenciaMs = result.latenciaMs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
    status = isTimeout ? "timeout" : "erro";
    erroMsg = msg.slice(0, 500);
  }

  const custoUsd = estimarCusto(provider, tokensIn, tokensOut);

  // 7. Log invocação
  const invocationId = await registrarInvocacao(
    supabase, orgId, input, feature, prompt, provider, tokensIn, tokensOut, latenciaMs,
    status, erroMsg, texto, custoUsd,
  );

  if (status !== "sucesso") {
    return { ok: false, texto: "", invocationId, custoUsd, latenciaMs, erro: erroMsg ?? undefined };
  }

  // 8. Parse JSON se solicitado
  let parsed: unknown = undefined;
  if (input.outputMode === "json") {
    try {
      // Tolera Markdown code fences
      const clean = texto.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      parsed = JSON.parse(clean);
    } catch (err) {
      return {
        ok: false, texto, invocationId, custoUsd, latenciaMs,
        erro: `Resposta não é JSON válido: ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  return { ok: true, texto, parsed, invocationId, custoUsd, latenciaMs };
}

/**
 * Versão para chamadas server-to-server (cron, webhooks) sem sessão de usuário.
 * Recebe orgId explicitamente e ignora verificação de role/budget de usuário.
 */
export async function invokeAISystem(
  orgId: string,
  input: Omit<InvokeAIInput, "timeoutMs"> & { timeoutMs?: number },
): Promise<InvokeAIResult> {
  const { createClient: createAdmin } = await import("@supabase/supabase-js");
  const supabase = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Carrega feature
  const { data: featureRows } = await supabase
    .from("ai_features")
    .select("*")
    .eq("codigo", input.feature)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`)
    .order("organizacao_id", { ascending: false, nullsFirst: false })
    .limit(1);
  const feature = featureRows?.[0] as AiFeature | undefined;

  if (!feature) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: "Feature não cadastrada" };
  }
  if (!feature.ativo) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: "Feature desativada" };
  }

  // 2. Carrega prompt
  const { data: promptRows } = await supabase
    .from("ai_prompts")
    .select("*")
    .eq("feature_codigo", input.feature)
    .eq("ativo", true)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`)
    .order("organizacao_id", { ascending: false, nullsFirst: false })
    .limit(1);
  const prompt = promptRows?.[0] as AiPrompt | undefined;
  if (!prompt) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: "Prompt ativo não encontrado" };
  }

  // 3. Resolve provider
  const { data: providerRows } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("codigo", feature.provider_codigo)
    .eq("ativo", true)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`)
    .order("organizacao_id", { ascending: false, nullsFirst: false })
    .limit(1);
  const provider = providerRows?.[0] as AiProvider | undefined;
  if (!provider) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: `Provider '${feature.provider_codigo}' não configurado` };
  }

  const adapter = ADAPTERS[provider.codigo];
  if (!adapter) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: `Adapter '${provider.codigo}' não implementado` };
  }

  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: `API key ausente (env ${provider.api_key_ref})` };
  }

  // 4. Renderiza e chama
  const userPrompt = renderTemplate(prompt.user_template, input.vars);
  let texto = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let latenciaMs = 0;

  try {
    const result = await adapter.call({
      apiKey,
      baseUrl: provider.base_url ?? undefined,
      modelo: feature.modelo,
      systemPrompt: prompt.system_prompt ?? undefined,
      userPrompt,
      temperature: Number(feature.temperature),
      maxTokens: feature.max_tokens,
      timeoutMs: input.timeoutMs,
    });
    texto = result.texto;
    tokensIn = result.tokensInput;
    tokensOut = result.tokensOutput;
    latenciaMs = result.latenciaMs;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Log na tabela de invocações como sistema
    await supabase.from("ai_invocations").insert({
      organizacao_id: orgId,
      feature_codigo: input.feature,
      prompt_versao: prompt?.versao ?? null,
      provider_codigo: provider.codigo,
      modelo: feature.modelo,
      ator_id: null,
      lead_id: input.leadId ?? null,
      input_vars: input.vars,
      output_texto: "",
      tokens_input: 0, tokens_output: 0,
      custo_estimado: 0, latencia_ms: 0,
      status: msg.toLowerCase().includes("timeout") ? "timeout" : "erro",
      erro_msg: msg.slice(0, 500),
    });
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: msg };
  }

  const custoUsd = estimarCusto(provider, tokensIn, tokensOut);

  // Log invocação
  const { data } = await supabase
    .from("ai_invocations")
    .insert({
      organizacao_id: orgId,
      feature_codigo: input.feature,
      prompt_versao: prompt?.versao ?? null,
      provider_codigo: provider.codigo,
      modelo: feature.modelo,
      ator_id: null,
      lead_id: input.leadId ?? null,
      input_vars: input.vars,
      output_texto: texto.slice(0, 20000),
      tokens_input: tokensIn, tokens_output: tokensOut,
      custo_estimado: custoUsd, latencia_ms: latenciaMs,
      status: "sucesso",
      erro_msg: null,
    })
    .select("id")
    .maybeSingle();

  // Parse JSON se pedido
  let parsed: unknown = undefined;
  if (input.outputMode === "json") {
    try {
      const clean = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(clean);
    } catch {
      return { ok: false, texto, invocationId: data?.id ?? null, custoUsd, latenciaMs, erro: "Resposta não é JSON válido" };
    }
  }

  return { ok: true, texto, parsed, invocationId: data?.id ?? null, custoUsd, latenciaMs };
}

// =============================================================
// Helpers internos
// =============================================================

async function registrarInvocacao(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  input: InvokeAIInput,
  feature: AiFeature | null,
  prompt: AiPrompt | null,
  provider: AiProvider | null,
  tokensIn: number,
  tokensOut: number,
  latenciaMs: number,
  status: "sucesso" | "erro" | "bloqueado_budget" | "timeout",
  erroMsg: string | null,
  outputTexto = "",
  custoUsd = 0,
): Promise<number | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("ai_invocations")
    .insert({
      organizacao_id: orgId,
      feature_codigo: input.feature,
      prompt_versao: prompt?.versao ?? null,
      provider_codigo: provider?.codigo ?? feature?.provider_codigo ?? null,
      modelo: feature?.modelo ?? null,
      ator_id: user?.id ?? null,
      lead_id: input.leadId ?? null,
      input_vars: input.vars,
      output_texto: outputTexto.slice(0, 20000),
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      custo_estimado: custoUsd,
      latencia_ms: latenciaMs,
      status,
      erro_msg: erroMsg,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Log fails shouldn't break the UX
    console.error("[ai_invocations log error]", error);
    return null;
  }
  return data?.id ?? null;
}

async function logErro(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  input: InvokeAIInput,
  feature: AiFeature | null,
  prompt: AiPrompt | null,
  latenciaMs: number,
  erro: string,
): Promise<InvokeAIResult> {
  const invocationId = await registrarInvocacao(
    supabase, orgId, input, feature, prompt, null, 0, 0, latenciaMs, "erro", erro,
  );
  return { ok: false, texto: "", invocationId, custoUsd: 0, latenciaMs, erro };
}
