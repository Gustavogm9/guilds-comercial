import type { ProviderAdapter, ProviderCallInput, ProviderCallResult } from "./types";
import { ProviderError } from "./types";

/**
 * Adapter Google Gemini.
 * Usa endpoint /v1beta/models/{model}:generateContent com key na query string.
 */
export const googleAdapter: ProviderAdapter = {
  codigo: "google",
  nome: "Google",

  async call(input: ProviderCallInput): Promise<ProviderCallResult> {
    const base = input.baseUrl ?? "https://generativelanguage.googleapis.com";
    const url = `${base}/v1beta/models/${input.modelo}:generateContent?key=${input.apiKey}`;
    const timeoutMs = input.timeoutMs ?? 30000;

    const body = {
      systemInstruction: input.systemPrompt
        ? { role: "system", parts: [{ text: input.systemPrompt }] }
        : undefined,
      contents: [
        { role: "user", parts: [{ text: input.userPrompt }] },
      ],
      generationConfig: {
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new ProviderError("google", res.status, `Google ${res.status}: ${errBody.slice(0, 400)}`);
      }

      const json = await res.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
        usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
      };

      const texto = json.candidates[0]?.content?.parts
        .map((p) => p.text ?? "")
        .join("") ?? "";

      return {
        texto,
        tokensInput: json.usageMetadata.promptTokenCount,
        tokensOutput: json.usageMetadata.candidatesTokenCount,
        latenciaMs: Date.now() - started,
        modeloUsado: input.modelo,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
