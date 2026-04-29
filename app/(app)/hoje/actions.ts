"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import type { CrmStage, MotivoPerda, PercepcaoVendedor, TomInteracao } from "@/lib/types";
import { MOTIVOS_PERDA } from "@/lib/types";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
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
  revalidatePath(`/pipeline/${input.lead_id}`);
}

export async function registrarToque(input: {
  lead_id: number;
  canal: string;
  passo?: "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
  observacoes?: string;
  proxima_acao?: string;
  data_proxima_acao?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const hoje = new Date().toISOString().slice(0, 10);

  if (input.passo) {
    await supabase.from("cadencia").update({
      status: "enviado",
      data_executada: hoje,
    }).eq("lead_id", input.lead_id).eq("passo", input.passo);
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
  revalidatePath(`/pipeline/${input.lead_id}`);
}

/** Etapas que exigem motivo obrigatório ao entrar. */
export const ETAPAS_EXIGEM_MOTIVO: CrmStage[] = ["Perdido", "Nutrição"];

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
      url: `/pipeline/${lead_id}`,
      tag: `lead-${lead_id}-status`,
    }).catch((err) => console.warn("[push] moverEtapa", err));
  }

  revalidatePath("/pipeline");
  revalidatePath("/hoje");
  revalidatePath("/funil");
  revalidatePath(`/pipeline/${lead_id}`);
}

/**
 * Atualiza a percepção subjetiva do vendedor sobre chance de fechamento.
 * Re-calcula o score indiretamente (via view v_lead_score que chama lead_score_fechamento).
 */
export async function atualizarPercepcao(lead_id: number, percepcao: PercepcaoVendedor) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  await supabase.from("leads")
    .update({ percepcao_vendedor: percepcao })
    .eq("id", lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "percepcao_alterada",
    payload: { para: percepcao },
  });

  revalidatePath(`/pipeline/${lead_id}`);
  revalidatePath("/hoje");
  revalidatePath("/funil");
}

/**
 * Marca o tom da última interação (positivo/neutro/negativo).
 * Atualiza a ligação mais recente do lead.
 */
export async function marcarTomUltimaInteracao(lead_id: number, tom: TomInteracao) {
  const supabase = createClient();
  const orgId = await requireOrg();

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

  revalidatePath(`/pipeline/${lead_id}`);
  revalidatePath("/funil");
}

export async function adiarAcao(lead_id: number, dias: number) {
  const supabase = createClient();
  const d = new Date();
  d.setDate(d.getDate() + dias);
  await supabase.from("leads").update({
    data_proxima_acao: d.toISOString().slice(0, 10),
  }).eq("id", lead_id);
  revalidatePath("/hoje");
}
