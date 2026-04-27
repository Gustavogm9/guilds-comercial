import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { dispatchWebhook } from "@/lib/webhooks";

const CRM_STAGES = new Set([
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
]);

function stageFromStatus(status: string | undefined) {
  if (status === "ganho") return "Fechado";
  if (status === "perdido") return "Perdido";
  if (status === "em_andamento") return "Prospecção";
  return null;
}

function buildLeadPatch(body: any) {
  const patch: Record<string, unknown> = {};
  const copyFields = [
    "nome",
    "empresa",
    "email",
    "cargo",
    "segmento",
    "fonte",
    "temperatura",
    "prioridade",
    "fit_icp",
    "decisor",
    "dor_principal",
    "observacoes",
    "proxima_acao",
    "data_proxima_acao",
    "motivo_perda",
    "motivo_perda_detalhe",
  ];

  for (const field of copyFields) {
    if (body[field] !== undefined) patch[field] = body[field];
  }

  if (body.whatsapp !== undefined || body.telefone !== undefined) {
    patch.whatsapp = body.whatsapp ?? body.telefone;
  }

  if (body.valor_potencial !== undefined || body.valor_estimado !== undefined) {
    patch.valor_potencial = body.valor_potencial ?? body.valor_estimado;
  }

  const requestedStage = body.crm_stage ?? body.etapa ?? stageFromStatus(body.status);
  if (requestedStage !== null && requestedStage !== undefined) {
    if (!CRM_STAGES.has(requestedStage)) {
      return { error: `Invalid crm_stage: ${requestedStage}`, patch: null };
    }

    patch.crm_stage = requestedStage;
    patch.funnel_stage = ["Fechado", "Perdido", "Nutrição"].includes(requestedStage)
      ? "arquivado"
      : "pipeline";

    if (requestedStage === "Fechado") {
      patch.data_fechamento = new Date().toISOString().slice(0, 10);
      patch.probabilidade = 1;
    }
  }

  return { error: null, patch };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabaseAdmin!
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .eq("organizacao_id", auth.organizacao_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ data }, { status: 200 });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: currentLead, error: selectError } = await auth.supabaseAdmin!
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .eq("organizacao_id", auth.organizacao_id)
    .single();

  if (selectError || !currentLead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const { error: patchError, patch } = buildLeadPatch(body);
  if (patchError) {
    return NextResponse.json({ error: patchError }, { status: 400 });
  }
  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: updatedLead, error: updateError } = await auth.supabaseAdmin!
    .from("leads")
    .update(patch)
    .eq("id", params.id)
    .eq("organizacao_id", auth.organizacao_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: "Failed to update lead", details: updateError.message }, { status: 500 });
  }

  if (updatedLead.crm_stage && updatedLead.crm_stage !== currentLead.crm_stage) {
    await dispatchWebhook(auth.organizacao_id, "lead.stage_changed", {
      lead: updatedLead,
      from: currentLead.crm_stage,
      to: updatedLead.crm_stage,
    });

    if (updatedLead.crm_stage === "Fechado") {
      await dispatchWebhook(auth.organizacao_id, "lead.won", { lead: updatedLead });
    } else if (updatedLead.crm_stage === "Perdido") {
      await dispatchWebhook(auth.organizacao_id, "lead.lost", { lead: updatedLead });
    }
  }

  return NextResponse.json({ data: updatedLead }, { status: 200 });
}
