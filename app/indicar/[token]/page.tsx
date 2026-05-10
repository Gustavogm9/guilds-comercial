import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import IndicarClient from "./indicar-client";
import type { EmbaixadorPortalContext } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Página pública do portal de embaixador.
 *
 * URL: /indicar/{token}
 *
 * Sem auth. Usa service role pra chamar buscar_embaixador_por_token (SECURITY
 * DEFINER que valida estritamente). Token inválido → 404.
 *
 * Não inclui sidebar/layout do app (leva o cliente direto pra ação).
 */
export default async function IndicarPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  if (!token || token.length < 16) notFound();

  const sb = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await sb.rpc("buscar_embaixador_por_token", { _token: token });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    notFound();
  }

  const ctx = (Array.isArray(data) ? data[0] : data) as EmbaixadorPortalContext;
  if (!ctx) notFound();

  return <IndicarClient token={token} ctx={ctx} />;
}
