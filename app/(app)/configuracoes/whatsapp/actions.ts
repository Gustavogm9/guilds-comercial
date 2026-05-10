"use server";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

/**
 * Gera um novo token webhook via RPC e retorna a URL completa.
 * Só gestores podem chamar.
 */
export async function gerarTokenWhatsapp(formData: FormData) {
  const me = await getCurrentProfile();
  if (!me) return { error: "Não autenticado." };
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Acesso negado." };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem org." };

  const supabase = createClient();

  // Chama a função RPC que gera token único
  const { data, error } = await supabase.rpc("gerar_whatsapp_webhook_token", {
    p_org_id: orgId,
  });

  if (error) return { error: error.message };

  revalidatePath("/configuracoes/whatsapp");
  return { ok: true, token: data as string };
}

/**
 * Atualiza o provider WhatsApp configurado para a org.
 */
export async function salvarProviderWhatsapp(formData: FormData) {
  const me = await getCurrentProfile();
  if (!me) return { error: "Não autenticado." };
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Acesso negado." };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem org." };

  const provider = formData.get("provider") as string;
  const PROVIDERS_VALIDOS = ["manual", "zapi", "evolution", "360dialog", "twilio"];
  if (!PROVIDERS_VALIDOS.includes(provider)) return { error: "Provider inválido." };

  const supabase = createClient();
  const { error } = await supabase
    .from("organizacoes")
    .update({ whatsapp_provider: provider })
    .eq("id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}

/**
 * Revoga o token webhook (seta null).
 * Qualquer chamada com o token antigo passará a retornar silenciosamente sem processar.
 */
export async function revogarTokenWhatsapp() {
  const me = await getCurrentProfile();
  if (!me) return { error: "Não autenticado." };
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Acesso negado." };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: "Sem org." };

  const supabase = createClient();
  const { error } = await supabase
    .from("organizacoes")
    .update({ whatsapp_webhook_token: null, whatsapp_provider: "manual" })
    .eq("id", orgId);

  if (error) return { error: error.message };

  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}
