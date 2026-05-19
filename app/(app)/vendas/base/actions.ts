"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MotivoPerda, LeadEnriched } from "@/lib/types";
import { MOTIVOS_PERDA } from "@/lib/types";
import { iniciarCadenciaConfiguravel } from "@/lib/cadencia-fluxos";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
}

/**
 * Pre-check: confirma que o lead pertence à org ativa.
 * RLS já protege, mas o silêncio do "0 rows affected" é confuso pra debug.
 */
async function assertLeadDaOrg(supabase: ReturnType<typeof createClient>, lead_id: number, orgId: string) {
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("id", lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!data) throw new Error(`Lead ${lead_id} não encontrado nesta organização.`);
}

/**
 * Pre-check: confirma que o profile_id é membro da org. Usado em criar/atribuir
 * pra evitar atribuir lead a alguém de outra org (mesmo que RLS bloqueie).
 */
async function assertMembroDaOrg(supabase: ReturnType<typeof createClient>, profile_id: string, orgId: string) {
  const { data } = await supabase
    .from("membros_organizacao")
    .select("profile_id")
    .eq("profile_id", profile_id)
    .eq("organizacao_id", orgId)
    .eq("ativo", true)
    .maybeSingle();
  if (!data) throw new Error(`Usuário ${profile_id} não é membro ativo desta organização.`);
}

/**
 * Normaliza campos antes de gravar — evita drift de formato em emails/whatsapp.
 */
function normalizarCamposLead<T extends { email?: string | null; whatsapp?: string | null }>(input: T): T {
  return {
    ...input,
    email: input.email ? input.email.trim().toLowerCase() : input.email,
    whatsapp: input.whatsapp ? input.whatsapp.replace(/\s+/g, " ").trim() : input.whatsapp,
  };
}

/** Cria um novo lead. Por padrão vai para base bruta.
 *  Se `direto_pipeline` = true, já entra em Prospecção e cria cadência D0–D30. */
