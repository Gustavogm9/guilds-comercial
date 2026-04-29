import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import PropostaGerador from "@/components/proposta-gerador";
import { ChevronLeft, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PropostaPage({ params }: { params: { leadId: string } }) {
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const leadId = parseInt(params.leadId, 10);
  if (Number.isNaN(leadId)) notFound();

  const supabase = createClient();
  const { data: lead } = await supabase
    .from("v_leads_enriched")
    .select("id, empresa, nome, segmento, dor_principal, valor_potencial, crm_stage")
    .eq("organizacao_id", orgId)
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) notFound();

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href={`/pipeline/${leadId}`} className="btn-ghost text-xs mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Voltar ao lead
      </Link>

      <div className="card p-5 md:p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Gerar Proposta Comercial</h1>
            <p className="text-sm text-muted-foreground tabular-nums">
              {lead.empresa || lead.nome || "(sem nome)"} · {lead.segmento ?? "sem segmento"} ·{" "}
              {Number(lead.valor_potencial ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>

      <PropostaGerador leadId={leadId} />
    </div>
  );
}
