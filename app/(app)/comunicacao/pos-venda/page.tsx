import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import PosVendaClient from "./pos-venda-client";
import type {
  OnboardingPendente,
  OnboardingTemplate,
  OnboardingTemplateItem,
  NpsResponse,
  NpsResumo,
  HealthScore,
  HealthResumo,
  ExpansaoAtiva,
  ExpansoesResumo,
  Expansao,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PosVendaPage() {
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  const supabase = createClient();

  const [
    onboardingsRes,
    templatesRes,
    templateItensRes,
    npsResponsesRes,
    npsResumoRes,
    healthScoresRes,
    healthResumoRes,
    expansoesAtivasRes,
    expansoesResumoRes,
    expansoesFechadasRes,
    renovacoesLeadsRes,
  ] = await Promise.all([
    supabase
      .from("v_onboarding_pendente")
      .select("*")
      .eq("organizacao_id", orgId)
      .order("iniciado_em", { ascending: false })
      .limit(200),
    supabase
      .from("onboarding_template")
      .select("*")
      .eq("organizacao_id", orgId)
      .eq("ativo", true)
      .order("default_template", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("onboarding_template_item")
      .select("*, onboarding_template!inner(organizacao_id)")
      .eq("onboarding_template.organizacao_id", orgId)
      .order("ordem", { ascending: true }),
    supabase
      .from("nps_responses")
      .select("*")
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("v_nps_resumo")
      .select("*")
      .eq("organizacao_id", orgId)
      .maybeSingle(),
    supabase
      .from("v_health_score")
      .select("*")
      .eq("organizacao_id", orgId)
      .order("health_score", { ascending: true })
      .limit(200),
    supabase
      .from("v_health_resumo")
      .select("*")
      .eq("organizacao_id", orgId)
      .maybeSingle(),
    supabase
      .from("v_expansoes_ativas")
      .select("*")
      .eq("organizacao_id", orgId)
      .order("data_proxima_acao", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase
      .from("v_expansoes_resumo")
      .select("*")
      .eq("organizacao_id", orgId)
      .maybeSingle(),
    supabase
      .from("expansoes")
      .select("*")
      .eq("organizacao_id", orgId)
      .in("estagio", ["fechada", "perdida"])
      .order("updated_at", { ascending: false })
      .limit(50),
    // Bloco E: clientes Fechados pra bulk renovação
    supabase
      .from("leads")
      .select("id, empresa, nome, valor_potencial, data_fechamento, data_renovacao, ciclo_renovacao_meses, valor_renovacao, responsavel_id")
      .eq("organizacao_id", orgId)
      .eq("crm_stage", "Fechado")
      .order("data_fechamento", { ascending: false })
      .limit(500),
  ]);

  return (
    <PosVendaClient
      meId={me.id}
      isGestor={isGestor}
      onboardings={(onboardingsRes.data ?? []) as OnboardingPendente[]}
      templates={(templatesRes.data ?? []) as OnboardingTemplate[]}
      templateItens={(templateItensRes.data ?? []) as OnboardingTemplateItem[]}
      npsResponses={(npsResponsesRes.data ?? []) as NpsResponse[]}
      npsResumo={(npsResumoRes.data ?? null) as NpsResumo | null}
      healthScores={(healthScoresRes.data ?? []) as HealthScore[]}
      healthResumo={(healthResumoRes.data ?? null) as HealthResumo | null}
      expansoesAtivas={(expansoesAtivasRes.data ?? []) as ExpansaoAtiva[]}
      expansoesResumo={(expansoesResumoRes.data ?? null) as ExpansoesResumo | null}
      expansoesHistorico={(expansoesFechadasRes.data ?? []) as Expansao[]}
      renovacoesLeads={(renovacoesLeadsRes.data ?? []) as Array<{
        id: number;
        empresa: string | null;
        nome: string | null;
        valor_potencial: number | null;
        data_fechamento: string | null;
        data_renovacao: string | null;
        ciclo_renovacao_meses: number | null;
        valor_renovacao: number | null;
        responsavel_id: string | null;
      }>}
    />
  );
}
