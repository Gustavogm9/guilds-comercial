"use server";

import { invokeAI } from "@/lib/ai/dispatcher";

export async function gerarBriefingPreCall(input: {
  leadId: number;
  empresa?: string;
  nome?: string;
  segmento?: string;
  dorPrincipal?: string;
  observacoes?: string;
}) {
  const result = await invokeAI({
    feature: "briefing_pre_call",
    leadId: input.leadId,
    vars: {
      empresa: input.empresa ?? "não informado",
      nome: input.nome ?? "não informado",
      segmento: input.segmento ?? "não informado",
      dorPrincipal: input.dorPrincipal ?? "não informado",
      observacoes: input.observacoes ?? "",
    },
  });

  return {
    ok: result.ok,
    texto: result.texto,
    erro: result.erro,
    invocationId: result.invocationId,
  };
}
