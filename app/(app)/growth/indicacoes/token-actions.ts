"use server";

import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

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
    .select("id, crm_stage")
    .eq("id", lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Lead ${lead_id} não encontrado nesta organização.`);
  return data;
}

/**
 * Gera (ou regenera) um token de acesso ao portal pra um cliente embaixador.
 * Se já existe token ativo, marca como inativo e cria novo (rotação).
 *
 * Token format: gc_emb_<48 hex chars> — ~24 bytes de entropia, suficiente
 * pra brute-force ser inviável (mesmo cap diário).
 */
export async function gerarTokenEmbaixador(input: {
  lead_id: number;
  mensagem_personalizada?: string;
  max_indicacoes_por_acesso?: number;
  expires_em_dias?: number;
}) {
  if (!Number.isInteger(input.lead_id) || input.lead_id <= 0) {
    throw new Error("Lead inválido.");
  }
  const max = input.max_indicacoes_por_acesso ?? 5;
  if (!Number.isInteger(max) || max <= 0 || max > 20) {
    throw new Error("max_indicacoes_por_acesso deve ser 1-20.");
  }
  const expDias = input.expires_em_dias;
  if (expDias != null && (!Number.isInteger(expDias) || expDias <= 0 || expDias > 365)) {
    throw new Error("expires_em_dias deve ser 1-365 (ou omitir pra não expirar).");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, input.lead_id, orgId);

  // Inativa qualquer token ativo anterior pra esse lead
  await supabase
    .from("embaixador_tokens")
    .update({ ativo: false })
    .eq("organizacao_id", orgId)
    .eq("lead_id", input.lead_id)
    .eq("ativo", true);

  // Gera token novo
  const token = "gc_emb_" + crypto.randomBytes(24).toString("hex");

  const expiresAt = expDias
    ? new Date(Date.now() + expDias * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("embaixador_tokens")
    .insert({
      organizacao_id: orgId,
      lead_id: input.lead_id,
      token,
      ativo: true,
      criado_por: user?.id ?? null,
      max_indicacoes_por_acesso: max,
      expires_at: expiresAt,
      mensagem_personalizada: input.mensagem_personalizada?.slice(0, 500) ?? null,
    })
    .select("id, token")
    .single();
  if (error) throw error;

  // Audit
  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    ator_id: user?.id ?? null,
    tipo: "token_embaixador_gerado",
    payload: {
      token_id: data!.id,
      max_por_acesso: max,
      expira_em: expiresAt,
    },
  });

  revalidatePath("/indicacoes");
  revalidatePath(`/vendas/pipeline/${input.lead_id}`);

  return { token: data!.token, token_id: data!.id };
}

/**
 * Revoga o token (marca ativo=false). Chamadas futuras com esse token
 * vão receber "Token inválido" do portal.
 */
export async function revogarTokenEmbaixador(token_id: number) {
  if (!Number.isInteger(token_id) || token_id <= 0) {
    throw new Error("Token inválido.");
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  const { data: tokenRow } = await supabase
    .from("embaixador_tokens")
    .select("id, lead_id")
    .eq("id", token_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!tokenRow) throw new Error("Token não encontrado.");

  const { error } = await supabase
    .from("embaixador_tokens")
    .update({ ativo: false })
    .eq("id", token_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: tokenRow.lead_id,
    ator_id: user?.id ?? null,
    tipo: "token_embaixador_revogado",
    payload: { token_id },
  });

  revalidatePath("/indicacoes");
  revalidatePath(`/vendas/pipeline/${tokenRow.lead_id}`);
}

/**
 * Atualiza a mensagem personalizada do token (vendedor pode trocar o tom
 * do convite sem precisar regenerar o token).
 */
export async function atualizarMensagemToken(input: {
  token_id: number;
  mensagem_personalizada: string;
}) {
  if (!Number.isInteger(input.token_id) || input.token_id <= 0) {
    throw new Error("Token inválido.");
  }

  const supabase = createClient();
  const orgId = await requireOrg();

  const { error } = await supabase
    .from("embaixador_tokens")
    .update({
      mensagem_personalizada: input.mensagem_personalizada?.slice(0, 500) ?? null,
    })
    .eq("id", input.token_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  revalidatePath("/indicacoes");
}
