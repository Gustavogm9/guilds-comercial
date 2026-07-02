"use server";

export const maxDuration = 60;

import { invokeAI } from "@/lib/ai/dispatcher";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const MODOS_VALIDOS = ["contrato_template", "briefing_juridico", "revisao_juridica"] as const;

type ModoContrato = typeof MODOS_VALIDOS[number];

type CamposContrato = {
  modo?: ModoContrato;
  contratoId?: number | null;
  propostaId?: number | null;
  templateDocxNome?: string;
  templateDocxRef?: string;
  skillChain?: string;
  modeloReferencia?: string;
  dadosCliente?: string;
  escopoAprovado?: string;
  condicoesComerciais?: string;
  vigencia?: string;
  responsabilidades?: string;
  pontosForaPadrao?: string;
  pedidoMelhoria?: string;
};

function clean(value?: string | null, max = 1600) {
  return String(value ?? "").trim().slice(0, max);
}

function defaultSkillChain(modo: ModoContrato) {
  const base = [
    "1. Conferir proposta aprovada, lead fechado, escopo, valores, prazos e condicoes.",
    "2. Identificar se o caso cabe no template juridico padrao ou exige revisao.",
    "3. Mapear dados faltantes: razao social, CNPJ, endereco, representante, vigencia, pagamento e anexos.",
    "4. Separar escopo comercial de clausulas juridicas e marcar riscos/premissas.",
    "5. Produzir saida revisavel por vendedor, gestor e juridico, sem substituir advogado.",
  ];
  if (modo === "briefing_juridico") {
    return [...base, "6. Gerar briefing juridico completo, com perguntas pendentes e pontos fora do padrao."].join("\n");
  }
  if (modo === "revisao_juridica") {
    return [...base, "6. Gerar checklist de revisao juridica e versao comentada para advogado validar."].join("\n");
  }
  return [...base, "6. Estruturar contrato a partir do template DOCX aprovado, preservando campos e anexos."].join("\n");
}

