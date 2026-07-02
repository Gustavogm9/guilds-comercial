"use server";

export const maxDuration = 60;

import { invokeAI } from "@/lib/ai/dispatcher";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";

const VARIACOES_VALIDAS = ["conservadora", "recomendada", "premium"] as const;
const FORMATOS_VALIDOS = ["proposta_comercial", "escopo_tecnico", "email_executivo", "whatsapp_resumo"] as const;

type CamposProposta = {
  formato?: typeof FORMATOS_VALIDOS[number];
  objetivo?: string;
  escopo?: string;
  entregas?: string;
  cronograma?: string;
  investimento?: string;
  condicoes?: string;
  observacoes?: string;
  validade?: string;
  skillChain?: string;
  modeloReferencia?: string;
  pedidoMelhoria?: string;
};

function clean(value?: string | null, max = 1200) {
  return String(value ?? "").trim().slice(0, max);
}

function labelFormato(formato?: string | null) {
  if (formato === "escopo_tecnico") return "Escopo tecnico / SOW";
  if (formato === "email_executivo") return "Email executivo de envio";
  if (formato === "whatsapp_resumo") return "Resumo para WhatsApp";
  return "Proposta comercial consultiva";
}

function defaultSkillChain(formato: string) {
  const base = [
    "1. Diagnosticar contexto do lead, etapa do pipeline, dor principal e urgencia.",
    "2. Mapear valor economico e impacto comercial com base nos dados disponiveis.",
    "3. Selecionar oferta, add-ons, upsell/cross-sell e cases mais aderentes do portfolio.",
    "4. Montar escopo, entregas, premissas, cronograma, investimento e proximos passos.",
    "5. Revisar clareza, riscos comerciais, objeccoes provaveis e aderencia ao formato escolhido.",
  ];
  if (formato === "email_executivo") {
    return [...base, "6. Converter a proposta em um email executivo curto, direto e acionavel."].join("\n");
  }
  if (formato === "whatsapp_resumo") {
    return [...base, "6. Converter a proposta em uma mensagem de WhatsApp objetiva e facil de encaminhar."].join("\n");
  }
  if (formato === "escopo_tecnico") {
    return [...base, "6. Detalhar escopo tecnico/SOW com entregaveis, criterios de aceite e dependencias."].join("\n");
  }
  return [...base, "6. Montar uma proposta comercial consultiva em HTML pronto para preview/PDF."].join("\n");
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

function findHtmlValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return /<([a-z][\w-]*)[\s\S]*>/i.test(value) ? value : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHtmlValue(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["html", "html_preview", "proposta_html", "preview_html"]) {
      const found = findHtmlValue(record[key]);
      if (found) return found;
    }
    for (const item of Object.values(record)) {
      const found = findHtmlValue(item);
      if (found) return found;
    }
  }
  return null;
}

function extractHtml(text: string) {
  const parsed = extractJson(text);
  const fromJson = findHtmlValue(parsed);
  if (fromJson) return fromJson;
  const match = text.match(/<(article|section|main|div|html)[\s\S]*<\/\1>/i);
  return match?.[0] ?? null;
}

