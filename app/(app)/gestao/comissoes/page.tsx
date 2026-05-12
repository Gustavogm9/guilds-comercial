import { redirect } from "next/navigation";
import { DollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import GestaoTabs from "../gestao-tabs";
import ComissoesClient from "./comissoes-client";

export const dynamic = "force-dynamic";

export default async function ComissoesPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const [{ data: regras }, { data: comissoes }, membros, { data: org }] = await Promise.all([
    supabase
      .from("regra_comissao")
      .select("*")
      .eq("organizacao_id", orgId)
      .eq("ativo", true)
      .order("vigente_de", { ascending: false }),
    supabase
      .from("comissao_calculada")
      .select(`
        *,
        lead:lead_id(id, empresa, nome),
        vendedor:vendedor_id(display_name)
      `)
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    listarMembrosDaOrg(orgId),
    supabase.from("organizacoes").select("moeda_padrao").eq("id", orgId).maybeSingle(),
  ]);

  const currency = ((org as any)?.moeda_padrao as string) || "BRL";

  // Resumo: total pendente, aprovado, pago no mês corrente
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const { data: resumoMes } = await supabase
    .from("comissao_calculada")
    .select("valor_comissao, status_pagamento")
    .eq("organizacao_id", orgId)
    .gte("competencia", inicioMes);

  const resumo = (resumoMes ?? []).reduce(
    (acc, c: any) => {
      const v = Number(c.valor_comissao);
      if (c.status_pagamento === "pendente") acc.pendente += v;
      else if (c.status_pagamento === "aprovado") acc.aprovado += v;
      else if (c.status_pagamento === "pago") acc.pago += v;
      return acc;
    },
    { pendente: 0, aprovado: 0, pago: 0 },
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <GestaoTabs isGestor={true} />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary" aria-hidden="true" />
          Comissionamento
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Regras configuráveis aplicadas automaticamente quando lead vira "Fechado".
          Histórico completo com aprovação e marcação de pagamento.
        </p>
      </header>

      <ComissoesClient
        regras={(regras ?? []) as any[]}
        comissoes={(comissoes ?? []) as any[]}
        membros={(membros ?? []) as any[]}
        currency={currency}
        resumo={resumo}
      />
    </div>
  );
}
