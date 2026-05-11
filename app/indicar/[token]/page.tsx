import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import IndicarClient from "./indicar-client";
import type { EmbaixadorPortalContext, ProgramaRecompensaPortal } from "@/lib/types";

export const dynamic = "force-dynamic";

interface MinhaIndicacaoPortal {
  indicado_nome: string;
  indicado_empresa: string | null;
  status: string;
  data_recebida: string;
  data_fechado: string | null;
  data_perdido: string | null;
  recompensa_paga: boolean;
}

interface BrandingPortal {
  organizacao_nome: string;
  logo_url: string | null;
  cor_primaria: string | null;
}

/**
 * Página pública do portal de embaixador.
 *
 * URL: /indicar/{token}
 *
 * Sem auth. Usa service role pra chamar funções SECURITY DEFINER que validam
 * o token estritamente.
 *
 * Carrega em paralelo:
 *   - Contexto do embaixador (nome, empresa, contadores)
 *   - Lista das próprias indicações (#5 do polish)
 *   - Programa de recompensa (#5 anterior)
 *   - Branding da org (#16 do polish — logo + cor)
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

  const [ctxRes, minhasIndicacoesRes, programaRes, brandingRes] = await Promise.all([
    sb.rpc("buscar_embaixador_por_token", { _token: token }),
    sb.rpc("listar_indicacoes_por_token", { _token: token }),
    sb.rpc("buscar_programa_recompensa_por_token", { _token: token }),
    sb.rpc("buscar_branding_por_token", { _token: token }),
  ]);

  if (ctxRes.error || !ctxRes.data || (Array.isArray(ctxRes.data) && ctxRes.data.length === 0)) {
    notFound();
  }

  const ctx = (Array.isArray(ctxRes.data) ? ctxRes.data[0] : ctxRes.data) as EmbaixadorPortalContext;
  if (!ctx) notFound();

  const minhasIndicacoes = (minhasIndicacoesRes.data ?? []) as MinhaIndicacaoPortal[];
  const programa = (Array.isArray(programaRes.data) ? programaRes.data[0] : programaRes.data) as ProgramaRecompensaPortal | null;
  const branding = (Array.isArray(brandingRes.data) ? brandingRes.data[0] : brandingRes.data) as BrandingPortal | null;

  return (
    <IndicarClient
      token={token}
      ctx={ctx}
      minhasIndicacoes={minhasIndicacoes}
      programa={programa}
      branding={branding}
    />
  );
}
