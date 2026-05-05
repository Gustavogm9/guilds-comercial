"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/types";
import { getAppUrl, sendInviteEmail } from "@/lib/email";

async function requireGestorOrg() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  const role = await getCurrentRole();
  const { data: { user } } = await supabase.auth.getUser();
  if (!orgId) throw new Error("Sem organização ativa");
  if (role !== "gestor") throw new Error("Apenas gestores podem alterar a equipe");
  return { orgId, meId: user?.id ?? null };
}

const ROLES_VALIDOS: Role[] = ["gestor", "comercial", "sdr"];

/**
 * Bug 1+2: garante que sempre há ao menos 1 gestor ativo.
 * Lança se a operação tiraria o último gestor da org.
 */
async function assertNotLastGestor(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  profile_id: string,
  motivo: "rebaixar" | "desativar"
) {
  const { data: meu } = await supabase
    .from("membros_organizacao")
    .select("role, ativo")
    .eq("organizacao_id", orgId)
    .eq("profile_id", profile_id)
    .maybeSingle();
  if (!meu || meu.role !== "gestor" || !meu.ativo) return; // não é gestor ativo

  const { count } = await supabase
    .from("membros_organizacao")
    .select("profile_id", { count: "exact", head: true })
    .eq("organizacao_id", orgId)
    .eq("role", "gestor")
    .eq("ativo", true);

  if ((count ?? 0) <= 1) {
    throw new Error(
      motivo === "rebaixar"
        ? "Não é possível rebaixar o último gestor ativo da organização."
        : "Não é possível desativar o último gestor ativo da organização."
    );
  }
}

/** ============ MEMBROS ============ */

export async function alterarRoleMembro(profile_id: string, novoRole: Role) {
  // Bug 4: valida role
  if (!ROLES_VALIDOS.includes(novoRole)) throw new Error("Papel inválido.");
  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  // Bug 1: protege último gestor (só se está rebaixando alguém que era gestor)
  if (novoRole !== "gestor") {
    await assertNotLastGestor(supabase, orgId, profile_id, "rebaixar");
  }
  const { error } = await supabase.from("membros_organizacao")
    .update({ role: novoRole })
    .eq("organizacao_id", orgId)
    .eq("profile_id", profile_id);
  if (error) throw error;
  revalidatePath("/equipe");
}

export async function desativarMembro(profile_id: string) {
  const supabase = createClient();
  const { orgId, meId } = await requireGestorOrg();
  // Bug 2: gestor não pode desativar a si mesmo (perderia acesso imediato)
  if (meId && profile_id === meId) {
    throw new Error("Você não pode desativar a si mesmo. Peça a outro gestor.");
  }
  await assertNotLastGestor(supabase, orgId, profile_id, "desativar");
  const { error } = await supabase.from("membros_organizacao")
    .update({ ativo: false })
    .eq("organizacao_id", orgId)
    .eq("profile_id", profile_id);
  if (error) throw error;
  revalidatePath("/equipe");
}

export async function reativarMembro(profile_id: string) {
  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  const { error } = await supabase.from("membros_organizacao")
    .update({ ativo: true })
    .eq("organizacao_id", orgId)
    .eq("profile_id", profile_id);
  if (error) throw error;
  revalidatePath("/equipe");
}

