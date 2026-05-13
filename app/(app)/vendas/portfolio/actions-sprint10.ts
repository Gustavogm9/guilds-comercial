"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

// ─── VARIAÇÕES DE PRODUTO ────────────────────────────────────────────────────

export async function listarVariacoes(produtoId: number) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("produto_variacoes")
    .select("*")
    .eq("produto_id", produtoId)
    .eq("organizacao_id", orgId)
    .order("ordem");
  return data ?? [];
}

export async function salvarVariacao(input: {
  id?: number; produto_id: number;
  nome: string; descricao?: string;
  valor?: number; recorrente?: boolean; ativo?: boolean; ordem?: number;
}) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, erro: "Não autenticado." };
  if (input.id) {
    const { error } = await supabase.from("produto_variacoes")
      .update({ ...input }).eq("id", input.id).eq("organizacao_id", orgId);
    if (error) return { ok: false, erro: error.message };
  } else {
    const { error } = await supabase.from("produto_variacoes")
      .insert({ ...input, organizacao_id: orgId });
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/portfolio");
  return { ok: true };
}

export async function deletarVariacao(id: number) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false };
  const { error } = await supabase.from("produto_variacoes")
    .delete().eq("id", id).eq("organizacao_id", orgId);
  revalidatePath("/portfolio");
  return { ok: !error, erro: error?.message };
}

// ─── EQUIPE POR PRODUTO ──────────────────────────────────────────────────────

export async function listarResponsaveisProduto(produtoId: number) {
  const supabase = createClient();
  const { data } = await supabase
    .from("produto_responsaveis")
    .select("produto_id, profile_id, papel, profiles(display_name, email)")
    .eq("produto_id", produtoId);
  return data ?? [];
}

export async function adicionarResponsavelProduto(input: {
  produto_id: number; profile_id: string; papel?: string;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("produto_responsaveis")
    .upsert({ ...input, papel: input.papel ?? "comercial" });
  revalidatePath("/portfolio");
  return { ok: !error, erro: error?.message };
}

export async function removerResponsavelProduto(produtoId: number, profileId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("produto_responsaveis")
    .delete().eq("produto_id", produtoId).eq("profile_id", profileId);
  revalidatePath("/portfolio");
  return { ok: !error };
}

// ─── LEAD × PRODUTO ──────────────────────────────────────────────────────────

export async function listarLeadProdutos(leadId: number) {
  const supabase = createClient();
  const { data } = await supabase
    .from("lead_produtos")
    .select("lead_id, produto_id, status, added_at, produtos(nome, categoria, recorrente)")
    .eq("lead_id", leadId);
  return data ?? [];
}

export async function listarLeadsPorProduto(produtoId: number, status?: string) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  let q = supabase
    .from("lead_produtos")
    .select("lead_id, status, added_at, leads(id, empresa, nome, crm_stage, responsavel_id, segmento)")
    .eq("produto_id", produtoId);
  if (status) q = q.eq("status", status);
  const { data } = await q.order("added_at", { ascending: false });
  return data ?? [];
}

export async function vincularProdutoLead(leadId: number, produtoId: number, status = "interesse") {
  const supabase = createClient();
  const { error } = await supabase.from("lead_produtos")
    .upsert({ lead_id: leadId, produto_id: produtoId, status });
  revalidatePath(`/vendas/pipeline/${leadId}`);
  return { ok: !error, erro: error?.message };
}

export async function atualizarStatusLeadProduto(leadId: number, produtoId: number, status: string) {
  const supabase = createClient();
  const { error } = await supabase.from("lead_produtos")
    .update({ status }).eq("lead_id", leadId).eq("produto_id", produtoId);
  revalidatePath(`/vendas/pipeline/${leadId}`);
  return { ok: !error };
}

export async function desvincularProdutoLead(leadId: number, produtoId: number) {
  const supabase = createClient();
  const { error } = await supabase.from("lead_produtos")
    .delete().eq("lead_id", leadId).eq("produto_id", produtoId);
  revalidatePath(`/vendas/pipeline/${leadId}`);
  return { ok: !error };
}

// ─── MÉTRICAS POR PRODUTO ────────────────────────────────────────────────────

export async function listarMetricasProdutos() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("v_metricas_produto")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("total_leads", { ascending: false });
  return data ?? [];
}

// ─── PROJETOS PRÓPRIOS ───────────────────────────────────────────────────────

export async function listarProjetosProprios() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("portfolio_cases")
    .select("*, produtos(nome)")
    .eq("organizacao_id", orgId)
    .eq("is_proprio", true)
    .order("destaque", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function salvarProjetoProprio(input: {
  id?: number; titulo: string; produto_id?: number | null;
  resultado?: string; descricao?: string;
  tecnologias?: string[]; data_conclusao?: string;
  link_externo?: string; publico?: boolean; destaque?: boolean;
}) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, erro: "Não autenticado." };
  const payload = { ...input, is_proprio: true, organizacao_id: orgId };
  if (input.id) {
    const { error } = await supabase.from("portfolio_cases")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", input.id).eq("organizacao_id", orgId);
    if (error) return { ok: false, erro: error.message };
  } else {
    const { error } = await supabase.from("portfolio_cases").insert(payload);
    if (error) return { ok: false, erro: error.message };
  }
  revalidatePath("/portfolio");
  return { ok: true };
}

// ─── MEMBROS DA ORG (para selecionar equipe) ─────────────────────────────────

export async function listarMembrosOrg() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];
  const { data } = await supabase
    .from("membros_organizacao")
    .select("profile_id, papel, profiles(display_name, email)")
    .eq("organizacao_id", orgId)
    .eq("ativo", true);
  return data ?? [];
}
