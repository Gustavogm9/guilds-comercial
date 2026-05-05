"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
}

const STATUS_VALIDOS = ["Ativo", "Pausado", "Remover"] as const;

async function assertLeadDaOrg(supabase: ReturnType<typeof createClient>, lead_id: number, orgId: string) {
  const { data } = await supabase.from("leads").select("id")
    .eq("id", lead_id).eq("organizacao_id", orgId).maybeSingle();
  if (!data) throw new Error(`Lead ${lead_id} não encontrado nesta organização.`);
}

export async function alterarStatusNews(id: number, status: "Ativo" | "Pausado" | "Remover") {
  if (!STATUS_VALIDOS.includes(status)) throw new Error("Status inválido.");
  const supabase = createClient();
  const orgId = await requireOrg();
  const { error } = await supabase.from("newsletter").update({ status })
    .eq("id", id).eq("organizacao_id", orgId);
  if (error) throw error;
  revalidatePath("/newsletter");
}

export async function marcarEnvio(id: number, lead_id: number) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await assertLeadDaOrg(supabase, lead_id, orgId);
  const hoje = new Date().toISOString().slice(0, 10);
  const proxima = new Date();
  proxima.setDate(proxima.getDate() + 14);

  const { error } = await supabase.from("newsletter").update({
    ultima_edicao_enviada: hoje,
    proxima_edicao_sugerida: proxima.toISOString().slice(0, 10),
  }).eq("id", id).eq("organizacao_id", orgId);
  if (error) throw error;

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
  await assertLeadDaOrg(supabase, lead_id, orgId);

  // upsert com onConflict pra evitar duplicar quando o lead já está na newsletter
  const { error } = await supabase.from("newsletter").upsert({
    organizacao_id: orgId,
    lead_id,
    responsavel_id: user?.id ?? null,
    optin: true,
    status: "Ativo",
    cta_provavel: cta ?? null,
  }, { onConflict: "lead_id" });
  if (error) throw error;

  await supabase.from("leads").update({ newsletter_optin: true })
    .eq("id", lead_id).eq("organizacao_id", orgId);

  revalidatePath("/newsletter");
}
