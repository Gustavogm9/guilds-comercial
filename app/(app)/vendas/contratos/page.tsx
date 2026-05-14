import { redirect } from "next/navigation";
import Link from "next/link";
import { FileSignature, Scale } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import VendasTabs from "../vendas-tabs";
import ContratoWorkbench, {
  type ContratoExistente,
  type ContratoSkillConfigOpcao,
  type LeadFechadoOpcao,
  type PropostaContratoOpcao,
} from "./contrato-workbench";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ lead?: string }>;
};

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export default async function ContratosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  const isGestor = role === "gestor";
  const supabase = createClient();

  const [leadsResult, propostasResult, contratosResult, skillConfigsResult] = await Promise.all([
    supabase
      .from("v_leads_enriched")
      .select("id, empresa, nome, segmento, dor_principal, valor_potencial, crm_stage, data_fechamento, observacoes")
      .eq("organizacao_id", orgId)
      .eq("crm_stage", "Fechado")
      .order("data_fechamento", { ascending: false, nullsFirst: false })
      .limit(150),
    supabase
      .from("propostas")
      .select("id, lead_id, produto_id, variacao, status, valor_total, valor_setup, valor_mensal, created_at, data_envio, texto_proposta, html_proposta")
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("contratos")
      .select("id, lead_id, proposta_id, modo, status, versao_atual, created_at, template_docx_nome, texto_contrato, html_contrato, briefing_juridico")
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("contrato_skill_configs")
      .select("id, nome, modo, template_docx_nome, template_docx_ref, skill_chain, modelo_referencia, padrao")
      .eq("organizacao_id", orgId)
      .eq("ativo", true)
      .order("padrao", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const leads: LeadFechadoOpcao[] = ((leadsResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((lead) => typeof lead.id === "number")
    .map((lead) => ({
      id: Number(lead.id),
      empresa: typeof lead.empresa === "string" ? lead.empresa : null,
      nome: typeof lead.nome === "string" ? lead.nome : null,
      segmento: typeof lead.segmento === "string" ? lead.segmento : null,
      dor_principal: typeof lead.dor_principal === "string" ? lead.dor_principal : null,
      valor_potencial: asNumber(lead.valor_potencial),
      crm_stage: typeof lead.crm_stage === "string" ? lead.crm_stage : null,
      data_fechamento: typeof lead.data_fechamento === "string" ? lead.data_fechamento : null,
      observacoes: typeof lead.observacoes === "string" ? lead.observacoes : null,
    }));

  const leadNomePorId = new Map(leads.map((lead) => [lead.id, lead.empresa || lead.nome || `Lead #${lead.id}`]));

  const propostas: PropostaContratoOpcao[] = ((propostasResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((proposta) => typeof proposta.id === "number")
    .map((proposta) => ({
      id: Number(proposta.id),
      lead_id: typeof proposta.lead_id === "number" ? proposta.lead_id : null,
      lead_nome: typeof proposta.lead_id === "number" ? leadNomePorId.get(proposta.lead_id) ?? `Lead #${proposta.lead_id}` : "Lead sem vinculo",
      produto_id: typeof proposta.produto_id === "number" ? proposta.produto_id : null,
      variacao: typeof proposta.variacao === "string" ? proposta.variacao : null,
      status: typeof proposta.status === "string" ? proposta.status : "rascunho",
      valor_total: asNumber(proposta.valor_total),
      valor_setup: asNumber(proposta.valor_setup),
      valor_mensal: asNumber(proposta.valor_mensal),
      created_at: typeof proposta.created_at === "string" ? proposta.created_at : null,
      data_envio: typeof proposta.data_envio === "string" ? proposta.data_envio : null,
      texto_proposta: typeof proposta.texto_proposta === "string" ? proposta.texto_proposta : null,
      html_proposta: typeof proposta.html_proposta === "string" ? proposta.html_proposta : null,
    }));

  const contratos: ContratoExistente[] = ((contratosResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((contrato) => typeof contrato.id === "number")
    .map((contrato) => ({
      id: Number(contrato.id),
      lead_id: typeof contrato.lead_id === "number" ? contrato.lead_id : null,
      proposta_id: typeof contrato.proposta_id === "number" ? contrato.proposta_id : null,
      lead_nome: typeof contrato.lead_id === "number" ? leadNomePorId.get(contrato.lead_id) ?? `Lead #${contrato.lead_id}` : "Lead sem vinculo",
      modo: typeof contrato.modo === "string" ? contrato.modo : "contrato_template",
      status: typeof contrato.status === "string" ? contrato.status : "rascunho",
      versao_atual: typeof contrato.versao_atual === "number" ? contrato.versao_atual : 1,
      created_at: typeof contrato.created_at === "string" ? contrato.created_at : null,
      template_docx_nome: typeof contrato.template_docx_nome === "string" ? contrato.template_docx_nome : null,
      texto_contrato: typeof contrato.texto_contrato === "string" ? contrato.texto_contrato : null,
      html_contrato: typeof contrato.html_contrato === "string" ? contrato.html_contrato : null,
      briefing_juridico: typeof contrato.briefing_juridico === "string" ? contrato.briefing_juridico : null,
    }));

  const skillConfigs: ContratoSkillConfigOpcao[] = ((skillConfigsResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((config) => typeof config.id === "number" && typeof config.nome === "string" && typeof config.skill_chain === "string")
    .map((config) => ({
      id: Number(config.id),
      nome: String(config.nome),
      modo: typeof config.modo === "string" ? config.modo : "contrato_template",
      template_docx_nome: typeof config.template_docx_nome === "string" ? config.template_docx_nome : null,
      template_docx_ref: typeof config.template_docx_ref === "string" ? config.template_docx_ref : null,
      skill_chain: String(config.skill_chain),
      modelo_referencia: typeof config.modelo_referencia === "string" ? config.modelo_referencia : null,
      padrao: Boolean(config.padrao),
    }));

  const initialLeadId = Number(params.lead);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <VendasTabs isGestor={isGestor} />

      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
            <FileSignature className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contratos</h1>
            <p className="text-sm text-muted-foreground">
              Gere contrato por template, briefing juridico ou revisao a partir de propostas fechadas.
            </p>
          </div>
        </div>
        <Link href="/vendas/juridico" className="btn-secondary text-sm self-start">
          <Scale className="w-4 h-4" /> Monitor juridico
        </Link>
      </header>

      <ContratoWorkbench
        leads={leads}
        propostas={propostas}
        contratos={contratos}
        skillConfigs={skillConfigs}
        initialLeadId={Number.isInteger(initialLeadId) ? initialLeadId : null}
      />
    </div>
  );
}
