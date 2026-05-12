"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type {
  CanalNps,
  ResponsavelPapel,
  StatusOnboardingChecklist,
  StatusOnboardingItem,
} from "@/lib/types";

const CANAIS_NPS: CanalNps[] = ["email", "whatsapp", "call", "in_app", "manual"];
const PAPEIS: ResponsavelPapel[] = ["comercial", "sdr", "gestor", "cliente"];

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa.");
  return orgId;
}

async function requireGestorOrg() {
  const orgId = await requireOrg();
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Acesso restrito a gestores.");
  return orgId;
}

async function assertLeadDaOrg(
  supabase: ReturnType<typeof createClient>,
  lead_id: number,
  orgId: string,
) {
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("id", lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Lead ${lead_id} não encontrado nesta organização.`);
}

// ===========================================================================
// Templates de onboarding (gestor configura em /equipe ou /pos-venda config)
// ===========================================================================

export async function criarTemplateOnboarding(input: {
  nome: string;
  descricao?: string;
  default_template?: boolean;
}) {
  const nome = input.nome?.trim();
  if (!nome || nome.length < 2 || nome.length > 80) {
    throw new Error("Nome do template inválido (2-80 chars).");
  }
  const orgId = await requireGestorOrg();
  const supabase = createClient();

  // Se default_template=true, desliga o atual default antes (constraint impede 2 defaults)
  if (input.default_template) {
    await supabase.from("onboarding_template")
      .update({ default_template: false })
      .eq("organizacao_id", orgId)
      .eq("default_template", true);
  }

  const { data, error } = await supabase
    .from("onboarding_template")
    .insert({
      organizacao_id: orgId,
      nome,
      descricao: input.descricao?.slice(0, 500) ?? null,
      default_template: !!input.default_template,
    })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/pos-venda");
  return { template_id: data!.id };
}

export async function adicionarItemTemplate(input: {
  template_id: number;
  titulo: string;
  descricao?: string;
  due_offset_dias?: number;
  obrigatorio?: boolean;
  responsavel_papel?: ResponsavelPapel;
  ordem?: number;
}) {
  const titulo = input.titulo?.trim();
  if (!titulo || titulo.length > 200) throw new Error("Título inválido (1-200 chars).");
  const offset = input.due_offset_dias ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 365) {
    throw new Error("due_offset_dias deve ser 0-365.");
  }
  if (input.responsavel_papel && !PAPEIS.includes(input.responsavel_papel)) {
    throw new Error("Papel inválido.");
  }

  const orgId = await requireGestorOrg();
  const supabase = createClient();

  // Verifica que o template pertence à org
  const { data: tpl } = await supabase
    .from("onboarding_template")
    .select("id")
    .eq("id", input.template_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!tpl) throw new Error("Template não encontrado.");

  const { error } = await supabase.from("onboarding_template_item").insert({
    template_id: input.template_id,
    ordem: input.ordem ?? 0,
    titulo,
    descricao: input.descricao?.slice(0, 1000) ?? null,
    due_offset_dias: offset,
    obrigatorio: input.obrigatorio ?? true,
    responsavel_papel: input.responsavel_papel ?? null,
  });
  if (error) throw error;

  revalidatePath("/pos-venda");
}

export async function atualizarItemTemplate(input: {
  item_id: number;
  obrigatorio?: boolean;
  titulo?: string;
  due_offset_dias?: number;
}) {
  if (!Number.isInteger(input.item_id) || input.item_id <= 0) {
    throw new Error("ID inválido.");
  }
  const orgId = await requireGestorOrg();
  const supabase = createClient();

  // Verifica que o item pertence à org (via template parent)
  const { data: item } = await supabase
    .from("onboarding_template_item")
    .select("id, onboarding_template:template_id(organizacao_id)")
    .eq("id", input.item_id)
    .maybeSingle();
  if (!item) throw new Error("Item não encontrado.");

  const tplOrgId = (item as any)?.onboarding_template?.organizacao_id;
  if (tplOrgId !== orgId) throw new Error("Item não pertence à sua organização.");

  const patch: Record<string, unknown> = {};
  if (typeof input.obrigatorio === "boolean") patch.obrigatorio = input.obrigatorio;
  if (typeof input.titulo === "string") {
    const t = input.titulo.trim();
    if (!t || t.length > 200) throw new Error("Título inválido (1-200 chars).");
    patch.titulo = t;
  }
  if (typeof input.due_offset_dias === "number") {
    const o = input.due_offset_dias;
    if (!Number.isInteger(o) || o < 0 || o > 365) throw new Error("due_offset_dias deve ser 0-365.");
    patch.due_offset_dias = o;
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("onboarding_template_item")
    .update(patch)
    .eq("id", input.item_id);
  if (error) throw error;

  revalidatePath("/pos-venda");
  revalidatePath("/comunicacao/pos-venda");
}

// ===========================================================================
// Versionamento de templates: clone, publicar, descartar
// ===========================================================================

export async function clonarTemplateComoDraft(template_id: number): Promise<{ novo_id: number }> {
  if (!Number.isInteger(template_id) || template_id <= 0) throw new Error("ID inválido.");
  await requireGestorOrg();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("clonar_template_como_draft", { _template_id: template_id });
  if (error) throw new Error(error.message);
  revalidatePath("/comunicacao/pos-venda");
  return { novo_id: Number(data) };
}

export async function publicarTemplateDraft(template_id: number) {
  if (!Number.isInteger(template_id) || template_id <= 0) throw new Error("ID inválido.");
  await requireGestorOrg();
  const supabase = createClient();
  const { error } = await supabase.rpc("publicar_template_draft", { _template_id: template_id });
  if (error) throw new Error(error.message);
  revalidatePath("/comunicacao/pos-venda");
}

export async function descartarTemplateDraft(template_id: number) {
  if (!Number.isInteger(template_id) || template_id <= 0) throw new Error("ID inválido.");
  await requireGestorOrg();
  const supabase = createClient();
  const { error } = await supabase.rpc("descartar_template_draft", { _template_id: template_id });
  if (error) throw new Error(error.message);
  revalidatePath("/comunicacao/pos-venda");
}

export async function removerItemTemplate(item_id: number) {
  if (!Number.isInteger(item_id) || item_id <= 0) throw new Error("ID inválido.");
  const orgId = await requireGestorOrg();
  const supabase = createClient();

  const { data: item } = await supabase
    .from("onboarding_template_item")
    .select("template_id, onboarding_template:template_id(organizacao_id)")
    .eq("id", item_id)
    .maybeSingle();
  if (!item) throw new Error("Item não encontrado.");

  // Defense-in-depth: confirma que o template parent é da org
  const tplOrgId = (item as any)?.onboarding_template?.organizacao_id;
  if (tplOrgId !== orgId) throw new Error("Item não pertence à sua organização.");

  const { error } = await supabase.from("onboarding_template_item").delete().eq("id", item_id);
  if (error) throw error;

  revalidatePath("/pos-venda");
}

// ===========================================================================
// Checklist por lead (item-level operations)
// ===========================================================================

export async function marcarItemOnboarding(input: {
  item_id: number;
  status: StatusOnboardingItem;
  observacoes?: string;
}) {
  if (!Number.isInteger(input.item_id) || input.item_id <= 0) throw new Error("ID inválido.");
  if (!["pendente", "concluido", "pulado"].includes(input.status)) {
    throw new Error("Status inválido.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  // Garante que o item pertence à org via checklist parent
  const { data: item } = await supabase
    .from("onboarding_item")
    .select("id, checklist_id, onboarding_checklist:checklist_id(organizacao_id, lead_id)")
    .eq("id", input.item_id)
    .maybeSingle();
  if (!item) throw new Error("Item não encontrado.");
  const checklist = (item as any)?.onboarding_checklist;
  if (!checklist || checklist.organizacao_id !== orgId) {
    throw new Error("Item não pertence à sua organização.");
  }

  const update: Record<string, unknown> = { status: input.status };
  if (input.status === "concluido") {
    update.concluido_em = new Date().toISOString();
    update.concluido_por = user?.id ?? null;
  } else {
    update.concluido_em = null;
    update.concluido_por = null;
  }
  if (input.observacoes !== undefined) {
    update.observacoes = input.observacoes.slice(0, 500);
  }

  const { error } = await supabase
    .from("onboarding_item")
    .update(update)
    .eq("id", input.item_id);
  if (error) throw error;

  // Auto-fecha checklist se todos os obrigatórios estão concluido/pulado
  await tentarFecharChecklist(supabase, checklist.checklist_id ?? item.checklist_id);

  revalidatePath("/pos-venda");
  revalidatePath(`/pipeline/${checklist.lead_id}`);
}

async function tentarFecharChecklist(
  supabase: ReturnType<typeof createClient>,
  checklist_id: number,
) {
  const { data: items } = await supabase
    .from("onboarding_item")
    .select("status")
    .eq("checklist_id", checklist_id);
  if (!items || items.length === 0) return;
  const todosFechados = items.every(
    (i: { status: string }) => i.status === "concluido" || i.status === "pulado",
  );
  if (todosFechados) {
    await supabase
      .from("onboarding_checklist")
      .update({ status: "concluido", concluido_em: new Date().toISOString() })
      .eq("id", checklist_id)
      .eq("status", "em_andamento");
  }
}

export async function fecharChecklistManual(checklist_id: number) {
  if (!Number.isInteger(checklist_id) || checklist_id <= 0) throw new Error("ID inválido.");
  const orgId = await requireOrg();
  const supabase = createClient();

  const { error } = await supabase
    .from("onboarding_checklist")
    .update({ status: "concluido", concluido_em: new Date().toISOString() })
    .eq("id", checklist_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  revalidatePath("/pos-venda");
}

// ===========================================================================
// NPS — solicitar e responder
// ===========================================================================

export async function solicitarNps(input: {
  lead_id: number;
  canal?: CanalNps;
  data_solicitacao?: string;
}) {
  if (!Number.isInteger(input.lead_id) || input.lead_id <= 0) {
    throw new Error("Lead inválido.");
  }
  if (input.canal && !CANAIS_NPS.includes(input.canal)) {
    throw new Error("Canal inválido.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, input.lead_id, orgId);

  const solicitado_em = input.data_solicitacao
    ? new Date(input.data_solicitacao).toISOString()
    : new Date().toISOString();

  const { error } = await supabase.from("nps_responses").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    solicitado_em,
    solicitado_por: user?.id ?? null,
    canal: input.canal ?? "email",
  });
  if (error) throw error;

  revalidatePath("/pos-venda");
  revalidatePath(`/pipeline/${input.lead_id}`);
}

export async function responderNps(input: {
  nps_id: number;
  score: number;
  comentario?: string;
}) {
  if (!Number.isInteger(input.nps_id) || input.nps_id <= 0) {
    throw new Error("NPS inválido.");
  }
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10) {
    throw new Error("Score deve ser inteiro 0-10.");
  }

  const supabase = createClient();
  const orgId = await requireOrg();

  // Confirma que o NPS é da org
  const { data: nps } = await supabase
    .from("nps_responses")
    .select("id, lead_id, score")
    .eq("id", input.nps_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!nps) throw new Error("NPS não encontrado.");
  if (nps.score !== null) throw new Error("Este NPS já foi respondido.");

  const { error } = await supabase
    .from("nps_responses")
    .update({
      score: input.score,
      comentario: input.comentario?.slice(0, 1000) ?? null,
      respondido_em: new Date().toISOString(),
    })
    .eq("id", input.nps_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  // Trigger SQL toma conta do resto:
  //   - score >= 9 → cria pedido_indicacao pos_resultado
  //   - score <= 6 → grava lead_evento detrator_alerta
  //   - 7-8 → grava lead_evento neutro

  revalidatePath("/pos-venda");
  revalidatePath(`/pipeline/${nps.lead_id}`);
  revalidatePath("/funil");
  revalidatePath("/hoje");
}

export async function descartarNpsPendente(nps_id: number) {
  if (!Number.isInteger(nps_id) || nps_id <= 0) throw new Error("ID inválido.");
  const orgId = await requireGestorOrg();
  const supabase = createClient();

  const { error } = await supabase
    .from("nps_responses")
    .delete()
    .eq("id", nps_id)
    .eq("organizacao_id", orgId)
    .is("score", null);
  if (error) throw error;

  revalidatePath("/pos-venda");
}
