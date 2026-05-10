"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa.");
  return orgId;
}

async function assertLeadDaOrg(
  supabase: ReturnType<typeof createClient>,
  lead_id: number,
  orgId: string,
) {
  const { data } = await supabase
    .from("leads")
    .select("id, crm_stage, data_renovacao")
    .eq("id", lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Lead ${lead_id} não encontrado nesta organização.`);
  return data;
}

/**
 * Define os parâmetros de renovação de um cliente.
 * - data_renovacao: quando o contrato vence (NULL = remove recorrência)
 * - ciclo_renovacao_meses: 1, 6, 12, 24… (default 12)
 * - valor_renovacao: valor previsto (default = valor_potencial do lead)
 *
 * O cron diário (`renovacoes-diarias`) detecta esse lead e cria expansão
 * tipo='renovacao' automaticamente quando data_renovacao <= 90 dias.
 */
export async function definirRenovacao(input: {
  lead_id: number;
  data_renovacao: string | null;
  ciclo_renovacao_meses?: number | null;
  valor_renovacao?: number | null;
}) {
  if (!Number.isInteger(input.lead_id) || input.lead_id <= 0) {
    throw new Error("Lead inválido.");
  }
  if (input.data_renovacao !== null && !ISO_DATE.test(input.data_renovacao)) {
    throw new Error("Data inválida (use YYYY-MM-DD).");
  }
  if (input.ciclo_renovacao_meses != null) {
    if (!Number.isInteger(input.ciclo_renovacao_meses) || input.ciclo_renovacao_meses <= 0 || input.ciclo_renovacao_meses > 60) {
      throw new Error("Ciclo deve ser entre 1 e 60 meses.");
    }
  }
  if (input.valor_renovacao != null) {
    if (!Number.isFinite(input.valor_renovacao) || input.valor_renovacao < 0 || input.valor_renovacao > 100_000_000) {
      throw new Error("Valor da renovação fora da faixa.");
    }
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const lead = await assertLeadDaOrg(supabase, input.lead_id, orgId);

  // Permite setar mesmo em pré-fechamento — gestor pode pré-cadastrar.
  // Mas avisa via observação que o cron só trabalha clientes Fechados.

  const update: Record<string, unknown> = {
    data_renovacao: input.data_renovacao,
  };
  if (input.ciclo_renovacao_meses !== undefined) {
    update.ciclo_renovacao_meses = input.ciclo_renovacao_meses;
  }
  if (input.valor_renovacao !== undefined) {
    update.valor_renovacao = input.valor_renovacao;
  }

  const { error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", input.lead_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  // Audit
  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    ator_id: user?.id ?? null,
    tipo: "renovacao_configurada",
    payload: {
      data_renovacao: input.data_renovacao,
      ciclo_meses: input.ciclo_renovacao_meses ?? null,
      valor: input.valor_renovacao ?? null,
      data_anterior: lead.data_renovacao,
    },
  });

  revalidatePath(`/pipeline/${input.lead_id}`);
  revalidatePath("/pos-venda");
  revalidatePath("/funil");
  revalidatePath("/hoje");
}

/**
 * Roda o cron de renovação manualmente (gestor pode forçar quando precisar).
 * Útil pra testar a integração ou re-disparar após mudar várias datas.
 */
export async function rodarRenovacoesAgora(): Promise<{ org_count: number; total: number }> {
  const orgId = await requireOrg();
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Só gestores podem disparar renovações manualmente.");

  const supabase = createClient();
  const { data, error } = await supabase.rpc("criar_expansoes_renovacao_pendentes", {
    _janela_dias: 90,
  });
  if (error) throw error;

  // RPC retorna table — supabase-js entrega como array
  const rows = (data ?? []) as Array<{ organizacao_id: string; expansoes_criadas: number }>;
  const meu = rows.find((r) => r.organizacao_id === orgId);

  revalidatePath("/pos-venda");
  revalidatePath("/funil");
  revalidatePath("/hoje");

  return {
    org_count: rows.length,
    total: meu?.expansoes_criadas ?? 0,
  };
}
