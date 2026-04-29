"use server";

import { invokeAI } from "@/lib/ai/dispatcher";

/**
 * Processa transcrição de ligação via IA (feature `extrair_ligacao`, JSON mode).
 *
 * Retorna `{ data, invocationId }` em sucesso ou `{ error }` em falha.
 * `invocationId` permite plugar `<AiOutputActions>` na UI pra alimentar o
 * ciclo de auto-evolução (marcar como exemplo, copiar, feedback A/B).
 */
export async function processarLigacaoAIAcion(orgId: string, transcricaoBruta: string) {
  try {
    const aiOutput = await invokeAI({
      feature: "extrair_ligacao",
      vars: {
        transcricao: transcricaoBruta
      },
      outputMode: "json",
    });

    if (!aiOutput.ok) {
      return { error: aiOutput.erro || "Erro ao processar ligação com IA." };
    }

    let data = aiOutput.parsed as any;

    // Fallback caso o JSON parseado não tenha a estrutura esperada
    if (!data || !data.resumo) {
      data = {
        resumo: aiOutput.texto,
        objecoes: [],
        proximos_passos: ["Revisar anotações manualmente"],
        probabilidade_fechamento: 50,
        sentimento: "neutro"
      };
    }

    return { data, invocationId: aiOutput.invocationId };
  } catch (err: any) {
    return { error: err.message || "Erro ao processar ligação com IA." };
  }
}
