import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import ConfigTabs from "../../../config-tabs";
import FluxoEditor from "./fluxo-editor";

export const dynamic = "force-dynamic";

export default async function FluxoEditPage(props: {
  params: Promise<{ id: string }>;
}) {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const { id } = await props.params;
  const fluxoId = parseInt(id, 10);
  if (isNaN(fluxoId)) notFound();

  const supabase = createClient();
  const { data: fluxo } = await supabase
    .from("v_cadencia_fluxo_completo")
    .select("*")
    .eq("id", fluxoId)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (!fluxo) notFound();

  return (
    <div className="max-w-5xl">
      <ConfigTabs isGestor={true} />
      <Link href="/configuracoes/cadencia/fluxos" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-3 h-3" /> Voltar pros fluxos
      </Link>

      <FluxoEditor fluxo={fluxo as any} />
    </div>
  );
}
