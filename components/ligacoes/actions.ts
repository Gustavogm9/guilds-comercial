"use server";

import { invokeAI } from "@/lib/ai/dispatcher";

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
    
    return { data };
  } catch (err: any) {
    return { error: err.message || "Erro ao processar ligação com IA." };
  }
}
