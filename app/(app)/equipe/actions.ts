"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/types";

async function requireGestorOrg() {
  const orgId = await getCurrentOrgId();
  const role = await getCurrentRole();
  if (!orgId) throw new Error("Sem organização ativa");
  if (role !== "gestor") throw new Error("Apenas gestores podem alterar a equipe");
  return orgId;
}

/** ============ MEMBROS ============ */

export async function alterarRoleMembro(profile_id: string, novoRole: Role) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("membros_organizacao")
    .update({ role: novoRole })
    .eq("organizacao_id", orgId)
    .eq("profile_id", profile_id);
  revalidatePath("/equipe");
}

export async function desativarMembro(profile_id: string) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("membros_organizacao")
    .update({ ativo: false })
    .eq("organizacao_id", orgId)
    .eq("profile_id", profile_id);
  revalidatePath("/equipe");
}

export async function reativarMembro(profile_id: string) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("membros_organizacao")
    .update({ ativo: true })
    .eq("organizacao_id", orgId)
    .eq("profile_id", profile_id);
  revalidatePath("/equipe");
}

/** ============ CONVITES ============ */

export async function criarConvite(input: {
  email: string;
  role: Role;
  segmentos?: string[];
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireGestorOrg();

  // Cria convite (token + expira em 7 dias via defaults do schema)
  const { data: convite, error } = await supabase.from("convites").insert({
    organizacao_id: orgId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    convidado_por: user?.id ?? null,
  }).select("token, expira_em").single();

  if (error) throw error;

  // TODO: disparar email via Resend com link /api/convite/{token}
  revalidatePath("/equipe");
  return { token: convite!.token, expira_em: convite!.expira_em };
}

export async function revogarConvite(convite_id: number) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("convites")
    .delete()
    .eq("id", convite_id)
    .eq("organizacao_id", orgId);
  revalidatePath("/equipe");
}

/** ============ SEGMENTOS / TERRITÓRIOS ============ */

export async function adicionarSegmentoVendedor(profile_id: string, segmento: string) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("vendedor_segmento").upsert({
    organizacao_id: orgId,
    profile_id,
    segmento: segmento.trim(),
  }, { onConflict: "organizacao_id,profile_id,segmento" });
  revalidatePath("/equipe");
}

export async function removerSegmentoVendedor(segmento_id: number) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("vendedor_segmento")
    .delete()
    .eq("id", segmento_id)
    .eq("organizacao_id", orgId);
  revalidatePath("/equipe");
}

/** ============ METAS INDIVIDUAIS ============ */

export async function definirMetaIndividual(input: {
  profile_id: string;
  periodo_tipo: "semana" | "mes";
  periodo_inicio: string;
  periodo_fim: string;
  meta_leads: number;
  meta_raiox: number;
  meta_calls: number;
  meta_props: number;
  meta_fech: number;
}) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("meta_individual").upsert({
    organizacao_id: orgId,
    ...input,
  }, { onConflict: "organizacao_id,profile_id,periodo_tipo,periodo_inicio" });
  revalidatePath("/equipe");
}

export async function removerMetaIndividual(meta_id: number) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("meta_individual")
    .delete()
    .eq("id", meta_id)
    .eq("organizacao_id", orgId);
  revalidatePath("/equipe");
}

/** ============ CARTEIRAS (transferência em massa) ============ */

export async function transferirCarteira(
  de_profile_id: string,
  para_profile_id: string,
  filtros?: { funnel_stage?: string; crm_stage?: string }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireGestorOrg();

  let query = supabase.from("leads")
    .update({ responsavel_id: para_profile_id })
    .eq("organizacao_id", orgId)
    .eq("responsavel_id", de_profile_id);

  if (filtros?.funnel_stage) query = query.eq("funnel_stage", filtros.funnel_stage);
  if (filtros?.crm_stage)    query = query.eq("crm_stage", filtros.crm_stage);

  const { data, error } = await query.select("id");
  if (error) throw error;

  // Audit — um evento por lead seria pesado; grava 1 evento-meta no primeiro lead
  if (data && data.length > 0) {
    await supabase.from("lead_evento").insert({
      organizacao_id: orgId,
      lead_id: data[0].id,
      ator_id: user?.id ?? null,
      tipo: "carteira_transferida",
      payload: {
        de: de_profile_id,
        para: para_profile_id,
        total_leads: data.length,
        filtros: filtros ?? null,
      },
    });
  }

  revalidatePath("/equipe");
  revalidatePath("/pipeline");
  revalidatePath("/base");
  revalidatePath("/hoje");

  return { total: data?.length ?? 0 };
}

/** ============ DISTRIBUIÇÃO AUTOMÁTICA ============ */

export async function atualizarConfigOrg(input: {
  distribuicao_automatica: boolean;
  distribuicao_estrategia: "segmento" | "round_robin" | "manual";
}) {
  const supabase = createClient();
  const orgId = await requireGestorOrg();
  await supabase.from("organizacao_config").upsert({
    organizacao_id: orgId,
    ...input,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organizacao_id" });
  revalidatePath("/equipe");
}
