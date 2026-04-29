import { requireActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Terminal } from "lucide-react";
import { ApiKeysManager, WebhooksManager } from "./client-components";
import { redirect } from "next/navigation";

export default async function DevelopersPage() {
  const session = await requireActiveOrg();
  
  // Apenas gestores podem acessar a aba de desenvolvedores
  if (session.role !== "gestor") {
    redirect("/hoje");
  }

  const supabase = createClient();

  const [{ data: apiKeys }, { data: webhooks }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("*")
      .eq("organizacao_id", session.organizacaoId)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhooks")
      .select("*")
      .eq("organizacao_id", session.organizacaoId)
      .order("created_at", { ascending: false })
  ]);

  return (
    <div className="space-y-8">
      <ApiKeysManager organizacaoId={session.organizacaoId} apiKeys={apiKeys || []} />
      <WebhooksManager organizacaoId={session.organizacaoId} webhooks={webhooks || []} />
    </div>
  );
}