function extractJson(text: string): unknown | null {
  const cleanText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleanText);
  } catch {
    const start = cleanText.indexOf("{");
    const end = cleanText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleanText.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function findString(record: unknown, keys: string[]) {
  if (!record || typeof record !== "object") return null;
  const obj = record as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function extractHtml(text: string) {
  const parsed = extractJson(text);
  const fromJson = findString(parsed, ["html", "html_contrato", "html_preview"]);
  if (fromJson) return fromJson;
  const match = text.match(/<(article|section|main|div|html)[\s\S]*<\/\1>/i);
  return match?.[0] ?? null;
}

function extractBriefing(text: string) {
  const parsed = extractJson(text);
  const fromJson = findString(parsed, ["briefing_juridico", "briefing", "resumo"]);
  return fromJson ?? text;
}

export async function gerarContratoAction(input: {
  leadId: number;
  campos?: CamposContrato;
}) {
  if (!Number.isInteger(input.leadId) || input.leadId <= 0) {
    return { ok: false, texto: "", html: null, erro: "Lead invalido" };
  }

  const campos = input.campos ?? {};
  const modo = campos.modo && MODOS_VALIDOS.includes(campos.modo) ? campos.modo : "contrato_template";

  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId || !me) return { ok: false, texto: "", html: null, erro: "Sem organizacao ou usuario" };

  const { data: lead } = await supabase
    .from("v_leads_enriched")
    .select("id, empresa, nome, segmento, dor_principal, valor_potencial, crm_stage, observacoes")
    .eq("organizacao_id", orgId)
    .eq("id", input.leadId)
    .maybeSingle();

  if (!lead) return { ok: false, texto: "", html: null, erro: "Lead nao encontrado" };

  const propostaId = campos.propostaId ?? null;
  const { data: proposta } = propostaId
    ? await supabase
      .from("propostas")
      .select("id, produto_id, variacao, status, texto_proposta, html_proposta, valor_total, valor_setup, valor_mensal, data_envio")
      .eq("organizacao_id", orgId)
      .eq("lead_id", input.leadId)
      .eq("id", propostaId)
      .maybeSingle()
    : await supabase
      .from("propostas")
      .select("id, produto_id, variacao, status, texto_proposta, html_proposta, valor_total, valor_setup, valor_mensal, data_envio")
      .eq("organizacao_id", orgId)
      .eq("lead_id", input.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const skillChain = [
    defaultSkillChain(modo),
    clean(campos.skillChain, 5000),
  ].filter(Boolean).join("\n\nSkills juridicas/comerciais validadas:\n");

  const briefingContrato = [
    `Modo: ${modo}`,
    `Dados do cliente: ${clean(campos.dadosCliente) || "nao informado"}`,
    `Escopo aprovado: ${clean(campos.escopoAprovado, 2500) || "usar proposta aprovada"}`,
    `Condicoes comerciais: ${clean(campos.condicoesComerciais, 1800) || "usar proposta aprovada"}`,
    `Vigencia/prazos: ${clean(campos.vigencia, 800) || "nao informado"}`,
    `Responsabilidades/SLA: ${clean(campos.responsabilidades, 1800) || "nao informado"}`,
    `Pontos fora do padrao: ${clean(campos.pontosForaPadrao, 1800) || "nao informado"}`,
    `Pedido de melhoria/revisao: ${clean(campos.pedidoMelhoria, 1500) || "nao informado"}`,
  ].join("\n");

  const templateReferencia = [
    `Template DOCX: ${clean(campos.templateDocxNome, 240) || "nao informado"}`,
    `Referencia/caminho: ${clean(campos.templateDocxRef, 500) || "nao informado"}`,
    `Modelo validado: ${clean(campos.modeloReferencia, 5000) || "nao informado"}`,
  ].join("\n");

  const schemaSaida = [
    "Retorne JSON valido sem markdown:",
    "{",
    '  "resumo": "string para vendedor/gestor",',
    '  "modo": "contrato_template|briefing_juridico|revisao_juridica",',
    '  "campos_docx": { "contratante": "", "escopo": "", "valor": "", "pagamento": "", "vigencia": "", "anexos": [] },',
    '  "html": "<article>preview seguro sem scripts</article>",',
    '  "briefing_juridico": "texto completo para advogado quando aplicavel",',
    '  "riscos": ["riscos e pontos que exigem validacao juridica"],',
    '  "pendencias": ["dados faltantes antes de assinar"]',
    "}",
  ].join("\n");

  const inputVars = {
    leadId: input.leadId,
    propostaId: proposta?.id ?? null,
    modo,
    templateDocxNome: clean(campos.templateDocxNome, 240),
    templateDocxRef: clean(campos.templateDocxRef, 500),
    pedidoMelhoria: clean(campos.pedidoMelhoria, 1500),
  };

  const result = await invokeAI({
    feature: "gerar_contrato",
    leadId: input.leadId,
    outputMode: "texto",
    vars: {
      modo_contrato: modo,
      empresa: lead.empresa ?? "nao informado",
      nome: lead.nome ?? "nao informado",
      segmento: lead.segmento ?? "nao informado",
      proposta_contexto: proposta?.texto_proposta ?? proposta?.html_proposta ?? "Nenhuma proposta encontrada.",
      briefing_contrato: briefingContrato,
      template_referencia: templateReferencia,
      skills_contrato: skillChain,
      schema_saida: schemaSaida,
    },
  });

  const html = result.ok ? extractHtml(result.texto) : null;
  const briefing = result.ok ? extractBriefing(result.texto) : null;
  let contratoId = campos.contratoId ?? null;
  let versao = 1;
  let versaoId: number | null = null;

  if (result.ok) {
    if (contratoId) {
      const { data: atual } = await supabase
        .from("contratos")
        .select("id, versao_atual")
        .eq("id", contratoId)
        .eq("organizacao_id", orgId)
        .eq("lead_id", input.leadId)
        .maybeSingle();
      if (!atual) contratoId = null;
      else {
        versao = Number((atual as any).versao_atual ?? 1) + 1;
        const { error } = await supabase.from("contratos").update({
          modo,
          proposta_id: proposta?.id ?? null,
          template_docx_nome: clean(campos.templateDocxNome, 240) || null,
          template_docx_ref: clean(campos.templateDocxRef, 500) || null,
          texto_contrato: result.texto,
          html_contrato: html,
          briefing_juridico: briefing,
          input_vars: inputVars,
          ultimo_pedido_melhoria: clean(campos.pedidoMelhoria, 1500) || null,
          versao_atual: versao,
          updated_at: new Date().toISOString(),
        }).eq("id", contratoId).eq("organizacao_id", orgId);
        if (error) return { ok: false, texto: result.texto, html, erro: error.message, invocationId: result.invocationId };
      }
    }

    if (!contratoId) {
      const { data: novo, error } = await supabase.from("contratos").insert({
        organizacao_id: orgId,
        lead_id: input.leadId,
        proposta_id: proposta?.id ?? null,
        criado_por: me.id,
        modo,
        status: modo === "contrato_template" ? "rascunho" : "em_revisao",
        template_docx_nome: clean(campos.templateDocxNome, 240) || null,
        template_docx_ref: clean(campos.templateDocxRef, 500) || null,
        texto_contrato: result.texto,
        html_contrato: html,
        briefing_juridico: briefing,
        input_vars: inputVars,
        ultimo_pedido_melhoria: clean(campos.pedidoMelhoria, 1500) || null,
        link_contrato: `/vendas/contratos?lead=${input.leadId}`,
      }).select("id").maybeSingle();
      if (error) return { ok: false, texto: result.texto, html, erro: error.message, invocationId: result.invocationId };
      contratoId = novo?.id ?? null;
    }

    if (contratoId) {
      const { data: versaoRow, error } = await supabase.from("contrato_versoes").insert({
        organizacao_id: orgId,
        contrato_id: contratoId,
        lead_id: input.leadId,
        proposta_id: proposta?.id ?? null,
        versao,
        modo,
        texto_contrato: result.texto,
        html_contrato: html,
        briefing_juridico: briefing,
        input_vars: inputVars,
        pedido_melhoria: clean(campos.pedidoMelhoria, 1500) || null,
        ai_invocation_id: result.invocationId,
        criado_por: me.id,
      }).select("id").maybeSingle();
      if (error) return { ok: false, texto: result.texto, html, erro: error.message, invocationId: result.invocationId, contratoId };
      versaoId = versaoRow?.id ?? null;

      if (clean(campos.pedidoMelhoria, 1500)) {
        await supabase.from("contrato_feedback").insert({
          organizacao_id: orgId,
          contrato_id: contratoId,
          versao_id: versaoId,
          tipo: "melhoria",
          conteudo: clean(campos.pedidoMelhoria, 1500),
          resolvido: true,
          criado_por: me.id,
        });
      }
    }

    revalidatePath("/vendas/contratos");
    revalidatePath("/vendas/juridico");
    revalidatePath("/comunicacao/pos-venda");
    revalidatePath("/flywheel");
    revalidatePath(`/vendas/pipeline/${input.leadId}`);
  }

  return {
    ok: result.ok,
    texto: result.texto,
    html,
    briefing,
    erro: result.erro,
    invocationId: result.invocationId,
    contratoId,
    versaoId,
    versao,
  };
}
