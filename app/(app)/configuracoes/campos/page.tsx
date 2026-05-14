import { redirect } from "next/navigation";
import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import CamposClient from "./campos-client";

export const dynamic = "force-dynamic";

export default async function CamposPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const { data: campos } = await supabase
    .from("custom_field_def")
    .select("*")
    .eq("organizacao_id", orgId)
    .eq("ativo", true)
    .order("entidade")
    .order("ordem")
    .order("rotulo");

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Tag className="w-6 h-6 text-primary" aria-hidden="true" />
          Campos customizados
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Defina campos adicionais por org pra leads, empresas e expansões.
          Tipos: texto, número, data, boolean, select, multi-select, URL.
          Valores ficam em <code className="text-xs">custom_fields</code> JSONB nas entidades.
        </p>
      </header>

      <CamposClient campos={(campos ?? []) as any[]} />
    </div>
  );
}
