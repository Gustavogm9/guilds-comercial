// Types do schema (espelhando supabase/schema.sql)

export type Role = "gestor" | "comercial" | "sdr";

export type FunnelStage = "base_bruta" | "base_qualificada" | "pipeline" | "arquivado";

export type CrmStage =
  | "Base"
  | "Prospecção"
  | "Qualificado"
  | "Raio-X Ofertado"
  | "Raio-X Feito"
  | "Call Marcada"
  | "Diagnóstico Pago"
  | "Proposta"
  | "Negociação"
  | "Fechado"
  | "Perdido"
  | "Nutrição";

export const CRM_STAGES_ATIVAS: CrmStage[] = [
  "Prospecção",
  "Qualificado",
  "Raio-X Ofertado",
  "Raio-X Feito",
  "Call Marcada",
  "Diagnóstico Pago",
  "Proposta",
  "Negociação",
];

/** Status da oferta (aligned with migration_v2_completude.sql). */
export type RaioxStatus =
  | "Não ofertado"
  | "Ofertado"
  | "Pago"
  | "Concluído"
  | "Recusou";

/** Modalidade de cobrança do Raio-X. */
export type TipoVoucher = "Nenhum" | "R$50" | "Gratuito estratégico";

/** Motivos padronizados de perda ou saída. */
export type MotivoPerda =
  | "Preço"
  | "Timing"
  | "Concorrência"
  | "Sumiu"
  | "Sem orçamento"
  | "Sem fit"
  | "Decisor errado"
  | "Outro";

export const MOTIVOS_PERDA: MotivoPerda[] = [
  "Preço",
  "Timing",
  "Concorrência",
  "Sumiu",
  "Sem orçamento",
  "Sem fit",
  "Decisor errado",
  "Outro",
];

/** Percepção subjetiva do vendedor sobre a probabilidade de fechamento. */
export type PercepcaoVendedor =
  | "Muito baixa"
  | "Baixa"
  | "Média"
  | "Alta"
  | "Muito alta";

export const PERCEPCOES_VENDEDOR: PercepcaoVendedor[] = [
  "Muito baixa",
  "Baixa",
  "Média",
  "Alta",
  "Muito alta",
];

/** Tom geral de uma ligação ou interação. */
export type TomInteracao = "positivo" | "neutro" | "negativo";

// =============================================================
// Camada de IA
// =============================================================

/** Códigos dos 15 features de IA (idênticos aos seeds de ai_features). */
export type AiFeatureCodigo =
  | "enriquecer_lead"
  | "gerar_oferta_raiox"
  | "gerar_documento_raiox"
  | "gerar_mensagem_cadencia"
  | "extrair_ligacao"
  | "next_best_action"
  | "briefing_pre_call"
  | "objection_handler"
  | "gerar_proposta"
  | "sugerir_motivo_perda"
  | "detectar_risco"
  | "resumo_diario"
  | "digest_semanal"
  | "reativar_nutricao"
  | "forecast_ml";

export const AI_FEATURES: AiFeatureCodigo[] = [
  "enriquecer_lead", "gerar_oferta_raiox", "gerar_documento_raiox",
  "gerar_mensagem_cadencia", "extrair_ligacao", "next_best_action",
  "briefing_pre_call", "objection_handler", "gerar_proposta",
  "sugerir_motivo_perda", "detectar_risco", "resumo_diario",
  "digest_semanal", "reativar_nutricao", "forecast_ml",
];

export type AiProviderCodigo = "anthropic" | "openai" | "google" | "local";

export interface AiProvider {
  id: number;
  organizacao_id: string | null;
  nome: string;
  codigo: AiProviderCodigo;
  api_key_ref: string | null;
  base_url: string | null;
  ativo: boolean;
  prioridade: number;
  modelo_default: string | null;
  custo_input_1k: number;
  custo_output_1k: number;
}

