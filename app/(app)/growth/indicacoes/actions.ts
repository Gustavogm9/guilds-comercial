"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type {
  CanalPedidoIndicacao,
  MomentoPedidoIndicacao,
  StatusIndicacao,
  StatusPedidoIndicacao,
  RecompensaTipo,
} from "@/lib/types";
import {
  MOMENTOS_PEDIDO_INDICACAO,
  CANAIS_PEDIDO_INDICACAO,
  STATUS_PEDIDO_INDICACAO,
  STATUS_INDICACAO,
} from "@/lib/types";

/**
 * Server actions de /indicacoes — feature do funil borboleta.
 *
 * Patterns alinhados com o resto do projeto:
 *   - requireOrg + assertLeadDaOrg pra defense-in-depth
 *   - Validação rigorosa de input (whitelists + ranges)
 *   - revalidatePath em /indicacoes, /pipeline/[id], /hoje, /funil
 *   - Erros levantados levam mensagem amigável (mostrada no toast do client)
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPOS_RECOMPENSA: RecompensaTipo[] = [
  "desconto_renovacao",
  "credito",
  "produto",
  "dinheiro",
  "nenhum",
];

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
    .select("id")
    .eq("id", lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Lead ${lead_id} não encontrado nesta organização.`);
}

async function assertPedidoDaOrg(
  supabase: ReturnType<typeof createClient>,
  pedido_id: number,
  orgId: string,
) {
  const { data } = await supabase
    .from("pedidos_indicacao")
    .select("id, lead_id, status, momento, solicitado_por")
    .eq("id", pedido_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Pedido ${pedido_id} não encontrado nesta organização.`);
  return data;
}

async function assertIndicacaoDaOrg(
  supabase: ReturnType<typeof createClient>,
  indicacao_id: number,
  orgId: string,
) {
  const { data } = await supabase
    .from("indicacoes")
    .select("*")
    .eq("id", indicacao_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Indicação ${indicacao_id} não encontrada nesta organização.`);
  return data;
}

// =============================================================================
// Pedidos de indicação
// =============================================================================

/**
 * Cria um pedido manual (gestor/vendedor pode pedir ad-hoc).
 * O trigger SQL já cria automaticamente quando lead vira "Fechado", mas isso
 * cobre os outros momentos (pós-raio-x, renovação, etc.).
 */
export async function criarPedidoIndicacao(input: {
  lead_id: number;
  momento: MomentoPedidoIndicacao;
  canal?: CanalPedidoIndicacao;
  observacoes?: string;
}) {
  if (!Number.isInteger(input.lead_id) || input.lead_id <= 0) {
    throw new Error("Lead inválido.");
  }
  if (!MOMENTOS_PEDIDO_INDICACAO.includes(input.momento)) {
    throw new Error("Momento inválido.");
  }
  if (input.canal && !CANAIS_PEDIDO_INDICACAO.includes(input.canal)) {
    throw new Error("Canal inválido.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, input.lead_id, orgId);

  // Se já existe pedido pendente pra mesmo (lead, momento), o unique index do DB
  // levanta. Capturamos pra dar mensagem amigável.
  const { error } = await supabase.from("pedidos_indicacao").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    solicitado_por: user?.id ?? null,
    momento: input.momento,
    canal: input.canal ?? null,
    observacoes: input.observacoes?.slice(0, 1000) ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um pedido pendente para este momento. Responda o atual antes de criar novo.");
    }
    throw error;
  }

  revalidatePath("/indicacoes");
  revalidatePath(`/vendas/pipeline/${input.lead_id}`);
  revalidatePath("/hoje");
}

