"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

export async function criarRegraComissao(input: {
  nome: string;
  aplicar_em: "lead_fechado" | "expansao_fechada" | "renovacao";
  tipo: "percentual_fixo" | "valor_fixo_por_venda" | "percentual_escalonado";
  percentual?: number | null;
  valor_fixo?: number | null;
  faixas_escalonadas?: any | null;
  segmento_filtro?: string | null;
  vendedor_id?: string | null;
  vigente_de: string;
  vigente_ate?: string | null;
}): Promise<{ ok: true; id: number }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("regra_comissao")
    .insert({
      organizacao_id: orgId,
      nome: input.nome.trim(),
      aplicar_em: input.aplicar_em,
      tipo: input.tipo,
      percentual: input.percentual ?? null,
      valor_fixo: input.valor_fixo ?? null,
      faixas_escalonadas: input.faixas_escalonadas ?? null,
      segmento_filtro: input.segmento_filtro?.trim() || null,
      vendedor_id: input.vendedor_id ?? null,
      vigente_de: input.vigente_de,
      vigente_ate: input.vigente_ate ?? null,
      ativo: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha.");

  revalidatePath("/gestao/comissoes");
  return { ok: true, id: data.id };
}

export async function arquivarRegra(regra_id: number) {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");
  const supabase = createClient();
  await supabase.from("regra_comissao").update({ ativo: false }).eq("id", regra_id).eq("organizacao_id", orgId);
  revalidatePath("/gestao/comissoes");
  return { ok: true };
}

export async function atualizarStatusComissao(input: {
  comissao_id: number;
  novo_status: "pendente" | "aprovado" | "pago" | "cancelado";
  pago_em?: string | null;
  observacao?: string;
}): Promise<{ ok: true }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");
  const supabase = createClient();
  await supabase
    .from("comissao_calculada")
    .update({
      status_pagamento: input.novo_status,
      pago_em: input.novo_status === "pago" ? (input.pago_em ?? new Date().toISOString().slice(0,10)) : null,
      observacao: input.observacao ?? null,
    })
    .eq("id", input.comissao_id)
    .eq("organizacao_id", orgId);
  revalidatePath("/gestao/comissoes");
  return { ok: true };
}