export interface AiFeature {
  id: number;
  organizacao_id: string | null;
  codigo: AiFeatureCodigo;
  nome: string;
  descricao: string | null;
  etapa_fluxo: string | null;
  ativo: boolean;
  provider_codigo: AiProviderCodigo;
  modelo: string;
  temperature: number;
  max_tokens: number;
  limite_dia_org: number;
  limite_dia_usuario: number;
  papel_minimo: "gestor" | "comercial" | "sdr";
}

export interface AiPrompt {
  id: number;
  organizacao_id: string | null;
  feature_codigo: AiFeatureCodigo;
  versao: number;
  ativo: boolean;
  system_prompt: string | null;
  user_template: string;
  variaveis_esperadas: string[];
  notas_editor: string | null;
  created_at: string;
}

export interface AiInvocation {
  id: number;
  organizacao_id: string;
  feature_codigo: AiFeatureCodigo;
  prompt_versao: number | null;
  provider_codigo: AiProviderCodigo;
  modelo: string;
  lead_id: number | null;
  input_vars: Record<string, unknown>;
  output_texto: string | null;
  output_json: Record<string, unknown> | null;
  tokens_input: number | null;
  tokens_output: number | null;
  custo_estimado: number | null;
  latencia_ms: number | null;
  status: "sucesso" | "erro" | "bloqueado_budget" | "timeout";
  erro_msg: string | null;
  created_at: string;
}

export interface AiUso30d {
  organizacao_id: string;
  feature_codigo: AiFeatureCodigo;
  invocacoes_ok: number;
  invocacoes_erro: number;
  bloqueadas: number;
  custo_usd: number;
  tokens_in_total: number;
  tokens_out_total: number;
  latencia_media_ms: number;
}

// ---------- multi-tenant ----------

export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  owner_id: string | null;
  ativa: boolean;
  created_at: string;
}

export interface OrganizacaoConfig {
  organizacao_id: string;
  distribuicao_automatica: boolean;
  distribuicao_estrategia: "segmento" | "round_robin" | "manual";
  raiox_preco_default: number;
  raiox_voucher_valor: number;
  updated_at: string;
}

export interface Membro {
  id: number;
  organizacao_id: string;
  profile_id: string;
  role: Role;
  ativo: boolean;
  created_at: string;
}

/** Membro + dados do profile (join normal nas queries) */
export interface MembroEnriched extends Membro {
  display_name: string;
  email: string;
}

export interface VendedorSegmento {
  id: number;
  organizacao_id: string;
  profile_id: string;
  segmento: string;
  created_at: string;
}

export interface MetaIndividual {
  id: number;
  organizacao_id: string;
  profile_id: string;
  periodo_tipo: "semana" | "mes";
  periodo_inicio: string;
  periodo_fim: string;
  meta_leads: number;
  meta_raiox: number;
  meta_calls: number;
  meta_props: number;
  meta_fech: number;
  created_at: string;
}

export interface Convite {
  id: number;
  organizacao_id: string;
  email: string;
  role: Role;
  token: string;
  convidado_por: string | null;
  expira_em: string;
  aceito_em: string | null;
  created_at: string;
}

// ---------- domínio ----------

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  role: Role;
  home_organizacao_id: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Lead {
  id: number;
  organizacao_id: string;
  legacy_id: string | null;
  is_demo: boolean;
  nome: string | null;
  empresa: string | null;
  cargo: string | null;
  email: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  instagram: string | null;
  segmento: string | null;
  cidade_uf: string | null;
  site: string | null;
  responsavel_id: string | null;
  motion: string | null;
  fonte: string | null;
  temperatura: "Frio" | "Morno" | "Quente";
  prioridade: "A" | "B" | "C";
  funnel_stage: FunnelStage;
  crm_stage: CrmStage | null;
  decisor: boolean | null;
  fit_icp: boolean | null;
  dor_principal: string | null;
  observacoes: string | null;
  canal_principal: string | null;
  data_entrada: string;
  data_primeiro_contato: string | null;
  data_ultimo_toque: string | null;
  data_proxima_acao: string | null;
  proxima_acao: string | null;
  valor_potencial: number;
  probabilidade: number;
  receita_ponderada: number;
  data_proposta: string | null;
  data_fechamento: string | null;
  newsletter_optin: boolean;
  motivo_perda: MotivoPerda | null;
  motivo_perda_detalhe: string | null;
  percepcao_vendedor: PercepcaoVendedor | null;
  created_at: string;
  updated_at: string;
}

