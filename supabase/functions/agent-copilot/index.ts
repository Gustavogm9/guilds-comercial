// ==============================================================================
// agent-copilot — Edge Function do Agente Conversacional (Guilds Comercial)
// ==============================================================================
// Cérebro do Copilot. 
// Loop de raciocínio: Maestro define o especialista -> Especialista chama tools -> Tools retornam dados -> Especialista monta resposta.
// ==============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { TOOLS, getToolSchemasForGemini, getToolsForAgent, makeContext } from "./tools.ts";

// Configurações e Variáveis de Ambiente
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_TOOL_LOOPS = 6;
const HISTORY_LIMIT = 15;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Adicionando um fallback cors headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o Copilot Operacional do Guilds — sistema de gestão para times comerciais e vendas.

Você ajuda o gestor comercial e o SDR a OPERAR o sistema conversando: criar contatos, buscar leads, registrar interações na timeline e agendar cadências de retorno.
Você é direto, prático, e fala português brasileiro natural.

PRINCÍPIOS:
- SEMPRE chame ferramentas (tools) para BUSCAR ou ALTERAR dados. Nunca invente fatos.
- Para AÇÕES DESTRUTIVAS ou que CRIAM dados, você pode chamar a tool diretamente SE o plano do Maestro permitir, ou confirme com o usuário se faltar contexto.
- Para LEITURA (listar, buscar, resumir), pode chamar a tool direto.
- Nunca exponha IDs, UUIDs ou tokens — use sempre o nome do contato/empresa.
- AUTOCORREÇÃO (Graceful Degradation): Se uma tool falhar e retornar um erro, NÃO desista. Leia o erro. Se for erro de formato, conserte e chame a tool de novo. Se faltar um dado, pergunte ao usuário.
- Lembre-se que você só atua nos dados da organização atual do usuário.

RACIOCÍNIO ATIVO:
- O Maestro (seu coordenador) vai te passar um Plano de Ação. Siga os passos sequencialmente.
- Sinta-se livre para chamar múltiplas tools em um único turno se o plano assim demandar.`;

// ─────────────────────────────────────────────────────────────────

async function loadHistory(user_id: string, channel: string, sessionId: string | null) {
  const { data } = await supabase
    .from("agent_conversations")
    .select("role, content, tool_call, tool_response")
    .eq("user_id", user_id)
    .eq("channel", channel)
    .eq("channel_session_id", sessionId || "")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const messages = (data || []).reverse();
  const contents: any[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content || "" }] });
    } else if (m.role === "model") {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.tool_call) parts.push({ functionCall: m.tool_call });
      if (parts.length) contents.push({ role: "model", parts });
    } else if (m.role === "tool") {
      contents.push({
        role: "function",
        parts: [{ functionResponse: { name: (m.tool_response as any)?.name || "unknown", response: m.tool_response } }],
      });
    }
  }
  return contents;
}

async function persistMessage(params: any) {
  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({
      user_id: params.user_id,
      organizacao_id: params.organization_id,
      channel: params.channel,
      channel_session_id: params.channel_session_id,
      role: params.role,
      content: params.content ?? null,
      tool_call: params.tool_call ?? null,
      tool_response: params.tool_response ?? null,
      tokens_in: params.tokens_in ?? null,
      tokens_out: params.tokens_out ?? null,
    })
    .select("id")
    .single();
  if (error) console.error("[agent-copilot] persistMessage error", error.message);
  return data?.id ?? null;
}

async function logAction(params: any) {
  await supabase.from("agent_actions").insert({
    user_id: params.user_id,
    organizacao_id: params.organization_id,
    conversation_id: params.conversation_id,
    channel: params.channel,
    tool_name: params.tool_name,
    tool_arguments: params.tool_arguments,
    result_summary: params.result_summary,
    success: params.success,
    error_message: params.error_message ?? null,
    latency_ms: params.latency_ms,
  });
}

// Fase 1: Maestro (Planejador e Roteador)
async function callMaestro(history: any[], lastUserMessage: any[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const maestroPrompt = `Você é o MAESTRO do Guilds Comercial. Leia a mensagem atual do usuário e o histórico, e decida QUAL especialista vai atendê-lo e QUAL o plano de ação.
  
ESPECIALISTAS DISPONÍVEIS:
- AGENT_CRM: Lida com pipeline de vendas, criação de leads, agendamento de tarefas/cadência e timeline.
- AGENT_PROSPECCAO: Lida com campanhas em massa (motor de inteligência lookalike).
- AGENT_PORTFOLIO: Lida com listar produtos, gerenciar propostas e ICP.
- AGENT_FLYWHEEL: Lida com indicações, embaixadores e recompensas.
- AGENT_ADMINISTRATIVO: Lida com webhooks, chaves de API, health score e convites.
- AGENT_UNIVERSAL: Assuntos genéricos ou comandos que cruzam domínios de forma inseparável.

