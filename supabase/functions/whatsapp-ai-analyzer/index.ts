// ===========================================================================
// EDGE FUNCTION — whatsapp-ai-analyzer
// ---------------------------------------------------------------------------
// Analisa conversas WhatsApp importadas usando IA (Gemini 2.0 Flash).
//
// Chamado de:
//   - POST /api/leads/[id]/whatsapp (import, background)
//   - Manualmente via Dashboard Supabase para re-análise
//
// Variáveis de ambiente:
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   GOOGLE_AI_API_KEY         (Gemini)
//   APP_URL                   (para callback)
// ===========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_API_KEY") ?? Deno.env.get("GOOGLE_AI_KEY") ?? "";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

async function chamarGemini(prompt: string): Promise<string> {
  const resp = await fetch(`${GEMINI_URL}?key=${GOOGLE_AI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const conversaId = body.conversa_id;
    const leadId = body.lead_id;

    if (!conversaId) {
      // Modo batch: processa todas conversas sem análise
      return await processarBatch();
    }

    return await analisarConversa(conversaId, leadId);
  } catch (err) {
    console.error("[whatsapp-ai-analyzer] erro:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function analisarConversa(conversaId: number, leadId?: number): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Busca conversa
  const { data: conversa } = await supabase
    .from("whatsapp_conversas")
    .select("id, organizacao_id, lead_id, contato_nome, total_msgs, primeira_msg, ultima_msg, resumo_ia")
    .eq("id", conversaId)
    .maybeSingle();

  if (!conversa) return resp({ ok: false, erro: "Conversa não encontrada" }, 404);
  if (conversa.resumo_ia) return resp({ ok: true, ja_analisada: true });

  const lId = conversa.lead_id ?? leadId;

  // Busca lead
  const { data: lead } = lId
    ? await supabase.from("leads").select("empresa, nome").eq("id", lId).maybeSingle()
    : { data: null };

  // Amostra de mensagens (últimas 150 com texto)
  const { data: msgs } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, eh_vendedor, conteudo, enviada_em")
    .eq("conversa_id", conversaId)
    .not("conteudo", "is", null)
    .order("enviada_em", { ascending: false })
    .limit(150);

  if (!msgs?.length) return resp({ ok: false, erro: "Sem mensagens de texto" }, 400);

  const amostra = msgs.reverse().map(m => {
    const prefix = m.eh_vendedor ? "Vendedor" : (conversa.contato_nome ?? "Lead");
    const dt = new Date(m.enviada_em);
    const hora = `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
    return `[${hora}] ${prefix}: ${m.conteudo}`;
  }).join("\n");

  const primeira = conversa.primeira_msg ? new Date(conversa.primeira_msg).toLocaleDateString("pt-BR") : "?";
  const ultima = conversa.ultima_msg ? new Date(conversa.ultima_msg).toLocaleDateString("pt-BR") : "?";

  const prompt = `Analise a seguinte conversa de WhatsApp entre Vendedor e o lead ${conversa.contato_nome ?? "Lead"} (empresa: ${lead?.empresa ?? lead?.nome ?? "N/A"}).

Total de mensagens: ${conversa.total_msgs}
Período: ${primeira} a ${ultima}
Amostra (últimas ${msgs.length} mensagens com texto):

${amostra}

Responda SOMENTE em JSON válido (sem markdown, sem blocos de código):
{
  "resumo": "resumo em 2-3 frases objetivas do que foi discutido",
  "sentimento": "positivo|neutro|negativo",
  "nivel_interesse": 7,
  "pontos_chave": ["ponto 1", "ponto 2"],
  "proxima_acao_sugerida": "ação recomendada",
  "sinais_compra": ["sinal 1"],
  "objecoes": ["objeção 1"]
}`;

  if (!GOOGLE_AI_KEY) {
    console.warn("[whatsapp-ai-analyzer] GOOGLE_AI_API_KEY não configurada");
    return resp({ ok: false, erro: "IA não configurada" }, 500);
  }

  let textoIA = await chamarGemini(prompt);

  // Remove possível markdown
  textoIA = textoIA.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

  let analise: any = {};
  try { analise = JSON.parse(textoIA); } catch { analise = { resumo: textoIA }; }

  const sentimentoValido = ["positivo", "neutro", "negativo"].includes(analise.sentimento) ? analise.sentimento : "neutro";

  // Atualiza conversa
  await supabase.from("whatsapp_conversas").update({
    resumo_ia: analise.resumo ?? null,
    sentimento: sentimentoValido,
    nivel_interesse: analise.nivel_interesse ?? null,
    pontos_chave: [
      ...(analise.pontos_chave ?? []),
      ...(analise.sinais_compra ?? []),
      ...(analise.objecoes ?? []),
    ],
  }).eq("id", conversaId);

  // Atualiza timeline
  await supabase.from("lead_timeline")
    .update({ resumo_ia: analise.resumo ?? null })
    .eq("ref_id", conversaId)
    .eq("ref_tabela", "whatsapp_conversas")
    .eq("tipo", "whatsapp_importado");

  // Sugere próxima ação na timeline
  if (analise.proxima_acao_sugerida && lId) {
    await supabase.from("lead_timeline").insert({
      organizacao_id: conversa.organizacao_id,
      lead_id: lId,
      tipo: "sistema",
      titulo: "Próxima ação sugerida pela IA (WhatsApp)",
      conteudo: analise.proxima_acao_sugerida,
      metadata: { source: "whatsapp-ai-analyzer", conversa_id: conversaId },
    });
  }

  return resp({ ok: true, resumo: analise.resumo, sentimento: sentimentoValido, nivel_interesse: analise.nivel_interesse, pontos_chave: analise.pontos_chave });
}

async function processarBatch(): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Busca conversas sem análise (máx 10 por execução)
  const { data: pendentes } = await supabase
    .from("whatsapp_conversas")
    .select("id, lead_id")
    .is("resumo_ia", null)
    .gt("total_msgs", 0)
    .order("created_at", { ascending: true })
    .limit(10);

  if (!pendentes?.length) return resp({ ok: true, processadas: 0 });

  let processadas = 0;
  for (const c of pendentes) {
    try {
      const r = await analisarConversa(c.id, c.lead_id ?? undefined);
      if (r.status < 400) processadas++;
    } catch (e) {
      console.error(`[batch] erro conversa ${c.id}:`, e);
    }
  }

  return resp({ ok: true, processadas, total_pendentes: pendentes.length });
}

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
