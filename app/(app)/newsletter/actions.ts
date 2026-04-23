"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
}

export async function alterarStatusNews(id: number, status: "Ativo" | "Pausado" | "Remover") {
  const supabase = createClient();
  await supabase.from("newsletter").update({ status }).eq("id", id);
  revalidatePath("/newsletter");
}

export async function marcarEnvio(id: number, lead_id: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const hoje = new Date().toISOString().slice(0, 10);
  const proxima = new Date();
  proxima.setDate(proxima.getDate() + 14);

  await supabase.from("newsletter").update({
    ultima_edicao_enviada: hoje,
    proxima_edicao_sugerida: proxima.toISOString().slice(0, 10),
  }).eq("id", id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "newsletter", payload: { acao: "envio_marcado" },
  });

  revalidatePath("/newsletter");
}

export async function adicionarLeadNews(lead_id: number, cta?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  await supabase.from("newsletter").upsert({
    organizacao_id: orgId,
    lead_id,
    responsavel_id: user?.id ?? null,
    optin: true,
    status: "Ativo",
    cta_provavel: cta ?? null,
  });

  await supabase.from("leads").update({ newsletter_optin: true }).eq("id", lead_id);

  revalidatePath("/newsletter");
}
