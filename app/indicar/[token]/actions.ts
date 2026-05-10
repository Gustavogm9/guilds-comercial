"use server";

/**
 * Actions PÚBLICAS (sem auth) usadas pelo portal /indicar/{token}.
 *
 * O acesso vai pra `auth.uid()` = NULL, mas as funções RPC `buscar_embaixador_por_token`
 * e `criar_indicacao_via_portal` são SECURITY DEFINER e validam o token estritamente
 * — então não há risco de leak de dados sem o token.
 *
 * Anti-abuse: 20 indicações/dia/embaixador (validado no SQL).
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente service-role pra bypassar RLS — funções SECURITY DEFINER já validam input.
function getServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface NovaIndicacaoPortalInput {
  token: string;
  indicado_nome: string;
  indicado_empresa?: string;
  indicado_cargo?: string;
  indicado_email?: string;
  indicado_whatsapp?: string;
  contexto?: string;
}

export async function criarIndicacaoPortalAction(input: NovaIndicacaoPortalInput): Promise<
  { ok: true; indicacao_id: number } | { ok: false; erro: string }
> {
  // Validações client-side defensivas (a RPC valida de novo no DB)
  if (!input.token || input.token.length < 16) {
    return { ok: false, erro: "Token inválido." };
  }
  if (!input.indicado_nome?.trim() || input.indicado_nome.length > 120) {
    return { ok: false, erro: "Nome obrigatório (até 120 chars)." };
  }

  const sb = getServiceClient();
  const { data, error } = await sb.rpc("criar_indicacao_via_portal", {
    _token: input.token,
    _indicado_nome: input.indicado_nome.trim(),
    _indicado_empresa: input.indicado_empresa?.trim() ?? null,
    _indicado_cargo: input.indicado_cargo?.trim() ?? null,
    _indicado_email: input.indicado_email?.trim() ?? null,
    _indicado_whatsapp: input.indicado_whatsapp?.trim() ?? null,
    _contexto: input.contexto?.trim() ?? null,
  });

  if (error) {
    return { ok: false, erro: "Erro ao registrar indicação. Tente novamente." };
  }

  // RPC retorna table — pega primeira row
  const row = (data as Array<{ ok: boolean; erro: string | null; indicacao_id: number | null }>)[0];
  if (!row || !row.ok) {
    return { ok: false, erro: row?.erro ?? "Erro desconhecido." };
  }

  return { ok: true, indicacao_id: row.indicacao_id! };
}
