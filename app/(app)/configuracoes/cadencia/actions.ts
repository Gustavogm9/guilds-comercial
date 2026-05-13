"use server";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import { getT, getServerLocale } from "@/lib/i18n";
import type { CadenciaPasso, CadenciaCanal } from "@/lib/cadencia-templates";

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface TemplateDB {
  id: number;
  organizacao_id: string;
  passo: CadenciaPasso;
  canal: CadenciaCanal;
  objetivo: string | null;
  assunto: string | null;
  corpo: string;
  nome: string | null;
  segmento: string | null;
  versao: number;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Guard de permissão ─────────────────────────────────────────────────────

async function assertGestor() {
  const t = getT(await getServerLocale());
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error(t("erros.sem_permissao") || "Sem permissão.");
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));
  return { me, orgId };
}

// ─── Listar ────────────────────────────────────────────────────────────────

/**
 * Lista todos os templates ativos da org, ordenados por passo + canal + versao desc.
 * Inclui apenas a versão mais recente (ativo = true) de cada combinação passo+canal+segmento.
 */
export async function listarTemplatesOrg(): Promise<TemplateDB[]> {
  const { orgId } = await assertGestor();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("cadencia_templates")
    .select("*")
    .eq("organizacao_id", orgId)
    .eq("ativo", true)
    .order("passo")
    .order("canal")
    .order("versao", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateDB[];
}

/**
 * Lista o histórico de versões de um template específico (passo + canal + segmento).
 */
export async function historicoTemplate(
  passo: CadenciaPasso,
  canal: string,
  segmento: string | null,
): Promise<TemplateDB[]> {
  const { orgId } = await assertGestor();
  const supabase = createClient();

  let q = supabase
    .from("cadencia_templates")
    .select("*")
    .eq("organizacao_id", orgId)
    .eq("passo", passo)
    .eq("canal", canal)
    .order("versao", { ascending: false });

  if (segmento) {
    q = q.eq("segmento", segmento);
  } else {
    q = q.is("segmento", null);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateDB[];
}

// ─── Criar ─────────────────────────────────────────────────────────────────

/**
 * Cria um novo template (sempre versao 1 para uma nova combinação passo+canal+segmento).
 */
export async function criarTemplate(input: {
  passo: CadenciaPasso;
  canal: CadenciaCanal;
  objetivo?: string;
  assunto?: string;
  corpo: string;
  nome?: string;
  segmento?: string | null;
}) {
  const { me, orgId } = await assertGestor();
  const supabase = createClient();

  // Valida campos obrigatórios
  if (!input.corpo?.trim()) throw new Error("Corpo do template é obrigatório.");
  if (!["D0","D3","D7","D11","D16","D30"].includes(input.passo))
    throw new Error("Passo inválido.");
  if (!["Email","WhatsApp","Ligação"].includes(input.canal))
    throw new Error("Canal inválido.");

  const { error } = await supabase.from("cadencia_templates").insert({
    organizacao_id: orgId,
    passo: input.passo,
    canal: input.canal,
    objetivo: input.objetivo?.trim() || null,
    assunto: input.assunto?.trim() || null,
    corpo: input.corpo.trim(),
    nome: input.nome?.trim() || `${input.passo} · ${input.canal}${input.segmento ? ` · ${input.segmento}` : ""}`,
    segmento: input.segmento || null,
    versao: 1,
    ativo: true,
    criado_por: me.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/configuracoes/cadencia");
  return { ok: true };
}

// ─── Editar (versionado) ────────────────────────────────────────────────────

/**
 * Editar cria uma nova versão e marca a anterior como ativo=false.
 * Nunca sobrescreve o histórico.
 */
export async function editarTemplate(
  templateId: number,
  input: {
    objetivo?: string;
    assunto?: string;
    corpo: string;
    nome?: string;
  },
) {
  const { me, orgId } = await assertGestor();
  const supabase = createClient();

  if (!input.corpo?.trim()) throw new Error("Corpo do template é obrigatório.");

  // Busca template atual para herdar passo, canal, segmento e incrementar versao
  const { data: atual, error: fetchErr } = await supabase
    .from("cadencia_templates")
    .select("*")
    .eq("id", templateId)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (fetchErr || !atual) throw new Error("Template não encontrado.");
  if (!atual.ativo) throw new Error("Não é possível editar uma versão inativa. Edite a versão ativa.");

  // Marca versão atual como inativa
  const { error: deactErr } = await supabase
    .from("cadencia_templates")
    .update({ ativo: false })
    .eq("id", templateId)
    .eq("organizacao_id", orgId);

  if (deactErr) throw new Error(deactErr.message);

  // Cria nova versão
  const { error: insertErr } = await supabase.from("cadencia_templates").insert({
    organizacao_id: orgId,
    passo: atual.passo,
    canal: atual.canal,
    objetivo: input.objetivo?.trim() || atual.objetivo,
    assunto: input.assunto?.trim() || atual.assunto,
    corpo: input.corpo.trim(),
    nome: input.nome?.trim() || atual.nome,
    segmento: atual.segmento,
    versao: (atual.versao ?? 1) + 1,
    ativo: true,
    criado_por: me.id,
  });

  if (insertErr) throw new Error(insertErr.message);

  revalidatePath("/configuracoes/cadencia");
  revalidatePath("/comunicacao/cadencia");
  return { ok: true, novaVersao: (atual.versao ?? 1) + 1 };
}

// ─── Restaurar versão ────────────────────────────────────────────────────────

/**
 * Restaura uma versão anterior: desativa a versão ativa atual e reativa a versão escolhida.
 */
export async function restaurarVersaoTemplate(templateId: number) {
  const { orgId } = await assertGestor();
  const supabase = createClient();

  const { data: alvo, error: fetchErr } = await supabase
    .from("cadencia_templates")
    .select("*")
    .eq("id", templateId)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (fetchErr || !alvo) throw new Error("Versão não encontrada.");
  if (alvo.ativo) throw new Error("Esta versão já está ativa.");

  // Desativa a versão atual ativa para o mesmo passo+canal+segmento
  let q = supabase
    .from("cadencia_templates")
    .update({ ativo: false })
    .eq("organizacao_id", orgId)
    .eq("passo", alvo.passo)
    .eq("canal", alvo.canal)
    .eq("ativo", true);

  if (alvo.segmento) {
    q = q.eq("segmento", alvo.segmento);
  } else {
    q = q.is("segmento", null);
  }
  await q;

  // Ativa a versão escolhida
  await supabase
    .from("cadencia_templates")
    .update({ ativo: true })
    .eq("id", templateId)
    .eq("organizacao_id", orgId);

  revalidatePath("/configuracoes/cadencia");
  return { ok: true };
}

// ─── Deletar ────────────────────────────────────────────────────────────────

/**
 * Remove permanentemente um template e todo seu histórico de versões.
 * Requer confirmação explícita — operação irreversível.
 */
export async function deletarTemplate(passo: CadenciaPasso, canal: string, segmento: string | null) {
  const { orgId } = await assertGestor();
  const supabase = createClient();

  let q = supabase
    .from("cadencia_templates")
    .delete()
    .eq("organizacao_id", orgId)
    .eq("passo", passo)
    .eq("canal", canal);

  if (segmento) {
    q = q.eq("segmento", segmento);
  } else {
    q = q.is("segmento", null);
  }

  const { error } = await q;
  if (error) throw new Error(error.message);

  revalidatePath("/configuracoes/cadencia");
  return { ok: true };
}
