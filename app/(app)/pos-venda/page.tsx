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
    />
  );
}
