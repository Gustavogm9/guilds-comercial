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

interface BrandingNps {
  organizacao_nome: string;
  logo_url: string | null;
  cor_primaria: string | null;
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

  // Carrega contexto NPS + branding da org em paralelo
  const [ctxRes, brandingRes] = await Promise.all([
    sb.rpc("buscar_nps_por_token", { _token: token }),
    sb.rpc("buscar_branding_por_token", { _token: token }),
  ]);

  if (ctxRes.error || !ctxRes.data || (Array.isArray(ctxRes.data) && ctxRes.data.length === 0)) {
    notFound();
  }

  const ctx = (Array.isArray(ctxRes.data) ? ctxRes.data[0] : ctxRes.data) as NpsContext;
  if (!ctx) notFound();

  const branding = (Array.isArray(brandingRes.data) ? brandingRes.data[0] : brandingRes.data) as BrandingNps | null;

  return <NpsClient token={token} ctx={ctx} branding={branding} />;
}
