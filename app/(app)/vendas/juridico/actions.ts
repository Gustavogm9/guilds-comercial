"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createClicksignEnvelope, createClicksignSigner, uploadClicksignDocument, activateClicksignEnvelope } from "@/lib/clicksign";
import { buildContractHtml, htmlToBase64, sha256 } from "@/lib/contracts/document";
import { dispatchWebhook } from "@/lib/webhooks";

const STATUS_VALIDOS = ["rascunho", "em_revisao", "aguardando_assinatura", "assinado", "cancelado"] as const;

type StatusContrato = typeof STATUS_VALIDOS[number];

function asStatus(value: FormDataEntryValue | null): StatusContrato | null {
  if (typeof value !== "string") return null;
  return STATUS_VALIDOS.includes(value as StatusContrato) ? value as StatusContrato : null;
}

function clean(value: FormDataEntryValue | null, max = 1800) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asId(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asEmail(value: FormDataEntryValue | null) {
  const email = clean(value, 240);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function asIsoDate(value: FormDataEntryValue | null) {
  const date = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function plainTextFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getContratoDaOrg(supabase: ReturnType<typeof createClient>, contratoId: number, orgId: string) {
  const { data } = await supabase
    .from("contratos")
    .select("*, leads(id, empresa, nome, email, whatsapp, valor_potencial)")
    .eq("id", contratoId)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  return data as any | null;
}

export async function atualizarStatusContratoAction(formData: FormData) {
  const contratoId = asId(formData.get("contratoId"));
  const status = asStatus(formData.get("status"));
  const nota = clean(formData.get("nota"));

  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me || !contratoId || !status) {
    return;
  }

  const supabase = createClient();
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "aguardando_assinatura") {
    update.data_envio = new Date().toISOString().slice(0, 10);
  }

  if (status === "assinado") {
    update.data_assinatura = new Date().toISOString().slice(0, 10);
  }

  await supabase
    .from("contratos")
    .update(update)
    .eq("id", contratoId)
    .eq("organizacao_id", orgId);

  if (nota) {
    await supabase.from("contrato_feedback").insert({
      organizacao_id: orgId,
      contrato_id: contratoId,
      tipo: status === "assinado" ? "aprovacao" : "juridico",
      conteudo: nota,
      resolvido: status === "assinado",
      criado_por: me.id,
    });
  }

  if (status === "em_revisao") {
    await dispatchWebhook(orgId, "contract.review_requested", { contrato_id: contratoId, status });
  }
  if (status === "assinado") {
    await dispatchWebhook(orgId, "contract.signed", { contrato_id: contratoId, status });
  }
  if (status === "cancelado") {
    await dispatchWebhook(orgId, "contract.canceled", { contrato_id: contratoId, status });
  }

  revalidatePath("/vendas/juridico");
  revalidatePath("/vendas/contratos");
  revalidatePath("/comunicacao/pos-venda");
  revalidatePath("/flywheel");
}

export async function prepararDocumentoContratoAction(formData: FormData) {
  const contratoId = asId(formData.get("contratoId"));
  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me || !contratoId) return;

  const supabase = createClient();
  const contrato = await getContratoDaOrg(supabase, contratoId, orgId);
  if (!contrato) return;

  const cliente = contrato.leads?.empresa || contrato.leads?.nome || `Contrato #${contrato.id}`;
  const html = buildContractHtml({
    title: `Contrato - ${cliente}`,
    html: contrato.html_contrato,
    text: contrato.texto_contrato,
    briefing: contrato.briefing_juridico,
  });
  const nome = `contrato-${contrato.id}-v${contrato.versao_atual}.html`;

  const { error } = await supabase.from("contratos").update({
    documento_nome: nome,
    documento_mime: "text/html",
    documento_html: html,
    documento_preparado_at: new Date().toISOString(),
    status: contrato.status === "rascunho" ? "em_revisao" : contrato.status,
    updated_at: new Date().toISOString(),
  }).eq("id", contratoId).eq("organizacao_id", orgId);

  if (error) return;

  await supabase.from("contrato_feedback").insert({
    organizacao_id: orgId,
    contrato_id: contratoId,
    tipo: "juridico",
    conteudo: `Documento revisavel preparado: ${nome}`,
    resolvido: true,
    criado_por: me.id,
  });

  await dispatchWebhook(orgId, "contract.generated", { contrato_id: contratoId, documento_nome: nome });
  revalidatePath("/vendas/juridico");
  revalidatePath("/vendas/contratos");
  if (contrato.lead_id) revalidatePath(`/vendas/pipeline/${contrato.lead_id}`);
}

