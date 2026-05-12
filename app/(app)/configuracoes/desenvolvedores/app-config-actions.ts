"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getCurrentRole } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

/**
 * Server actions pra editar `public.app_config` (URLs dos crons + secret).
 *
 * Tabela é restrita a service role no DB (sem RLS policy pra authenticated).
 * Aqui validamos role=gestor e usamos service client.
 *
 * Pra `cron_secret` mostramos só os últimos 4 chars (mascarado). Pra URLs
 * mostramos integral.
 */

const KEYS_PERMITIDAS = new Set([
  "cron_secret",
  "cron_email_url",
  "cron_push_url",
  "cron_push_flywheel_url",
]);

export interface AppConfigEntry {
  key: string;
  value_display: string; // mascarado pra secrets
  is_secret: boolean;
  preenchido: boolean;
}

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function isSecret(key: string): boolean {
  return key.toLowerCase().includes("secret") || key.toLowerCase().includes("token");
}

function maskSecret(v: string): string {
  if (v.length <= 8) return "•••••••";
  return `••••••${v.slice(-4)}`;
}

export async function listarAppConfig(): Promise<AppConfigEntry[]> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores podem ver configurações de cron.");

  const supa = service();
  const { data, error } = await supa.from("app_config").select("key, value");
  if (error) throw new Error(error.message);

  const existentes = new Map((data ?? []).map((r: any) => [r.key as string, r.value as string]));

  // Retorna sempre TODAS as keys conhecidas (preenchidas ou não)
  const entries: AppConfigEntry[] = [];
  for (const key of KEYS_PERMITIDAS) {
    const value = existentes.get(key);
    const preenchido = !!(value && value.length > 0);
    const secret = isSecret(key);
    entries.push({
      key,
      value_display: !preenchido ? "" : secret ? maskSecret(value!) : value!,
      is_secret: secret,
      preenchido,
    });
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export async function salvarAppConfig(input: { key: string; value: string }) {
  const role = await getCurrentRole();
  if (role !== "gestor") return { error: "Apenas gestores podem editar." };

  const { key, value } = input;
  if (!KEYS_PERMITIDAS.has(key)) return { error: `Key '${key}' não é editável aqui.` };
  if (!value || value.trim().length === 0) return { error: "Valor obrigatório." };

  // Validações por tipo de key
  if (key.endsWith("_url")) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        return { error: "URL deve usar http(s)." };
      }
    } catch {
      return { error: "URL inválida." };
    }
  }
  if (key === "cron_secret" && value.length < 16) {
    return { error: "Secret precisa ter ao menos 16 chars." };
  }

  const supa = service();
  const { error } = await supa
    .from("app_config")
    .upsert({ key, value: value.trim() }, { onConflict: "key" });
  if (error) return { error: error.message };

  revalidatePath("/configuracoes/desenvolvedores");
  return { success: true };
}