/**
 * Vendedor responde um pedido — pode ser respondido (com N indicações),
 * negado, ignorado ou agendado pra outra hora.
 *
 * Quando status='respondido' + indicacoes preenchidas:
 *   - Cria N rows em `indicacoes`
 *   - Cria N leads novos em base_bruta com indicacao_id apontando + fonte='Indicação'
 *   - Atualiza pedido com qtd_indicacoes_recebidas
 *
 * Tudo numa única transação lógica do lado do client (cada step pode falhar
 * independentemente; idealmente isso seria RPC PL/pgSQL — ver TECH_DEBT.md item 3).
 */
export interface NovaIndicacaoInput {
  nome: string;
  empresa?: string;
  cargo?: string;
  email?: string;
  whatsapp?: string;
  linkedin?: string;
  contexto?: string;
}

export async function responderPedidoIndicacao(input: {
  pedido_id: number;
  status: StatusPedidoIndicacao;
  observacoes?: string;
  indicacoes?: NovaIndicacaoInput[];
}) {
  if (!Number.isInteger(input.pedido_id) || input.pedido_id <= 0) {
    throw new Error("Pedido inválido.");
  }
  if (!STATUS_PEDIDO_INDICACAO.includes(input.status)) {
    throw new Error("Status inválido.");
  }

  // Validação das indicações (se houver)
  const indicacoesValidadas: NovaIndicacaoInput[] = [];
  if (input.status === "respondido") {
    if (!input.indicacoes || input.indicacoes.length === 0) {
      throw new Error("Para marcar como respondido, informe ao menos 1 indicação.");
    }
    if (input.indicacoes.length > 10) {
      throw new Error("Máximo de 10 indicações por pedido.");
    }
    for (const ind of input.indicacoes) {
      const nome = ind.nome?.trim();
      if (!nome) throw new Error("Toda indicação precisa de nome.");
      if (nome.length > 120) throw new Error("Nome muito longo (máx. 120 chars).");
      if (ind.email && !EMAIL_REGEX.test(ind.email.trim().toLowerCase())) {
        throw new Error(`Email inválido: ${ind.email}`);
      }
      indicacoesValidadas.push({
        nome,
        empresa: ind.empresa?.trim().slice(0, 120) || undefined,
        cargo: ind.cargo?.trim().slice(0, 80) || undefined,
        email: ind.email?.trim().toLowerCase().slice(0, 200) || undefined,
        whatsapp: ind.whatsapp?.trim().slice(0, 30) || undefined,
        linkedin: ind.linkedin?.trim().slice(0, 200) || undefined,
        contexto: ind.contexto?.trim().slice(0, 500) || undefined,
      });
    }
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const pedido = await assertPedidoDaOrg(supabase, input.pedido_id, orgId);

  if (pedido.status !== "pendente" && pedido.status !== "agendado") {
    throw new Error("Este pedido já foi respondido. Crie um novo se quiser registrar mais indicações.");
  }

  // 1. Atualiza o pedido
  const { error: updErr } = await supabase
    .from("pedidos_indicacao")
    .update({
      status: input.status,
      qtd_indicacoes_recebidas: indicacoesValidadas.length,
      data_resposta: new Date().toISOString(),
      observacoes: input.observacoes?.slice(0, 1000) ?? null,
    })
    .eq("id", input.pedido_id)
    .eq("organizacao_id", orgId);
  if (updErr) throw updErr;

  // 2. Se respondido, cria indicações + leads
  const leadsIdsCriados: number[] = [];
  if (input.status === "respondido" && indicacoesValidadas.length > 0) {
    for (const ind of indicacoesValidadas) {
      // Insere indicação
      const { data: indicacaoRow, error: indErr } = await supabase
        .from("indicacoes")
        .insert({
          organizacao_id: orgId,
          embaixador_lead_id: pedido.lead_id,
          pedido_id: input.pedido_id,
          solicitado_por: user?.id ?? null,
          indicado_nome: ind.nome,
          indicado_empresa: ind.empresa ?? null,
          indicado_cargo: ind.cargo ?? null,
          indicado_email: ind.email ?? null,
          indicado_whatsapp: ind.whatsapp ?? null,
          indicado_linkedin: ind.linkedin ?? null,
          contexto: ind.contexto ?? null,
          status: "recebida",
        })
        .select("id")
        .single();
      if (indErr) throw indErr;

      // Cria lead novo na base bruta com origem rastreada
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: leadRow, error: leadErr } = await supabase
        .from("leads")
        .insert({
          organizacao_id: orgId,
          empresa: ind.empresa ?? null,
          nome: ind.nome,
          cargo: ind.cargo ?? null,
          email: ind.email ?? null,
          whatsapp: ind.whatsapp ?? null,
          linkedin: ind.linkedin ?? null,
          observacoes: ind.contexto ?? null,
          fonte: "Indicação",
          funnel_stage: "base_bruta",
          responsavel_id: user?.id ?? null,
          indicacao_id: indicacaoRow!.id,
          data_entrada: hoje,
        })
        .select("id")
        .single();
      if (leadErr) throw leadErr;

      // Atualiza indicação com lead_convertido_id e bumpa status pra virou_lead
      await supabase
        .from("indicacoes")
        .update({
          lead_convertido_id: leadRow!.id,
          status: "virou_lead",
          data_convertido: new Date().toISOString(),
        })
        .eq("id", indicacaoRow!.id);

      // Auditoria — evento no embaixador
      await supabase.from("lead_evento").insert({
        organizacao_id: orgId,
        lead_id: pedido.lead_id,
        ator_id: user?.id ?? null,
        tipo: "indicou",
        payload: {
          indicacao_id: indicacaoRow!.id,
          lead_indicado_id: leadRow!.id,
          empresa_indicada: ind.empresa,
          nome_indicado: ind.nome,
        },
      });

      // Auditoria — evento no lead novo
      await supabase.from("lead_evento").insert({
        organizacao_id: orgId,
        lead_id: leadRow!.id,
        ator_id: user?.id ?? null,
        tipo: "criado_por_indicacao",
        payload: {
          indicacao_id: indicacaoRow!.id,
          embaixador_lead_id: pedido.lead_id,
        },
      });

      leadsIdsCriados.push(leadRow!.id);
    }
  }

  revalidatePath("/indicacoes");
  revalidatePath("/hoje");
  revalidatePath("/vendas/base");
  revalidatePath("/growth/funil");
  revalidatePath(`/vendas/pipeline/${pedido.lead_id}`);

  return {
    indicacoes_criadas: indicacoesValidadas.length,
    leads_criados: leadsIdsCriados,
  };
}

