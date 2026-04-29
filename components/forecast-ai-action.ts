"use server";

import { invokeAI } from "@/lib/ai/dispatcher";

export async function forecastMLAction(input: {
  forecastBest: number;
  forecastLikely: number;
  forecastWorst: number;
  leadsAtivos: number;
  leadsAltos: number;
}) {
  const result = await invokeAI({
    feature: "forecast_ml",
    vars: {
      forecastOtimista: input.forecastBest,
      forecastProvavel: input.forecastLikely,
      forecastPessimista: input.forecastWorst,
      leadsAtivos: input.leadsAtivos,
      leadsScoreAlto: input.leadsAltos,
    },
  });

  return {
    ok: result.ok,
    texto: result.texto,
    erro: result.erro,
    invocationId: result.invocationId,
  };
}
