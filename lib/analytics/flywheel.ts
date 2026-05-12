"use server";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

/**
 * Tracking de eventos do flywheel.
 *
 * Server action chamada por client components em momentos-chave:
 *   - flywheel_aberto: visita /flywheel
 *   - flywheel_card_clicado: click num FaseCard
 *   - flywheel_tour_completo / flywheel_tour_dismissed
 *   - health_modal_aberto: drill-down de health
 *   - onboarding_checklist_aberto
 *   - script_pedido_aberto / script_pedido_copiado
 *   - proposta_expansao_aberta / proposta_expansao_copiada
 *   - nps_insights_aberto
 *   - celebracao_pos_fechado_disparada / celebracao_indicacoes_salvas
 *   - portal_embaixador_acessado (server-side em /indicar/[token])
 *
 * Não-PII por design: properties são contextuais (lead_id, fonte) mas sem
 * email/whatsapp/conteúdo do user. RLS garante isolamento por org.
 *
 * Falha silenciosa: erros nunca interrompem a UX do user.
 */
const EVENT_NAMES = [
  "flywheel_aberto",
  "flywheel_card_clicado",
  "flywheel_tour_completo",
  "flywheel_tour_dismissed",
  "health_modal_aberto",
  "onboarding_checklist_aberto",
  "script_pedido_aberto",
  "script_pedido_copiado",
  "proposta_expansao_aberta",
  "proposta_expansao_copiada",
  "nps_insights_aberto",
  "celebracao_pos_fechado_disparada",
  "celebracao_indicacoes_salvas",
  "portal_embaixador_acessado",
  "portal_indicacao_criada",
  // Prospecção
  "prospeccao_empresa_ativada",
  "prospeccao_bulk_criado",
  "prospeccao_csv_exportado",
  "prospeccao_socios_enriquecidos",
  "prospeccao_base_aberta",
] as const;

export type FlywheelEventName = typeof EVENT_NAMES[number];

export async function trackFlywheelEvent(
  event_name: FlywheelEventName,
  properties?: Record<string, unknown>,
) {
  try {
    if (!EVENT_NAMES.includes(event_name)) return;

    const me = await getCurrentProfile();
    const orgId = await getCurrentOrgId();
    if (!orgId) return;

    const supabase = createClient();
    await supabase.from("flywheel_events").insert({
      organizacao_id: orgId,
      profile_id: me?.id ?? null,
      event_name,
      properties: properties ?? {},
    });
  } catch {
    // Tracking não deve quebrar UX
  }
}
