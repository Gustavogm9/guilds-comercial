"use server";
/**
 * Server actions da /hoje.
 *
 * DÍVIDA TÉCNICA conhecida (não bloqueante):
 *
 *  - Item 5: `registrarLigacao` faz 3 mutações sequenciais (insert ligacoes →
 *    update leads → insert lead_evento). Não é atomicidade transacional —
 *    se a 2ª falhar, fica registro órfão. Em produção, mitigado pelo retry
 *    do vendedor. Fix futuro: function PG `registrar_ligacao_atomico(...)`
 *    via RPC, embrulhando as 3 ops em transação BEGIN/COMMIT.
 *
 *  - Item 25: query da view `v_leads_enriched` em /hoje não é cacheada com
 *    `unstable_cache` porque a função do Next 15+ proíbe `cookies()` dentro
 *    do callback (e o Supabase client lê auth via cookies). Fix futuro: usar
 *    service role bypass + filtros manuais por orgId — trade-off com
 *    defense-in-depth de RLS, então fica como decisão de produto.
 */
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type { CrmStage, MotivoPerda, PercepcaoVendedor, TomInteracao } from "@/lib/types";
import { MOTIVOS_PERDA } from "@/lib/types";
import { ETAPAS_EXIGEM_MOTIVO } from "@/lib/lists";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
}

/**
 * Pre-check de segurança: confirma que o lead pertence à org ativa do user
 * antes de qualquer mutação. RLS já protege, mas o silêncio do "0 rows affected"
 * é confuso pra debug — preferimos throw explícito.
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

export async function registrarLigacao(input: {
  lead_id: number;
  resultado: string;
  proxima_acao?: string;
  data_proxima_acao?: string;
  observacoes?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, input.lead_id, orgId);

  await supabase.from("ligacoes").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    responsavel_id: user?.id ?? null,
    data_hora: new Date().toISOString(),
    atendeu: input.resultado.startsWith("Atendeu"),
    resultado: input.resultado,
    observacoes: input.observacoes,
  });

  await supabase.from("leads").update({
    data_ultimo_toque: new Date().toISOString().slice(0, 10),
    proxima_acao: input.proxima_acao,
    data_proxima_acao: input.data_proxima_acao,
  }).eq("id", input.lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    ator_id: user?.id ?? null,
    tipo: "ligacao",
    payload: { resultado: input.resultado, observacoes: input.observacoes ?? null },
  });

  revalidatePath("/hoje");
  revalidatePath(`/vendas/pipeline/${input.lead_id}`);
}

export async function registrarToque(input: {
  lead_id: number;
  canal: string;
  cadencia_id?: number | null;
  passo?: string;
  observacoes?: string;
  proxima_acao?: string;
  data_proxima_acao?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, input.lead_id, orgId);
  const hoje = new Date().toISOString().slice(0, 10);

  if (input.cadencia_id || input.passo) {
    let query = supabase.from("cadencia").update({
      status: "enviado",
      data_executada: hoje,
    }).eq("organizacao_id", orgId).eq("lead_id", input.lead_id);

    query = input.cadencia_id
      ? query.eq("id", input.cadencia_id)
      : query.eq("passo", input.passo);

    await query;
  }

  await supabase.from("leads").update({
    data_ultimo_toque: hoje,
    proxima_acao: input.proxima_acao,
    data_proxima_acao: input.data_proxima_acao,
  }).eq("id", input.lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.lead_id,
    ator_id: user?.id ?? null,
    tipo: "toque",
    payload: { canal: input.canal, passo: input.passo ?? null, obs: input.observacoes ?? null },
  });

  revalidatePath("/hoje");
  revalidatePath(`/vendas/pipeline/${input.lead_id}`);
}

/** Etapas que exigem motivo obrigatório ao entrar. */
// Removido export constante para lib/lists.ts pois Next.js proíbe em Server Actions

/**
 * Move lead para nova etapa.
 *
 * Se novaEtapa ∈ ETAPAS_EXIGEM_MOTIVO, `motivo` é obrigatório.
 * `motivoDetalhe` só é usado se motivo === 'Outro'.
 */
