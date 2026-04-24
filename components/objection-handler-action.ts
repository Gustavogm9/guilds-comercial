"use server";

import { invokeAI } from "@/lib/ai/dispatcher";

export async function objectionHandlerAction(input: {
  leadId: number;
  objecao: string;
  empresa?: string;
  segmento?: string;
}) {
  const result = await invokeAI({
    feature: "objection_handler",
    leadId: input.leadId,
    vars: {
      objecao: input.objecao,
      empresa: input.empresa ?? "não informado",
      segmento: input.segmento ?? "não informado",
    },
  });

  return {
    ok: result.ok,
    texto: result.texto,
    erro: result.erro,
  };
}
