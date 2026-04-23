import type { ProviderAdapter, ProviderCallInput, ProviderCallResult } from "./types";
import { ProviderError } from "./types";

/**
 * Adapter OpenAI (Chat Completions).
 * Compatível com modelos gpt-4o, gpt-4-turbo, etc.
 */
export const openaiAdapter: ProviderAdapter = {
  codigo: "openai",
  nome: "OpenAI",

  async call(input: ProviderCallInput): Promise<ProviderCallResult> {
    const base = input.baseUrl ?? "https://api.openai.com";
    const url = `${base}/v1/chat/completions`;
    const timeoutMs = input.timeoutMs ?? 30000;

    const messages: Array<{ role: string; content: string }> = [];
    if (input.systemPrompt) {
      messages.push({ role: "system", content: input.systemPrompt });
    }
    messages.push({ role: "user", content: input.userPrompt });

    const body = {
      model: input.modelo,
      messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new ProviderError("openai", res.status, `OpenAI ${res.status}: ${errBody.slice(0, 400)}`);
      }

      const json = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
        model: string;
      };

      return {
        texto: json.choices[0]?.message?.content ?? "",
        tokensInput: json.usage.prompt_tokens,
        tokensOutput: json.usage.completion_tokens,
        latenciaMs: Date.now() - started,
        modeloUsado: json.model,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