export async function moverEtapa(
  lead_id: number,
  novaEtapa: CrmStage,
  motivo?: MotivoPerda,
  motivoDetalhe?: string,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);
  const exigeMotivo = ETAPAS_EXIGEM_MOTIVO.includes(novaEtapa);
  const arquivado = novaEtapa === "Fechado" || novaEtapa === "Perdido" || novaEtapa === "Nutrição";

  // Validação do motivo
  if (exigeMotivo) {
    if (!motivo || !MOTIVOS_PERDA.includes(motivo)) {
      throw new Error(`Motivo obrigatório ao mover para '${novaEtapa}'.`);
    }
    if (motivo === "Outro" && !(motivoDetalhe ?? "").trim()) {
      throw new Error("Descreva o motivo quando selecionar 'Outro'.");
    }
  }

  // Atualiza lead — inclui motivo se aplicável
  const update: Record<string, unknown> = {
    crm_stage: novaEtapa,
    funnel_stage: arquivado ? "arquivado" : "pipeline",
  };
  if (exigeMotivo) {
    update.motivo_perda = motivo ?? null;
    update.motivo_perda_detalhe = motivo === "Outro" ? (motivoDetalhe ?? "").trim() : null;
  }
  if (novaEtapa === "Fechado") {
    update.data_fechamento = new Date().toISOString().slice(0, 10);
    update.probabilidade = 1;
  }

  // Pega responsavel + empresa do lead pra enviar push depois
  const { data: leadAtual } = await supabase
    .from("leads")
    .select("responsavel_id, empresa, nome")
    .eq("id", lead_id)
    .maybeSingle();

  await supabase.from("leads").update(update).eq("id", lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "etapa_alterada",
    payload: {
      para: novaEtapa,
      ...(exigeMotivo ? { motivo, motivo_detalhe: motivo === "Outro" ? motivoDetalhe : null } : {}),
    },
  });

  // Push notification: só em mudanças finais (Fechado / Perdido)
  if ((novaEtapa === "Fechado" || novaEtapa === "Perdido") && leadAtual?.responsavel_id) {
    const empresaLabel = leadAtual.empresa || leadAtual.nome || `Lead #${lead_id}`;
    const { sendPushToUser } = await import("@/lib/push");
    sendPushToUser(leadAtual.responsavel_id, {
      evento: "lead_fechado_proposta",
      title: novaEtapa === "Fechado" ? `🎉 ${empresaLabel} fechou!` : `${empresaLabel} marcado como perdido`,
      body: novaEtapa === "Fechado"
        ? "Parabéns! Atualize o valor real e o cliente é seu."
        : `Motivo: ${motivo ?? "—"}. Veja o detalhe.`,
      url: `/vendas/pipeline/${lead_id}`,
      tag: `lead-${lead_id}-status`,
    }).catch((err) => console.warn("[push] moverEtapa", err));
  }

  // Disparar Webhooks
  try {
    const { data: leadCompleto } = await supabase.from("leads").select("*").eq("id", lead_id).single();
    if (leadCompleto) {
      const { dispatchWebhook } = await import("@/lib/webhooks");
      await dispatchWebhook(orgId, "lead.stage_changed", { lead: leadCompleto });
      
      if (novaEtapa === "Fechado") {
        await dispatchWebhook(orgId, "lead.won", { lead: leadCompleto });
      } else if (novaEtapa === "Perdido") {
        await dispatchWebhook(orgId, "lead.lost", { lead: leadCompleto });
      }
    }
  } catch (err) {
    console.warn("[webhook] Falha ao disparar webhooks em moverEtapa", err);
  }

  revalidatePath("/vendas/pipeline");
  revalidatePath("/hoje");
  revalidatePath("/growth/funil");
  revalidatePath(`/vendas/pipeline/${lead_id}`);
}

/**
 * Atualiza a percepção subjetiva do vendedor sobre chance de fechamento.
 * Re-calcula o score indiretamente (via view v_lead_score que chama lead_score_fechamento).
 */
export async function atualizarPercepcao(lead_id: number, percepcao: PercepcaoVendedor) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);

  await supabase.from("leads")
    .update({ percepcao_vendedor: percepcao })
    .eq("id", lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "percepcao_alterada",
    payload: { para: percepcao },
  });

  revalidatePath(`/vendas/pipeline/${lead_id}`);
  revalidatePath("/hoje");
  revalidatePath("/growth/funil");
}

/**
 * Marca o tom da última interação (positivo/neutro/negativo).
 * Atualiza a ligação mais recente do lead.
 */
export async function marcarTomUltimaInteracao(lead_id: number, tom: TomInteracao) {
  const supabase = createClient();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);

  const { data: ultima } = await supabase
    .from("ligacoes")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("organizacao_id", orgId)
    .order("data_hora", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultima) throw new Error("Nenhuma ligação registrada para marcar tom.");

  await supabase.from("ligacoes")
    .update({ tom_interacao: tom })
    .eq("id", ultima.id);

  revalidatePath(`/vendas/pipeline/${lead_id}`);
  revalidatePath("/growth/funil");
}

export async function adiarAcao(lead_id: number, dias: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);

  if (!Number.isFinite(dias) || dias < 1 || dias > 90) {
    throw new Error("Dias inválido (1-90).");
  }

  const d = new Date();
  d.setDate(d.getDate() + dias);
  const novaData = d.toISOString().slice(0, 10);

  await supabase.from("leads").update({
    data_proxima_acao: novaData,
  }).eq("id", lead_id).eq("organizacao_id", orgId);

  // Audit log — mantém consistência com outras actions desta página
  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id,
    ator_id: user?.id ?? null,
    tipo: "acao_adiada",
    payload: { dias, nova_data: novaData },
  });

  // Revalida /pipeline também — se user adiou pelo /hoje e abrir /pipeline em
  // outra aba, deve ver a data atualizada sem F5.
  revalidatePath("/hoje");
  revalidatePath("/vendas/pipeline");
  revalidatePath(`/vendas/pipeline/${lead_id}`);
}
