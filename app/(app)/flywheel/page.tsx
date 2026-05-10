import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import FlywheelDashboard from "./flywheel-dashboard";
import type {
  AdvocacyKpis,
  TopEmbaixador,
  HealthResumo,
  ExpansoesResumo,
  RenovacoesResumo,
  NpsResumo,
  RecompensasResumo,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * /flywheel — dashboard único do funil borboleta.
 *
 * Antes desta página, as 6 fases do flywheel estavam espalhadas em 4-5 telas
 * diferentes (sub-tabs de Growth + Comunicação). Vendedor/gestor não tinha
 * visão consolidada.
 *
 * Esta página agrega:
 *   P1 — Indicações (advocacy) → /growth/indicacoes
 *   P2 — Onboarding + NPS      → /comunicacao/pos-venda?tab=onboarding|nps
 *   P3 — Health Score          → /comunicacao/pos-venda?tab=saude
 *   P4 — Expansão              → /comunicacao/pos-venda?tab=expansoes
 *   P5 — Renovação             → /comunicacao/pos-venda?tab=expansoes (com filtro tipo=renovacao)
 *   P6 — Portal embaixador     → /growth/indicacoes (tab embaixadores)
 *
 * Cada bloco mostra KPI principal + estado atual + CTA.
 */
export default async function FlywheelPage() {
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();

  const [
    advocacyKpisRes,
    topEmbaixadoresRes,
    healthResumoRes,
    expansoesResumoRes,
    renovacoesResumoRes,
    npsResumoRes,
    recompensasResumoRes,
    pedidosPendentesRes,
    npsPendentesRes,
    healthRiscoRes,
    expansoesAtrasadasRes,
    renovacoesProximasRes,
  ] = await Promise.all([
    supabase.from("v_advocacy_kpis").select("*").eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("v_top_embaixadores").select("*").eq("organizacao_id", orgId)
      .order("receita_gerada", { ascending: false }).limit(5),
    supabase.from("v_health_resumo").select("*").eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("v_expansoes_resumo").select("*").eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("v_renovacoes_resumo").select("*").eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("v_nps_resumo").select("*").eq("organizacao_id", orgId).maybeSingle(),
    supabase.from("v_recompensas_resumo").select("*").eq("organizacao_id", orgId).maybeSingle(),
    // Counts de pendências pra os badges de alerta
    supabase.from("v_pedidos_pendentes").select("pedido_id", { count: "exact", head: true })
      .eq("organizacao_id", orgId),
    supabase.from("v_nps_pendente_responder").select("nps_id", { count: "exact", head: true })
      .eq("organizacao_id", orgId),
    supabase.from("v_health_score").select("lead_id", { count: "exact", head: true })
      .eq("organizacao_id", orgId).eq("categoria", "em_risco"),
    supabase.from("v_expansoes_atrasadas").select("expansao_id", { count: "exact", head: true })
      .eq("organizacao_id", orgId),
    supabase.from("v_renovacoes_proximas").select("lead_id", { count: "exact", head: true })
      .eq("organizacao_id", orgId).in("urgencia", ["vencida", "critica", "urgente"]),
  ]);

  const orgRow = await supabase
    .from("organizacoes")
    .select("moeda_padrao, nome")
    .eq("id", orgId)
    .maybeSingle();
  const currency = ((orgRow.data as any)?.moeda_padrao as string) || "BRL";
  const orgNome = ((orgRow.data as any)?.nome as string) || "";

  return (
    <FlywheelDashboard
      orgNome={orgNome}
      currency={currency}
      advocacy={(advocacyKpisRes.data ?? null) as AdvocacyKpis | null}
      topEmbaixadores={(topEmbaixadoresRes.data ?? []) as TopEmbaixador[]}
      health={(healthResumoRes.data ?? null) as HealthResumo | null}
      expansoes={(expansoesResumoRes.data ?? null) as ExpansoesResumo | null}
      renovacoes={(renovacoesResumoRes.data ?? null) as RenovacoesResumo | null}
      nps={(npsResumoRes.data ?? null) as NpsResumo | null}
      recompensas={(recompensasResumoRes.data ?? null) as RecompensasResumo | null}
      counts={{
        pedidos_pendentes: pedidosPendentesRes.count ?? 0,
        nps_pendentes: npsPendentesRes.count ?? 0,
        health_em_risco: healthRiscoRes.count ?? 0,
        expansoes_atrasadas: expansoesAtrasadasRes.count ?? 0,
        renovacoes_iminentes: renovacoesProximasRes.count ?? 0,
      }}
    />
  );
}
