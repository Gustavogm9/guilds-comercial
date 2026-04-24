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
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-guild-100 text-guild-600 rounded-xl grid place-items-center">
            <Terminal className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">API & Webhooks</h1>
            <p className="text-slate-500">Integre o Guilds Comercial com Zapier, Make ou sistemas internos.</p>
          </div>
        </div>

        <ApiKeysManager organizacaoId={session.organizacaoId} apiKeys={apiKeys || []} />
        <WebhooksManager organizacaoId={session.organizacaoId} webhooks={webhooks || []} />

      </div>
    </div>
  );
}
