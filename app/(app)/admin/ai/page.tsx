import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import type { AiFeature, AiPrompt, AiProvider, AiUso30d } from "@/lib/types";
import AdminAiClient from "./admin-ai-client";
import Ai30dSummary from "@/components/ai/ai-30d-summary";
import OverageWarningBanner from "@/components/ai/overage-warning-banner";
import type { FewshotExemplo } from "@/components/ai/fewshot-tab";

export const dynamic = "force-dynamic";

type Tab = "features" | "prompts" | "providers" | "logs" | "fewshot" | "experimentos";

export default async function AdminAiPage({ searchParams }: {
  searchParams: { tab?: Tab; feature?: string };
}) {
  const me = await getCurrentProfile();
  if (!me) return null;
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();

  // Busca overrides da org + templates globais (merge preferindo org) + dados das novas tabs
  const [
    { data: featuresOrg },
    { data: featuresGlobal },
    { data: providers },
    { data: prompts },
    { data: uso },
    { data: logs },
    { data: fewshotData },
    { data: experimentosData },
    { data: resultadosData },
  ] = await Promise.all([
    supabase.from("ai_features").select("*").eq("organizacao_id", orgId),
    supabase.from("ai_features").select("*").is("organizacao_id", null),
    supabase.from("ai_providers").select("*").or(`organizacao_id.eq.${orgId},organizacao_id.is.null`).order("prioridade"),
    supabase.from("ai_prompts").select("*").or(`organizacao_id.eq.${orgId},organizacao_id.is.null`).order("feature_codigo").order("versao", { ascending: false }),
    supabase.from("v_ai_uso_30d").select("*").eq("organizacao_id", orgId),
    supabase.from("ai_invocations").select("id, created_at, feature_codigo, provider_codigo, modelo, status, tokens_input, tokens_output, custo_estimado, latencia_ms, erro_msg, input_vars, output_texto").eq("organizacao_id", orgId).order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_fewshot_exemplos").select("id, feature_codigo, segmento_org, segmento_lead, cargo_decisor, ticket_range, output, score, fonte, ativo, created_at").eq("organizacao_id", orgId).eq("ativo", true).order("score", { ascending: false }).limit(200),
    supabase.from("ai_prompt_experiments").select("*").eq("organizacao_id", orgId).order("started_at", { ascending: false }).limit(50),
    supabase.from("v_ai_experimento_resultado").select("*"),
  ]);

  // Merge: org override se existir, senão global
  const featuresMap = new Map<string, AiFeature>();
  for (const f of (featuresGlobal ?? []) as AiFeature[]) featuresMap.set(f.codigo, f);
  for (const f of (featuresOrg ?? []) as AiFeature[]) featuresMap.set(f.codigo, f);
  const features = Array.from(featuresMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

  // Filtra resultados pra apenas experimentos da org
  const expIds = new Set(((experimentosData ?? []) as Array<{ id: number }>).map((e) => e.id));
  const resultados = ((resultadosData ?? []) as Array<{ experiment_id: number }>).filter((r) =>
    expIds.has(r.experiment_id)
  );

  const tab = (searchParams.tab ?? "features") as Tab;
  const featureAberta = searchParams.feature ?? null;

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto pb-0">
        <OverageWarningBanner organizacaoId={orgId} />
        <Ai30dSummary uso={(uso ?? []) as AiUso30d[]} />
      </div>
      <AdminAiClient
        tab={tab}
        featureAberta={featureAberta}
        features={features}
        providers={(providers ?? []) as AiProvider[]}
        prompts={(prompts ?? []) as AiPrompt[]}
        uso={(uso ?? []) as AiUso30d[]}
        logs={(logs ?? []) as LogRow[]}
        fewshot={(fewshotData ?? []) as FewshotExemplo[]}
        experimentos={(experimentosData ?? []) as any}
        resultadosExperimento={resultados as any}
      />
    </>
  );
}

export type LogRow = {
  id: number;
  created_at: string;
  feature_codigo: string;
  provider_codigo: string | null;
  modelo: string | null;
  status: string;
  tokens_input: number | null;
  tokens_output: number | null;
  custo_estimado: number | null;
  latencia_ms: number | null;
  erro_msg: string | null;
  input_vars: Record<string, unknown>;
  output_texto: string | null;
};
