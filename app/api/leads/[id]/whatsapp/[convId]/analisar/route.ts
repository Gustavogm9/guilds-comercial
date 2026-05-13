import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { invokeAISystem } from "@/lib/ai/dispatcher";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; convId: string }> };

function isInternalRequest(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && req.headers.get("authorization") === `Bearer ${expected}`);
}

async function resolveAuthorizedOrg(req: NextRequest) {
  if (isInternalRequest(req)) return { orgId: null as string | null };

  const me = await getCurrentProfile();
  if (!me) return { error: NextResponse.json({ erro: "Nao autenticado." }, { status: 401 }) };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { error: NextResponse.json({ erro: "Sem org." }, { status: 403 }) };

  return { orgId };
}

/**
 * POST /api/leads/[id]/whatsapp/[convId]/analisar
 *
 * Analisa uma conversa WhatsApp importada usando IA.
 * Pode ser chamada por usuario autenticado da org ativa ou por chamada interna
 * assinada com CRON_SECRET.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id, convId } = await params;
  const leadId = parseInt(id, 10);
  const conversaId = parseInt(convId, 10);

  if (isNaN(leadId) || isNaN(conversaId)) {
    return NextResponse.json({ erro: "IDs invalidos." }, { status: 400 });
  }

  const auth = await resolveAuthorizedOrg(req);
  if ("error" in auth) return auth.error;

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let conversaQuery = supabase
    .from("whatsapp_conversas")
    .select("id, organizacao_id, lead_id, contato_nome, total_msgs, primeira_msg, ultima_msg, resumo_ia")
    .eq("id", conversaId)
    .eq("lead_id", leadId);

  if (auth.orgId) conversaQuery = conversaQuery.eq("organizacao_id", auth.orgId);

  const { data: conversa } = await conversaQuery.maybeSingle();
  if (!conversa) return NextResponse.json({ erro: "Conversa nao encontrada." }, { status: 404 });

  if (conversa.resumo_ia) return NextResponse.json({ ok: true, ja_analisada: true });

  const { data: lead } = await supabase
    .from("leads")
    .select("empresa, nome, segmento")
    .eq("id", conversa.lead_id ?? leadId)
    .eq("organizacao_id", conversa.organizacao_id)
    .maybeSingle();

  const { data: msgs } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, eh_vendedor, conteudo, enviada_em, tipo_midia")
    .eq("conversa_id", conversaId)
    .eq("organizacao_id", conversa.organizacao_id)
    .not("conteudo", "is", null)
    .order("enviada_em", { ascending: false })
    .limit(150);

  if (!msgs?.length) {
    return NextResponse.json({ erro: "Sem mensagens de texto para analisar." }, { status: 400 });
  }

  const amostraTexto = msgs
    .reverse()
    .map((m) => {
      const prefix = m.eh_vendedor ? "Vendedor" : (conversa.contato_nome ?? "Lead");
      return `[${new Date(m.enviada_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}] ${prefix}: ${m.conteudo}`;
    })
    .join("\n");

  const primeira = conversa.primeira_msg ? new Date(conversa.primeira_msg).toLocaleDateString("pt-BR") : "?";
  const ultima = conversa.ultima_msg ? new Date(conversa.ultima_msg).toLocaleDateString("pt-BR") : "?";

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
    analise = { resumo: aiResult.texto };
  }

  const sentimentoValido = ["positivo", "neutro", "negativo"].includes(analise.sentimento ?? "")
    ? analise.sentimento
    : "neutro";

  await supabase.from("whatsapp_conversas").update({
    resumo_ia: analise.resumo ?? null,
    sentimento: sentimentoValido,
    nivel_interesse: analise.nivel_interesse ?? null,
    pontos_chave: [
      ...(analise.pontos_chave ?? []),
      ...(analise.sinais_compra ?? []),
      ...(analise.objecoes ?? []),
    ],
  }).eq("id", conversaId).eq("organizacao_id", conversa.organizacao_id);

  await supabase
    .from("lead_timeline")
    .update({ resumo_ia: analise.resumo ?? null })
    .eq("ref_id", conversaId)
    .eq("organizacao_id", conversa.organizacao_id)
    .eq("ref_tabela", "whatsapp_conversas")
    .eq("tipo", "whatsapp_importado");

  if (analise.proxima_acao_sugerida) {
    await supabase.from("lead_timeline").insert({
      organizacao_id: conversa.organizacao_id,
      lead_id: conversa.lead_id ?? leadId,
      tipo: "sistema",
      titulo: "Proxima acao sugerida pela IA (WhatsApp)",
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

export async function GET(req: NextRequest, { params }: Params) {
  const { id, convId } = await params;
  const leadId = parseInt(id, 10);
  const conversaId = parseInt(convId, 10);
  if (isNaN(leadId) || isNaN(conversaId)) {
    return NextResponse.json({ erro: "ID invalido." }, { status: 400 });
  }

  const auth = await resolveAuthorizedOrg(req);
  if ("error" in auth) return auth.error;

  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let query = supabase
    .from("whatsapp_conversas")
    .select("resumo_ia, sentimento, nivel_interesse, pontos_chave")
    .eq("id", conversaId)
    .eq("lead_id", leadId);

  if (auth.orgId) query = query.eq("organizacao_id", auth.orgId);

  const { data } = await query.maybeSingle();
  return NextResponse.json({ ok: true, analisada: !!data?.resumo_ia, ...data });
}
