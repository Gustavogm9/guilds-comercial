import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { redirect } from "next/navigation";
import WhatsappConfigClient from "./whatsapp-config-client";

export default async function WhatsappConfigPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/configuracoes/perfil");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();
  const { data: org } = await supabase
    .from("organizacoes")
    .select("id, nome, whatsapp_webhook_token, whatsapp_provider")
    .eq("id", orgId)
    .maybeSingle();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure a integração com WhatsApp para receber mensagens em tempo real e analisar conversas com IA.
        </p>
      </div>
      <WhatsappConfigClient
        orgId={orgId}
        tokenAtual={(org as any)?.whatsapp_webhook_token ?? null}
        providerAtual={(org as any)?.whatsapp_provider ?? "manual"}
      />
    </div>
  );
}
