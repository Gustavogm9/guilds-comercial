"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

/**
 * Saldo de crédito de um lead (embaixador).
 *
 * Retorna 0 se nunca recebeu crédito (lead sem rows em lead_credito_movimentos).
 */
export async function consultarSaldoLead(lead_id: number): Promise<{
  saldo: number;
  total_creditos: number;
  total_debitos: number;
  ultimo_movimento_em: string | null;
}> {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  const { data } = await supabase
    .from("v_lead_saldo")
    .select("saldo, total_creditos, total_debitos, ultimo_movimento_em")
    .eq("organizacao_id", orgId)
    .eq("lead_id", lead_id)
    .maybeSingle();

  return {
    saldo: Number(data?.saldo ?? 0),
    total_creditos: Number((data as any)?.total_creditos ?? 0),
    total_debitos: Number((data as any)?.total_debitos ?? 0),
    ultimo_movimento_em: (data as any)?.ultimo_movimento_em ?? null,
  };
}

/**
 * Consome crédito de um lead. Apenas gestor.
 *
 * Usado em renovação/expansão como desconto. Falha se saldo insuficiente.
 * Retorna saldo restante.
 */
export async function consumirCreditoLead(input: {
  lead_id: number;
  valor: number;
  origem: "consumo_renovacao" | "consumo_expansao" | "consumo_outro";
  descricao?: string;
  expansao_id?: number;
}): Promise<{ saldo_restante: number }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores podem consumir crédito.");

  if (!Number.isInteger(input.lead_id) || input.lead_id <= 0) throw new Error("Lead inválido.");
  if (!Number.isFinite(input.valor) || input.valor <= 0) throw new Error("Valor inválido.");

  const supabase = createClient();
  const { data, error } = await supabase.rpc("consumir_credito_lead", {
    _lead_id: input.lead_id,
    _valor: input.valor,
    _origem: input.origem,
    _descricao: input.descricao ?? null,
    _referencia_expansao_id: input.expansao_id ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/growth/indicacoes");
  revalidatePath("/comunicacao/pos-venda");
  return { saldo_restante: Number(data) };
}
