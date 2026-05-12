import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { Building2, AlertTriangle } from "lucide-react";
import OrgForm from "./org-form";
import type { Organizacao } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrganizacaoPage() {
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/configuracoes/perfil");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();
  const { data: org } = await supabase
    .from("organizacoes")
    .select("*")
    .eq("id", orgId)
    .single();
  if (!org) redirect("/hoje");

  const orgTyped = org as Organizacao;
  const dadosFiscaisIncompletos = !orgTyped.cnpj || !orgTyped.razao_social;

  return (
    <div className="max-w-3xl space-y-4">
      {dadosFiscaisIncompletos && (
        <div className="card p-4 flex items-start gap-3 bg-warning-500/10 border-warning-500/30">
          <AlertTriangle className="w-5 h-5 text-warning-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Dados fiscais incompletos</h3>
            <p className="text-sm text-muted-foreground">
              Preencha CNPJ e razão social para que possamos emitir nota fiscal e habilitar todos os recursos da plataforma.
            </p>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-primary" />
          Detalhes da Organização
        </h2>

        <OrgForm org={orgTyped} />
      </div>
    </div>
  );
}
