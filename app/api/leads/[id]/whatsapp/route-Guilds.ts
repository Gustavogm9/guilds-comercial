import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { parseWhatsappExport } from "@/lib/whatsapp-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/leads/[id]/whatsapp
 * Lista conversas WhatsApp do lead (resumo, sem mensagens individuais).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const { id } = await params;
  const leadId = parseInt(id, 10);
  if (isNaN(leadId)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .select("id, contato_nome, contato_tel, arquivo_nome, total_msgs, primeira_msg, ultima_msg, resumo_ia, sentimento, pontos_chave, nivel_interesse, canal, created_at")
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, conversas: data ?? [] });
}

/**
 * POST /api/leads/[id]/whatsapp/import
 * Importa exportação .txt do WhatsApp.
 *
 * Body: FormData com campo `file` (.txt) e opcionalmente `nome_vendedor`.
 * Ou JSON com `conteudo` (string do arquivo) e `nome_vendedor`.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const { id } = await params;
  const leadId = parseInt(id, 10);
  if (isNaN(leadId)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const supabase = createClient();

  // Verifica acesso ao lead
  const { data: lead } = await supabase
    .from("leads").select("id, empresa, nome").eq("id", leadId).eq("organizacao_id", orgId).maybeSingle();
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado." }, { status: 404 });

  // Aceita FormData ou JSON
  let textoConversa = "";
  let nomeArquivo = "conversa.txt";
  let nomeVendedor: string | null = me.display_name;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ erro: "Arquivo não enviado." }, { status: 400 });
    textoConversa = await file.text();
    nomeArquivo = file.name;
    nomeVendedor = (form.get("nome_vendedor") as string | null) ?? me.display_name;
  } else {
    const body = await req.json().catch(() => ({}));
    if (!body.conteudo) return NextResponse.json({ erro: "Conteúdo não fornecido." }, { status: 400 });
    textoConversa = body.conteudo;
    nomeArquivo = body.nome_arquivo ?? "conversa.txt";
    nomeVendedor = body.nome_vendedor ?? me.display_name;
  }

  // Valida tamanho (max 5MB de texto)
  if (textoConversa.length > 5 * 1024 * 1024) {
    return NextResponse.json({ erro: "Arquivo muito grande. Máximo 5MB." }, { status: 413 });
  }

  // Parseia a conversa
  const resultado = parseWhatsappExport(textoConversa, nomeVendedor);

  if (resultado.total_msgs === 0) {
    return NextResponse.json({ erro: "Nenhuma mensagem válida encontrada. Verifique o formato do arquivo." }, { status: 400 });
  }

  // Cria a conversa no banco
  const { data: conversa, error: errConv } = await supabase
    .from("whatsapp_conversas")
    .insert({
      organizacao_id: orgId,
      lead_id: leadId,
      contato_nome: resultado.contato_nome,
      arquivo_nome: nomeArquivo,
      total_msgs: resultado.total_msgs,
      primeira_msg: resultado.primeira_msg?.toISOString() ?? null,
      ultima_msg: resultado.ultima_msg?.toISOString() ?? null,
      canal: "importado",
    })
    .select("id")
    .single();

  if (errConv) return NextResponse.json({ erro: errConv.message }, { status: 500 });

  // Insere mensagens em lotes de 500
  const LOTE = 500;
  for (let i = 0; i < resultado.mensagens.length; i += LOTE) {
    const lote = resultado.mensagens.slice(i, i + LOTE).map(m => ({
      conversa_id: conversa.id,
      organizacao_id: orgId,
      lead_id: leadId,
      remetente: m.remetente,
      eh_vendedor: m.eh_vendedor,
      conteudo: m.conteudo,
      tipo_midia: m.tipo_midia,
      enviada_em: m.enviada_em.toISOString(),
    }));
    const { error: errMsg } = await supabase.from("whatsapp_mensagens").insert(lote);
    if (errMsg) console.error("[whatsapp/import] lote", i, errMsg.message);
  }

  // Registra na lead_timeline
  await supabase.from("lead_timeline").insert({
    organizacao_id: orgId,
    lead_id: leadId,
    tipo: "whatsapp_importado",
    titulo: `Conversa importada: ${resultado.contato_nome ?? nomeArquivo}`,
    conteudo: `${resultado.total_msgs} mensagens entre ${resultado.primeira_msg?.toLocaleDateString("pt-BR") ?? "?"} e ${resultado.ultima_msg?.toLocaleDateString("pt-BR") ?? "?"}`,
    metadata: {
      conversa_id: conversa.id,
      total_msgs: resultado.total_msgs,
      contato_nome: resultado.contato_nome,
      erros_parse: resultado.erros,
    },
    ref_id: conversa.id,
    ref_tabela: "whatsapp_conversas",
    criado_por: me.id,
  });

  // Dispara análise IA em background (best-effort)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  fetch(`${appUrl}/api/leads/${leadId}/whatsapp/${conversa.id}/analisar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    conversa_id: conversa.id,
    total_msgs: resultado.total_msgs,
    contato_nome: resultado.contato_nome,
    primeira_msg: resultado.primeira_msg,
    ultima_msg: resultado.ultima_msg,
    erros_parse: resultado.erros,
  });
}
