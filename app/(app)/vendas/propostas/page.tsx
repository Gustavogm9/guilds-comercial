import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import VendasTabs from "../vendas-tabs";
import PropostaWorkbench, {
  type LeadOpcao,
  type ProdutoOpcao,
  type PropostaRecente,
  type PropostaSkillConfigOpcao,
} from "./proposta-workbench";

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

export default async function PropostasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  const isGestor = role === "gestor";
  const supabase = createClient();

  const [leadsResult, produtosResult, propostasResult, skillConfigsResult] = await Promise.all([
    supabase
      .from("v_leads_enriched")
      .select("id, empresa, nome, segmento, dor_principal, valor_potencial, crm_stage, data_proposta, updated_at")
      .eq("organizacao_id", orgId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(150),
    supabase
      .from("produtos")
      .select("id, nome, categoria, recorrente, valor_base, valor_max, descricao")
      .eq("organizacao_id", orgId)
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    supabase
      .from("propostas")
      .select("id, lead_id, produto_id, variacao, status, valor_total, created_at, data_envio, texto_proposta, link_proposta")
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("proposta_skill_configs")
      .select("id, nome, formato, skill_chain, modelo_referencia, padrao")
      .eq("organizacao_id", orgId)
      .eq("ativo", true)
      .order("padrao", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const leads: LeadOpcao[] = ((leadsResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((lead) => typeof lead.id === "number")
    .map((lead) => ({
      id: Number(lead.id),
      empresa: typeof lead.empresa === "string" ? lead.empresa : null,
      nome: typeof lead.nome === "string" ? lead.nome : null,
      segmento: typeof lead.segmento === "string" ? lead.segmento : null,
      dor_principal: typeof lead.dor_principal === "string" ? lead.dor_principal : null,
      valor_potencial: asNumber(lead.valor_potencial),
      crm_stage: typeof lead.crm_stage === "string" ? lead.crm_stage : null,
      data_proposta: typeof lead.data_proposta === "string" ? lead.data_proposta : null,
    }));

  const produtos: ProdutoOpcao[] = ((produtosResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((produto) => typeof produto.id === "number" && typeof produto.nome === "string")
    .map((produto) => ({
      id: Number(produto.id),
      nome: String(produto.nome),
      categoria: typeof produto.categoria === "string" ? produto.categoria : null,
      recorrente: typeof produto.recorrente === "boolean" ? produto.recorrente : null,
      valor_base: asNumber(produto.valor_base),
      valor_max: asNumber(produto.valor_max),
      descricao: typeof produto.descricao === "string" ? produto.descricao : null,
    }));

  const leadNomePorId = new Map(leads.map((lead) => [lead.id, lead.empresa || lead.nome || `Lead #${lead.id}`]));
  const produtoNomePorId = new Map(produtos.map((produto) => [produto.id, produto.nome]));

  const propostas: PropostaRecente[] = ((propostasResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((proposta) => typeof proposta.id === "number")
    .map((proposta) => {
      const leadId = typeof proposta.lead_id === "number" ? proposta.lead_id : null;
      const produtoId = typeof proposta.produto_id === "number" ? proposta.produto_id : null;
      return {
        id: Number(proposta.id),
        lead_id: leadId,
        produto_id: produtoId,
        lead_nome: leadId ? leadNomePorId.get(leadId) ?? `Lead #${leadId}` : "Lead sem vinculo",
        produto_nome: produtoId ? produtoNomePorId.get(produtoId) ?? null : null,
        variacao: typeof proposta.variacao === "string" ? proposta.variacao : null,
        status: typeof proposta.status === "string" ? proposta.status : "rascunho",
        valor_total: asNumber(proposta.valor_total),
        created_at: typeof proposta.created_at === "string" ? proposta.created_at : null,
        data_envio: typeof proposta.data_envio === "string" ? proposta.data_envio : null,
        texto_proposta: typeof proposta.texto_proposta === "string" ? proposta.texto_proposta : null,
        link_proposta: typeof proposta.link_proposta === "string" ? proposta.link_proposta : null,
      };
    });

  const skillConfigs: PropostaSkillConfigOpcao[] = ((skillConfigsResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((config) => typeof config.id === "number" && typeof config.nome === "string" && typeof config.skill_chain === "string")
    .map((config) => ({
      id: Number(config.id),
      nome: String(config.nome),
      formato: typeof config.formato === "string" ? config.formato : "proposta_comercial",
      skill_chain: String(config.skill_chain),
      modelo_referencia: typeof config.modelo_referencia === "string" ? config.modelo_referencia : null,
      padrao: Boolean(config.padrao),
    }));

  const initialLeadId = Number(params.lead);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <VendasTabs isGestor={isGestor} />

      <header className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Propostas</h1>
          <p className="text-sm text-muted-foreground">
            Gere documentos, escopos, emails e resumos comerciais a partir dos formatos validados.
          </p>
        </div>
      </header>

      <PropostaWorkbench
        leads={leads}
        produtos={produtos}
        propostas={propostas}
        skillConfigs={skillConfigs}
        initialLeadId={Number.isInteger(initialLeadId) ? initialLeadId : null}
      />
    </div>
  );
}
