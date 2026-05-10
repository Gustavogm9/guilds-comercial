import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { getAppUrl } from "@/lib/email";
import IndicacoesClient from "./indicacoes-client";
import type {
  PedidoIndicacaoEnriched,
  IndicacaoEnriched,
  AdvocacyKpis,
  TopEmbaixador,
  EmbaixadorToken,
  OrgRecompensaConfig,
  RecompensasResumo,
} from "@/lib/types";
import GrowthTabs from "../growth-tabs";

export const dynamic = "force-dynamic";

export default async function IndicacoesPage(props: {
  searchParams: Promise<{ tab?: string; resp?: string }>;
}) {
  const searchParams = await props.searchParams;
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  // Vendedor não-gestor só vê o que pediu/é responsável
  const respFiltro = isGestor ? (searchParams.resp ?? "all") : me.id;

  const supabase = createClient();

  // Carrega tudo em paralelo
  const baseFilter = supabase.from("v_pedidos_pendentes")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("data_pedido", { ascending: true })
    .limit(200);

  const pendentesQuery = respFiltro === "all"
    ? baseFilter
    : baseFilter.eq("lead_responsavel_id", respFiltro);

  const indicacoesBase = supabase.from("v_indicacoes_enriquecidas")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  const indicacoesQuery = respFiltro === "all"
    ? indicacoesBase
    : indicacoesBase.eq("solicitado_por", respFiltro);

  const [
    pendentesRes, indicacoesRes, embaixadoresRes, kpisRes, tokensRes,
    recompensaConfigRes, recompensasResumoRes,
  ] = await Promise.all([
    pendentesQuery,
    indicacoesQuery,
    supabase.from("v_top_embaixadores")
      .select("*")
      .eq("organizacao_id", orgId)
      .order("receita_gerada", { ascending: false })
      .limit(50),
    supabase.from("v_advocacy_kpis")
      .select("*")
      .eq("organizacao_id", orgId)
      .maybeSingle(),
    supabase.from("v_embaixador_tokens")
      .select("*")
      .eq("organizacao_id", orgId)
      .limit(200),
    // Item 5: config de recompensas + KPIs
    supabase.from("org_recompensa_config")
      .select("*")
      .eq("organizacao_id", orgId)
      .maybeSingle(),
    supabase.from("v_recompensas_resumo")
      .select("*")
      .eq("organizacao_id", orgId)
      .maybeSingle(),
  ]);

  // baseUrl pra montar links públicos do portal /indicar/{token}
  const baseUrl = getAppUrl();

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <GrowthTabs isGestor={isGestor} />
      <IndicacoesClient
        meId={me.id}
      isGestor={isGestor}
      pendentes={(pendentesRes.data ?? []) as PedidoIndicacaoEnriched[]}
      indicacoes={(indicacoesRes.data ?? []) as IndicacaoEnriched[]}
      embaixadores={(embaixadoresRes.data ?? []) as TopEmbaixador[]}
      kpis={(kpisRes.data ?? null) as AdvocacyKpis | null}
      tokensEmbaixador={(tokensRes.data ?? []) as EmbaixadorToken[]}
      baseUrl={baseUrl}
      recompensaConfig={(recompensaConfigRes.data ?? null) as OrgRecompensaConfig | null}
      recompensasResumo={(recompensasResumoRes.data ?? null) as RecompensasResumo | null}
    />
    </div>
  );
}
