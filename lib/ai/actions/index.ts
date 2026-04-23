/**
 * Server actions das 15 features de IA.
 *
 * Cada função é um wrapper tipado sobre `invokeAI`. Regra:
 *   - Função recebe só os dados necessários (nada cru do DB sem pré-processar).
 *   - Monta `vars` que batem com `variaveis_esperadas` do prompt correspondente.
 *   - Escolhe outputMode (texto livre ou JSON) conforme o design do prompt.
 *   - Retorna o resultado + invocationId pra UI referenciar.
 *
 * Quando o usuário edita o prompt via /admin/ai, NÃO é preciso tocar aqui —
 * as vars não mudam (são contrato entre action e prompt).
 */

"use server";

import { invokeAI, type InvokeAIResult } from "../dispatcher";
import { revalidatePath } from "next/cache";

// =============================================================
// 1. Enriquecer lead
// =============================================================
export async function enriquecerLead(input: {
  leadId: number;
  empresa: string;
  nome?: string;
  cargo?: string;
  cidade_uf?: string;
  linkedin?: string;
  site?: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "enriquecer_lead",
    leadId: input.leadId,
    outputMode: "json",
    vars: {
      empresa: input.empresa,
      nome: input.nome ?? "",
      cargo: input.cargo ?? "",
      cidade_uf: input.cidade_uf ?? "",
      linkedin: input.linkedin ?? "",
      site: input.site ?? "",
    },
  });
}

// =============================================================
// 2. Gerar oferta do Raio-X
// =============================================================
export async function gerarOfertaRaioX(input: {
  leadId: number;
  empresa: string;
  nome: string;
  cargo?: string;
  segmento?: string;
  canal: "WhatsApp" | "Email" | "LinkedIn";
  tipo_voucher: "Nenhum" | "R$50" | "Gratuito estratégico";
  contexto?: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "gerar_oferta_raiox",
    leadId: input.leadId,
    outputMode: "texto",
    vars: { ...input },
  });
}

// =============================================================
// 3. Gerar documento do Raio-X (a partir da call)
// =============================================================
export async function gerarDocumentoRaioX(input: {
  leadId: number;
  empresa: string;
  segmento?: string;
  conteudo_call: string;
  tamanho?: string;
  dor_principal?: string;
  valor_potencial?: number;
}): Promise<InvokeAIResult> {
  const r = await invokeAI({
    feature: "gerar_documento_raiox",
    leadId: input.leadId,
    outputMode: "json",
    vars: {
      empresa: input.empresa,
      segmento: input.segmento ?? "",
      conteudo_call: input.conteudo_call,
      tamanho: input.tamanho ?? "",
      dor_principal: input.dor_principal ?? "",
      valor_potencial: input.valor_potencial ?? 0,
    },
  });
  if (r.ok) revalidatePath(`/pipeline/${input.leadId}`);
  return r;
}

// =============================================================
// 4. Gerar mensagem de cadência
// =============================================================
export async function gerarMensagemCadencia(input: {
  leadId: number;
  empresa: string;
  nome: string;
  cargo?: string;
  passo: "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
  canal: "WhatsApp" | "Email" | "LinkedIn";
  dor_principal?: string;
  ultima_interacao?: string;
  tom_anterior?: "positivo" | "neutro" | "negativo" | null;
  raiox_status?: string;
  raiox_score?: number;
  vendedor: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "gerar_mensagem_cadencia",
    leadId: input.leadId,
    outputMode: "texto",
    vars: {
      empresa: input.empresa,
      nome: input.nome,
      cargo: input.cargo ?? "",
      passo: input.passo,
      canal: input.canal,
      dor_principal: input.dor_principal ?? "",
      ultima_interacao: input.ultima_interacao ?? "—",
      tom_anterior: input.tom_anterior ?? "neutro",
      raiox_status: input.raiox_status ?? "—",
      raiox_score: input.raiox_score ?? 0,
      vendedor: input.vendedor,
    },
  });
}

// =============================================================
// 5. Extrair dados da ligação (transcrição → JSON)
// =============================================================
export async function extrairLigacao(input: {
  leadId: number;
  empresa: string;
  transcricao: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "extrair_ligacao",
    leadId: input.leadId,
    outputMode: "json",
    vars: input,
  });
}

