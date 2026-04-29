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
import { renderTemplate } from "./template";
import { getServerLocale, getT } from "@/lib/i18n";

async function tIA() {
  return getT(await getServerLocale());
}

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
  const t = await tIA();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: t("erros.sem_org") };
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
    return logErro(supabase, orgId, input, null, null, 0, t("erros.ia_feature_nao_cadastrada"));
  }
  if (!feature.ativo) {
    return logErro(supabase, orgId, input, null, null, 0, t("erros.ia_feature_desabilitada"));
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
    return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: t("erros.ia_limite_org") };
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
      return { ok: false, texto: "", invocationId: null, custoUsd: 0, latenciaMs: 0, erro: t("erros.ia_limite_usuario") };
    }
  }

  // 4. Carrega prompt ativo — preferindo (org × idioma_org) com fallback para
  // (org × pt-BR) e depois (global × idioma_org) e por fim (global × pt-BR).
  // Pega idioma_padrao da org pra escolher prompt; default pt-BR.
  const { data: orgRow } = await supabase
    .from("organizacoes")
    .select("idioma_padrao")
    .eq("id", orgId)
    .maybeSingle();
  const idiomaOrg = (orgRow as any)?.idioma_padrao ?? "pt-BR";

  // Carrega todos os prompts ativos (org+global) e escolhe o melhor match
  const { data: promptRows } = await supabase
    .from("ai_prompts")
    .select("*")
    .eq("feature_codigo", input.feature)
    .eq("ativo", true)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`);
  const prompts = (promptRows ?? []) as AiPrompt[];

  // Ranking: org+idioma > org+pt-BR > global+idioma > global+pt-BR
  function rankPrompt(p: AiPrompt): number {
    const isOrg = p.organizacao_id === orgId;
    const matchIdioma = (p as any).idioma === idiomaOrg;
    const matchPtBR = (p as any).idioma === "pt-BR";
    if (isOrg && matchIdioma) return 4;
    if (isOrg && matchPtBR) return 3;
    if (!isOrg && matchIdioma) return 2;
    if (!isOrg && matchPtBR) return 1;
    return 0;
  }
  const sorted = prompts.slice().sort((a, b) => rankPrompt(b) - rankPrompt(a));
  let prompt = sorted[0];
  if (!prompt) {
    return logErro(supabase, orgId, input, feature, null, 0, "Prompt ativo não encontrado");
  }

  // 4b. Verifica se há experimento A/B rodando — sobrescreve o prompt selecionado
  let experimentInfo: { experimentId: number; variant: "a" | "b" } | null = null;
  try {
    const { data: experimentoData } = await supabase.rpc("escolher_prompt_experimento", {
      _org: orgId,
      _feature_codigo: input.feature,
    });
    if (experimentoData && experimentoData.length > 0) {
      const escolha = experimentoData[0];
      // Carrega o prompt da variant escolhida
      const { data: variantPrompt } = await supabase
        .from("ai_prompts")
        .select("*")
        .eq("id", escolha.prompt_id)
        .maybeSingle();
      if (variantPrompt) {
        prompt = variantPrompt as AiPrompt;
        experimentInfo = {
          experimentId: Number(escolha.experiment_id),
          variant: escolha.variant as "a" | "b",
        };
      }
    }
  } catch (err) {
    console.warn("[ab-test] escolher_prompt_experimento falhou:", err);
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
  // Injeta `idioma` nas vars automaticamente (extraído da org) — assim user_templates
  // podem referenciar {{idioma}} pra instruir o LLM a responder no idioma certo.
  const varsComIdioma = {
    idioma: idiomaOrg,
    locale: idiomaOrg,
    ...input.vars,
  };
  const userPrompt = renderTemplate(prompt.user_template, varsComIdioma);

  // 6b. Carrega few-shot exemplos da org filtrados por contexto do lead.
  // Injetados no system prompt antes da chamada — auto-evolução funcionando.
  let systemPromptFinal = prompt.system_prompt ?? undefined;

  // 6c. Suffix de idioma no system prompt — fallback para casos onde o
  // user_template não usa {{idioma}}. Reforça resposta no locale da org.
  const idiomaInstrucao = idiomaOrg === "en-US"
    ? "\n\nIMPORTANT: Respond in English (en-US)."
    : idiomaOrg === "pt-BR"
    ? "\n\nIMPORTANTE: Responda em Português do Brasil (pt-BR)."
    : `\n\nIMPORTANT: Respond in ${idiomaOrg}.`;
  systemPromptFinal = (systemPromptFinal ?? "") + idiomaInstrucao;
  try {
    const { data: exemplos } = await supabase.rpc("obter_fewshot_exemplos", {
      _org: orgId,
      _feature_codigo: input.feature,
      _lead_id: input.leadId ?? null,
      _limite: 3,
    });
    if (exemplos && exemplos.length > 0) {
      const exemplosTxt = exemplos
        .map((ex: any, i: number) => {
          const inputResumo = JSON.stringify(ex.input_vars).slice(0, 600);
          return `### Exemplo ${i + 1} (score ${ex.score}, match ${ex.match_score})\nContexto: ${inputResumo}\nOutput aprovado:\n${ex.output}`;
        })
        .join("\n\n");
      systemPromptFinal = `${systemPromptFinal ?? ""}\n\n## Exemplos de outputs anteriores aprovados desta organização (use o estilo, tom e estrutura como referência):\n\n${exemplosTxt}`.trim();
    }
  } catch (err) {
    // Falha no fewshot não bloqueia a chamada principal
    console.warn("[fewshot] obter_fewshot_exemplos falhou:", err);
  }

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
      systemPrompt: systemPromptFinal,
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

  // 7b. Se faz parte de experimento, registra o evento (sem evento_sucesso ainda
  // — ele vem depois quando UI chama registrar_evento_experimento ao usuário aceitar/copiar)
  if (experimentInfo && invocationId) {
    supabase.from("ai_experiment_events").insert({
      experiment_id: experimentInfo.experimentId,
      invocation_id: invocationId,
      variant: experimentInfo.variant,
    }).then(() => {}, (err: unknown) => console.warn("[ab-test] insert event:", err));
  }

  if (status !== "sucesso") {
    return { ok: false, texto: "", invocationId, custoUsd, latenciaMs, erro: erroMsg ?? undefined };
  }

  // 7.5. Registra usage para cobrança de overage (best-effort, não bloqueia)
  supabase.rpc("registrar_ai_usage", { _org: orgId, _feature_codigo: input.feature })
    .then(() => {})
    .then(undefined, (err: unknown) => {
      console.warn("[ai_usage] registrar_ai_usage falhou:", err);
    });

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

  // 1.5 Idioma da org (pra escolher prompt + reforço de instrução)
  const { data: orgRow } = await supabase
    .from("organizacoes")
    .select("idioma_padrao")
    .eq("id", orgId)
    .maybeSingle();
  const idiomaOrg = (orgRow as any)?.idioma_padrao ?? "pt-BR";

  // 2. Carrega prompts e ranqueia por (org, idioma)
  const { data: promptRows } = await supabase
    .from("ai_prompts")
    .select("*")
    .eq("feature_codigo", input.feature)
    .eq("ativo", true)
    .or(`organizacao_id.eq.${orgId},organizacao_id.is.null`);
  const prompts = (promptRows ?? []) as AiPrompt[];
  function rankPromptSys(p: AiPrompt): number {
    const isOrg = p.organizacao_id === orgId;
    const matchIdioma = (p as any).idioma === idiomaOrg;
    const matchPtBR = (p as any).idioma === "pt-BR";
    if (isOrg && matchIdioma) return 4;
    if (isOrg && matchPtBR) return 3;
    if (!isOrg && matchIdioma) return 2;
    if (!isOrg && matchPtBR) return 1;
    return 0;
  }
  const prompt = prompts.slice().sort((a, b) => rankPromptSys(b) - rankPromptSys(a))[0];
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

  // 4. Renderiza e chama (com {{idioma}} injetado nas vars + suffix de idioma no system)
  const varsComIdiomaSys = { idioma: idiomaOrg, locale: idiomaOrg, ...input.vars };
  const userPrompt = renderTemplate(prompt.user_template, varsComIdiomaSys);
  const idiomaInstrucaoSys = idiomaOrg === "en-US"
    ? "\n\nIMPORTANT: Respond in English (en-US)."
    : idiomaOrg === "pt-BR"
    ? "\n\nIMPORTANTE: Responda em Português do Brasil (pt-BR)."
    : `\n\nIMPORTANT: Respond in ${idiomaOrg}.`;
  const systemPromptSys = (prompt.system_prompt ?? "") + idiomaInstrucaoSys;
  let texto = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let latenciaMs = 0;

  try {
    const result = await adapter.call({
      apiKey,
      baseUrl: provider.base_url ?? undefined,
      modelo: feature.modelo,
      systemPrompt: systemPromptSys,
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

  // Registra usage pra cobrança de overage (best-effort)
  supabase.rpc("registrar_ai_usage", { _org: orgId, _feature_codigo: input.feature })
    .then(() => {})
    .then(undefined, (err: unknown) => {
      console.warn("[ai_usage] registrar_ai_usage (system) falhou:", err);
    });

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
