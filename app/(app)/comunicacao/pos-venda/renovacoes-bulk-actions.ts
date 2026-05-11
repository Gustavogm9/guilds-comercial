"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa.");
  return orgId;
}

/**
 * Atualiza renovações em massa. Recebe array de leads + valores.
 * Faz UPDATE atomic por lead (loop, mas rápido com índice).
 *
 * Anti-abuse: máximo 500 leads por chamada.
 */
export async function bulkAtualizarRenovacoes(
  updates: Array<{
    lead_id: number;
    data_renovacao: string | null;
    ciclo_renovacao_meses?: number | null;
    valor_renovacao?: number | null;
  }>,
): Promise<{ atualizados: number; erros: string[] }> {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error("Nenhuma atualização fornecida.");
  }
  if (updates.length > 500) {
    throw new Error("Máximo 500 leads por operação.");
  }

  const orgId = await requireOrg();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let atualizados = 0;
  const erros: string[] = [];

  // Validações + execução por chunk de 50
  for (const u of updates) {
    if (!Number.isInteger(u.lead_id) || u.lead_id <= 0) {
      erros.push(`Lead ID inválido: ${u.lead_id}`);
      continue;
    }
    if (u.data_renovacao !== null && !ISO_DATE.test(u.data_renovacao)) {
      erros.push(`Data inválida pra lead ${u.lead_id}: ${u.data_renovacao}`);
      continue;
    }
    if (u.ciclo_renovacao_meses != null) {
      if (!Number.isInteger(u.ciclo_renovacao_meses) || u.ciclo_renovacao_meses <= 0 || u.ciclo_renovacao_meses > 60) {
        erros.push(`Ciclo inválido pra lead ${u.lead_id}`);
        continue;
      }
    }
    if (u.valor_renovacao != null) {
      if (!Number.isFinite(u.valor_renovacao) || u.valor_renovacao < 0 || u.valor_renovacao > 100_000_000) {
        erros.push(`Valor inválido pra lead ${u.lead_id}`);
        continue;
      }
    }

    const update: Record<string, unknown> = {
      data_renovacao: u.data_renovacao,
    };
    if (u.ciclo_renovacao_meses !== undefined) {
      update.ciclo_renovacao_meses = u.ciclo_renovacao_meses;
    }
    if (u.valor_renovacao !== undefined) {
      update.valor_renovacao = u.valor_renovacao;
    }

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", u.lead_id)
      .eq("organizacao_id", orgId);

    if (error) {
      erros.push(`Lead ${u.lead_id}: ${error.message}`);
    } else {
      atualizados += 1;
    }
  }

  // Audit consolidado
  if (atualizados > 0) {
    await supabase.from("organizacao_evento").insert({
      organizacao_id: orgId,
      ator_id: user?.id ?? null,
      tipo: "renovacoes_bulk_atualizadas",
      payload: { qtd: atualizados, erros: erros.length },
    });
  }

  revalidatePath("/comunicacao/pos-venda");
  revalidatePath("/funil");
  revalidatePath("/flywheel");

  return { atualizados, erros };
}
