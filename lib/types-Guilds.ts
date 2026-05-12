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
  | "forecast_ml"
  | "analisar_whatsapp";

export const AI_FEATURES: AiFeatureCodigo[] = [
  "enriquecer_lead", "gerar_oferta_raiox", "gerar_documento_raiox",
  "gerar_mensagem_cadencia", "extrair_ligacao", "next_best_action",
  "briefing_pre_call", "objection_handler", "gerar_proposta",
  "sugerir_motivo_perda", "detectar_risco", "resumo_diario",
  "digest_semanal", "reativar_nutricao", "forecast_ml", "analisar_whatsapp",
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
  /** Locale do prompt (pt-BR, en-US...). Default 'pt-BR'. Dispatcher escolhe matching org.idioma_padrao. */
  idioma: string;
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

export type RegimeTributario =
  | "simples_nacional"
  | "lucro_presumido"
  | "lucro_real"
  | "mei"
  | "isento";

export interface EnderecoOrg {
  cep?: string;          // BR-specific (CEP); fora do BR usar `postal_code`
  postal_code?: string;  // genérico (ZIP, etc)
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;           // BR; fora usar `regiao`
  regiao?: string;       // estado/província/região
  pais?: string;         // ISO 3166-1 alpha-2 (default da org)
}

export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  owner_id: string | null;
  ativa: boolean;
  plano?: "trial" | "starter" | "growth" | "scale";
  billing_status?: "trialing" | "active" | "past_due" | "canceled";
  trial_started_at?: string;
  trial_ends_at?: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  // Dados fiscais (todos opcionais — preenchidos pós-onboarding)
  razao_social?: string | null;
  cnpj?: string | null;
  /** Tax ID genérico (CNPJ/EIN/RUT/NIF/VAT/etc.) — usado pra empresas fora do BR */
  tax_id?: string | null;
  inscricao_estadual?: string | null;
  regime_tributario?: RegimeTributario | null;
  telefone?: string | null;
  site?: string | null;
  endereco?: EnderecoOrg | null;
  logo_url?: string | null;
  timezone?: string | null;
  /** ISO 3166-1 alpha-2 (default 'BR') */
  pais?: string;
  /** locale (default 'pt-BR') — define idioma da UI/IA/emails */
  idioma_padrao?: string;
  /** ISO 4217 (default 'BRL') */
  moeda_padrao?: string;
  /** Cor primária custom pro portal embaixador / NPS. Hex `#rrggbb`. Default usa Guilds. */
  portal_cor_primaria?: string | null;
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
  // Configurações de perfil
  telefone?: string | null;
  avatar_url?: string | null;
  timezone?: string | null;
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
  valor_setup: number;
  valor_mensal: number;
  probabilidade: number;
  receita_ponderada: number;
  data_proposta: string | null;
  data_fechamento: string | null;
  link_proposta: string | null;
  newsletter_optin: boolean;
  motivo_perda: MotivoPerda | null;
  motivo_perda_detalhe: string | null;
  percepcao_vendedor: PercepcaoVendedor | null;
  /** Liga o lead à indicação que o originou (NULL = lead não veio de indicação). */
  indicacao_id: number | null;
  /** Data de vencimento do contrato. Cron diário cria expansão tipo='renovacao' quando <= 90d. */
  data_renovacao: string | null;
  /** Ciclo recorrente em meses. Quando renovação fecha, data_renovacao avança automaticamente. */
  ciclo_renovacao_meses: number | null;
  /** Valor previsto da próxima renovação (default = valor_potencial). */
  valor_renovacao: number | null;
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
  // Scoring multi-dimensional (computed on-demand via recalcular_score_lead)
  score_total?: number | null;
  score_icp_fit?: number | null;
  score_engajamento?: number | null;
  score_comportamento?: number | null;
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

// =============================================================================
// Indicações / Advocacy (lado direito do funil borboleta)
// =============================================================================

export type MomentoPedidoIndicacao =
  | "pos_fechamento"
  | "pos_raio_x"
  | "pos_resultado"
  | "renovacao"
  | "outro";

export const MOMENTOS_PEDIDO_INDICACAO: MomentoPedidoIndicacao[] = [
  "pos_fechamento",
  "pos_raio_x",
  "pos_resultado",
  "renovacao",
  "outro",
];

export type CanalPedidoIndicacao = "call" | "whatsapp" | "email" | "pessoalmente" | "outro";

export const CANAIS_PEDIDO_INDICACAO: CanalPedidoIndicacao[] = [
  "call",
  "whatsapp",
  "email",
  "pessoalmente",
  "outro",
];

export type StatusPedidoIndicacao =
  | "pendente"
  | "respondido"
  | "negado"
  | "ignorado"
  | "agendado";

export const STATUS_PEDIDO_INDICACAO: StatusPedidoIndicacao[] = [
  "pendente",
  "respondido",
  "negado",
  "ignorado",
  "agendado",
];

export type StatusIndicacao =
  | "recebida"
  | "contactado"
  | "virou_lead"
  | "fechado"
  | "perdido"
  | "descartado";

export const STATUS_INDICACAO: StatusIndicacao[] = [
  "recebida",
  "contactado",
  "virou_lead",
  "fechado",
  "perdido",
  "descartado",
];

export type RecompensaTipo =
  | "desconto_renovacao"
  | "credito"
  | "produto"
  | "dinheiro"
  | "nenhum";

export interface PedidoIndicacao {
  id: number;
  organizacao_id: string;
  lead_id: number;
  solicitado_por: string | null;
  momento: MomentoPedidoIndicacao;
  canal: CanalPedidoIndicacao | null;
  status: StatusPedidoIndicacao;
  qtd_indicacoes_recebidas: number;
  data_pedido: string;
  data_resposta: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * View `v_pedidos_pendentes` aliasa o PK como `pedido_id` para evitar colisão
 * com `lead.id` quando enriquecido. Por isso NÃO estende `PedidoIndicacao`
 * (que tem `id`) — declara só os campos retornados pela view.
 */
export interface PedidoIndicacaoEnriched {
  pedido_id: number;
  organizacao_id: string;
  lead_id: number;
  solicitado_por: string | null;
  momento: MomentoPedidoIndicacao;
  canal: CanalPedidoIndicacao | null;
  status: StatusPedidoIndicacao;
  data_pedido: string;
  observacoes: string | null;
  lead_empresa: string | null;
  lead_nome: string | null;
  lead_responsavel_id: string | null;
  lead_crm_stage: CrmStage | null;
  solicitado_por_nome: string | null;
  dias_pendente: number;
}

export interface Indicacao {
  id: number;
  organizacao_id: string;

  embaixador_lead_id: number | null;
  embaixador_externo_nome: string | null;

  pedido_id: number | null;
  solicitado_por: string | null;

  indicado_nome: string;
  indicado_empresa: string | null;
  indicado_cargo: string | null;
  indicado_email: string | null;
  indicado_whatsapp: string | null;
  indicado_linkedin: string | null;
  contexto: string | null;

  lead_convertido_id: number | null;
  status: StatusIndicacao;

  data_recebida: string;
  data_contactado: string | null;
  data_convertido: string | null;
  data_fechado: string | null;
  data_perdido: string | null;

  recompensa_tipo: RecompensaTipo | null;
  recompensa_valor: number | null;
  recompensa_paga: boolean;
  recompensa_paga_em: string | null;

  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IndicacaoEnriched extends Indicacao {
  embaixador_empresa: string | null;
  embaixador_nome: string | null;
  lead_convertido_empresa: string | null;
  lead_convertido_crm_stage: CrmStage | null;
  lead_convertido_valor: number | null;
  solicitado_por_nome: string | null;
}

export interface AdvocacyKpis {
  organizacao_id: string;
  clientes_fechados: number;
  indicacoes_viraram_lead: number;
  clientes_que_indicaram: number;
  k_factor: number;
  dias_media_p_responder: number | null;
  receita_via_indicacao: number;
}

export interface TopEmbaixador {
  organizacao_id: string;
  embaixador_lead_id: number;
  embaixador_empresa: string | null;
  embaixador_nome: string | null;
  embaixador_responsavel_id: string | null;
  qtd_indicacoes: number;
  qtd_viraram_lead: number;
  qtd_fecharam: number;
  receita_gerada: number;
  taxa_conversao_pct: number;
  ultima_indicacao_em: string;
}

// =============================================================================
// Onboarding pós-venda + NPS (P2 do flywheel)
// =============================================================================

export type StatusOnboardingChecklist = "em_andamento" | "concluido" | "abandonado";
export type StatusOnboardingItem = "pendente" | "concluido" | "pulado";
export type ResponsavelPapel = "comercial" | "sdr" | "gestor" | "cliente";
export type CanalNps = "email" | "whatsapp" | "call" | "in_app" | "manual";
export type CategoriaNps = "promotor" | "neutro" | "detrator";

export interface OnboardingTemplate {
  id: number;
  organizacao_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  default_template: boolean;
  status?: "draft" | "publicado" | "arquivado";
  versao?: number;
  parent_template_id?: number | null;
  publicado_em?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingTemplateItem {
  id: number;
  template_id: number;
  ordem: number;
  titulo: string;
  descricao: string | null;
  due_offset_dias: number;
  obrigatorio: boolean;
  responsavel_papel: ResponsavelPapel | null;
}

export interface OnboardingChecklist {
  id: number;
  organizacao_id: string;
  lead_id: number;
  template_id: number | null;
  status: StatusOnboardingChecklist;
  iniciado_em: string;
  concluido_em: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingItem {
  id: number;
  checklist_id: number;
  template_item_id: number | null;
  ordem: number;
  titulo: string;
  descricao: string | null;
  status: StatusOnboardingItem;
  due_at: string | null;
  responsavel_papel: ResponsavelPapel | null;
  responsavel_id: string | null;
  concluido_em: string | null;
  concluido_por: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingPendente {
  checklist_id: number;
  organizacao_id: string;
  lead_id: number;
  iniciado_em: string;
  template_id: number | null;
  lead_empresa: string | null;
  lead_nome: string | null;
  lead_responsavel_id: string | null;
  total_items: number;
  concluidos: number;
  pulados: number;
  atrasados: number;
  pct_concluido: number;
}

export interface NpsResponse {
  id: number;
  organizacao_id: string;
  lead_id: number;
  solicitado_em: string;
  solicitado_por: string | null;
  canal: CanalNps | null;
  score: number | null;
  comentario: string | null;
  respondido_em: string | null;
  categoria: CategoriaNps | null;
  created_at: string;
}

export interface NpsResumo {
  organizacao_id: string;
  total_respostas: number;
  promotores: number;
  neutros: number;
  detratores: number;
  nps_score: number | null;
  score_medio: number | null;
}

export interface NpsPendenteResponder {
  nps_id: number;
  organizacao_id: string;
  lead_id: number;
  solicitado_em: string;
  canal: CanalNps | null;
  lead_empresa: string | null;
  lead_nome: string | null;
  lead_responsavel_id: string | null;
  dias_pendente: number;
}

// =============================================================================
// Health Score (P3 do flywheel)
// =============================================================================

export type CategoriaHealth = "saudavel" | "atencao" | "em_risco";

export interface HealthScore {
  organizacao_id: string;
  lead_id: number;
  lead_empresa: string | null;
  lead_nome: string | null;
  lead_responsavel_id: string | null;
  data_fechamento: string | null;
  valor_potencial: number;
  dias_sem_interacao: number;
  pts_recencia: number;
  pts_nps: number;
  pts_onboarding: number;
  pts_indicacao: number;
  ultimo_nps_score: number | null;
  indicacoes_dadas: number;
  health_score: number;
  categoria: CategoriaHealth;
}

export interface HealthResumo {
  organizacao_id: string;
  total_fechados: number;
  saudaveis: number;
  atencao: number;
  em_risco: number;
  score_medio: number | null;
  arr_em_risco: number;
}

// =============================================================================
// Expansões (P4 do flywheel)
// =============================================================================

export type TipoExpansao =
  | "upsell"
  | "cross_sell"
  | "expansao_seats"
  | "renovacao"
  | "recompra"
  | "outro";

export const TIPOS_EXPANSAO: TipoExpansao[] = [
  "upsell",
  "cross_sell",
  "expansao_seats",
  "renovacao",
  "recompra",
  "outro",
];

export type EstagioExpansao =
  | "identificada"
  | "qualificada"
  | "proposta"
  | "negociacao"
  | "fechada"
  | "perdida";

export const ESTAGIOS_EXPANSAO: EstagioExpansao[] = [
  "identificada",
  "qualificada",
  "proposta",
  "negociacao",
  "fechada",
  "perdida",
];

export const ESTAGIOS_EXPANSAO_ATIVOS: EstagioExpansao[] = [
  "identificada",
  "qualificada",
  "proposta",
  "negociacao",
];

export type OrigemExpansao =
  | "vendedor"
  | "cliente"
  | "sistema_inatividade"
  | "sistema_milestone"
  | "sistema_renovacao";

export interface Expansao {
  id: number;
  organizacao_id: string;
  cliente_lead_id: number;
  responsavel_id: string | null;
  tipo: TipoExpansao;
  titulo: string;
  descricao: string | null;
  valor_potencial: number;
  valor_recorrente_mensal: number | null;
  estagio: EstagioExpansao;
  motivo_perda: string | null;
  origem: OrigemExpansao;
  data_identificada: string;
  data_proxima_acao: string | null;
  proxima_acao: string | null;
  data_fechada: string | null;
  data_perdida: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpansaoAtiva extends Expansao {
  cliente_empresa: string | null;
  cliente_nome: string | null;
  cliente_crm_stage: CrmStage | null;
  responsavel_nome: string | null;
  dias_aberta: number;
  dias_ate_acao: number | null;
}

export interface ExpansoesResumo {
  organizacao_id: string;
  total_expansoes: number;
  ativas: number;
  fechadas: number;
  perdidas: number;
  taxa_conversao_pct: number | null;
  pipeline_aberto: number;
  receita_expandida: number;
  arr_expandido: number;
  dias_medio_fechar: number | null;
}

export interface ExpansaoAtrasada {
  expansao_id: number;
  organizacao_id: string;
  cliente_lead_id: number;
  responsavel_id: string | null;
  tipo: TipoExpansao;
  titulo: string;
  estagio: EstagioExpansao;
  proxima_acao: string | null;
  data_proxima_acao: string;
  valor_potencial: number;
  cliente_empresa: string | null;
  cliente_nome: string | null;
  dias_atrasada: number;
}

// =============================================================================
// Renovações automáticas (P5 do flywheel)
// =============================================================================

export type UrgenciaRenovacao =
  | "vencida"
  | "critica"   // <= 7 dias
  | "urgente"   // <= 30 dias
  | "proxima"   // <= 60 dias
  | "futura"    // <= 90 dias
  | "distante"; // > 90 dias

export interface RenovacaoProxima {
  lead_id: number;
  organizacao_id: string;
  cliente_empresa: string | null;
  cliente_nome: string | null;
  responsavel_id: string | null;
  data_renovacao: string;
  ciclo_renovacao_meses: number | null;
  valor_previsto: number;
  dias_ate_renovacao: number;
  urgencia: UrgenciaRenovacao;
  tem_expansao_ativa: boolean;
  responsavel_nome: string | null;
}

export interface RenovacoesResumo {
  organizacao_id: string;
  total_clientes_recorrentes: number;
  renovacoes_proximas_90d: number;
  renovacoes_proximas_30d: number;
  renovacoes_vencidas: number;
  taxa_renovacao_pct: number | null;
  arr_em_renovacao_90d: number;
}

// =============================================================================
// Portal embaixador self-service (P6 do flywheel)
// =============================================================================

export interface EmbaixadorToken {
  id: number;
  organizacao_id: string;
  lead_id: number;
  token: string;
  ativo: boolean;
  expires_at: string | null;
  ultimo_acesso: string | null;
  total_acessos: number;
  total_indicacoes_recebidas: number;
  mensagem_personalizada: string | null;
  max_indicacoes_por_acesso: number;
  created_at: string;
  criado_por: string | null;
  embaixador_empresa: string | null;
  embaixador_nome: string | null;
  embaixador_crm_stage: CrmStage | null;
  criado_por_nome: string | null;
}

export interface EmbaixadorPortalContext {
  organizacao_id: string;
  organizacao_nome: string;
  lead_id: number;
  embaixador_empresa: string | null;
  embaixador_nome: string | null;
  mensagem_personalizada: string | null;
  total_indicacoes_recebidas: number;
  max_indicacoes_por_acesso: number;
  qtd_minhas_indicacoes: number;
  qtd_minhas_que_fecharam: number;
}

// Programa de recompensas (item 5 do polish)
export interface OrgRecompensaConfig {
  organizacao_id: string;
  ativo: boolean;
  valor_virou_lead: number;
  valor_fechado: number;
  tipo_default: RecompensaTipo;
  mensagem_recompensa: string | null;
  limite_mensal_por_embaixador: number | null;
  created_at: string;
  updated_at: string;
}

export interface RecompensasResumo {
  organizacao_id: string;
  total_com_recompensa: number;
  total_pagas: number;
  total_pendentes: number;
  total_valor_pago: number;
  total_valor_pendente: number;
}

export interface ProgramaRecompensaPortal {
  programa_ativo: boolean;
  valor_virou_lead: number;
  valor_fechado: number;
  tipo_default: RecompensaTipo;
  mensagem_recompensa: string | null;
}

// =============================================================================
// Flywheel polish (Bloco B-D) — drill-down + tendência + breakdown
// =============================================================================

export interface HealthBreakdownComponente {
  componente: "recencia" | "nps" | "onboarding" | "indicacao";
  label: string;
  pontos: number;
  peso: number;
  descricao: string;
  acao_sugerida: string | null;
}

export interface HealthBreakdown {
  organizacao_id: string;
  lead_id: number;
  lead_empresa: string | null;
  lead_nome: string | null;
  lead_responsavel_id: string | null;
  health_score: number;
  categoria: CategoriaHealth;
  dias_sem_interacao: number;
  componentes: HealthBreakdownComponente[];
  proxima_acao_recomendada: string;
}

export type TendenciaHealth =
  | "subindo_forte"
  | "subindo"
  | "estavel"
  | "caindo"
  | "caindo_forte"
  | "novo";

export interface HealthTendencia {
  lead_id: number;
  organizacao_id: string;
  score_atual: number;
  categoria_atual: CategoriaHealth;
  score_30d_atras: number | null;
  score_60d_atras: number | null;
  score_90d_atras: number | null;
  tendencia_30d: TendenciaHealth;
}

export interface HealthScoreSnapshot {
  id: number;
  organizacao_id: string;
  lead_id: number;
  snapshot_date: string;
  health_score: number;
  pts_recencia: number;
  pts_nps: number;
  pts_onboarding: number;
  pts_indicacao: number;
  categoria: CategoriaHealth;
  created_at: string;
}

export interface NpsHistoricoLead {
  lead_id: number;
  organizacao_id: string;
  total_respostas: number;
  respondidas: number;
  score_medio: number | null;
  score_max: number | null;
  score_min: number | null;
  ultimas_10: Array<{
    score: number;
    data: string | null;
    comentario: string | null;
    categoria: CategoriaNps | null;
  }>;
}
