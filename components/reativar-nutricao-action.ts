"use server";

import { invokeAI } from "@/lib/ai/dispatcher";

export async function reativarNutricaoAction(input: {
  leadId: number;
  empresa?: string;
  nome?: string;
  segmento?: string;
  motivo?: string;
}) {
  const result = await invokeAI({
    feature: "reativar_nutricao",
    leadId: input.leadId,
    vars: {
      empresa: input.empresa ?? "não informado",
      nome: input.nome ?? "não informado",
      segmento: input.segmento ?? "não informado",
      motivoPerda: input.motivo ?? "sem motivo registrado",
    },
  });

  return {
    ok: result.ok,
    texto: result.texto,
    erro: result.erro,
    invocationId: result.invocationId,
  };
}