export async function criarLead(input: {
  nome?: string;
  empresa?: string;
  cargo?: string;
  email?: string;
  whatsapp?: string;
  linkedin?: string;
  segmento?: string;
  cidade_uf?: string;
  fonte?: string;
  observacoes?: string;
  responsavel_id?: string;
  temperatura?: "Frio" | "Morno" | "Quente";
  prioridade?: "A" | "B" | "C";
  newsletter_optin?: boolean;
  direto_pipeline?: boolean;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  // Bug 5: valida que responsavel_id é membro ativo da org
  if (input.responsavel_id) {
    await assertMembroDaOrg(supabase, input.responsavel_id, orgId);
  }

  // Robustez 13: normaliza email/whatsapp antes de gravar (dedup futuro funciona)
  const norm = normalizarCamposLead({
    email: input.email,
    whatsapp: input.whatsapp,
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const direto = !!input.direto_pipeline;

  const { data, error } = await supabase.from("leads").insert({
    organizacao_id: orgId,
    nome: input.nome ?? null,
    empresa: input.empresa ?? null,
    cargo: input.cargo ?? null,
    email: norm.email ?? null,
    whatsapp: norm.whatsapp ?? null,
    linkedin: input.linkedin ?? null,
    segmento: input.segmento ?? null,
    cidade_uf: input.cidade_uf ?? null,
    fonte: input.fonte ?? null,
    observacoes: input.observacoes ?? null,
    responsavel_id: input.responsavel_id ?? user?.id ?? null,
    temperatura: input.temperatura ?? "Morno",
    prioridade: input.prioridade ?? "B",
    newsletter_optin: input.newsletter_optin ?? false,
    funnel_stage: direto ? "pipeline" : "base_bruta",
    crm_stage: direto ? "Prospecção" : null,
    data_primeiro_contato: null,
    proxima_acao: null,
    data_proxima_acao: null,
  }).select("id").single();

  if (error) throw error;

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: data!.id,
    ator_id: user?.id ?? null,
    tipo: direto ? "criado_pipeline" : "criado",
    payload: { fonte: input.fonte ?? null, direto },
  });

  if (input.newsletter_optin) {
    await supabase.from("newsletter").insert({
      organizacao_id: orgId,
      lead_id: data!.id,
      responsavel_id: input.responsavel_id ?? user?.id ?? null,
      optin: true,
      status: "Ativo",
    });
  }

  if (direto) {
    await iniciarCadenciaConfiguravel({
      supabase,
      organizacao_id: orgId,
      lead_id: data!.id,
      baseIso: hoje,
      preservarExecutados: false,
    });
  }

  // Disparar Webhook
  try {
    const { data: leadCompleto } = await supabase.from("leads").select("*").eq("id", data!.id).single();
    if (leadCompleto) {
      const { dispatchWebhook } = await import("@/lib/webhooks");
      await dispatchWebhook(orgId, "lead.created", leadCompleto);
    }
  } catch (err) {
    console.warn("[webhook] Falha ao disparar webhook em criarLead", err);
  }

  revalidatePath("/vendas/base");
  if (direto) revalidatePath("/vendas/pipeline");
  return data!.id;
}

/** Importação em massa via CSV. Recebe array de rows já parseados.
 *  Retorna { criados, ignorados, erros }. */
export type DedupPolitica = "ignorar" | "atualizar" | "criar_mesmo_assim";

export interface ImportRow {
  empresa?: string;
  nome?: string;
  cargo?: string;
  email?: string;
  whatsapp?: string;
  linkedin?: string;
  segmento?: string;
  cidade_uf?: string;
  fonte?: string;
  observacoes?: string;
  site?: string;
  valor_potencial?: number;
  valor_setup?: number;
  valor_mensal?: number;
  probabilidade?: number;
  crm_stage?: string;
  data_proposta?: string;
  temperatura?: "Frio" | "Morno" | "Quente";
  prioridade?: "A" | "B" | "C";
  instagram?: string;
  pais?: string;
  link_proposta?: string;
  responsavel_id?: string;
  data_entrada?: string;
  data_fechamento?: string;
}

/** Tenta normalizar "DD/MM/YYYY" para "YYYY-MM-DD", senão retorna cru */
function normalizarData(d?: string): string | null {
  if (!d) return null;
  const t = d.trim();
  if (!t || t === "?" || t === "-") return null;
  
  // Checa DD/MM/YYYY ou D/M/YYYY
  const dmv = t.split("/");
  if (dmv.length === 3) {
    const [dd, mm, yyyy] = dmv;
    if (yyyy.length === 4) {
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }
  
  // Checa YYYY-MM-DD
  const ymd = t.split("-");
  if (ymd.length === 3 && ymd[0].length === 4) {
    return t;
  }
  
  // Se não bate com os formatos esperados, ignora para não quebrar o banco
  return null;
}

/**
 * Import em massa com dedup por email/whatsapp.
 *
 * politica_dedup:
 *  - 'ignorar' (default): pula rows que batem com lead existente
 *  - 'atualizar': faz update no lead existente com campos não-vazios do CSV
 *  - 'criar_mesmo_assim': insere mesmo com duplicata (cria lead novo)
 */
function traduzirCrmStage(stageRaw: string | undefined): string | null {
  if (!stageRaw) return null;
  const s = stageRaw.toLowerCase().trim();
  if (s === "fechada" || s === "cliente ativo") return "Fechado";
  if (s === "em negociação" || s === "em negociacao") return "Negociação";
  if (s === "enviada") return "Proposta";
  if (s === "demo") return "Call Marcada";
  if (s === "teste n8n" || s === "interno") return "Perdido";
  return stageRaw.trim();
}

export async function importarLeadsEmMassa(
  rows: ImportRow[],
  politica_dedup: DedupPolitica = "ignorar"
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  const valid = rows.filter((r) => (r.empresa ?? "").trim().length > 0);
  const sem_empresa = rows.length - valid.length;
  if (valid.length === 0) {
    return { criados: 0, atualizados: 0, ignorados: sem_empresa, sem_empresa, duplicados: 0, erros: [] as string[] };
  }

  // Carrega leads existentes pra dedup (email + whatsapp normalizado pra dígitos)
  const { data: existentes } = await supabase
    .from("leads")
    .select("id, email, whatsapp")
    .eq("organizacao_id", orgId);
  const indexEmail = new Map<string, number>();
  const indexWhats = new Map<string, number>();
  for (const lead of existentes ?? []) {
    if (lead.email) indexEmail.set(lead.email.toLowerCase().trim(), lead.id);
    if (lead.whatsapp) {
      const norm = String(lead.whatsapp).replace(/\D/g, "");
      if (norm) indexWhats.set(norm, lead.id);
    }
  }

  let criados = 0;
  let atualizados = 0;
  let duplicados = 0;
  const erros: string[] = [];

  const novosPayload: any[] = [];

  for (const r of valid) {
    const emailKey = (r.email ?? "").toLowerCase().trim();
    const whatsKey = String(r.whatsapp ?? "").replace(/\D/g, "");
    const existenteId =
      (emailKey && indexEmail.get(emailKey)) ||
      (whatsKey && indexWhats.get(whatsKey)) ||
      null;

    if (existenteId && politica_dedup !== "criar_mesmo_assim") {
      duplicados++;
      if (politica_dedup === "atualizar") {
        const update: any = {};
        if (r.empresa) update.empresa = r.empresa.trim();
        if (r.nome) update.nome = r.nome.trim();
        if (r.cargo) update.cargo = r.cargo.trim();
        if (r.email) update.email = r.email.trim();
        if (r.whatsapp) update.whatsapp = r.whatsapp.trim();
        if (r.linkedin) update.linkedin = r.linkedin.trim();
        if (r.segmento) update.segmento = r.segmento.trim();
        if (r.cidade_uf) update.cidade_uf = r.cidade_uf.trim();
        if (r.site) update.site = r.site.trim();
        
        if (r.observacoes) update.observacoes = r.observacoes.trim();

        if (r.valor_potencial && r.valor_potencial > 0) update.valor_potencial = r.valor_potencial;
        if (r.valor_setup && r.valor_setup > 0) update.valor_setup = r.valor_setup;
        if (r.valor_mensal && r.valor_mensal > 0) update.valor_mensal = r.valor_mensal;
        if (r.probabilidade !== undefined) update.probabilidade = r.probabilidade;
        
        const translatedStage = traduzirCrmStage(r.crm_stage);
        if (translatedStage) {
          update.crm_stage = translatedStage;
          update.funnel_stage = ["Fechado", "Perdido", "Nutrição"].includes(translatedStage) ? "arquivado" : "pipeline";
        }
        
        if (r.data_proposta) update.data_proposta = r.data_proposta.trim();
        if (r.link_proposta) update.link_proposta = r.link_proposta.trim();
        if (r.temperatura) update.temperatura = r.temperatura;
        if (r.prioridade) update.prioridade = r.prioridade;
        if (r.instagram) update.instagram = r.instagram.trim();
        
        if (r.responsavel_id) update.responsavel_id = r.responsavel_id;
        
        const dataIn = normalizarData(r.data_entrada);
        if (dataIn) update.data_entrada = dataIn;
        const dataFec = normalizarData(r.data_fechamento);
        if (dataFec) update.data_fechamento = dataFec;
        
        if (r.pais) {
          update.cidade_uf = r.cidade_uf ? `${r.cidade_uf.trim()} - ${r.pais.trim()}` : r.pais.trim();
        }
        const { error: upErr } = await supabase.from("leads").update(update).eq("id", existenteId);
        if (upErr) erros.push(`update lead ${existenteId}: ${upErr.message}`);
        else atualizados++;
      }
      continue;
    }

    novosPayload.push({
      organizacao_id: orgId,
      empresa: (r.empresa ?? "").trim(),
      nome: r.nome?.trim() || null,
      cargo: r.cargo?.trim() || null,
      email: r.email?.trim() || null,
      whatsapp: r.whatsapp?.trim() || null,
      linkedin: r.linkedin?.trim() || null,
      segmento: r.segmento?.trim() || null,
      cidade_uf: r.pais ? (r.cidade_uf ? `${r.cidade_uf.trim()} - ${r.pais.trim()}` : r.pais.trim()) : (r.cidade_uf?.trim() || null),
      site: r.site?.trim() || null,
      fonte: r.fonte?.trim() || "Lista fria",
      observacoes: r.observacoes?.trim() || null,
      valor_potencial: r.valor_potencial && r.valor_potencial > 0 ? r.valor_potencial : 0,
      valor_setup: r.valor_setup && r.valor_setup > 0 ? r.valor_setup : 0,
      valor_mensal: r.valor_mensal && r.valor_mensal > 0 ? r.valor_mensal : 0,
      probabilidade: r.probabilidade ?? 0,
      crm_stage: traduzirCrmStage(r.crm_stage) || null,
      data_proposta: normalizarData(r.data_proposta) || null,
      link_proposta: r.link_proposta?.trim() || null,
      temperatura: r.temperatura || 'Frio',
      prioridade: r.prioridade || 'B',
      instagram: r.instagram?.trim() || null,
      responsavel_id: r.responsavel_id || user?.id || null,
      data_entrada: normalizarData(r.data_entrada) || new Date().toISOString().split('T')[0],
      data_fechamento: normalizarData(r.data_fechamento) || null,
      funnel_stage: traduzirCrmStage(r.crm_stage) 
        ? (["Fechado", "Perdido", "Nutrição"].includes(traduzirCrmStage(r.crm_stage)!) ? "arquivado" : "pipeline") 
        : "base_bruta",
    });
  }

  if (novosPayload.length > 0) {
    const { data, error } = await supabase.from("leads").insert(novosPayload).select("id");
    if (error) {
      erros.push(`insert: ${error.message}`);
    } else {
      criados = data?.length ?? 0;
      const eventos = (data ?? []).map((row) => ({
        organizacao_id: orgId,
        lead_id: row.id,
        ator_id: user?.id ?? null,
        tipo: "criado",
        payload: { fonte: "importado_csv", politica_dedup },
      }));
      if (eventos.length > 0) await supabase.from("lead_evento").insert(eventos);
    }
  }

  revalidatePath("/vendas/base");
  return { criados, atualizados, ignorados: sem_empresa, sem_empresa, duplicados, erros };
}

/** Move um lead da Base Bruta → Base Qualificada (pré-triagem) */
export async function qualificarBase(input: {
  lead_id: number;
  fit_icp: boolean;
  decisor?: boolean;
  dor_principal?: string;
  temperatura?: "Frio" | "Morno" | "Quente";
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, input.lead_id, orgId);

  await supabase.from("leads").update({
    funnel_stage: "base_qualificada",
    fit_icp: input.fit_icp,
    decisor: input.decisor ?? null,
    dor_principal: input.dor_principal ?? null,
    temperatura: input.temperatura ?? "Morno",
  }).eq("id", input.lead_id).eq("organizacao_id", orgId);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    ator_id: user?.id ?? null,
    tipo: "qualificado_base",
    payload: { fit: input.fit_icp, decisor: input.decisor ?? null },
  });

  revalidatePath("/vendas/base");
}