export async function enviarContratoClicksignAction(formData: FormData) {
  const contratoId = asId(formData.get("contratoId"));
  const signatarioNome = clean(formData.get("signatarioNome"), 240);
  const signatarioEmail = asEmail(formData.get("signatarioEmail"));
  const signatarioTelefone = clean(formData.get("signatarioTelefone"), 80) || null;
  const signatarioDocumento = clean(formData.get("signatarioDocumento"), 80) || null;

  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me || !contratoId) return;
  if (!signatarioNome || !signatarioEmail) return;

  const supabase = createClient();
  const contrato = await getContratoDaOrg(supabase, contratoId, orgId);
  if (!contrato) return;

  const cliente = contrato.leads?.empresa || contrato.leads?.nome || `Contrato #${contrato.id}`;
  const html = contrato.documento_html || buildContractHtml({
    title: `Contrato - ${cliente}`,
    html: contrato.html_contrato,
    text: contrato.texto_contrato,
    briefing: contrato.briefing_juridico,
  });
  const plain = plainTextFromHtml(html);
  const filename = (contrato.documento_nome || `contrato-${contrato.id}-v${contrato.versao_atual}.txt`).replace(/\.html$/i, ".txt");
  const base64 = htmlToBase64(plain || "Contrato sem conteudo.");

  try {
    const envelope = await createClicksignEnvelope({
      name: `Contrato - ${cliente}`,
      deadlineAt: contrato.vigencia_fim ? `${contrato.vigencia_fim}T23:59:59-03:00` : null,
    });
    if (!envelope.id) throw new Error("Clicksign nao retornou envelope id.");

    const document = await uploadClicksignDocument({
      envelopeId: envelope.id,
      filename,
      mimeType: "text/plain",
      base64,
    });
    if (!document.id) throw new Error("Clicksign nao retornou document id.");

    const signer = await createClicksignSigner(envelope.id, {
      name: signatarioNome,
      email: signatarioEmail,
      phoneNumber: signatarioTelefone,
      documentation: signatarioDocumento,
    });

    let activatePayload: unknown = null;
    try {
      activatePayload = (await activateClicksignEnvelope(envelope.id)).payload;
    } catch (err) {
      activatePayload = { activation_error: err instanceof Error ? err.message : String(err) };
    }
    const activationError = Boolean(
      activatePayload &&
      typeof activatePayload === "object" &&
      "activation_error" in activatePayload
    );

    const payload = {
      envelope: envelope.payload,
      document: document.payload,
      signer: signer.payload,
      activate: activatePayload,
      source_sha256: sha256(plain),
    };

    const { error } = await supabase.from("contratos").update({
      documento_nome: filename,
      documento_mime: "text/plain",
      documento_html: html,
      documento_preparado_at: new Date().toISOString(),
      clicksign_envelope_id: envelope.id,
      clicksign_document_id: document.id,
      clicksign_signer_id: signer.id,
      clicksign_sign_url: typeof signer.links?.self === "string" ? signer.links.self : null,
      clicksign_status: activationError ? "draft_activation_pending" : "running",
      clicksign_payload: payload,
      signatario_nome: signatarioNome,
      signatario_email: signatarioEmail,
      signatario_telefone: signatarioTelefone,
      signatario_documento: signatarioDocumento,
      status: activationError ? "em_revisao" : "aguardando_assinatura",
      data_envio: activationError ? contrato.data_envio : new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }).eq("id", contratoId).eq("organizacao_id", orgId);

    if (error) return;

    await supabase.from("contrato_feedback").insert({
      organizacao_id: orgId,
      contrato_id: contratoId,
      tipo: "juridico",
      conteudo: activationError
        ? `Envelope Clicksign criado, mas a ativacao ainda precisa de requisitos/configuracao: ${(activatePayload as { activation_error?: string }).activation_error}`
        : `Envelope Clicksign criado para ${signatarioNome} <${signatarioEmail}>.`,
      resolvido: !activationError,
      criado_por: me.id,
    });

    if (!activationError) {
      await dispatchWebhook(orgId, "contract.signature_requested", {
        contrato_id: contratoId,
        envelope_id: envelope.id,
        document_id: document.id,
        signer_id: signer.id,
      });
    }

    revalidatePath("/vendas/juridico");
    revalidatePath("/vendas/contratos");
    if (contrato.lead_id) revalidatePath(`/vendas/pipeline/${contrato.lead_id}`);
  } catch (err) {
    await supabase.from("contrato_feedback").insert({
      organizacao_id: orgId,
      contrato_id: contratoId,
      tipo: "juridico",
      conteudo: `Falha Clicksign: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      resolvido: false,
      criado_por: me.id,
    });
    revalidatePath("/vendas/juridico");
  }
}

export async function configurarVigenciaContratoAction(formData: FormData) {
  const contratoId = asId(formData.get("contratoId"));
  const vigenciaInicio = asIsoDate(formData.get("vigenciaInicio"));
  const vigenciaFim = asIsoDate(formData.get("vigenciaFim"));
  const ciclo = Number(clean(formData.get("cicloMeses"), 3) || "12");
  const configurarRenovacao = clean(formData.get("configurarRenovacao"), 10) === "on";

  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me || !contratoId) return;
  if (!vigenciaFim) return;

  const supabase = createClient();
  const contrato = await getContratoDaOrg(supabase, contratoId, orgId);
  if (!contrato) return;

  await supabase.from("contratos").update({
    vigencia_inicio: vigenciaInicio,
    vigencia_fim: vigenciaFim,
    renovacao_configurada: configurarRenovacao,
    updated_at: new Date().toISOString(),
  }).eq("id", contratoId).eq("organizacao_id", orgId);

  if (configurarRenovacao && contrato.lead_id) {
    await supabase.from("leads").update({
      data_renovacao: vigenciaFim,
      ciclo_renovacao_meses: Number.isInteger(ciclo) && ciclo > 0 && ciclo <= 60 ? ciclo : 12,
      valor_renovacao: contrato.leads?.valor_potencial ?? null,
    }).eq("id", contrato.lead_id).eq("organizacao_id", orgId);

    await supabase.from("lead_evento").insert({
      organizacao_id: orgId,
      lead_id: contrato.lead_id,
      ator_id: me.id,
      tipo: "renovacao_configurada",
      payload: {
        contrato_id: contratoId,
        data_renovacao: vigenciaFim,
        origem: "contrato_assinado",
      },
    });
  }

  await supabase.from("contrato_feedback").insert({
    organizacao_id: orgId,
    contrato_id: contratoId,
    tipo: "juridico",
    conteudo: configurarRenovacao
      ? `Vigencia configurada ate ${vigenciaFim} e renovacao enviada ao pos-venda.`
      : `Vigencia configurada ate ${vigenciaFim}.`,
    resolvido: true,
    criado_por: me.id,
  });

  revalidatePath("/vendas/juridico");
  revalidatePath("/comunicacao/pos-venda");
  revalidatePath("/flywheel");
  if (contrato.lead_id) revalidatePath(`/vendas/pipeline/${contrato.lead_id}`);
}

export async function adicionarNotaJuridicaAction(formData: FormData) {
  const contratoId = asId(formData.get("contratoId"));
  const conteudo = clean(formData.get("conteudo"));

  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me || !contratoId || !conteudo) {
    return;
  }

  const supabase = createClient();
  await supabase.from("contrato_feedback").insert({
    organizacao_id: orgId,
    contrato_id: contratoId,
    tipo: "juridico",
    conteudo,
    criado_por: me.id,
  });

  revalidatePath("/vendas/juridico");
  revalidatePath("/vendas/contratos");
  revalidatePath("/comunicacao/pos-venda");
  revalidatePath("/flywheel");
}