// =============================================================
// 6. Next Best Action
// =============================================================
export async function nextBestAction(input: {
  leadId: number;
  empresa: string;
  score: number;
  rotulo_score: string;
  crm_stage: string;
  dias_sem_tocar: number;
  ultima_interacao: string;
  tom_anterior: string;
  dor_principal: string;
  cadencia_pendente: string;
  valor_potencial: number;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "next_best_action",
    leadId: input.leadId,
    outputMode: "texto",
    vars: input,
  });
}

// =============================================================
// 7. Briefing pré-call
// =============================================================
export async function briefingPreCall(input: {
  leadId: number;
  empresa: string;
  data_call: string;
  participantes: string;
  crm_stage: string;
  score: number;
  historico_interacoes: string;
  raiox_resumo: string;
  dor_principal: string;
  objecoes: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "briefing_pre_call",
    leadId: input.leadId,
    outputMode: "texto",
    vars: input,
  });
}

// =============================================================
// 8. Objection handler
// =============================================================
export async function objectionHandler(input: {
  leadId: number;
  empresa: string;
  crm_stage: string;
  objecao: string;
  contexto?: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "objection_handler",
    leadId: input.leadId,
    outputMode: "json",
    vars: {
      empresa: input.empresa,
      crm_stage: input.crm_stage,
      objecao: input.objecao,
      contexto: input.contexto ?? "",
    },
  });
}

// =============================================================
// 9. Gerar proposta (3 versões)
// =============================================================
export async function gerarProposta(input: {
  leadId: number;
  empresa: string;
  segmento?: string;
  dor_principal?: string;
  raiox_score?: number;
  perda_anual?: number;
  valor_potencial: number;
  preferencias?: string;
}): Promise<InvokeAIResult> {
  const r = await invokeAI({
    feature: "gerar_proposta",
    leadId: input.leadId,
    outputMode: "json",
    vars: {
      empresa: input.empresa,
      segmento: input.segmento ?? "",
      dor_principal: input.dor_principal ?? "",
      raiox_score: input.raiox_score ?? 0,
      perda_anual: input.perda_anual ?? 0,
      valor_potencial: input.valor_potencial,
      preferencias: input.preferencias ?? "",
    },
  });
  if (r.ok) revalidatePath(`/pipeline/${input.leadId}`);
  return r;
}

// =============================================================
// 10. Sugerir motivo de perda padrão (livre → enum)
// =============================================================
export async function sugerirMotivoPerda(input: {
  texto_livre: string;
  leadId?: number;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "sugerir_motivo_perda",
    leadId: input.leadId ?? null,
    outputMode: "json",
    vars: { texto_livre: input.texto_livre },
  });
}

// =============================================================
// 11. Detectar risco no pipeline (cron)
// =============================================================
export async function detectarRisco(input: {
  leads_json: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "detectar_risco",
    outputMode: "json",
    vars: input,
  });
}

// =============================================================
// 12. Resumo diário (cron 19h)
// =============================================================
export async function resumoDiario(input: {
  vendedor: string;
  data: string;
  total_ligacoes: number;
  ligacoes_com_atendimento: number;
  raiox_ofertados: number;
  raiox_pagos: number;
  promocoes: number;
  perdidos: number;
  motivos_principais: string;
  pendencias_amanha: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "resumo_diario",
    outputMode: "texto",
    vars: input,
  });
}

// =============================================================
// 13. Digest semanal do gestor (cron sexta 17h)
// =============================================================
export async function digestSemanal(input: {
  periodo: string;
  kpis_json: string;
  por_vendedor_json: string;
  funil_json: string;
  perdidos_json: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "digest_semanal",
    outputMode: "texto",
    vars: input,
  });
}

// =============================================================
// 14. Reativar lead em nutrição
// =============================================================
export async function reativarNutricao(input: {
  leadId: number;
  empresa: string;
  nome: string;
  cargo?: string;
  motivo_nutricao: string;
  dias_nutricao: number;
  sinais?: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "reativar_nutricao",
    leadId: input.leadId,
    outputMode: "json",
    vars: {
      empresa: input.empresa,
      nome: input.nome,
      cargo: input.cargo ?? "",
      motivo_nutricao: input.motivo_nutricao,
      dias_nutricao: input.dias_nutricao,
      sinais: input.sinais ?? "",
    },
  });
}

// =============================================================
// 15. Forecast ML ajustado
// =============================================================
export async function forecastML(input: {
  forecast_best: number;
  forecast_likely: number;
  forecast_worst: number;
  n_amostras: number;
  amostra_json: string;
}): Promise<InvokeAIResult> {
  return invokeAI({
    feature: "forecast_ml",
    outputMode: "json",
    vars: input,
  });
}
