"use server";

/**
 * Action pública (sem auth) usada pelo portal /nps/{token}.
 * Chama RPC `responder_nps_via_token` (SECURITY DEFINER) que valida
 * estritamente.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function responderNpsAction(input: {
  token: string;
  score: number;
  comentario?: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!input.token || input.token.length < 16) {
    return { ok: false, erro: "Token inválido." };
  }
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10) {
    return { ok: false, erro: "Score deve ser entre 0 e 10." };
  }

  const sb = getServiceClient();
  const { data, error } = await sb.rpc("responder_nps_via_token", {
    _token: input.token,
    _score: input.score,
    _comentario: input.comentario?.trim() ?? null,
  });

  if (error) {
    return { ok: false, erro: "Erro ao registrar resposta. Tente novamente." };
  }

  const row = (data as Array<{ ok: boolean; erro: string | null }>)[0];
  if (!row || !row.ok) {
    return { ok: false, erro: row?.erro ?? "Erro desconhecido." };
  }

  return { ok: true };
}
