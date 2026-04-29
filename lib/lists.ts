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

// Cores por etapa para o kanban — light + dark friendly via opacity stepping.
// Cada stage usa um hue Tailwind como label visual. Tokens de design ficam pros
// elementos estruturais (cards, inputs); aqui o que precisamos é distinguir
// rapidamente por cor entre 11 estados — então usamos uma palette categórica.
export const STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Base":               { bg: "bg-stone-100/60 dark:bg-stone-500/15",     text: "text-stone-700 dark:text-stone-300",     border: "border-stone-200/70 dark:border-stone-500/25" },
  "Prospecção":         { bg: "bg-slate-100/60 dark:bg-slate-500/15",     text: "text-slate-700 dark:text-slate-300",     border: "border-slate-200/70 dark:border-slate-500/25" },
  "Qualificado":        { bg: "bg-sky-100/60 dark:bg-sky-500/15",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-200/70 dark:border-sky-500/25" },
  "Raio-X Ofertado":    { bg: "bg-indigo-100/60 dark:bg-indigo-500/15",   text: "text-indigo-700 dark:text-indigo-300",   border: "border-indigo-200/70 dark:border-indigo-500/25" },
  "Raio-X Feito":       { bg: "bg-violet-100/60 dark:bg-violet-500/15",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-200/70 dark:border-violet-500/25" },
  "Call Marcada":       { bg: "bg-amber-100/60 dark:bg-amber-500/15",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-200/70 dark:border-amber-500/25" },
  "Diagnóstico Pago":   { bg: "bg-orange-100/60 dark:bg-orange-500/15",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-200/70 dark:border-orange-500/25" },
  "Proposta":           { bg: "bg-rose-100/60 dark:bg-rose-500/15",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200/70 dark:border-rose-500/25" },
  "Negociação":         { bg: "bg-pink-100/60 dark:bg-pink-500/15",       text: "text-pink-700 dark:text-pink-300",       border: "border-pink-200/70 dark:border-pink-500/25" },
  "Fechado":            { bg: "bg-emerald-100/60 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/70 dark:border-emerald-500/25" },
  "Perdido":            { bg: "bg-zinc-100/60 dark:bg-zinc-500/15",       text: "text-zinc-600 dark:text-zinc-400",       border: "border-zinc-200/70 dark:border-zinc-500/25" },
  "Nutrição":           { bg: "bg-teal-100/60 dark:bg-teal-500/15",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-200/70 dark:border-teal-500/25" },
};

export const URGENCIA_LABELS = {
  vencida:     { label: "Vencida",      color: "text-destructive bg-destructive/10 border-destructive/25" },
  hoje:        { label: "Hoje",         color: "text-warning-500 bg-warning-500/10 border-warning-500/25" },
  amanha:      { label: "Amanhã",       color: "text-primary bg-primary/10 border-primary/25" },
  esta_semana: { label: "Esta semana",  color: "text-foreground bg-secondary border-border" },
  futuro:      { label: "Futuro",       color: "text-muted-foreground bg-muted border-border" },
  sem_acao:    { label: "Sem ação",     color: "text-muted-foreground bg-muted/60 border-border" },
} as const;