// --- Score de fechamento ---
export interface LeadScore {
  id: number;
  organizacao_id: string;
  responsavel_id: string | null;
  empresa: string | null;
  nome: string | null;
  crm_stage: CrmStage | null;
  funnel_stage: FunnelStage;
  valor_potencial: number;
  probabilidade: number;
  receita_ponderada: number;
  fit_icp: boolean | null;
  decisor: boolean | null;
  temperatura: "Frio" | "Morno" | "Quente";
  percepcao_vendedor: PercepcaoVendedor | null;
  dias_sem_tocar: number;
  score: number;
  valor_esperado_score: number;
}

export interface ForecastMes {
  organizacao_id: string;
  responsavel_id: string | null;
  forecast_best: number;
  forecast_likely: number;
  forecast_worst: number;
  leads_altos: number;
  leads_ativos: number;
}

export interface TopOportunidade {
  id: number;
  organizacao_id: string;
  responsavel_id: string | null;
  empresa: string | null;
  nome: string | null;
  crm_stage: CrmStage | null;
  valor_potencial: number;
  data_proxima_acao: string | null;
  proxima_acao: string | null;
  percepcao_vendedor: PercepcaoVendedor | null;
  score: number;
  valor_esperado: number;
}

export interface LeadEnriched extends Lead {
  dias_sem_tocar: number;
  semana_proxima_acao: string | null;
  urgencia: "sem_acao" | "vencida" | "hoje" | "amanha" | "esta_semana" | "futuro";
  responsavel_nome: string | null;
  responsavel_email: string | null;
  raiox_status: RaioxStatus | null;
  raiox_nivel: "Alto" | "Médio" | "Baixo" | "Pendente" | null;
  raiox_score: number | null;
  raiox_data_pagamento: string | null;
  total_ligacoes: number;
}

export interface Ligacao {
  id: number;
  organizacao_id: string;
  lead_id: number;
  responsavel_id: string | null;
  tipo_ligacao: string | null;
  tentativa: number;
  data_hora: string;
  duracao_min: number;
  atendeu: boolean | null;
  resultado: string | null;
  call_gerou_raio_x: boolean;
  agendou_call: boolean;
  resumo: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface Cadencia {
  id: number;
  organizacao_id: string;
  lead_id: number;
  passo: "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
  canal: string | null;
  objetivo: string | null;
  data_prevista: string | null;
  data_executada: string | null;
  status: "pendente" | "enviado" | "respondido" | "pular" | "removido";
  mensagem_enviada: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface RaioX {
  id: number;
  organizacao_id: string;
  lead_id: number;
  responsavel_id: string | null;
  data_oferta: string;
  status_oferta: RaioxStatus;
  tipo_voucher: TipoVoucher;
  preco_lista: number;
  voucher_desconto: number;
  gratuito: boolean;
  preco_final: number;
  pago: boolean;
  data_pagamento: string | null;
  score: number | null;
  perda_anual_estimada: number | null;
  nivel: "Alto" | "Médio" | "Baixo" | "Pendente";
  saida_recomendada: string | null;
  call_revisao: boolean;
  data_call: string | null;
  diagnostico_pago_sugerido: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface Newsletter {
  id: number;
  organizacao_id: string;
  lead_id: number;
  responsavel_id: string | null;
  optin: boolean;
  data_entrada: string;
  ultima_edicao_enviada: string | null;
  proxima_edicao_sugerida: string | null;
  status: "Ativo" | "Pausado" | "Remover";
  cta_provavel: string | null;
  observacoes: string | null;
  created_at: string;
}
