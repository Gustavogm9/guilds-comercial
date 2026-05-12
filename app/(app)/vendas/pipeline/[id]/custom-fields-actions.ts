"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

export async function salvarCustomFieldsLead(
  lead_id: number,
  valores: Record<string, any>,
): Promise<{ ok: true }> {
  if (!Number.isInteger(lead_id) || lead_id <= 0) throw new Error("Lead inválido.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const supabase = createClient();

  // Valida que lead pertence à org
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!lead) throw new Error("Lead não encontrado.");

  // Salva valores como JSONB
  await supabase
    .from("leads")
    .update({ custom_fields: valores })
    .eq("id", lead_id);

  revalidatePath(`/vendas/pipeline/${lead_id}`);
  return { ok: true };
}