/** Promove um lead da base → pipeline */
export async function promoverParaPipeline(lead_id: number, proxima_acao?: string | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);
  const hoje = new Date().toISOString().slice(0, 10);

  await supabase.from("leads").update({
    funnel_stage: "pipeline",
    crm_stage: "Prospecção",
    data_primeiro_contato: hoje,
    proxima_acao: proxima_acao ?? null,
    data_proxima_acao: proxima_acao ? hoje : null,
  }).eq("id", lead_id).eq("organizacao_id", orgId);

  await iniciarCadenciaConfiguravel({
    supabase,
    organizacao_id: orgId,
    lead_id,
    baseIso: hoje,
    preservarExecutados: true,
  });

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id,
    ator_id: user?.id ?? null,
    tipo: "promovido_pipeline",
    payload: { etapa: "Prospecção" },
  });

  revalidatePath("/vendas/base");
  revalidatePath("/vendas/pipeline");
  redirect(`/vendas/pipeline/${lead_id}`);
}

/**
 * Arquiva um lead (sem fit / sem interesse).
 * Motivo é obrigatório e deve ser um dos MOTIVOS_PERDA padrão.
 * Se motivo === 'Outro', detalhe é obrigatório.
 */
export async function arquivarLead(
  lead_id: number,
  motivo: MotivoPerda,
  detalhe?: string,
) {
  if (!motivo || !MOTIVOS_PERDA.includes(motivo)) {
    throw new Error("Motivo de arquivamento é obrigatório.");
  }
  if (motivo === "Outro" && !(detalhe ?? "").trim()) {
    throw new Error("Descreva o motivo quando selecionar 'Outro'.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);

  await supabase.from("leads").update({
    funnel_stage: "arquivado",
    crm_stage: "Perdido",
    motivo_perda: motivo,
    motivo_perda_detalhe: motivo === "Outro" ? (detalhe ?? "").trim() : null,
  }).eq("id", lead_id).eq("organizacao_id", orgId);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "arquivado",
    payload: {
      motivo,
      motivo_detalhe: motivo === "Outro" ? detalhe : null,
    },
  });

  revalidatePath("/vendas/base");
  revalidatePath("/growth/funil");
}

