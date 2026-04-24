"use server";

import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

/**
 * Gera uma nova API Key
 */
export async function generateApiKey(formData: FormData) {
  const supabase = createClient();
  const name = formData.get("name") as string;
  const organizacao_id = formData.get("organizacao_id") as string;

  if (!name || !organizacao_id) {
    return { error: "Nome e organização são obrigatórios" };
  }

  // Gera um raw token aleatório (ex: gc_live_xxxxxxxxxxxxxxxxxxxxxxxx)
  const rawKey = "gc_live_" + crypto.randomBytes(32).toString("hex");

  // Hash da chave com SHA-256
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.substring(0, 12) + "...";

  const { error } = await supabase.from("api_keys").insert({
    organizacao_id,
    name,
    key_hash: keyHash,
    prefix
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  
  // Retornamos a rawKey apenas esta vez para ser exibida ao usuário
  return { rawKey, success: true };
}

/**
 * Revoga (deleta) uma API Key
 */
export async function revokeApiKey(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("api_keys").delete().eq("id", id);
  
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  return { success: true };
}

/**
 * Cadastra um novo Webhook
 */
export async function createWebhook(formData: FormData) {
  const supabase = createClient();
  const url = formData.get("url") as string;
  const organizacao_id = formData.get("organizacao_id") as string;
  
  // Pegar múltiplos eventos do form (se usar checkboxes)
  const events = formData.getAll("events") as string[];

  if (!url || !organizacao_id || events.length === 0) {
    return { error: "URL, Organização e ao menos um evento são obrigatórios" };
  }

  // Gerar um secret seguro
  const secret = "whsec_" + crypto.randomBytes(24).toString("hex");

  const { error } = await supabase.from("webhooks").insert({
    organizacao_id,
    url,
    events,
    secret,
    active: true
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  return { success: true };
}

/**
 * Deleta um Webhook
 */
export async function deleteWebhook(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("webhooks").delete().eq("id", id);
  
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  return { success: true };
}
