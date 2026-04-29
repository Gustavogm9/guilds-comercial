"use server";

import { invokeAI } from "@/lib/ai/dispatcher";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export async function gerarPropostaAction(input: {
  leadId: number;
  variacao: "conservadora" | "recomendada" | "premium";
}) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, texto: "", erro: "Sem organização" };

  // Buscar contexto do lead
  const { data: lead } = await supabase
    .from("v_leads_enriched")
    .select("empresa, nome, segmento, dor_principal, observacoes, valor_potencial, crm_stage")
    .eq("organizacao_id", orgId)
    .eq("id", input.leadId)
    .maybeSingle();

  if (!lead) return { ok: false, texto: "", erro: "Lead não encontrado" };

  const result = await invokeAI({
    feature: "gerar_proposta",
    leadId: input.leadId,
    outputMode: "texto",
    vars: {
      empresa: lead.empresa ?? "não informado",
      nome: lead.nome ?? "não informado",
      segmento: lead.segmento ?? "não informado",
      dorPrincipal: lead.dor_principal ?? "não informado",
      observacoes: lead.observacoes ?? "",
      valorPotencial: lead.valor_potencial ?? 0,
      variacao: input.variacao,
    },
  });

  return { ok: result.ok, texto: result.texto, erro: result.erro, invocationId: result.invocationId };
}
