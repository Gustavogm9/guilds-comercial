"use server";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

/**
 * Endpoint público para submeter LP (sem auth).
 */
export async function submeterLpAction(slug: string, dados: Record<string, string>): Promise<{
  ok: boolean;
  erro?: string;
  lead_id?: number;
  agradecimento_titulo?: string;
  agradecimento_texto?: string;
}> {
  if (!slug || slug.length < 3) return { ok: false, erro: "Slug inválido." };
  if (!dados || Object.keys(dados).length === 0) return { ok: false, erro: "Sem dados." };

  const h = await headers();
  const ua = h.get("user-agent") ?? null;
  const referer = h.get("referer") ?? null;

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await sb.rpc("submeter_lp", {
    _slug: slug,
    _dados: dados,
    _user_agent: ua,
    _referer: referer,
  });

  if (error) return { ok: false, erro: error.message };
  return data as any;
}
