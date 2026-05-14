"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type {
  TipoExpansao,
  EstagioExpansao,
  OrigemExpansao,
} from "@/lib/types";
import {
  TIPOS_EXPANSAO,
  ESTAGIOS_EXPANSAO,
} from "@/lib/types";

const ORIGENS_VALIDAS: OrigemExpansao[] = [
  "vendedor",
  "cliente",
  "sistema_inatividade",
  "sistema_milestone",
  "sistema_renovacao",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

async function assertProdutoDaOrg(
  supabase: ReturnType<typeof createClient>,
  produto_id: number | null | undefined,
  orgId: string,
) {
  if (produto_id == null) return null;
  if (!Number.isInteger(produto_id) || produto_id <= 0) {
    throw new Error("Produto inválido.");
  }
  const { data } = await supabase
    .from("produtos")
    .select("id, nome")
    .eq("id", produto_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error("Produto não encontrado nesta organização.");
  return data;
}

async function assertExpansaoDaOrg(
  supabase: ReturnType<typeof createClient>,
  expansao_id: number,
  orgId: string,
) {
  const { data } = await supabase
    .from("expansoes")
    .select("*")
    .eq("id", expansao_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Expansão ${expansao_id} não encontrada.`);
  return data;
}

async function refletirProdutoFechadoNoLead(
  supabase: ReturnType<typeof createClient>,
  leadId: number,
  produtoId: number | null | undefined,
) {
  if (produtoId == null) return;
  const { error } = await supabase
    .from("lead_produtos")
    .upsert({
      lead_id: leadId,
      produto_id: produtoId,
      status: "fechado",
    }, { onConflict: "lead_id,produto_id" });
  if (error) throw error;
}

export async function criarExpansao(input: {
  cliente_lead_id: number;
  produto_id?: number | null;
  tipo: TipoExpansao;
  titulo: string;
  descricao?: string;
  valor_potencial?: number;
  valor_recorrente_mensal?: number;
  origem?: OrigemExpansao;
  data_proxima_acao?: string;
  proxima_acao?: string;
}) {
  if (!Number.isInteger(input.cliente_lead_id) || input.cliente_lead_id <= 0) {
    throw new Error("Cliente inválido.");
  }
  if (!TIPOS_EXPANSAO.includes(input.tipo)) {
    throw new Error("Tipo de expansão inválido.");
  }
  const titulo = input.titulo?.trim();
  if (!titulo || titulo.length < 2 || titulo.length > 200) {
    throw new Error("Título inválido (2-200 chars).");
  }
  const valor = input.valor_potencial ?? 0;
  if (!Number.isFinite(valor) || valor < 0 || valor > 100_000_000) {
    throw new Error("Valor potencial fora da faixa (0-100M).");
  }
  if (input.valor_recorrente_mensal != null) {
    if (!Number.isFinite(input.valor_recorrente_mensal) || input.valor_recorrente_mensal < 0) {
      throw new Error("Valor recorrente inválido.");
    }
  }
  if (input.origem && !ORIGENS_VALIDAS.includes(input.origem)) {
    throw new Error("Origem inválida.");
  }
  if (input.data_proxima_acao && !ISO_DATE.test(input.data_proxima_acao)) {
    throw new Error("Data próxima ação inválida (use YYYY-MM-DD).");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const lead = await assertLeadDaOrg(supabase, input.cliente_lead_id, orgId);
  await assertProdutoDaOrg(supabase, input.produto_id, orgId);

  // Recomendado: expansão só em quem já é cliente. Não bloqueio (gestor pode
  // querer pré-cadastrar antes do fechamento), mas aviso via observação.
  if (lead.crm_stage !== "Fechado") {
    // Permite, mas indica
  }

  const { data, error } = await supabase
    .from("expansoes")
    .insert({
      organizacao_id: orgId,
      cliente_lead_id: input.cliente_lead_id,
      responsavel_id: user?.id ?? null,
      produto_id: input.produto_id ?? null,
      tipo: input.tipo,
      titulo,
      descricao: input.descricao?.slice(0, 2000) ?? null,
      valor_potencial: valor,
      valor_recorrente_mensal: input.valor_recorrente_mensal ?? 0,
      origem: input.origem ?? "vendedor",
      data_proxima_acao: input.data_proxima_acao ?? null,
      proxima_acao: input.proxima_acao?.slice(0, 200) ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Audit no lead-cliente
  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.cliente_lead_id,
    ator_id: user?.id ?? null,
    tipo: "expansao_criada",
    payload: {
      expansao_id: data!.id,
      tipo: input.tipo,
      titulo,
      valor_potencial: valor,
      produto_id: input.produto_id ?? null,
      origem: input.origem ?? "vendedor",
    },
  });

  revalidatePath("/pos-venda");
  revalidatePath("/comunicacao/pos-venda");
  revalidatePath("/growth/funil");
  revalidatePath(`/vendas/pipeline/${input.cliente_lead_id}`);
  return { expansao_id: data!.id };
}

export async function atualizarEstagioExpansao(input: {
  expansao_id: number;
  estagio: EstagioExpansao;
  motivo_perda?: string;
}) {
  if (!Number.isInteger(input.expansao_id) || input.expansao_id <= 0) {
    throw new Error("Expansão inválida.");
  }
  if (!ESTAGIOS_EXPANSAO.includes(input.estagio)) {
    throw new Error("Estágio inválido.");
  }
  if (input.estagio === "perdida" && !input.motivo_perda?.trim()) {
    throw new Error("Motivo da perda é obrigatório.");
  }

  const supabase = createClient();
  const orgId = await requireOrg();
  const exp = await assertExpansaoDaOrg(supabase, input.expansao_id, orgId);

  if (exp.estagio === input.estagio) {
    if (input.estagio === "fechada") {
      await refletirProdutoFechadoNoLead(supabase, exp.cliente_lead_id, exp.produto_id);
      revalidatePath(`/vendas/pipeline/${exp.cliente_lead_id}`);
      if (exp.produto_id) {
        revalidatePath("/vendas/portfolio");
        revalidatePath(`/vendas/portfolio/${exp.produto_id}/pipeline`);
      }
    }
    return; // no-op
  }

  const update: Record<string, unknown> = { estagio: input.estagio };
  if (input.estagio === "perdida") {
    update.motivo_perda = input.motivo_perda!.trim().slice(0, 200);
  } else if (input.estagio !== "fechada") {
    update.motivo_perda = null;
  }

  const { error } = await supabase
    .from("expansoes")
    .update(update)
    .eq("id", input.expansao_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  if (input.estagio === "fechada") {
    await refletirProdutoFechadoNoLead(supabase, exp.cliente_lead_id, exp.produto_id);
  }

  revalidatePath("/pos-venda");
  revalidatePath("/comunicacao/pos-venda");
  revalidatePath("/growth/funil");
  revalidatePath(`/vendas/pipeline/${exp.cliente_lead_id}`);
  if (exp.produto_id) {
    revalidatePath("/vendas/portfolio");
    revalidatePath(`/vendas/portfolio/${exp.produto_id}/pipeline`);
  }
}

export async function atualizarExpansao(input: {
  expansao_id: number;
  produto_id?: number | null;
  titulo?: string;
  descricao?: string;
  valor_potencial?: number;
  valor_recorrente_mensal?: number;
  data_proxima_acao?: string | null;
  proxima_acao?: string;
}) {
  if (!Number.isInteger(input.expansao_id) || input.expansao_id <= 0) {
    throw new Error("Expansão inválida.");
  }

  const supabase = createClient();
  const orgId = await requireOrg();
  const exp = await assertExpansaoDaOrg(supabase, input.expansao_id, orgId);
  await assertProdutoDaOrg(supabase, input.produto_id, orgId);

  const update: Record<string, unknown> = {};

  if (input.produto_id !== undefined) {
    update.produto_id = input.produto_id;
  }

  if (input.titulo !== undefined) {
    const titulo = input.titulo.trim();
    if (titulo.length < 2 || titulo.length > 200) {
      throw new Error("Título inválido (2-200 chars).");
    }
    update.titulo = titulo;
  }
  if (input.descricao !== undefined) {
    update.descricao = input.descricao.slice(0, 2000) || null;
  }
  if (input.valor_potencial !== undefined) {
    if (!Number.isFinite(input.valor_potencial) || input.valor_potencial < 0 || input.valor_potencial > 100_000_000) {
      throw new Error("Valor potencial fora da faixa.");
    }
    update.valor_potencial = input.valor_potencial;
  }
  if (input.valor_recorrente_mensal !== undefined) {
    if (!Number.isFinite(input.valor_recorrente_mensal) || input.valor_recorrente_mensal < 0) {
      throw new Error("Valor recorrente inválido.");
    }
    update.valor_recorrente_mensal = input.valor_recorrente_mensal;
  }
  if (input.data_proxima_acao !== undefined) {
    if (input.data_proxima_acao !== null && !ISO_DATE.test(input.data_proxima_acao)) {
      throw new Error("Data próxima ação inválida.");
    }
    update.data_proxima_acao = input.data_proxima_acao;
  }
  if (input.proxima_acao !== undefined) {
    update.proxima_acao = input.proxima_acao.slice(0, 200) || null;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("expansoes")
    .update(update)
    .eq("id", input.expansao_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  const produtoIdFinal = input.produto_id !== undefined ? input.produto_id : exp.produto_id;
  if (exp.estagio === "fechada") {
    await refletirProdutoFechadoNoLead(supabase, exp.cliente_lead_id, produtoIdFinal);
  }

  revalidatePath("/pos-venda");
  revalidatePath("/comunicacao/pos-venda");
  revalidatePath(`/vendas/pipeline/${exp.cliente_lead_id}`);
  if (produtoIdFinal) {
    revalidatePath("/vendas/portfolio");
    revalidatePath(`/vendas/portfolio/${produtoIdFinal}/pipeline`);
  }
}

export async function removerExpansao(expansao_id: number) {
  if (!Number.isInteger(expansao_id) || expansao_id <= 0) throw new Error("ID inválido.");
  const supabase = createClient();
  const orgId = await requireOrg();
  const exp = await assertExpansaoDaOrg(supabase, expansao_id, orgId);

  // Só remove se estiver ativa (fechadas/perdidas viram histórico imutável)
  if (exp.estagio === "fechada" || exp.estagio === "perdida") {
    throw new Error("Expansões fechadas/perdidas não podem ser removidas (histórico). Use o estágio 'perdida' se quiser arquivar.");
  }

  const { error } = await supabase
    .from("expansoes")
    .delete()
    .eq("id", expansao_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  revalidatePath("/pos-venda");
  revalidatePath(`/vendas/pipeline/${exp.cliente_lead_id}`);
}
