import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { invokeAISystem } from "@/lib/ai/dispatcher";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; convId: string }> };

/**
 * POST /api/leads/[id]/whatsapp/[convId]/analisar
 *
 * Analisa uma conversa WhatsApp importada usando IA.
 * Atualiza: whatsapp_conversas.resumo_ia, sentimento, pontos_chave, nivel_interesse
 * Atualiza: lead_timeline.resumo_ia do evento whatsapp_importado
 *
 * Chamado automaticamente pelo endpoint de import (best-effort background).
 * Também pode ser chamado manualmente pelo vendedor via UI.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id, convId } = await params;
  const leadId = parseInt(id, 10);
  const conversaId = parseInt(convId, 10);

  if (isNaN(leadId) || isNaN(conversaId)) {
    return NextResponse.json({ erro: "IDs inválidos." }, { status: 400 });
  }

  // Usa service role para não depender de contexto de sessão (chamado em background)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Busca dados da conversa
  const { data: conversa } = await supabase
    .from("whatsapp_conversas")
    .select("id, organizacao_id, lead_id, contato_nome, total_msgs, primeira_msg, ultima_msg, resumo_ia")
    .eq("id", conversaId)
    .maybeSingle();

  if (!conversa) return NextResponse.json({ erro: "Conversa não encontrada." }, { status: 404 });

  // Já foi analisada — skip (idempotente)
  if (conversa.resumo_ia) return NextResponse.json({ ok: true, ja_analisada: true });

  // Busca lead para contexto
  const { data: lead } = await supabase
    .from("leads")
    .select("empresa, nome, segmento")
    .eq("id", conversa.lead_id ?? leadId)
    .maybeSingle();

  // Busca amostra das mensagens (últimas 150 para economizar tokens)
  const { data: msgs } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, eh_vendedor, conteudo, enviada_em, tipo_midia")
    .eq("conversa_id", conversaId)
    .not("conteudo", "is", null)
    .order("enviada_em", { ascending: false })
    .limit(150);

  if (!msgs?.length) {
    return NextResponse.json({ erro: "Sem mensagens de texto para analisar." }, { status: 400 });
  }

  // Monta amostra em texto cronológico
  const amostraTexto = msgs
    .reverse()
    .map(m => {
      const prefix = m.eh_vendedor ? "Vendedor" : (conversa.contato_nome ?? "Lead");
      return `[${new Date(m.enviada_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}] ${prefix}: ${m.conteudo}`;
    })
    .join("\n");

  const primeira = conversa.primeira_msg ? new Date(conversa.primeira_msg).toLocaleDateString("pt-BR") : "?";
  const ultima = conversa.ultima_msg ? new Date(conversa.ultima_msg).toLocaleDateString("pt-BR") : "?";

  // Chama IA via dispatcher do sistema
  const aiResult = await invokeAISystem(conversa.organizacao_id, {
    feature: "analisar_whatsapp",
    vars: {
      vendedor: "Vendedor",
      contato: conversa.contato_nome ?? "Lead",
      empresa: lead?.empresa ?? lead?.nome ?? "Empresa",
      total_msgs: conversa.total_msgs,
      periodo: `${primeira} a ${ultima}`,
      amostra_msgs: msgs.length,
      amostra: amostraTexto,
    },
    leadId: conversa.lead_id ?? leadId,
    outputMode: "json",
  });

  if (!aiResult.ok) {
    console.error("[whatsapp/analisar] IA falhou:", aiResult.erro);
    return NextResponse.json({ ok: false, erro: aiResult.erro }, { status: 500 });
  }

  // Parseia resultado JSON da IA
  let analise: {
    resumo?: string;
    sentimento?: string;
    nivel_interesse?: number;
    pontos_chave?: string[];
    proxima_acao_sugerida?: string;
    sinais_compra?: string[];
    objecoes?: string[];
  } = {};

  try {
    analise = typeof aiResult.texto === "string" ? JSON.parse(aiResult.texto) : aiResult.texto;
  } catch {
    // IA retornou texto não-JSON — usa como resumo
    analise = { resumo: aiResult.texto };
  }

  const sentimentoValido = ["positivo", "neutro", "negativo"].includes(analise.sentimento ?? "")
    ? analise.sentimento
    : "neutro";

  // Atualiza conversa com resultado da IA
  await supabase.from("whatsapp_conversas").update({
    resumo_ia: analise.resumo ?? null,
    sentimento: sentimentoValido,
    nivel_interesse: analise.nivel_interesse ?? null,
    pontos_chave: [
      ...(analise.pontos_chave ?? []),
      ...(analise.sinais_compra ?? []),
      ...(analise.objecoes ?? []),
    ],
  }).eq("id", conversaId);

  // Atualiza o evento da timeline com o resumo IA
  await supabase
    .from("lead_timeline")
    .update({ resumo_ia: analise.resumo ?? null })
    .eq("ref_id", conversaId)
    .eq("ref_tabela", "whatsapp_conversas")
    .eq("tipo", "whatsapp_importado");

  // Se há proxima_acao sugerida, registra na timeline
  if (analise.proxima_acao_sugerida) {
    await supabase.from("lead_timeline").insert({
      organizacao_id: conversa.organizacao_id,
      lead_id: conversa.lead_id ?? leadId,
      tipo: "sistema",
      titulo: "Próxima ação sugerida pela IA (WhatsApp)",
      conteudo: analise.proxima_acao_sugerida,
      metadata: {
        source: "analisar_whatsapp",
        conversa_id: conversaId,
        custo_usd: aiResult.custoUsd,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    resumo: analise.resumo,
    sentimento: sentimentoValido,
    nivel_interesse: analise.nivel_interesse,
    pontos_chave: analise.pontos_chave,
    proxima_acao_sugerida: analise.proxima_acao_sugerida,
    custo_usd: aiResult.custoUsd,
  });
}

/**
 * GET /api/leads/[id]/whatsapp/[convId]/analisar
 * Retorna o status atual da análise sem re-executar.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id, convId } = await params;
  const conversaId = parseInt(convId, 10);
  if (isNaN(conversaId)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await supabase
    .from("whatsapp_conversas")
    .select("resumo_ia, sentimento, nivel_interesse, pontos_chave")
    .eq("id", conversaId)
    .maybeSingle();

  return NextResponse.json({ ok: true, analisada: !!data?.resumo_ia, ...data });
}