/** Atribui responsável a um lead */
export async function atribuirResponsavel(lead_id: number, responsavel_id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);
  await assertMembroDaOrg(supabase, responsavel_id, orgId);
  await supabase.from("leads").update({ responsavel_id })
    .eq("id", lead_id).eq("organizacao_id", orgId);
  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "responsavel_alterado", payload: { para: responsavel_id },
  });
  revalidatePath("/vendas/base");
  revalidatePath("/vendas/pipeline");
}

/** Enriquecimento de Lead via IA (Copiloto) */
export async function enriquecerLead(lead_id: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);

  // Buscar dados básicos do lead para usar como contexto
  const { data: lead } = await supabase.from("leads")
    .select("empresa, nome, email, segmento, cargo, cidade_uf, observacoes")
    .eq("id", lead_id).eq("organizacao_id", orgId).single();
  if (!lead) throw new Error("Lead não encontrado.");

  // Import dynamic para evitar problema de ciclo
  const { invokeAI } = await import("@/lib/ai/dispatcher");

  const aiOutput = await invokeAI({
    feature: "enriquecer_lead",
    vars: {
      empresa: lead.empresa ?? "",
      nome: lead.nome ?? "",
      email: lead.email ?? "",
    },
    leadId: lead_id,
    outputMode: "json",
  });

  if (!aiOutput.ok) {
    throw new Error(aiOutput.erro || "Falha ao enriquecer lead com IA.");
  }

  // Salvar no BD
  const enrichedData = (aiOutput.parsed as any) ?? {};

  await supabase.from("leads").update({
    segmento: enrichedData.segmento || lead.segmento,
    cargo: enrichedData.cargo || lead.cargo,
    cidade_uf: enrichedData.localizacao || lead.cidade_uf,
    observacoes: lead.observacoes
      ? lead.observacoes + "\n\nIA: " + (enrichedData.resumo ?? aiOutput.texto)
      : "IA: " + (enrichedData.resumo ?? aiOutput.texto),
  }).eq("id", lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "enriquecido_ia", payload: { dados: enrichedData },
  });

  revalidatePath("/vendas/base");
}

export async function editarLeadInline(
  lead_id: number,
  payload: Partial<LeadEnriched>
) {
  const supabase = createClient();
  const orgId = await requireOrg();

  const updateData: any = { ...payload };
  delete updateData.id;
  delete updateData.organizacao_id;
  delete updateData.created_at;
  delete updateData.updated_at;
  // Limpar campos de view enriquecida
  delete updateData.display_name;
  delete updateData.responsavel_nome;

  if (payload.crm_stage !== undefined) {
    const translatedCrmStage = traduzirCrmStage(payload.crm_stage || undefined);
    if (translatedCrmStage) {
      updateData.crm_stage = translatedCrmStage;
      updateData.funnel_stage = ["Fechado", "Perdido", "Nutrição"].includes(translatedCrmStage)
        ? "arquivado"
        : "pipeline";
    } else if (payload.crm_stage === null) {
      updateData.crm_stage = null;
    }
  }

  // Prevenir undefined -> null se precisar
  for (const key in updateData) {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  }

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", lead_id)
    .eq("organizacao_id", orgId);

  if (error) {
    throw new Error("Erro ao atualizar lead: " + error.message);
  }

  revalidatePath("/vendas/base");
}
