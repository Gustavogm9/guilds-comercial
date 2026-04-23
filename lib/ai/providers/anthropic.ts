import type { ProviderAdapter, ProviderCallInput, ProviderCallResult } from "./types";
import { ProviderError } from "./types";

/**
 * Adapter Anthropic (Claude).
 * Usa endpoint /v1/messages com header x-api-key.
 * Parseia usage.input_tokens / output_tokens pra auditoria.
 */
export const anthropicAdapter: ProviderAdapter = {
  codigo: "anthropic",
  nome: "Anthropic",

  async call(input: ProviderCallInput): Promise<ProviderCallResult> {
    const base = input.baseUrl ?? "https://api.anthropic.com";
    const url = `${base}/v1/messages`;
    const timeoutMs = input.timeoutMs ?? 30000;

    const body = {
      model: input.modelo,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      system: input.systemPrompt ?? undefined,
      messages: [
        { role: "user", content: input.userPrompt },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new ProviderError("anthropic", res.status, `Anthropic ${res.status}: ${errBody.slice(0, 400)}`);
      }

      const json = await res.json() as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
        model: string;
      };

      const texto = json.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");

      return {
        texto,
        tokensInput: json.usage.input_tokens,
        tokensOutput: json.usage.output_tokens,
        latenciaMs: Date.now() - started,
        modeloUsado: json.model,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};