/** ============ CONVITES ============ */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function criarConvite(input: {
  email: string;
  role: Role;
  segmentos?: string[];
}) {
  // Bug 4: validação de input
  const email = input.email.trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new Error("Email inválido.");
  }
  if (!ROLES_VALIDOS.includes(input.role)) {
    throw new Error("Papel inválido.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { orgId } = await requireGestorOrg();

  // Bug 3: verifica se já é membro ativo (busca via profiles)
  const { data: profileExistente } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profileExistente) {
    const { data: membro } = await supabase
      .from("membros_organizacao")
      .select("ativo")
      .eq("organizacao_id", orgId)
      .eq("profile_id", profileExistente.id)
      .maybeSingle();
    if (membro?.ativo) {
      throw new Error("Esta pessoa já é membro ativo da organização.");
    }
  }

  // Bug 3: verifica se já existe convite pendente (não-aceito, não-expirado)
  const { data: pendente } = await supabase
    .from("convites")
    .select("id, expira_em")
    .eq("organizacao_id", orgId)
    .eq("email", email)
    .is("aceito_em", null)
    .maybeSingle();
  if (pendente && new Date(pendente.expira_em) > new Date()) {
    throw new Error("Já existe um convite pendente para este email. Revogue antes de criar outro.");
  }

  // Cria convite (token + expira em 7 dias via defaults do schema)
  const { data: convite, error } = await supabase.from("convites").insert({
    organizacao_id: orgId,
    email,
    role: input.role,
    convidado_por: user?.id ?? null,
  }).select("token, expira_em").single();

  if (error) throw error;

  const [{ data: org }, { data: profile }] = await Promise.all([
    supabase.from("organizacoes").select("nome").eq("id", orgId).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  const inviteUrl = `${getAppUrl()}/api/convite/${convite!.token}`;
  let emailSent = false;
  try {
    const result = await sendInviteEmail({
      email,
      orgName: org?.nome ?? "sua organizacao",
      inviterName: profile?.display_name ?? user?.email ?? "Um gestor",
      inviteUrl,
      role: input.role,
    });
    emailSent = result.sent;
  } catch (err) {
    console.error("Erro ao enviar convite:", err);
  }

  revalidatePath("/equipe");
  return { token: convite!.token, expira_em: convite!.expira_em, email_sent: emailSent };
}

export async function revogarConvite(convite_id: number) {
  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  const { error } = await supabase.from("convites")
    .delete()
    .eq("id", convite_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;
  revalidatePath("/equipe");
}

/** ============ SEGMENTOS / TERRITÓRIOS ============ */

async function assertMembroDaOrg(supabase: ReturnType<typeof createClient>, profile_id: string, orgId: string) {
  const { data } = await supabase
    .from("membros_organizacao")
    .select("profile_id")
    .eq("profile_id", profile_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error("Usuário não é membro desta organização.");
}

export async function adicionarSegmentoVendedor(profile_id: string, segmento: string) {
  // Bug 11: valida no servidor
  const seg = segmento.trim();
  if (!seg) throw new Error("Segmento não pode ser vazio.");
  if (seg.length > 80) throw new Error("Segmento muito longo (máx. 80 chars).");
  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  await assertMembroDaOrg(supabase, profile_id, orgId);
  const { error } = await supabase.from("vendedor_segmento").upsert({
    organizacao_id: orgId,
    profile_id,
    segmento: seg,
  }, { onConflict: "organizacao_id,profile_id,segmento" });
  if (error) throw error;
  revalidatePath("/equipe");
}

export async function removerSegmentoVendedor(segmento_id: number) {
  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  const { error } = await supabase.from("vendedor_segmento")
    .delete()
    .eq("id", segmento_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;
  revalidatePath("/equipe");
}

/** ============ METAS INDIVIDUAIS ============ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  // Bug 7: validação rigorosa
  if (!["semana", "mes"].includes(input.periodo_tipo)) {
    throw new Error("Período inválido.");
  }
  if (!ISO_DATE.test(input.periodo_inicio) || !ISO_DATE.test(input.periodo_fim)) {
    throw new Error("Datas inválidas (use formato YYYY-MM-DD).");
  }
  if (input.periodo_inicio >= input.periodo_fim) {
    throw new Error("Data inicial deve ser anterior à data final.");
  }
  const metas = [input.meta_leads, input.meta_raiox, input.meta_calls, input.meta_props, input.meta_fech];
  if (metas.some(n => !Number.isFinite(n) || n < 0 || n > 99999)) {
    throw new Error("Valores de meta devem estar entre 0 e 99999.");
  }

  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  await assertMembroDaOrg(supabase, input.profile_id, orgId);
  const { error } = await supabase.from("meta_individual").upsert({
    organizacao_id: orgId,
    ...input,
  }, { onConflict: "organizacao_id,profile_id,periodo_tipo,periodo_inicio" });
  if (error) throw error;
  revalidatePath("/equipe");
}

export async function removerMetaIndividual(meta_id: number) {
  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  const { error } = await supabase.from("meta_individual")
    .delete()
    .eq("id", meta_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;
  revalidatePath("/equipe");
}

/** ============ CARTEIRAS (transferência em massa) ============ */

const FUNNEL_STAGES_VALIDOS = ["base_bruta", "base_qualificada", "pipeline", "arquivado"];
const CRM_STAGES_VALIDOS = [
  "Prospecção", "Qualificado", "Raio-X Ofertado", "Raio-X Feito",
  "Call Marcada", "Diagnóstico Pago", "Proposta", "Fechado", "Perdido",
];

export async function transferirCarteira(
  de_profile_id: string,
  para_profile_id: string,
  filtros?: { funnel_stage?: string; crm_stage?: string }
) {
  // Bug 5+6: validação rigorosa de input
  if (!de_profile_id || !para_profile_id) {
    throw new Error("Selecione vendedor de origem e destino.");
  }
  if (de_profile_id === para_profile_id) {
    throw new Error("Origem e destino devem ser diferentes.");
  }
  if (filtros?.funnel_stage && !FUNNEL_STAGES_VALIDOS.includes(filtros.funnel_stage)) {
    throw new Error("Filtro de funil inválido.");
  }
  if (filtros?.crm_stage && !CRM_STAGES_VALIDOS.includes(filtros.crm_stage)) {
    throw new Error("Filtro de etapa CRM inválido.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { orgId } = await requireGestorOrg();
  await assertMembroDaOrg(supabase, de_profile_id, orgId);
  await assertMembroDaOrg(supabase, para_profile_id, orgId);

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

const ESTRATEGIAS_VALIDAS = ["segmento", "round_robin", "manual"] as const;

export async function atualizarConfigOrg(input: {
  distribuicao_automatica: boolean;
  distribuicao_estrategia: "segmento" | "round_robin" | "manual";
}) {
  if (!ESTRATEGIAS_VALIDAS.includes(input.distribuicao_estrategia)) {
    throw new Error("Estratégia inválida.");
  }
  const supabase = createClient();
  const { orgId } = await requireGestorOrg();
  const { error } = await supabase.from("organizacao_config").upsert({
    organizacao_id: orgId,
    distribuicao_automatica: input.distribuicao_automatica,
    distribuicao_estrategia: input.distribuicao_estrategia,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organizacao_id" });
  if (error) throw error;
  revalidatePath("/equipe");
}
