"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type { RecompensaTipo } from "@/lib/types";

const TIPOS_VALIDOS: RecompensaTipo[] = [
  "desconto_renovacao",
  "credito",
  "produto",
  "dinheiro",
  "nenhum",
];

async function requireGestorOrg() {
  const orgId = await getCurrentOrgId();
  const role = await getCurrentRole();
  if (!orgId) throw new Error("Sem organização ativa.");
  if (role !== "gestor") throw new Error("Acesso restrito a gestores.");
  return orgId;
}

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa.");
  return orgId;
}

/**
 * Configura ou atualiza o programa de recompensas da organização.
 * Quando `ativo=true`, trigger SQL preenche automaticamente
 * `recompensa_valor` em indicações que viram lead/fechado.
 */
export async function configurarRecompensas(input: {
  ativo: boolean;
  valor_virou_lead: number;
  valor_fechado: number;
  tipo_default: RecompensaTipo;
  mensagem_recompensa?: string | null;
  limite_mensal_por_embaixador?: number | null;
}) {
  if (!Number.isFinite(input.valor_virou_lead) || input.valor_virou_lead < 0 || input.valor_virou_lead > 100_000) {
    throw new Error("valor_virou_lead deve estar entre 0 e 100000.");
  }
  if (!Number.isFinite(input.valor_fechado) || input.valor_fechado < 0 || input.valor_fechado > 100_000_000) {
    throw new Error("valor_fechado deve estar entre 0 e 100000000.");
  }
  if (input.valor_fechado < input.valor_virou_lead) {
    throw new Error("Valor de fechado deve ser >= valor de virou_lead (lógica do funil).");
  }
  if (!TIPOS_VALIDOS.includes(input.tipo_default)) {
    throw new Error("Tipo de recompensa inválido.");
  }
  if (input.limite_mensal_por_embaixador != null) {
    if (!Number.isInteger(input.limite_mensal_por_embaixador) || input.limite_mensal_por_embaixador < 0 || input.limite_mensal_por_embaixador > 1000) {
      throw new Error("Limite mensal deve estar entre 0 e 1000.");
    }
  }

  const orgId = await requireGestorOrg();
  const supabase = createClient();

  const { error } = await supabase
    .from("org_recompensa_config")
    .upsert({
      organizacao_id: orgId,
      ativo: input.ativo,
      valor_virou_lead: input.valor_virou_lead,
      valor_fechado: input.valor_fechado,
      tipo_default: input.tipo_default,
      mensagem_recompensa: input.mensagem_recompensa?.slice(0, 500) ?? null,
      limite_mensal_por_embaixador: input.limite_mensal_por_embaixador ?? null,
    }, { onConflict: "organizacao_id" });
  if (error) throw error;

  revalidatePath("/growth/indicacoes");
}

/**
 * Marca recompensa de uma indicação como paga. Vendedor/gestor confirma
 * que pagou (crédito, transferência, desconto aplicado, etc.).
 */
export async function marcarRecompensaPaga(input: {
  indicacao_id: number;
  /** Override opcional dos campos antes de marcar como paga (caso negocie outro valor). */
  override_tipo?: RecompensaTipo;
  override_valor?: number;
}) {
  if (!Number.isInteger(input.indicacao_id) || input.indicacao_id <= 0) {
    throw new Error("ID inválido.");
  }
  if (input.override_tipo && !TIPOS_VALIDOS.includes(input.override_tipo)) {
    throw new Error("Tipo inválido.");
  }
  if (input.override_valor != null) {
    if (!Number.isFinite(input.override_valor) || input.override_valor < 0) {
      throw new Error("Valor inválido.");
    }
  }

  const orgId = await requireOrg();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Confirma que indicação é da org e está em estado terminal (fechado)
  const { data: ind } = await supabase
    .from("indicacoes")
    .select("id, status, recompensa_paga, embaixador_lead_id")
    .eq("id", input.indicacao_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!ind) throw new Error("Indicação não encontrada.");
  if (ind.recompensa_paga) throw new Error("Recompensa já foi marcada como paga.");
  if (ind.status !== "fechado") {
    throw new Error("Só recompensas de indicações fechadas podem ser pagas.");
  }

  const update: Record<string, unknown> = {
    recompensa_paga: true,
    recompensa_paga_em: new Date().toISOString(),
  };
  if (input.override_tipo !== undefined) update.recompensa_tipo = input.override_tipo;
  if (input.override_valor !== undefined) update.recompensa_valor = input.override_valor;

  const { error } = await supabase
    .from("indicacoes")
    .update(update)
    .eq("id", input.indicacao_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  // Audit no embaixador
  // Audit no embaixador
  if (ind.embaixador_lead_id) {
    await supabase.from("lead_timeline").insert({
      organizacao_id: orgId,
      lead_id: ind.embaixador_lead_id,
      criado_por: user?.id ?? null,
      tipo: "recompensa_paga",
      titulo: `Recompensa paga (Indicação #${input.indicacao_id})`,
      metadata: {
        indicacao_id: input.indicacao_id,
        valor: input.override_valor,
        tipo: input.override_tipo,
      },
    });
  }

  revalidatePath("/growth/indicacoes");
}

/**
 * Reverte pagamento (se houve engano).
 */
export async function reverterRecompensaPaga(indicacao_id: number) {
  if (!Number.isInteger(indicacao_id) || indicacao_id <= 0) throw new Error("ID inválido.");
  const orgId = await requireGestorOrg();
  const supabase = createClient();

  const { error } = await supabase
    .from("indicacoes")
    .update({ recompensa_paga: false, recompensa_paga_em: null })
    .eq("id", indicacao_id)
    .eq("organizacao_id", orgId)
    .eq("recompensa_paga", true);
  if (error) throw error;

  revalidatePath("/growth/indicacoes");
}
