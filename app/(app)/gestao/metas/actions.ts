"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

type Periodo = "semanal" | "mensal" | "trimestral";
type Metrica =
  | "receita_fechada"
  | "qtd_leads_fechados"
  | "qtd_propostas"
  | "qtd_atividades"
  | "qtd_reunioes"
  | "receita_expansao";

export async function criarMeta(input: {
  vendedor_id: string | null;
  periodo: Periodo;
  data_inicio: string;
  data_fim: string;
  metrica: Metrica;
  meta_valor: number;
}): Promise<{ ok: true; meta_id: number }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores podem criar metas.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");
  if (!Number.isFinite(input.meta_valor) || input.meta_valor <= 0) throw new Error("Meta inválida.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("meta_periodo")
    .insert({
      organizacao_id: orgId,
      vendedor_id: input.vendedor_id,
      periodo: input.periodo,
      data_inicio: input.data_inicio,
      data_fim: input.data_fim,
      metrica: input.metrica,
      meta_valor: input.meta_valor,
      ativo: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao criar.");

  revalidatePath("/gestao/metas");
  return { ok: true, meta_id: data.id };
}

export async function arquivarMeta(meta_id: number) {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const supabase = createClient();
  await supabase
    .from("meta_periodo")
    .update({ ativo: false })
    .eq("id", meta_id)
    .eq("organizacao_id", orgId);

  revalidatePath("/gestao/metas");
  return { ok: true };
}
