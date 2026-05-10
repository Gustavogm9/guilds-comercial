import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import NpsClient from "./nps-client";

export const dynamic = "force-dynamic";

interface NpsContext {
  nps_id: number;
  organizacao_id: string;
  organizacao_nome: string;
  cliente_empresa: string | null;
  cliente_nome: string | null;
  ja_respondido: boolean;
}

/**
 * Portal público de NPS. URL: /nps/{token}
 *
 * Sem auth. Valida token via SECURITY DEFINER. Cliente clica no link do
 * email D+7 e responde aqui.
 *
 * Token inválido → 404.
 * Já respondido → mostra tela "obrigado" sem permitir reenvio.
 */
export default async function NpsPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;

  if (!token || token.length < 16) notFound();

  const sb = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await sb.rpc("buscar_nps_por_token", { _token: token });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    notFound();
  }

  const ctx = (Array.isArray(data) ? data[0] : data) as NpsContext;
  if (!ctx) notFound();

  return <NpsClient token={token} ctx={ctx} />;
}
