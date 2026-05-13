"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";

// ─── PRODUTOS ────────────────────────────────────────────────────────────────

export async function listarProdutos() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("produtos")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("ordem", { ascending: true });
  return data ?? [];
}

export async function salvarProduto(input: {
  id?: number;
  nome: string;
  descricao?: string;
  categoria?: string;
  segmentos_alvo?: string[];
  cargos_alvo?: string[];
  valor_base?: number;
  valor_max?: number;
  recorrente?: boolean;
  ativo?: boolean;
}) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me) return { ok: false, erro: "Não autenticado." };

  if (input.id) {
    const { error } = await supabase
      .from("produtos")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("organizacao_id", orgId);
    if (error) return { ok: false, erro: error.message };
  } else {
    const { error } = await supabase
      .from("produtos")
      .insert({ ...input, organizacao_id: orgId });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/portfolio");
  return { ok: true };
}

export async function deletarProduto(id: number) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, erro: "Não autenticado." };
  const { error } = await supabase
    .from("produtos")
    .delete()
    .eq("id", id)
    .eq("organizacao_id", orgId);
  revalidatePath("/portfolio");
  return { ok: !error, erro: error?.message };
}

// ─── CASES / PORTFOLIO ───────────────────────────────────────────────────────

export async function listarCases() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("portfolio_cases")
    .select("*, produtos(nome)")
    .eq("organizacao_id", orgId)
    .order("destaque", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function salvarCase(input: {
  id?: number;
  titulo: string;
  produto_id?: number | null;
  cliente_nome?: string;
  cliente_segmento?: string;
  resultado?: string;
  resultado_metricas?: Record<string, string>;
  depoimento?: string;
  link_externo?: string;
  publico?: boolean;
  destaque?: boolean;
}) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, erro: "Não autenticado." };

  if (input.id) {
    const { error } = await supabase
      .from("portfolio_cases")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("organizacao_id", orgId);
    if (error) return { ok: false, erro: error.message };
  } else {
    const { error } = await supabase
      .from("portfolio_cases")
      .insert({ ...input, organizacao_id: orgId });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/portfolio");
  return { ok: true };
}

export async function deletarCase(id: number) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, erro: "Não autenticado." };
  const { error } = await supabase
    .from("portfolio_cases")
    .delete()
    .eq("id", id)
    .eq("organizacao_id", orgId);
  revalidatePath("/portfolio");
  return { ok: !error, erro: error?.message };
}

// ─── HIPÓTESES ICP ───────────────────────────────────────────────────────────

export async function listarHipoteses() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("icp_hipoteses")
    .select("*, produtos(nome)")
    .eq("organizacao_id", orgId)
    .order("leads_fechados", { ascending: false });
  return data ?? [];
}

export async function salvarHipotese(input: {
  id?: number;
  nome: string;
  descricao?: string;
  produto_id?: number | null;
  segmentos?: string[];
  cidades?: string[];
  cargos?: string[];
  canal_preferido?: string;
  cor?: string;
  status?: string;
}) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, erro: "Não autenticado." };

  if (input.id) {
    const { error } = await supabase
      .from("icp_hipoteses")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("organizacao_id", orgId);
    if (error) return { ok: false, erro: error.message };
  } else {
    const { error } = await supabase
      .from("icp_hipoteses")
      .insert({ ...input, organizacao_id: orgId });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/portfolio");
  return { ok: true };
}

export async function atualizarStatusHipotese(id: number, status: "ativa" | "pausada" | "descartada" | "validada") {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false };
  const { error } = await supabase
    .from("icp_hipoteses")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organizacao_id", orgId);
  revalidatePath("/portfolio");
  return { ok: !error };
}

// ─── PROPOSTAS ───────────────────────────────────────────────────────────────

export async function listarPropostas(leadId?: number) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  let q = supabase
    .from("propostas")
    .select("*, produtos(nome), leads(empresa, nome)")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false });
  if (leadId) q = q.eq("lead_id", leadId);
  const { data } = await q.limit(50);
  return data ?? [];
}

export async function salvarProposta(input: {
  lead_id: number;
  produto_id?: number | null;
  variacao?: string;
  valor_total?: number;
  valor_setup?: number;
  valor_mensal?: number;
  status?: string;
  texto_proposta?: string;
  link_proposta?: string;
  data_envio?: string;
}) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me) return { ok: false, erro: "Não autenticado." };

  const { data, error } = await supabase
    .from("propostas")
    .insert({ ...input, organizacao_id: orgId, criado_por: me.id })
    .select("id")
    .single();

  revalidatePath("/portfolio");
  revalidatePath(`/vendas/pipeline/${input.lead_id}`);
  return { ok: !error, id: data?.id, erro: error?.message };
}

export async function atualizarStatusProposta(
  id: number,
  status: "enviada" | "visualizada" | "aceita" | "recusada" | "expirada",
  motivoRecusa?: string
) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false };
  const { error } = await supabase
    .from("propostas")
    .update({
      status,
      motivo_recusa: motivoRecusa ?? null,
      data_resposta: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organizacao_id", orgId);
  revalidatePath("/portfolio");
  return { ok: !error };
}
