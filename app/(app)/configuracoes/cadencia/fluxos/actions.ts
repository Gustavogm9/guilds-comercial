"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const CANAIS = ["email", "whatsapp", "call", "linkedin", "sms", "task_manual"] as const;
type Canal = typeof CANAIS[number];

interface PassoInput {
  id?: number;
  ordem: number;
  offset_dias: number;
  canal: Canal;
  nome_passo: string;
  assunto?: string | null;
  corpo?: string | null;
  pular_se_respondeu: boolean;
  pular_se_clicou_link: boolean;
  condicao_para_executar?: string;
}

export async function criarFluxo(input: {
  nome: string;
  descricao?: string;
  trigger: "manual" | "lead_criado" | "lead_segmento" | "lead_fonte";
  trigger_valor?: string;
  passos: PassoInput[];
}): Promise<{ ok: true; fluxo_id: number }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores podem criar fluxos.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const nome = input.nome.trim();
  if (!nome || nome.length > 80) throw new Error("Nome inválido (1-80 chars).");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: fluxo, error } = await supabase
    .from("cadencia_fluxo")
    .insert({
      organizacao_id: orgId,
      nome,
      descricao: input.descricao?.trim() || null,
      trigger: input.trigger,
      trigger_valor: input.trigger_valor?.trim() || null,
      status: "draft",
      criado_por: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !fluxo) throw new Error(error?.message ?? "Falha ao criar.");

  if (input.passos?.length > 0) {
    await supabase.from("cadencia_fluxo_passo").insert(
      input.passos.map((p, idx) => ({
        fluxo_id: fluxo.id,
        ordem: idx + 1,
        offset_dias: p.offset_dias,
        canal: p.canal,
        nome_passo: p.nome_passo.trim().slice(0, 80),
        assunto: p.assunto?.trim() || null,
        corpo: p.corpo?.trim() || null,
        pular_se_respondeu: p.pular_se_respondeu,
        pular_se_clicou_link: p.pular_se_clicou_link,
        condicao_para_executar: p.condicao_para_executar ?? "sempre",
      })),
    );
  }

  revalidatePath("/configuracoes/cadencia/fluxos");
  return { ok: true, fluxo_id: fluxo.id };
}

export async function atualizarFluxoPassos(input: {
  fluxo_id: number;
  passos: PassoInput[];
}): Promise<{ ok: true }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const supabase = createClient();
  // Verifica que o fluxo é da org
  const { data: fluxo } = await supabase
    .from("cadencia_fluxo")
    .select("id, status")
    .eq("id", input.fluxo_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!fluxo) throw new Error("Fluxo não encontrado.");
  if (fluxo.status === "arquivado") throw new Error("Fluxo arquivado.");

  // Drop + recria (mais simples que diff)
  await supabase.from("cadencia_fluxo_passo").delete().eq("fluxo_id", input.fluxo_id);

  if (input.passos.length > 0) {
    const { error } = await supabase.from("cadencia_fluxo_passo").insert(
      input.passos.map((p, idx) => ({
        fluxo_id: input.fluxo_id,
        ordem: idx + 1,
        offset_dias: Math.max(0, Math.min(365, p.offset_dias)),
        canal: p.canal,
        nome_passo: p.nome_passo.trim().slice(0, 80),
        assunto: p.assunto?.trim() || null,
        corpo: p.corpo?.trim() || null,
        pular_se_respondeu: p.pular_se_respondeu,
        pular_se_clicou_link: p.pular_se_clicou_link,
        condicao_para_executar: p.condicao_para_executar ?? "sempre",
      })),
    );
    if (error) throw new Error(error.message);
  }

  await supabase
    .from("cadencia_fluxo")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.fluxo_id);

  revalidatePath(`/configuracoes/cadencia/fluxos/${input.fluxo_id}`);
  return { ok: true };
}

export async function publicarFluxo(fluxo_id: number) {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");
  const supabase = createClient();

  // Valida: tem >=1 passo
  const { count } = await supabase
    .from("cadencia_fluxo_passo")
    .select("id", { count: "exact", head: true })
    .eq("fluxo_id", fluxo_id);
  if ((count ?? 0) < 1) throw new Error("Fluxo precisa de pelo menos 1 passo.");

  await supabase
    .from("cadencia_fluxo")
    .update({ status: "publicado", publicado_em: new Date().toISOString() })
    .eq("id", fluxo_id)
    .eq("organizacao_id", orgId);

  revalidatePath("/configuracoes/cadencia/fluxos");
  return { ok: true };
}

export async function arquivarFluxo(fluxo_id: number) {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");
  const supabase = createClient();
  await supabase
    .from("cadencia_fluxo")
    .update({ status: "arquivado", ativo: false, default_template: false })
    .eq("id", fluxo_id)
    .eq("organizacao_id", orgId);
  revalidatePath("/configuracoes/cadencia/fluxos");
  return { ok: true };
}

export async function marcarFluxoDefault(fluxo_id: number) {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");
  const supabase = createClient();

  // Tira default dos outros publicados
  await supabase
    .from("cadencia_fluxo")
    .update({ default_template: false })
    .eq("organizacao_id", orgId)
    .eq("default_template", true);

  await supabase
    .from("cadencia_fluxo")
    .update({ default_template: true })
    .eq("id", fluxo_id)
    .eq("organizacao_id", orgId);

  revalidatePath("/configuracoes/cadencia/fluxos");
  return { ok: true };
}
