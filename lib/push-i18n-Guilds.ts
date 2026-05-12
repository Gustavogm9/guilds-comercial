/**
 * Templates de push notification por evento × locale.
 *
 * Usar via `buildPushPayload(evento, locale, vars)` que retorna `{title, body}`
 * pra passar em `sendPushToUser({title, body, ...})`.
 *
 * Adicionar novo locale: copiar bloco existente e traduzir. Variável é
 * substituída via simple `{{var}}` replacement (sem dependência externa).
 */
import type { PushEvento } from "./push";

type Locale = "pt-BR" | "en-US";

interface Template {
  title: string;
  body: string;
}

/**
 * Templates indexados por [locale][evento]. Vars suportadas via {{name}}.
 */
const TEMPLATES: Record<Locale, Record<PushEvento, Template>> = {
  "pt-BR": {
    cadencia_vencendo: {
      title: "Cadência {{passo}} hoje · {{empresa}}",
      body: "Não esqueça do toque de hoje ({{canal}}).",
    },
    resumo_diario: {
      title: "Seu resumo de hoje chegou",
      body: "{{n_leads}} leads ativos no pipeline. Veja o que priorizar.",
    },
    lead_fechado_proposta: {
      title: "🎉 {{empresa}} fechou!",
      body: "Parabéns! Atualize o valor real e o cliente é seu.",
    },
    lead_reabriu: {
      title: "{{empresa}} respondeu sua mensagem",
      body: "{{lead_nome}} acabou de interagir. Hora de retomar.",
    },
    nps_detrator_recebido: {
      title: "NPS detrator: {{empresa}}",
      body: "Score {{score}}/10. Ação hoje pode salvar o cliente.",
    },
    indicacao_via_portal: {
      title: "Nova indicação de {{embaixador}}",
      body: "{{indicado_nome}}{{indicado_empresa_label}} chegou pelo portal.",
    },
    health_risco_critico: {
      title: "Cliente em risco: {{empresa}}",
      body: "Health caiu pra {{health_score}}. Ver breakdown.",
    },
    renovacao_iminente: {
      title: "Renovação em {{dias}}d: {{empresa}}",
      body: "Contrato vence em {{data_renovacao}}. Confirmar continuidade.",
    },
    expansao_atrasada: {
      title: "Expansão atrasada: {{titulo}}",
      body: "Próxima ação venceu há {{dias_atraso}}d. Fechar ou perder.",
    },
  },
  "en-US": {
    cadencia_vencendo: {
      title: "Cadence {{passo}} today · {{empresa}}",
      body: "Don't forget today's outreach ({{canal}}).",
    },
    resumo_diario: {
      title: "Your daily summary is ready",
      body: "{{n_leads}} active leads in your pipeline. See what to prioritize.",
    },
    lead_fechado_proposta: {
      title: "🎉 {{empresa}} closed!",
      body: "Congrats! Update the actual value and you're done.",
    },
    lead_reabriu: {
      title: "{{empresa}} replied to your message",
      body: "{{lead_nome}} just engaged. Time to follow up.",
    },
    nps_detrator_recebido: {
      title: "NPS detractor: {{empresa}}",
      body: "Score {{score}}/10. Acting today may save the customer.",
    },
    indicacao_via_portal: {
      title: "New referral from {{embaixador}}",
      body: "{{indicado_nome}}{{indicado_empresa_label}} just came in via the portal.",
    },
    health_risco_critico: {
      title: "Customer at risk: {{empresa}}",
      body: "Health dropped to {{health_score}}. See breakdown.",
    },
    renovacao_iminente: {
      title: "Renewal in {{dias}}d: {{empresa}}",
      body: "Contract ends {{data_renovacao}}. Confirm continuity.",
    },
    expansao_atrasada: {
      title: "Expansion overdue: {{titulo}}",
      body: "Next action passed {{dias_atraso}}d ago. Close or drop.",
    },
  },
};

/** Substitui {{vars}} no template. */
function render(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => String(vars[k] ?? ""));
}

/**
 * Constrói o payload de push pra um evento + locale.
 * Variantes específicas (Fechado vs Perdido) são passadas via `variantOverride`.
 */
export function buildPushPayload(
  evento: PushEvento,
  locale: string,
  vars: Record<string, string | number> = {},
  variantOverride?: Partial<Template>
): { title: string; body: string } {
  const safeLocale: Locale = (locale === "en-US" ? "en-US" : "pt-BR");
  const tpl = TEMPLATES[safeLocale][evento];
  return {
    title: render(variantOverride?.title ?? tpl.title, vars),
    body: render(variantOverride?.body ?? tpl.body, vars),
  };
}

/**
 * Helper: pega idioma_padrao da org via supabase admin.
 * Cache simples por orgId pra não consultar 10x num cron.
 */
const orgLocaleCache = new Map<string, { locale: string; at: number }>();
const CACHE_TTL_MS = 5 * 60_000;

export async function getOrgLocale(supabaseAdmin: any, orgId: string): Promise<string> {
  const cached = orgLocaleCache.get(orgId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.locale;

  const { data } = await supabaseAdmin
    .from("organizacoes")
    .select("idioma_padrao")
    .eq("id", orgId)
    .maybeSingle();
  const locale = data?.idioma_padrao ?? "pt-BR";
  orgLocaleCache.set(orgId, { locale, at: Date.now() });
  return locale;
}
