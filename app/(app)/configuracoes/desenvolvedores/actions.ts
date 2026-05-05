"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whitelist de eventos permitidos. Manter alinhado com o emitter de webhooks.
const WEBHOOK_EVENTS_VALIDOS = new Set([
  "lead.created",
  "lead.updated",
  "lead.qualified",
  "lead.promoted",
  "lead.archived",
  "lead.won",
  "lead.lost",
  "stage.changed",
  "responsavel.changed",
  "proposta.sent",
  "proposta.accepted",
]);

const MAX_WEBHOOKS_POR_ORG = 25;
const MAX_API_KEYS_POR_ORG = 50;

async function requireGestorOrg() {
  const [orgId, role] = await Promise.all([getCurrentOrgId(), getCurrentRole()]);
  if (!orgId) throw new Error("Sem organização ativa.");
  if (role !== "gestor") throw new Error("Acesso restrito a gestores.");
  return orgId;
}

/**
 * Bug critical (SSRF): bloqueia URLs apontando pra IPs privados/loopback/metadados.
 * Sem isso, um gestor poderia configurar um webhook pra http://localhost ou
 * http://169.254.169.254 (AWS metadata) e o servidor faria a request por ele.
 */
function isUrlPrivada(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // IPv4
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10) return true;                                  // 10.0.0.0/8
    if (a === 127) return true;                                 // 127.0.0.0/8
    if (a === 0) return true;                                   // 0.0.0.0/8
    if (a === 169 && b === 254) return true;                    // link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
    if (a >= 224) return true;                                  // multicast/reservado
  }
  // IPv6 simplificado — nunca aceita IPs literais
  if (h.includes(":")) return true;
  // Hostnames internos comuns
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  return false;
}

export async function generateApiKey(formData: FormData) {
  const supabase = createClient();
  const organizacao_id = await requireGestorOrg();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "Nome é obrigatório" };
  if (name.length > 80) return { error: "Nome muito longo (máx. 80 chars)." };

  // Cap por org
  const { count } = await supabase.from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("organizacao_id", organizacao_id);
  if ((count ?? 0) >= MAX_API_KEYS_POR_ORG) {
    return { error: `Limite de ${MAX_API_KEYS_POR_ORG} chaves por organização atingido. Revogue alguma antes.` };
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
  if (!UUID_REGEX.test(id)) return { error: "ID inválido." };
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
  if (url.length > 2048) {
    return { error: "URL muito longa (máx. 2048 chars)." };
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

  // Bug critical (SSRF): bloqueia hosts privados/loopback/metadados
  if (isUrlPrivada(parsedUrl.hostname)) {
    return { error: "URL aponta para um host privado ou interno. Use um endpoint público HTTPS." };
  }

  // Bug: valida eventos contra whitelist
  const eventosInvalidos = events.filter((e) => !WEBHOOK_EVENTS_VALIDOS.has(e));
  if (eventosInvalidos.length > 0) {
    return { error: `Eventos inválidos: ${eventosInvalidos.slice(0, 3).join(", ")}` };
  }
  if (events.length > 50) return { error: "Máximo de 50 eventos por webhook." };

  // Cap por org
  const { count } = await supabase.from("webhooks")
    .select("id", { count: "exact", head: true })
    .eq("organizacao_id", organizacao_id);
  if ((count ?? 0) >= MAX_WEBHOOKS_POR_ORG) {
    return { error: `Limite de ${MAX_WEBHOOKS_POR_ORG} webhooks por organização atingido.` };
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
  if (!UUID_REGEX.test(id)) return { error: "ID inválido." };
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
