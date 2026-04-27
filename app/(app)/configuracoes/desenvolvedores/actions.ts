"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

async function requireGestorOrg() {
  const [orgId, role] = await Promise.all([getCurrentOrgId(), getCurrentRole()]);
  if (!orgId) throw new Error("Sem organização ativa.");
  if (role !== "gestor") throw new Error("Acesso restrito a gestores.");
  return orgId;
}

export async function generateApiKey(formData: FormData) {
  const supabase = createClient();
  const organizacao_id = await requireGestorOrg();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Nome é obrigatório" };
  }

  const rawKey = "gc_live_" + crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.substring(0, 12) + "...";

  const { error } = await supabase.from("api_keys").insert({
    organizacao_id,
    name,
    key_hash: keyHash,
    prefix,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  return { rawKey, success: true };
}

export async function revokeApiKey(id: string) {
  const supabase = createClient();
  const organizacao_id = await requireGestorOrg();
  const { error } = await supabase.from("api_keys")
    .delete()
    .eq("id", id)
    .eq("organizacao_id", organizacao_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  return { success: true };
}

export async function createWebhook(formData: FormData) {
  const supabase = createClient();
  const organizacao_id = await requireGestorOrg();
  const url = String(formData.get("url") ?? "").trim();
  const events = formData.getAll("events").map(String);

  if (!url || events.length === 0) {
    return { error: "URL e ao menos um evento são obrigatórios" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: "URL inválida" };
  }

  if (parsedUrl.protocol !== "https:") {
    return { error: "Use uma URL HTTPS para webhooks" };
  }

  const secret = "whsec_" + crypto.randomBytes(24).toString("hex");

  const { error } = await supabase.from("webhooks").insert({
    organizacao_id,
    url,
    events,
    secret,
    active: true,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  return { success: true };
}

export async function deleteWebhook(id: string) {
  const supabase = createClient();
  const organizacao_id = await requireGestorOrg();
  const { error } = await supabase.from("webhooks")
    .delete()
    .eq("id", id)
    .eq("organizacao_id", organizacao_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/configuracoes/desenvolvedores");
  return { success: true };
}