SEU PAPEL:
Pense silenciosamente sobre TODOS os passos. Formate ESTRITAMENTE como JSON, sem marcações markdown:
{
  "agente": "NOME_DO_AGENTE",
  "plano": "1. Passo... 2. Passo..."
}`;

  const contents = [...history, { role: "user", parts: lastUserMessage }];
  const body = {
    contents,
    systemInstruction: { parts: [{ text: maestroPrompt }] },
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
  };

  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error("Maestro failed");
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const usage = data.usageMetadata || {};
    const parsed = JSON.parse(text);
    return {
      agent: parsed.agente || "AGENT_UNIVERSAL",
      plan: parsed.plano || "",
      tokens_in: usage.promptTokenCount || 0,
      tokens_out: usage.candidatesTokenCount || 0,
    };
  } catch (e) {
    console.error("[Maestro] Falhou, fallback para Universal", e);
    return { agent: "AGENT_UNIVERSAL", plan: "", tokens_in: 0, tokens_out: 0 };
  }
}

async function callGemini(contents: any[], agentType: string, plan: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  let agentPrompt = SYSTEM_PROMPT;
  if (plan) {
    agentPrompt += `\n\n[INSTRUÇÃO DO MAESTRO]\nVocê é o agente: ${agentType}\nExecute rigorosamente este Plano de Ação definido pelo Maestro:\n${plan}`;
  }

  const toolsToUse = getToolSchemasForGemini(agentType);

  const body = {
    contents,
    systemInstruction: { parts: [{ text: agentPrompt }] },
    tools: toolsToUse.length > 0 ? [{ functionDeclarations: toolsToUse }] : undefined,
    generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini Error: ${await res.text()}`);
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const usage = data.usageMetadata || {};
  return {
    parts: candidate?.content?.parts || [],
    tokens_in: usage.promptTokenCount || 0,
    tokens_out: usage.candidatesTokenCount || 0,
  };
}

async function resolveUserContext(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: orgData } = await supabase.from("membros_organizacao").select("organizacao_id").eq("user_id", data.user.id).limit(1).single();
  return {
    user_id: data.user.id,
    organization_id: orgData?.organizacao_id || null,
  };
}

// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const token = authHeader.slice(7);
    const userCtx = await resolveUserContext(token);
    if (!userCtx) return new Response(JSON.stringify({ error: "Unauthorized or missing org" }), { status: 401, headers: corsHeaders });

    const body = await req.json();
    const userMessage = body.message?.trim() || "";
    const channel = body.channel || "in_app";
    const sessionId = body.channel_session_id || null;

    if (!userMessage) return new Response(JSON.stringify({ error: "Empty message" }), { status: 400, headers: corsHeaders });

    // Persiste a mensagem do usuário
    await persistMessage({
      user_id: userCtx.user_id,
      organization_id: userCtx.organization_id,
      channel,
      channel_session_id: sessionId,
      role: "user",
      content: userMessage,
    });

    const userParts = [{ text: userMessage }];
    const history = await loadHistory(userCtx.user_id, channel, sessionId);

    // Chama o Maestro
    const maestroRes = await callMaestro(history, userParts);
    let totalTokensIn = maestroRes.tokens_in;
    let totalTokensOut = maestroRes.tokens_out;
    const { agent, plan } = maestroRes;

    history.push({ role: "user", parts: userParts });

    const ctx = makeContext(supabase, {
      user_id: userCtx.user_id,
      organization_id: userCtx.organization_id,
      channel,
    });

    let assistantText = "";

    // Loop de Tool Execution
    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
      const { parts, tokens_in, tokens_out } = await callGemini(history, agent, plan);
      totalTokensIn += tokens_in;
      totalTokensOut += tokens_out;

      const fnCallPart = parts.find((p: any) => p.functionCall);
      const textPart = parts.find((p: any) => p.text);

      if (!fnCallPart) {
        // Resposta final
        assistantText = textPart?.text || "...";
        await persistMessage({
          user_id: userCtx.user_id,
          organization_id: userCtx.organization_id,
          channel,
          channel_session_id: sessionId,
          role: "model",
          content: assistantText,
          tokens_in,
          tokens_out,
        });
        break;
      }

      const modelMsgId = await persistMessage({
        user_id: userCtx.user_id,
        organization_id: userCtx.organization_id,
        channel,
        channel_session_id: sessionId,
        role: "model",
        content: textPart?.text || null,
        tool_call: fnCallPart.functionCall,
        tokens_in,
        tokens_out,
      });

      history.push({ role: "model", parts });

      const fnName = fnCallPart.functionCall.name;
      const fnArgs = fnCallPart.functionCall.args || {};
      const tool = getToolsForAgent(agent)[fnName];

      let result: any;
      let toolError: string | null = null;
      const startedAt = Date.now();

      if (!tool) {
        toolError = `Tool não encontrada: ${fnName}`;
        result = { ok: false, error: toolError };
      } else {
        try {
          result = await tool.execute(fnArgs, ctx);
        } catch (e: any) {
          toolError = e.message;
          result = { ok: false, error: toolError };
        }
      }

      await logAction({
        user_id: userCtx.user_id,
        organization_id: userCtx.organization_id,
        conversation_id: modelMsgId,
        channel,
        tool_name: fnName,
        tool_arguments: fnArgs,
        result_summary: typeof result === "object" ? JSON.stringify(result).slice(0, 280) : String(result).slice(0, 280),
        success: !toolError,
        error_message: toolError,
        latency_ms: Date.now() - startedAt,
      });

      await persistMessage({
        user_id: userCtx.user_id,
        organization_id: userCtx.organization_id,
        channel,
        channel_session_id: sessionId,
        role: "tool",
        tool_response: { name: fnName, ...result },
      });

      history.push({
        role: "function",
        parts: [{ functionResponse: { name: fnName, response: result } }],
      });
    }

    if (!assistantText) assistantText = "Desculpe, a operação falhou ou não pude completá-la. Tente de novo?";

    return new Response(
      JSON.stringify({ ok: true, reply: assistantText, tokens_in: totalTokensIn, tokens_out: totalTokensOut }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[agent-copilot] FATAL", err);
    return new Response(JSON.stringify({ error: "Internal error", message: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