/**
 * Adia um pedido pendente em N dias (vendedor agendou pedir depois).
 */
export async function adiarPedidoIndicacao(pedido_id: number, dias: number) {
  if (!Number.isInteger(pedido_id) || pedido_id <= 0) {
    throw new Error("Pedido inválido.");
  }
  if (!Number.isFinite(dias) || dias < 1 || dias > 90) {
    throw new Error("Dias inválido (1-90).");
  }

  const supabase = createClient();
  const orgId = await requireOrg();
  const pedido = await assertPedidoDaOrg(supabase, pedido_id, orgId);

  if (pedido.status !== "pendente") {
    throw new Error("Só pedidos pendentes podem ser adiados.");
  }

  const novaData = new Date();
  novaData.setDate(novaData.getDate() + dias);

  // Bumpamos data_pedido pro futuro — assim ele sai do "pendente urgente" e
  // só reaparece em /hoje quando chegar a data.
  const { error } = await supabase
    .from("pedidos_indicacao")
    .update({ status: "agendado", data_pedido: novaData.toISOString() })
    .eq("id", pedido_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  revalidatePath("/indicacoes");
  revalidatePath("/hoje");
}

// =============================================================================
// Indicações
// =============================================================================

/**
 * Cria indicação manual (sem ter passado por um pedido formal). Útil quando
 * o cliente menciona alguém de passagem na conversa e o vendedor anota.
 */
export async function criarIndicacaoManual(input: {
  embaixador_lead_id?: number;
  embaixador_externo_nome?: string;
  indicado_nome: string;
  indicado_empresa?: string;
  indicado_cargo?: string;
  indicado_email?: string;
  indicado_whatsapp?: string;
  indicado_linkedin?: string;
  contexto?: string;
  criar_lead?: boolean; // se true, já cria o lead vinculado na base bruta
}) {
  const nome = input.indicado_nome?.trim();
  if (!nome || nome.length < 2) throw new Error("Nome do indicado obrigatório.");
  if (nome.length > 120) throw new Error("Nome muito longo.");

  if (!input.embaixador_lead_id && !input.embaixador_externo_nome?.trim()) {
    throw new Error("Informe um embaixador (cliente atual ou nome externo).");
  }
  if (input.indicado_email && !EMAIL_REGEX.test(input.indicado_email.trim().toLowerCase())) {
    throw new Error("Email inválido.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  if (input.embaixador_lead_id) {
    await assertLeadDaOrg(supabase, input.embaixador_lead_id, orgId);
  }

  const { data: indicacaoRow, error } = await supabase
    .from("indicacoes")
    .insert({
      organizacao_id: orgId,
      embaixador_lead_id: input.embaixador_lead_id ?? null,
      embaixador_externo_nome: input.embaixador_externo_nome?.trim().slice(0, 120) ?? null,
      solicitado_por: user?.id ?? null,
      indicado_nome: nome,
      indicado_empresa: input.indicado_empresa?.trim().slice(0, 120) ?? null,
      indicado_cargo: input.indicado_cargo?.trim().slice(0, 80) ?? null,
      indicado_email: input.indicado_email?.trim().toLowerCase().slice(0, 200) ?? null,
      indicado_whatsapp: input.indicado_whatsapp?.trim().slice(0, 30) ?? null,
      indicado_linkedin: input.indicado_linkedin?.trim().slice(0, 200) ?? null,
      contexto: input.contexto?.trim().slice(0, 500) ?? null,
      status: "recebida",
    })
    .select("id")
    .single();
  if (error) throw error;

  let leadId: number | null = null;
  if (input.criar_lead) {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: leadRow, error: leadErr } = await supabase
      .from("leads")
      .insert({
        organizacao_id: orgId,
        empresa: input.indicado_empresa ?? null,
        nome: nome,
        cargo: input.indicado_cargo ?? null,
        email: input.indicado_email ?? null,
        whatsapp: input.indicado_whatsapp ?? null,
        linkedin: input.indicado_linkedin ?? null,
        observacoes: input.contexto ?? null,
        fonte: "Indicação",
        funnel_stage: "base_bruta",
        responsavel_id: user?.id ?? null,
        indicacao_id: indicacaoRow!.id,
        data_entrada: hoje,
      })
      .select("id")
      .single();
    if (leadErr) throw leadErr;
    leadId = leadRow!.id;

    await supabase
      .from("indicacoes")
      .update({
        lead_convertido_id: leadId,
        status: "virou_lead",
        data_convertido: new Date().toISOString(),
      })
      .eq("id", indicacaoRow!.id);
  }

  revalidatePath("/indicacoes");
  revalidatePath("/vendas/base");
  return { indicacao_id: indicacaoRow!.id, lead_id: leadId };
}

/**
 * Atualiza status manualmente (vendedor marca como "contactado" depois do
 * primeiro toque, "descartado" se decidiu não trabalhar, etc.).
 *
 * NOTA: status='fechado' e 'perdido' são geridos pelos triggers SQL —
 * não permitir mutação manual aqui pra manter consistência.
 */
export async function atualizarStatusIndicacao(
  indicacao_id: number,
  novo_status: StatusIndicacao,
) {
  if (!Number.isInteger(indicacao_id) || indicacao_id <= 0) {
    throw new Error("Indicação inválida.");
  }
  if (!STATUS_INDICACAO.includes(novo_status)) {
    throw new Error("Status inválido.");
  }
  if (novo_status === "fechado" || novo_status === "perdido") {
    throw new Error("Status 'fechado' e 'perdido' são definidos automaticamente pelo sistema.");
  }

  const supabase = createClient();
  const orgId = await requireOrg();
  await assertIndicacaoDaOrg(supabase, indicacao_id, orgId);

  const update: Record<string, unknown> = { status: novo_status };
  if (novo_status === "contactado") update.data_contactado = new Date().toISOString();

  const { error } = await supabase
    .from("indicacoes")
    .update(update)
    .eq("id", indicacao_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  revalidatePath("/indicacoes");
}

/**
 * Converte indicação em lead (caso não tenha sido criado automaticamente).
 * Útil quando o vendedor cria a indicação primeiro com criar_lead=false.
 */
export async function converterIndicacaoEmLead(indicacao_id: number) {
  if (!Number.isInteger(indicacao_id) || indicacao_id <= 0) {
    throw new Error("Indicação inválida.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const indicacao = await assertIndicacaoDaOrg(supabase, indicacao_id, orgId);

  if (indicacao.lead_convertido_id) {
    throw new Error("Esta indicação já virou lead.");
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: leadRow, error } = await supabase
    .from("leads")
    .insert({
      organizacao_id: orgId,
      empresa: indicacao.indicado_empresa,
      nome: indicacao.indicado_nome,
      cargo: indicacao.indicado_cargo,
      email: indicacao.indicado_email,
      whatsapp: indicacao.indicado_whatsapp,
      linkedin: indicacao.indicado_linkedin,
      observacoes: indicacao.contexto,
      fonte: "Indicação",
      funnel_stage: "base_bruta",
      responsavel_id: user?.id ?? null,
      indicacao_id: indicacao.id,
      data_entrada: hoje,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase
    .from("indicacoes")
    .update({
      lead_convertido_id: leadRow!.id,
      status: "virou_lead",
      data_convertido: new Date().toISOString(),
    })
    .eq("id", indicacao.id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: leadRow!.id,
    ator_id: user?.id ?? null,
    tipo: "criado_por_indicacao",
    payload: {
      indicacao_id: indicacao.id,
      embaixador_lead_id: indicacao.embaixador_lead_id,
    },
  });

  revalidatePath("/indicacoes");
  revalidatePath("/vendas/base");
  return { lead_id: leadRow!.id };
}

/**
 * Marca recompensa como paga (fase 2 — UI completa virá depois).
 */
export async function marcarRecompensaPaga(input: {
  indicacao_id: number;
  tipo?: RecompensaTipo;
  valor?: number;
}) {
  if (!Number.isInteger(input.indicacao_id) || input.indicacao_id <= 0) {
    throw new Error("Indicação inválida.");
  }
  if (input.tipo && !TIPOS_RECOMPENSA.includes(input.tipo)) {
    throw new Error("Tipo de recompensa inválido.");
  }
  if (input.valor !== undefined && (!Number.isFinite(input.valor) || input.valor < 0)) {
    throw new Error("Valor inválido.");
  }

  const supabase = createClient();
  const orgId = await requireOrg();
  const indicacao = await assertIndicacaoDaOrg(supabase, input.indicacao_id, orgId);

  if (indicacao.status !== "fechado") {
    throw new Error("Só indicações que fecharam recebem recompensa paga.");
  }

  const { error } = await supabase
    .from("indicacoes")
    .update({
      recompensa_tipo: input.tipo ?? indicacao.recompensa_tipo ?? "credito",
      recompensa_valor: input.valor ?? indicacao.recompensa_valor ?? 0,
      recompensa_paga: true,
      recompensa_paga_em: new Date().toISOString(),
    })
    .eq("id", input.indicacao_id)
    .eq("organizacao_id", orgId);
  if (error) throw error;

  revalidatePath("/indicacoes");
}
