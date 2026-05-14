import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import LpsClient from "./lps-client";

export const dynamic = "force-dynamic";

export default async function LandingPagesPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const [{ data: lps }, { data: fluxos }, membros] = await Promise.all([
    supabase.from("landing_page").select("*").eq("organizacao_id", orgId).order("created_at", { ascending: false }),
    supabase.from("cadencia_fluxo").select("id, nome, status").eq("organizacao_id", orgId).eq("status", "publicado"),
    listarMembrosDaOrg(orgId),
  ]);

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" aria-hidden="true" />
          Landing Pages
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          URLs públicas pra captura de leads. Cada submissão vira lead na base bruta automaticamente.
        </p>
      </header>

      <LpsClient
        lps={(lps ?? []) as any[]}
        fluxos={(fluxos ?? []) as any[]}
        membros={(membros ?? []) as any[]}
      />
    </div>
  );
}
