"use server";

/**
 * Pipeline de áudio: Whisper transcreve, GPT analisa.
 *
 * Usado por:
 *   - Voice notes do vendedor (registro rápido)
 *   - Análise de chamadas gravadas (Gong-like)
 *
 * Custos OpenAI:
 *   - Whisper: $0.006/min audio
 *   - GPT-4o-mini análise: ~$0.0002 por chamada típica
 *   Total: ~$0.01 por ligação de 10min. Aceitável.
 */

const OPENAI_KEY = process.env.OPENAI_API_KEY!;

export async function transcreverAudio(audioUrl: string): Promise<{
  transcricao: string;
  duracao_seg?: number;
  custo_usd: number;
}> {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY ausente.");

  // Whisper aceita até 25MB. Pra arquivos públicos: download local.
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) });
  if (!audioRes.ok) throw new Error(`Falha download áudio: ${audioRes.status}`);
  const blob = await audioRes.blob();

  const formData = new FormData();
  formData.append("file", blob, "audio.mp3");
  formData.append("model", "whisper-1");
  formData.append("language", "pt");
  formData.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const erro = await res.text().catch(() => "");
    throw new Error(`Whisper ${res.status}: ${erro.slice(0, 200)}`);
  }

  const data = await res.json();
  const duracao = data?.duration ?? 0;
  const custo_usd = (duracao / 60) * 0.006;

  return {
    transcricao: data.text ?? "",
    duracao_seg: Math.round(duracao),
    custo_usd: Number(custo_usd.toFixed(4)),
  };
}

interface AnaliseChamadaResult {
  resumo: string;
  pontos_chave: string[];
  objecoes: string[];
  proximas_acoes: string[];
  sentimento: "positivo" | "neutro" | "negativo";
  nivel_interesse: "quente" | "morno" | "frio";
  custo_usd: number;
}

export async function analisarChamada(transcricao: string, contextoLead?: string): Promise<AnaliseChamadaResult> {
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY ausente.");
  if (!transcricao.trim()) throw new Error("Transcrição vazia.");

  const systemPrompt = "Você analisa transcrições de ligações comerciais B2B em português brasileiro. Extrai sinais úteis pro vendedor agir. Retorna JSON estrito.";

  const userPrompt = [
    contextoLead ? `Contexto do lead: ${contextoLead}\n` : "",
    "Transcrição:",
    transcricao.slice(0, 8000),
    "",
    "Retorne JSON com:",
    "- resumo: 2-3 frases curtas do que aconteceu",
    "- pontos_chave: array até 5 strings com sinais críticos",
    "- objecoes: array de objeções levantadas pelo prospect",
    "- proximas_acoes: array do que o vendedor deve fazer (verbos no infinitivo)",
    "- sentimento: 'positivo' | 'neutro' | 'negativo'",
    "- nivel_interesse: 'quente' | 'morno' | 'frio'",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const erro = await res.text().catch(() => "");
    throw new Error(`GPT ${res.status}: ${erro.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta IA vazia.");
  const parsed = JSON.parse(content);

  // GPT-4o-mini: $0.15/1M input + $0.60/1M output. Estimativa ~$0.0002 por análise.
  const totalTokens = data?.usage?.total_tokens ?? 0;
  const custo_usd = Number(((totalTokens / 1_000_000) * 0.5).toFixed(4));

  return {
    resumo: parsed.resumo ?? "",
    pontos_chave: Array.isArray(parsed.pontos_chave) ? parsed.pontos_chave.slice(0, 8) : [],
    objecoes: Array.isArray(parsed.objecoes) ? parsed.objecoes.slice(0, 5) : [],
    proximas_acoes: Array.isArray(parsed.proximas_acoes) ? parsed.proximas_acoes.slice(0, 5) : [],
    sentimento: ["positivo", "neutro", "negativo"].includes(parsed.sentimento) ? parsed.sentimento : "neutro",
    nivel_interesse: ["quente", "morno", "frio"].includes(parsed.nivel_interesse) ? parsed.nivel_interesse : "morno",
    custo_usd,
  };
}

export async function processarVoiceNota(audioUrl: string, contextoLead?: string): Promise<{
  transcricao: string;
  resumo: string;
  acoes_extraidas: string[];
  custo_usd: number;
}> {
  const tr = await transcreverAudio(audioUrl);

  if (!tr.transcricao.trim()) {
    return { transcricao: "", resumo: "Áudio sem voz detectável.", acoes_extraidas: [], custo_usd: tr.custo_usd };
  }

  // Análise curta — voice note é registro rápido (não ligação completa)
  const systemPrompt = "Você processa notas de voz curtas de vendedores. Extrai resumo de 1 frase e ações TODO. Retorna JSON.";
  const userPrompt = [
    contextoLead ? `Lead: ${contextoLead}\n` : "",
    "Áudio do vendedor (transcrito):",
    tr.transcricao.slice(0, 3000),
    "",
    "JSON com: resumo (1 frase) + acoes_extraidas (array de verbos no infinitivo).",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    return { transcricao: tr.transcricao, resumo: tr.transcricao.slice(0, 200), acoes_extraidas: [], custo_usd: tr.custo_usd };
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = content ? JSON.parse(content) : {};

  const custoTotal = tr.custo_usd + Number((((data?.usage?.total_tokens ?? 0) / 1_000_000) * 0.5).toFixed(4));

  return {
    transcricao: tr.transcricao,
    resumo: parsed.resumo ?? tr.transcricao.slice(0, 200),
    acoes_extraidas: Array.isArray(parsed.acoes_extraidas) ? parsed.acoes_extraidas.slice(0, 5) : [],
    custo_usd: custoTotal,
  };
}
