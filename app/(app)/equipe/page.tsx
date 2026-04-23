import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import EquipeClient from "./equipe-client";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();

  const [membros, { data: convites }, { data: segmentos }, { data: metas }, { data: config }] =
    await Promise.all([
      listarMembrosDaOrg(orgId),
      supabase.from("convites")
        .select("*")
        .eq("organizacao_id", orgId)
        .is("aceito_em", null)
        .order("created_at", { ascending: false }),
      supabase.from("vendedor_segmento")
        .select("*")
        .eq("organizacao_id", orgId),
      supabase.from("meta_individual")
        .select("*")
        .eq("organizacao_id", orgId)
        .order("periodo_inicio", { ascending: false }),
      supabase.from("organizacao_config")
        .select("*")
        .eq("organizacao_id", orgId)
        .maybeSingle(),
    ]);

  // Lista de segmentos únicos usados por leads (sugestões para o gestor)
  const { data: segmentosLeads } = await supabase.from("leads")
    .select("segmento")
    .eq("organizacao_id", orgId)
    .not("segmento", "is", null);
  const segmentosDisponiveis = Array.from(
    new Set((segmentosLeads ?? []).map(l => l.segmento).filter(Boolean) as string[])
  ).sort();

  return (
    <EquipeClient
      meId={me.id}
      membros={membros}
      convites={(convites ?? []) as Array<{
        id: number;
        email: string;
        role: "gestor" | "comercial" | "sdr";
        token: string;
        expira_em: string;
        created_at: string;
      }>}
      segmentos={(segmentos ?? []) as Array<{
        id: number;
        profile_id: string;
        segmento: string;
      }>}
      metas={(metas ?? []) as Array<{
        id: number;
        profile_id: string;
        periodo_tipo: "semana" | "mes";
        periodo_inicio: string;
        periodo_fim: string;
        meta_leads: number;
        meta_raiox: number;
        meta_calls: number;
        meta_props: number;
        meta_fech: number;
      }>}
      segmentosDisponiveis={segmentosDisponiveis}
      config={(config as { distribuicao_automatica: boolean; distribuicao_estrategia: "segmento" | "round_robin" | "manual" } | null) ?? {
        distribuicao_automatica: false,
        distribuicao_estrategia: "manual",
      }}
    />
  );
}
