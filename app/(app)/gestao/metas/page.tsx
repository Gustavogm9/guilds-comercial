import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import GestaoTabs from "../gestao-tabs";
import MetasClient from "./metas-client";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const [{ data: metas }, membros, { data: org }] = await Promise.all([
    supabase
      .from("v_meta_progresso")
      .select("*")
      .eq("organizacao_id", orgId)
      .eq("ativo", true)
      .order("data_fim", { ascending: false }),
    listarMembrosDaOrg(orgId),
    supabase.from("organizacoes").select("moeda_padrao").eq("id", orgId).maybeSingle(),
  ]);

  const currency = ((org as any)?.moeda_padrao as string) || "BRL";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <GestaoTabs isGestor={true} />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Target className="w-6 h-6 text-primary" aria-hidden="true" />
          Metas do time
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Defina metas semanais/mensais/trimestrais por vendedor ou pra equipe toda.
          Realizado é atualizado em tempo real com base nos dados do CRM.
        </p>
      </header>

      <MetasClient
        metas={(metas ?? []) as any[]}
        membros={(membros ?? []) as any[]}
        currency={currency}
      />
    </div>
  );
}
