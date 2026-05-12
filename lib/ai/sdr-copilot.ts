"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

/**
 * AI SDR Copilot: gera mensagem personalizada pra um lead via OpenAI.
 *
 * Contexto usado:
 *   - dados do lead (nome, empresa, cargo, dor, segmento)
 *   - histórico recente (último toque, NPS se tiver, observações)
 *   - ICP fit (se calculado)
 *   - objetivo da mensagem (abertura, follow-up, etc.)
 *
 * Persiste em lead_ai_mensagem pra histórico + tracking de uso/custo.
 */
export type Objetivo =
  | "abertura"
  | "follow_up_apos_silencio"
  | "reengajar_detrator"
  | "pedido_indicacao"
  | "reativacao_perdido"
  | "expansao";

export type Canal = "email" | "whatsapp" | "linkedin";

interface GerarInput {
  lead_id: number;
  canal: Canal;
  objetivo: Objetivo;
  tom?: "formal" | "amigavel" | "consultivo";
  instrucoes_extra?: string;
}

interface GerarResult {
  assunto?: string;
  corpo: string;
  contexto_usado: string[];
  custo_tokens: number;
  mensagem_id: number;
}

const OBJETIVO_LABEL: Record<Objetivo, string> = {
  abertura: "primeira mensagem (cold outbound)",
  follow_up_apos_silencio: "follow-up após silêncio do lead",
  reengajar_detrator: "reengajar um cliente que respondeu NPS baixo",
  pedido_indicacao: "pedir indicação a um cliente fechado",
  reativacao_perdido: "reativar lead que estava perdido",
  expansao: "propor expansão (upsell/cross-sell) pra cliente atual",
};

export async function gerarMensagemSdr(input: GerarInput): Promise<GerarResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Carrega lead + contexto (últimos eventos, NPS, etc)
  const { data: lead } = await supabase
    .from("leads")
    .select(`
      id, organizacao_id, nome, empresa, cargo, email, whatsapp, linkedin,
      segmento, dor_principal, observacoes, crm_stage, score_total,
      score_icp_fit, data_ultimo_toque, proxima_acao, valor_potencial
    `)
    .eq("id", input.lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (!lead) throw new Error("Lead não encontrado.");

  // Última NPS (se for cliente)
  const { data: nps } = await supabase
    .from("nps_responses")
    .select("score, comentario, respondido_em")
    .eq("lead_id", input.lead_id)
    .not("score", "is", null)
    .order("respondido_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Vendedor (assinatura)
  const { data: vendedor } = user
    ? await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
    : { data: null };

  // Org name
  const { data: org } = await supabase.from("organizacoes").select("nome").eq("id", orgId).maybeSingle();

  const contextoUsado: string[] = [];
  if (lead.nome) contextoUsado.push("nome");
  if (lead.empresa) contextoUsado.push("empresa");
  if (lead.cargo) contextoUsado.push("cargo");
  if (lead.dor_principal) contextoUsado.push("dor");
  if (lead.segmento) contextoUsado.push("segmento");
  if (lead.score_icp_fit != null) contextoUsado.push("ICP fit score");
  if (nps?.score != null) contextoUsado.push("NPS");

  const tom = input.tom ?? "consultivo";

  // System prompt
  const systemPrompt = `Você é um SDR brasileiro experiente da empresa "${(org as any)?.nome ?? "nossa empresa"}". Escreva mensagens curtas, diretas, sem clichês ("espero que esteja bem", "vim por meio desta"). Use ${tom === "amigavel" ? "linguagem casual e calorosa" : tom === "formal" ? "linguagem formal" : "linguagem consultiva e profissional"}. Tom de quem entende do problema do prospect, não de quem está pedindo favor. Português brasileiro. Sem emojis salvo se canal=whatsapp.`;

  // User prompt com contexto
  const userPrompt = [
    `Objetivo: ${OBJETIVO_LABEL[input.objetivo]}.`,
    `Canal: ${input.canal}.`,
    "",
    "Dados do lead:",
    lead.nome ? `- Nome: ${lead.nome}` : null,
    lead.empresa ? `- Empresa: ${lead.empresa}` : null,
    lead.cargo ? `- Cargo: ${lead.cargo}` : null,
    lead.segmento ? `- Segmento: ${lead.segmento}` : null,
    lead.dor_principal ? `- Dor anotada: ${lead.dor_principal}` : null,
    lead.crm_stage ? `- Etapa atual: ${lead.crm_stage}` : null,
    nps?.score != null ? `- Último NPS: ${nps.score}/10${nps.comentario ? ` ("${nps.comentario}")` : ""}` : null,
    lead.observacoes ? `- Observações: ${lead.observacoes.slice(0, 500)}` : null,
    "",
    input.instrucoes_extra ? `Instruções adicionais: ${input.instrucoes_extra}` : null,
    "",
    "Formato de resposta JSON estrito:",
    input.canal === "email"
      ? `{"assunto": "...", "corpo": "..."}`
      : `{"corpo": "..."}`,
    "",
    "Regras:",
    "- Mensagem curta. Email: 80-120 palavras máx. WhatsApp/LinkedIn: 50-80 palavras.",
    "- Personalização real (não 'percebi que sua empresa tem cara de inovação').",
    `- Termine com call-to-action específica${input.canal === "email" ? " no PS se fizer sentido" : ""}.`,
    vendedor?.display_name ? `- Assine como "${vendedor.display_name}"` : null,
    "- Variáveis dinâmicas: use os dados acima diretamente, não placeholders {{}}.",
  ].filter(Boolean).join("\n");

  // Chama OpenAI
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const erro = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${erro.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta IA vazia.");

  let parsed: { assunto?: string; corpo: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { corpo: content };
  }

  if (!parsed.corpo) throw new Error("IA não retornou corpo de mensagem.");

  const totalTokens = data?.usage?.total_tokens ?? 0;

  // Persiste
  const { data: msgRow, error: msgErr } = await supabase
    .from("lead_ai_mensagem")
    .insert({
      organizacao_id: orgId,
      lead_id: input.lead_id,
      criado_por: user?.id ?? null,
      canal: input.canal,
      objetivo: input.objetivo,
      assunto: parsed.assunto ?? null,
      corpo: parsed.corpo,
      contexto_usado: {
        campos: contextoUsado,
        nps_score: nps?.score ?? null,
        score_icp: lead.score_icp_fit ?? null,
      },
      modelo_ia: "gpt-4o-mini",
      custo_tokens: totalTokens,
    })
    .select("id")
    .single();

  if (msgErr || !msgRow) throw new Error(msgErr?.message ?? "Falha ao persistir mensagem.");

  return {
    assunto: parsed.assunto,
    corpo: parsed.corpo,
    contexto_usado: contextoUsado,
    custo_tokens: totalTokens,
    mensagem_id: msgRow.id,
  };
}

export async function marcarMensagemCopiada(mensagem_id: number) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();
  await supabase
    .from("lead_ai_mensagem")
    .update({ copiado: true })
    .eq("id", mensagem_id)
    .eq("organizacao_id", orgId);
}

export async function marcarMensagemEnviada(mensagem_id: number) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();
  await supabase
    .from("lead_ai_mensagem")
    .update({ enviado: true, copiado: true })
    .eq("id", mensagem_id)
    .eq("organizacao_id", orgId);
}
