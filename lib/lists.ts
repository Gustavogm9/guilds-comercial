// Listas/dropdowns do sistema (espelha aba LISTAS da planilha)

export const ETAPAS_CRM = [
  "Base",
  "Prospecção",
  "Qualificado",
  "Raio-X Ofertado",
  "Raio-X Feito",
  "Call Marcada",
  "Diagnóstico Pago",
  "Proposta",
  "Negociação",
  "Fechado",
  "Perdido",
  "Nutrição",
] as const;

/** Colunas visíveis no Kanban do Pipeline (exclui Base, Perdido, Nutrição). */
export const ETAPAS_PIPELINE_VISIVEL = [
  "Prospecção",
  "Qualificado",
  "Raio-X Ofertado",
  "Raio-X Feito",
  "Call Marcada",
  "Diagnóstico Pago",
  "Proposta",
  "Negociação",
  "Fechado",
] as const;

/** Probabilidade default por etapa (espelha lead_probabilidade_por_etapa no Postgres). */
export const PROBABILIDADE_POR_ETAPA: Record<string, number> = {
  "Base": 0,
  "Prospecção": 0.10,
  "Qualificado": 0.25,
  "Raio-X Ofertado": 0.35,
  "Raio-X Feito": 0.45,
  "Call Marcada": 0.60,
  "Diagnóstico Pago": 0.75,
  "Proposta": 0.85,
  "Negociação": 0.95,
  "Fechado": 1.00,
  "Perdido": 0,
  "Nutrição": 0.05,
};

export const MOTIONS = ["Outbound", "Inbound", "Indicação", "Parceria", "Reativação"] as const;

export const SEGMENTOS = [
  "Farmácia / Manipulação",
  "Imobiliária",
  "Corretora / Seguros",
  "Saúde ocupacional",
  "Saúde",
  "Fintech / Operações",
  "Serviços",
  "Indústria",
  "Outro",
] as const;

export const FONTES = [
  "Lista fria",
  "Grupo / Comunidade",
  "Indicação",
  "Networking",
  "Instagram",
  "LinkedIn",
  "Site",
  "Newsletter",
  "Parceiro",
  "Evento",
  "Outbound manual",
] as const;

export const TEMPERATURAS = ["Frio", "Morno", "Quente"] as const;

export const CANAIS = ["Email", "WhatsApp", "Email + WhatsApp", "Ligação"] as const;

export const PRIORIDADES = ["A", "B", "C"] as const;

export const RAIOX_STATUS = [
  "Não ofertado",
  "Ofertado",
  "Pago",
  "Concluído",
  "Recusou",
] as const;

export const RAIOX_TIPO_VOUCHER = [
  "Nenhum",
  "R$50",
  "Gratuito estratégico",
] as const;

export const TIPOS_CALL = [
  "Qualificação",
  "Revisão Raio-X",
  "Diagnóstico pago",
  "Proposta",
  "Sem call",
] as const;

export const RESULTADOS_LIGACAO = [
  "Atendeu e qualificou",
  "Atendeu e pediu retorno",
  "Atendeu e sem fit",
  "Sem resposta",
  "Caixa postal",
  "Número inválido",
  "Agendou call",
  "Enviado Raio-X",
] as const;

export const PROXIMAS_ACOES = [
  "Enviar D0",
  "Enviar D3",
  "Enviar D7",
  "Enviar D11",
  "Enviar D16",
  "Enviar D30",
  "Ligar",
  "Enviar Raio-X",
  "Agendar call",
  "Enviar proposta",
  "Entrar em nutrição",
  "Sem ação",
] as const;

// Cores por etapa para o kanban
export const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Base":               { bg: "bg-stone-50",  text: "text-stone-700",  border: "border-stone-200" },
  "Prospecção":         { bg: "bg-slate-50",  text: "text-slate-700",  border: "border-slate-200" },
  "Qualificado":        { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  "Raio-X Ofertado":    { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  "Raio-X Feito":       { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  "Call Marcada":       { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
  "Diagnóstico Pago":   { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "Proposta":           { bg: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-200" },
  "Negociação":         { bg: "bg-pink-50",   text: "text-pink-700",   border: "border-pink-200" },
  "Fechado":            { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "Perdido":            { bg: "bg-zinc-50",   text: "text-zinc-500",   border: "border-zinc-200" },
  "Nutrição":           { bg: "bg-teal-50",   text: "text-teal-700",   border: "border-teal-200" },
};

export const URGENCIA_LABELS = {
  vencida:     { label: "Vencida",      color: "text-urgent-500 bg-red-50 border-red-200" },
  hoje:        { label: "Hoje",         color: "text-warning-500 bg-amber-50 border-amber-200" },
  amanha:      { label: "Amanhã",       color: "text-blue-700 bg-blue-50 border-blue-200" },
  esta_semana: { label: "Esta semana",  color: "text-slate-700 bg-slate-50 border-slate-200" },
  futuro:      { label: "Futuro",       color: "text-slate-500 bg-slate-50 border-slate-200" },
  sem_acao:    { label: "Sem ação",     color: "text-zinc-500 bg-zinc-50 border-zinc-200" },
} as const;
