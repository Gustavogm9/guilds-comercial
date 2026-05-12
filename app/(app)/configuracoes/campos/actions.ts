"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const CHAVE_REGEX = /^[a-z][a-z0-9_]{0,40}$/;

export async function criarCustomField(input: {
  entidade: "lead" | "empresa" | "expansao";
  chave: string;
  rotulo: string;
  tipo: "texto" | "numero" | "data" | "boolean" | "select" | "multi_select" | "url";
  opcoes?: string[];
  obrigatorio?: boolean;
  visivel_em_listagem?: boolean;
  ordem?: number;
  descricao?: string;
}): Promise<{ ok: true; id: number }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const chave = input.chave.trim().toLowerCase();
  if (!CHAVE_REGEX.test(chave)) {
    throw new Error("Chave inválida. Use letras minúsculas, números e underscore (começa com letra, max 40 chars).");
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("custom_field_def")
    .insert({
      organizacao_id: orgId,
      entidade: input.entidade,
      chave,
      rotulo: input.rotulo.trim().slice(0, 80),
      tipo: input.tipo,
      opcoes: input.opcoes ?? [],
      obrigatorio: input.obrigatorio ?? false,
      visivel_em_listagem: input.visivel_em_listagem ?? false,
      ordem: input.ordem ?? 0,
      descricao: input.descricao?.trim() || null,
      ativo: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha.");

  revalidatePath("/configuracoes/campos");
  return { ok: true, id: data.id };
}

export async function atualizarCustomField(input: {
  id: number;
  rotulo?: string;
  opcoes?: string[];
  obrigatorio?: boolean;
  visivel_em_listagem?: boolean;
  ordem?: number;
  descricao?: string;
  ativo?: boolean;
}): Promise<{ ok: true }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.rotulo !== undefined) patch.rotulo = input.rotulo.trim().slice(0, 80);
  if (input.opcoes !== undefined) patch.opcoes = input.opcoes;
  if (input.obrigatorio !== undefined) patch.obrigatorio = input.obrigatorio;
  if (input.visivel_em_listagem !== undefined) patch.visivel_em_listagem = input.visivel_em_listagem;
  if (input.ordem !== undefined) patch.ordem = input.ordem;
  if (input.descricao !== undefined) patch.descricao = input.descricao || null;
  if (input.ativo !== undefined) patch.ativo = input.ativo;

  await supabase.from("custom_field_def").update(patch).eq("id", input.id).eq("organizacao_id", orgId);

  revalidatePath("/configuracoes/campos");
  return { ok: true };
}

export async function removerCustomField(field_id: number): Promise<{ ok: true }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");
  const supabase = createClient();
  // Soft delete via ativo=false (mantém histórico em leads.custom_fields)
  await supabase.from("custom_field_def").update({ ativo: false }).eq("id", field_id).eq("organizacao_id", orgId);
  revalidatePath("/configuracoes/campos");
  return { ok: true };
}
