"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

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

  revalidatePath("/vendas/juridico");
  revalidatePath("/vendas/contratos");
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
}
