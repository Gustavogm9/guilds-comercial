/**
 * Interface comum para providers de IA.
 * Cada adapter (Anthropic, OpenAI, Google) implementa essa interface.
 * O dispatcher seleciona o adapter baseado em ai_features.provider_codigo.
 */

export interface ProviderCallInput {
  apiKey: string;
  baseUrl?: string;
  modelo: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
}

export interface ProviderCallResult {
  texto: string;
  tokensInput: number;
  tokensOutput: number;
  latenciaMs: number;
  modeloUsado: string;
}

export interface ProviderAdapter {
  codigo: "anthropic" | "openai" | "google" | "local";
  nome: string;
  call(input: ProviderCallInput): Promise<ProviderCallResult>;
}

export class ProviderError extends Error {
  constructor(
    public readonly providerCodigo: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
