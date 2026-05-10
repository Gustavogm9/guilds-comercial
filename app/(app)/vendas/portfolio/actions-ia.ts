"use server";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { GoogleGenAI } from "@google/genai";

export async function gerarIcpProduto(produtoId: number) {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Não autorizado" };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "Sem organização ativa" };

  const supabase = createClient();

  // 1. Busca os clientes "Fechado" vinculados a este produto
  const { data: fechados } = await supabase
    .from("lead_produtos")
    .select("leads(empresa, segmento, cargo, valor_potencial, cidade_uf, dor_principal, anotacoes_ia)")
    .eq("produto_id", produtoId)
    .eq("status", "fechado");

  // Opcional: buscar cases de sucesso associados ao produto para enriquecer
  const { data: cases } = await supabase
    .from("portfolio_cases")
    .select("cliente_nome, resultado, depoimento")
    .eq("produto_id", produtoId)
    .eq("organizacao_id", orgId)
    .limit(5);

  const fechadosLen = fechados?.length || 0;
  if (fechadosLen === 0 && (!cases || cases.length === 0)) {
    return { ok: false, error: "Nenhum cliente fechado ou case para analisar o ICP." };
  }

  // 2. Extrai dados úteis para o LLM
  const leadsData = (fechados ?? []).slice(0, 50).map(lp => lp.leads).filter(Boolean);

  // 3. Prompt para o Gemini extrair o ICP
  const prompt = `Você é um estrategista de vendas B2B. Sua tarefa é analisar o histórico de clientes que COMPRARAM um produto específico e gerar o Perfil de Cliente Ideal (ICP) desse produto.

Histórico de Clientes Fechados (${leadsData.length} amostras):
${JSON.stringify(leadsData, null, 2)}

Cases de Sucesso:
${JSON.stringify(cases ?? [], null, 2)}

Extraia padrões claros e retorne um JSON com o seguinte formato:
{
  "segmento": "Segmento principal e secundários",
  "porte": "Tamanho/porte provável baseado no valor",
  "cargos_decisores": ["Cargo 1", "Cargo 2"],
  "dores_comuns": ["Dor 1", "Dor 2"],
  "motivos_compra": ["Motivo 1", "Motivo 2"],
  "dicas_abordagem": "Dica de como um SDR ou vendedor deve abordar esse tipo de empresa."
}
Responda APENAS com o JSON válido, sem markdown (\`\`\`json) em volta.`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text || "{}";
    let icpExtraido;
    try {
      icpExtraido = JSON.parse(text);
      icpExtraido.ultimo_calculo = new Date().toISOString();
      icpExtraido.amostras_usadas = leadsData.length;
    } catch (e) {
      console.error("Falha ao fazer parse do JSON do ICP", e);
      return { ok: false, error: "A IA retornou um formato inválido." };
    }

    // 4. Salva no banco de dados
    const { error: updateErr } = await supabase
      .from("produtos")
      .update({ icp_extraido: icpExtraido })
      .eq("id", produtoId)
      .eq("organizacao_id", orgId);

    if (updateErr) {
      console.error(updateErr);
      return { ok: false, error: "Erro ao salvar ICP no banco de dados." };
    }

    return { ok: true, icp: icpExtraido };
  } catch (err: any) {
    console.error("Erro no Gemini:", err);
    return { ok: false, error: err.message || "Erro ao processar a IA." };
  }
}

export async function calcularLookAlikeProduto(produtoId: number) {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "Não autorizado" };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "Sem organização ativa" };

  const supabase = createClient();

  // 1. Busca o ICP do produto
  const { data: produto } = await supabase
    .from("produtos")
    .select("icp_extraido")
    .eq("id", produtoId)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (!produto || !produto.icp_extraido) {
    return { ok: false, error: "Gere o ICP do produto primeiro." };
  }

  const icp = produto.icp_extraido as any;

  // 2. Busca leads ativos na organização (limitado aos 100 mais recentes para não estourar)
  const { data: leads } = await supabase
    .from("leads")
    .select("id, empresa, segmento, cargo, dor_principal, produto_scores")
    .eq("organizacao_id", orgId)
    .neq("crm_stage", "Perdido")
    .neq("crm_stage", "Fechado")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!leads || leads.length === 0) {
    return { ok: true, message: "Nenhum lead ativo para analisar." };
  }

  const prompt = `Você é um analista de vendas (SDR). Temos o seguinte ICP (Perfil de Cliente Ideal) para o nosso Produto:
${JSON.stringify(icp, null, 2)}

Temos uma lista de leads ativos. Pontue o fit (0 a 100) de cada lead com base nesse ICP. Retorne APENAS um JSON no formato:
{
  "scores": {
    "LEAD_ID_1": 85,
    "LEAD_ID_2": 40
  }
}

Lista de Leads:
${JSON.stringify(leads.map(l => ({ id: l.id, empresa: l.empresa, segmento: l.segmento, cargo: l.cargo, dor: l.dor_principal })), null, 2)}`;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text || "{}";
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "A IA retornou um formato inválido." };
    }

    if (!result.scores) {
      return { ok: false, error: "Faltam os scores no resultado." };
    }

    // 3. Atualiza os scores no DB
    let updates = 0;
    for (const lead of leads) {
      const score = result.scores[lead.id];
      if (typeof score === "number") {
        const currentScores = (lead.produto_scores as any) || {};
        currentScores[produtoId] = score;

        await supabase
          .from("leads")
          .update({ produto_scores: currentScores })
          .eq("id", lead.id);
        updates++;
      }
    }

    return { ok: true, atualizados: updates };
  } catch (err: any) {
    console.error("Erro no Gemini (Look-alike):", err);
    return { ok: false, error: err.message || "Erro ao processar a IA." };
  }
}