export async function gerarPropostaAction(input: {
  leadId: number;
  variacao: "conservadora" | "recomendada" | "premium";
  produtoId?: number | null;
  propostaId?: number | null;
  campos?: CamposProposta;
}) {
  if (!Number.isInteger(input.leadId) || input.leadId <= 0) {
    return { ok: false, texto: "", html: null, erro: "Lead invalido" };
  }
  if (!VARIACOES_VALIDAS.includes(input.variacao)) {
    return { ok: false, texto: "", html: null, erro: "Variacao invalida" };
  }

  const formato = input.campos?.formato && FORMATOS_VALIDOS.includes(input.campos.formato)
    ? input.campos.formato
    : "proposta_comercial";

  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  const me = await getCurrentProfile();
  if (!orgId) return { ok: false, texto: "", html: null, erro: "Sem organizacao" };

  const { data: lead } = await supabase
    .from("v_leads_enriched")
    .select("empresa, nome, segmento, dor_principal, observacoes, valor_potencial, crm_stage")
    .eq("organizacao_id", orgId)
    .eq("id", input.leadId)
    .maybeSingle();

  if (!lead) return { ok: false, texto: "", html: null, erro: "Lead nao encontrado" };

  const { data: produtos } = await supabase
    .from("produtos")
    .select("id, nome, descricao, categoria, valor_base, valor_max, recorrente, segmentos_alvo")
    .eq("organizacao_id", orgId)
    .eq("ativo", true)
    .order("ordem");

  const produtoSelecionado = input.produtoId
    ? (produtos ?? []).find((produto) => produto.id === input.produtoId)
    : null;

  const { data: leadProdutos } = await supabase
    .from("lead_produtos")
    .select("status, produtos(nome, categoria, recorrente)")
    .eq("lead_id", input.leadId);

  const { data: cases } = await supabase
    .from("portfolio_cases")
    .select("titulo, cliente_segmento, resultado, resultado_metricas, depoimento, descricao, is_proprio, tecnologias")
    .eq("organizacao_id", orgId)
    .or("publico.eq.true,is_proprio.eq.true")
    .limit(6);

  const produtoCtx = (produtos ?? []).map((produto) =>
    `- ${produto.nome}${produtoSelecionado?.id === produto.id ? " [oferta selecionada]" : ""} (${produto.categoria ?? "sem categoria"}): ${produto.descricao ?? "sem descricao"} | R$ ${produto.valor_base ?? "?"} ${produto.recorrente ? "[recorrente]" : "[unico]"}`
  ).join("\n");

  const leadProdutosCtx = (leadProdutos ?? []).map((lp: any) =>
    `- ${lp.produtos?.nome ?? "Produto"} (${lp.produtos?.categoria ?? "sem categoria"}) | status: ${lp.status ?? "interesse"}`
  ).join("\n");

  const casesCtx = (cases ?? []).map((item) =>
    `- ${item.is_proprio ? "Projeto proprio" : "Case"}: ${item.titulo} | Segmento: ${item.cliente_segmento ?? "sem segmento"} | Resultado: ${item.resultado ?? "sem resultado"} | Detalhe: ${item.descricao ?? item.depoimento ?? "sem detalhe"}`
  ).join("\n");

  const campos = input.campos ?? {};
  const skillChain = [
    defaultSkillChain(formato),
    clean(campos.skillChain, 4000),
  ].filter(Boolean).join("\n\nSkills comerciais validadas pelo time/Claude:\n");
  const schemaSaida = [
    "Retorne preferencialmente JSON valido, sem markdown antes/depois, neste formato:",
    "{",
    '  "resumo": "string curta para o vendedor",',
    '  "campos": { "cliente": "", "objetivo": "", "escopo": [], "entregas": [], "cronograma": "", "investimento": "", "condicoes": "", "validade": "", "proximos_passos": [] },',
    '  "html": "<article>HTML sem scripts, sem iframes, com estilos inline simples e pronto para preview/PDF</article>",',
    '  "checklist_validacao": ["itens que o vendedor deve conferir"],',
    '  "riscos": ["riscos, premissas ou pontos para validar antes de enviar"]',
    "}",
    "Se o formato escolhido for email ou WhatsApp, mantenha o HTML como preview do conteudo final.",
  ].join("\n");

  const briefingComercial = [
    `Formato escolhido: ${labelFormato(formato)}`,
    `Objetivo da proposta: ${clean(campos.objetivo) || "nao informado"}`,
    `Escopo desejado: ${clean(campos.escopo) || "nao informado"}`,
    `Entregas combinadas: ${clean(campos.entregas) || "nao informado"}`,
    `Cronograma/prazo: ${clean(campos.cronograma, 500) || "nao informado"}`,
    `Investimento/ancoragem: ${clean(campos.investimento, 500) || "usar valor potencial e portfolio"}`,
    `Condicoes comerciais: ${clean(campos.condicoes, 700) || "nao informado"}`,
    `Validade: ${clean(campos.validade, 120) || "nao informado"}`,
    `Observacoes do vendedor: ${clean(campos.observacoes) || "nao informado"}`,
    `Modelo/referencia validada: ${clean(campos.modeloReferencia, 1500) || "nao informado"}`,
    `Pedido de melhoria/correcao pos-geracao: ${clean(campos.pedidoMelhoria, 1500) || "nao informado"}`,
  ].join("\n");

  const inputVars = {
    leadId: input.leadId,
    produtoId: input.produtoId ?? null,
    variacao: input.variacao,
    formato,
    campos: {
      objetivo: clean(campos.objetivo),
      escopo: clean(campos.escopo),
      entregas: clean(campos.entregas),
      cronograma: clean(campos.cronograma, 500),
      investimento: clean(campos.investimento, 500),
      condicoes: clean(campos.condicoes, 700),
      validade: clean(campos.validade, 120),
      observacoes: clean(campos.observacoes),
      pedidoMelhoria: clean(campos.pedidoMelhoria, 1500),
    },
  };

  const result = await invokeAI({
    feature: "gerar_proposta",
    leadId: input.leadId,
    outputMode: "texto",
    vars: {
      empresa: lead.empresa ?? "nao informado",
      nome: lead.nome ?? "nao informado",
      segmento: lead.segmento ?? "nao informado",
      dorPrincipal: lead.dor_principal ?? "nao informado",
      dor_principal: lead.dor_principal ?? "nao informado",
      observacoes: lead.observacoes ?? "",
      valorPotencial: lead.valor_potencial ?? 0,
      valor_potencial: lead.valor_potencial ?? 0,
      raiox_score: 0,
      perda_anual: 0,
      variacao: input.variacao,
      formato_proposta: labelFormato(formato),
      briefing_comercial: briefingComercial,
      skills_proposta: skillChain,
      schema_saida: schemaSaida,
      preferencias: [
        lead.observacoes ?? "",
        briefingComercial,
        "Sequencia de skills a seguir antes de devolver a resposta:",
        skillChain,
        "Formato obrigatorio de saida:",
        schemaSaida,
      ].filter(Boolean).join("\n\n"),
      produtos_disponiveis: produtoCtx || "Nao configurados ainda.",
      produtos_vinculados_ao_lead: leadProdutosCtx || "Nenhum produto vinculado ao lead ainda.",
      cases_relevantes: casesCtx || "Nenhum case/projeto cadastrado ainda.",
    },
  });

  const htmlPreview = result.ok ? extractHtml(result.texto) : null;
  const hoje = new Date().toISOString().slice(0, 10);
  const dataFollowUp = new Date();
  dataFollowUp.setDate(dataFollowUp.getDate() + 3);
  const propostaLink = `/proposta/${input.leadId}`;
  let persistedPropostaId: number | null = input.propostaId ?? null;
  let persistedVersaoId: number | null = null;
  let persistedVersao = 1;

  if (result.ok && me) {
    let propostaId = persistedPropostaId;
    let versao = 1;

    if (propostaId) {
      const { data: atual } = await supabase
        .from("propostas")
        .select("id, versao_atual")
        .eq("id", propostaId)
        .eq("organizacao_id", orgId)
        .eq("lead_id", input.leadId)
        .maybeSingle();
      if (!atual) propostaId = null;
      else {
        versao = Number((atual as any).versao_atual ?? 1) + 1;
        const { error: updatePropostaError } = await supabase
          .from("propostas")
          .update({
            produto_id: input.produtoId ?? null,
            variacao: input.variacao,
            texto_proposta: result.texto,
            html_proposta: htmlPreview,
            input_vars: inputVars,
            ultimo_pedido_melhoria: clean(campos.pedidoMelhoria, 1500) || null,
            versao_atual: versao,
            updated_at: new Date().toISOString(),
          })
          .eq("id", propostaId)
          .eq("organizacao_id", orgId);
        if (updatePropostaError) {
          return { ok: false, texto: result.texto, html: htmlPreview, erro: updatePropostaError.message, invocationId: result.invocationId };
        }
      }
    }

    if (!propostaId) {
      const { data: novaProposta, error: propostaError } = await supabase.from("propostas").insert({
        organizacao_id: orgId,
        lead_id: input.leadId,
        produto_id: input.produtoId ?? null,
        criado_por: me.id,
        variacao: input.variacao,
        status: "rascunho",
        texto_proposta: result.texto,
        html_proposta: htmlPreview,
        input_vars: inputVars,
        ultimo_pedido_melhoria: clean(campos.pedidoMelhoria, 1500) || null,
        versao_atual: 1,
        link_proposta: propostaLink,
        data_envio: hoje,
      }).select("id").maybeSingle();
      if (propostaError) {
        return { ok: false, texto: result.texto, html: htmlPreview, erro: propostaError.message, invocationId: result.invocationId };
      }
      propostaId = novaProposta?.id ?? null;
    }

    let versaoId: number | null = null;
    if (propostaId) {
      persistedPropostaId = propostaId;
      persistedVersao = versao;
      const { data: versaoRow, error: versaoError } = await supabase.from("proposta_versoes").insert({
        organizacao_id: orgId,
        proposta_id: propostaId,
        lead_id: input.leadId,
        versao,
        texto_proposta: result.texto,
        html_proposta: htmlPreview,
        input_vars: inputVars,
        pedido_melhoria: clean(campos.pedidoMelhoria, 1500) || null,
        ai_invocation_id: result.invocationId,
        criado_por: me.id,
      }).select("id").maybeSingle();
      if (versaoError) {
        return { ok: false, texto: result.texto, html: htmlPreview, erro: versaoError.message, invocationId: result.invocationId, propostaId };
      }
      versaoId = versaoRow?.id ?? null;
      persistedVersaoId = versaoId;

      if (clean(campos.pedidoMelhoria, 1500)) {
        await supabase.from("proposta_feedback").insert({
          organizacao_id: orgId,
          proposta_id: propostaId,
          versao_id: versaoId,
          tipo: "melhoria",
          conteudo: clean(campos.pedidoMelhoria, 1500),
          resolvido: true,
          criado_por: me.id,
        });
      }
    }

    const { error: leadError } = await supabase
      .from("leads")
      .update({
        funnel_stage: "pipeline",
        crm_stage: "Proposta",
        data_proposta: hoje,
        link_proposta: propostaLink,
        proxima_acao: "Fazer follow-up da proposta",
        data_proxima_acao: dataFollowUp.toISOString().slice(0, 10),
      })
      .eq("id", input.leadId)
      .eq("organizacao_id", orgId);
    if (leadError) {
      return { ok: false, texto: result.texto, html: htmlPreview, erro: leadError.message, invocationId: result.invocationId };
    }

    revalidatePath(`/proposta/${input.leadId}`);
    revalidatePath(`/vendas/pipeline/${input.leadId}`);
    revalidatePath("/vendas/pipeline");
    revalidatePath("/vendas/base");
    revalidatePath("/vendas/portfolio");
    revalidatePath("/vendas/propostas");
    revalidatePath("/hoje");
  }

  return {
    ok: result.ok,
    texto: result.texto,
    html: htmlPreview,
    erro: result.erro,
    invocationId: result.invocationId,
    propostaId: persistedPropostaId,
    versaoId: persistedVersaoId,
    versao: persistedVersao,
  };
}
