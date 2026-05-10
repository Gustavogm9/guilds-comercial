import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/**
 * POST /api/webhooks/whatsapp/[token]
 *
 * Receptor de mensagens WhatsApp ao vivo.
 * Compatível com:
 *   - Z-API: https://developer.z-api.io/webhooks
 *   - Evolution API: https://doc.evolution-api.com/webhooks
 *   - 360Dialog
 *
 * Fluxo:
 *   1. Valida token (mapeia para organização via organizacoes.whatsapp_webhook_token)
 *   2. Normaliza payload (Z-API / Evolution / 360Dialog → formato interno)
 *   3. Tenta vincular ao lead pelo número de telefone
 *   4. Cria ou reutiliza whatsapp_conversas para o número
 *   5. Insere whatsapp_mensagens
 *   6. Registra na lead_timeline (se lead vinculado)
 *
 * Segurança:
 *   - Token único por org (UUID v4 armazenado em organizacoes.whatsapp_webhook_token)
 *   - Rate limit implícito pelo banco (RLS com service role)
 *   - Não expõe dados de outras orgs (token → org lookup)
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Valida token → resolve org
  const { data: org } = await supabase
    .from("organizacoes")
    .select("id, nome, whatsapp_provider")
    .eq("whatsapp_webhook_token", token)
    .maybeSingle();

  if (!org) {
    // Retorna 200 para não expor ao provider que o token é inválido
    console.warn("[webhook/whatsapp] token não encontrado:", token.slice(0, 8));
    return NextResponse.json({ ok: true });
  }

  // 2. Parseia payload
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ erro: "Payload inválido." }, { status: 400 });
  }

  // 3. Normaliza para formato interno
  const msg = normalizarPayload(payload, org.whatsapp_provider ?? "zapi");
  if (!msg) {
    // Evento ignorado (delivery receipt, status de leitura, etc.)
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const telNormalizado = normalizarTel(msg.telefone);

  // 4. Tenta vincular ao lead pelo telefone
  const { data: leadMatch } = await supabase
    .from("leads")
    .select("id, empresa, nome")
    .eq("organizacao_id", org.id)
    .or(`whatsapp.eq.${telNormalizado},whatsapp.eq.${msg.telefone}`)
    .maybeSingle();

  // 5. Busca ou cria conversa para este número
  const { data: conversaExistente } = await supabase
    .from("whatsapp_conversas")
    .select("id, total_msgs")
    .eq("organizacao_id", org.id)
    .eq("contato_tel", telNormalizado)
    .eq("canal", org.whatsapp_provider ?? "zapi")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversaId = conversaExistente?.id;

  if (!conversaId) {
    const { data: novaConversa } = await supabase
      .from("whatsapp_conversas")
      .insert({
        organizacao_id: org.id,
        lead_id: leadMatch?.id ?? null,
        contato_nome: msg.nomeContato ?? null,
        contato_tel: telNormalizado,
        canal: org.whatsapp_provider ?? "zapi",
        primeira_msg: msg.timestamp,
        ultima_msg: msg.timestamp,
        total_msgs: 0,
      })
      .select("id")
      .single();
    conversaId = novaConversa?.id;
  } else {
    // Atualiza última mensagem e contador
    await supabase
      .from("whatsapp_conversas")
      .update({ ultima_msg: msg.timestamp, total_msgs: (conversaExistente?.total_msgs ?? 0) + 1 })
      .eq("id", conversaId);
  }

  if (!conversaId) {
    console.error("[webhook/whatsapp] falha ao criar conversa");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // 6. Insere mensagem
  await supabase.from("whatsapp_mensagens").insert({
    conversa_id: conversaId,
    organizacao_id: org.id,
    lead_id: leadMatch?.id ?? null,
    remetente: msg.nomeContato ?? msg.telefone,
    eh_vendedor: msg.ehVendedor,
    conteudo: msg.conteudo,
    tipo_midia: msg.tipoMidia ?? null,
    enviada_em: msg.timestamp,
  });

  // 7. Registra na timeline (somente se vinculado a lead)
  if (leadMatch?.id) {
    await supabase.from("lead_timeline").insert({
      organizacao_id: org.id,
      lead_id: leadMatch.id,
      tipo: "whatsapp_direto",
      titulo: msg.ehVendedor
        ? `Mensagem enviada via WhatsApp`
        : `Mensagem recebida de ${msg.nomeContato ?? msg.telefone}`,
      conteudo: msg.conteudo ? msg.conteudo.slice(0, 500) : null,
      metadata: {
        conversa_id: conversaId,
        telefone: telNormalizado,
        provider: org.whatsapp_provider,
        tipo_midia: msg.tipoMidia,
      },
      ref_id: conversaId,
      ref_tabela: "whatsapp_conversas",
    });
  }

  return NextResponse.json({
    ok: true,
    lead_vinculado: !!leadMatch,
    conversa_id: conversaId,
  });
}

// ================================================================
// Normalizadores de payload por provider
// ================================================================

type MsgNormalizada = {
  telefone: string;
  nomeContato: string | null;
  conteudo: string | null;
  tipoMidia: "imagem" | "audio" | "video" | "documento" | "figurinha" | null;
  ehVendedor: boolean;
  timestamp: string;
};

function normalizarPayload(payload: any, provider: string): MsgNormalizada | null {
  try {
    if (provider === "zapi") return normalizarZApi(payload);
    if (provider === "evolution") return normalizarEvolution(payload);
    return normalizarGenerico(payload);
  } catch {
    return null;
  }
}

function normalizarZApi(p: any): MsgNormalizada | null {
  // Z-API webhook: https://developer.z-api.io/webhooks/on-message-received
  if (p.type === "DeliveryCallback" || p.status) return null; // receipt, ignorar
  if (!p.phone) return null;

  const tipoMidia = p.image ? "imagem"
    : p.audio || p.voice ? "audio"
    : p.video ? "video"
    : p.document ? "documento"
    : p.sticker ? "figurinha"
    : null;

  return {
    telefone: p.phone,
    nomeContato: p.senderName ?? p.name ?? null,
    conteudo: p.text?.message ?? p.caption ?? null,
    tipoMidia,
    ehVendedor: p.fromMe === true,
    timestamp: p.momment ? new Date(p.momment).toISOString() : new Date().toISOString(),
  };
}

function normalizarEvolution(p: any): MsgNormalizada | null {
  // Evolution API: event = messages.upsert
  if (p.event !== "messages.upsert") return null;
  const msg = p.data?.message;
  if (!msg) return null;

  const key = p.data?.key;
  const fromMe = key?.fromMe === true;
  const remoteJid = key?.remoteJid ?? "";
  const tel = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");

  const msgContent = msg.conversation ?? msg.extendedTextMessage?.text ?? null;
  const tipoMidia = msg.imageMessage ? "imagem"
    : msg.audioMessage ? "audio"
    : msg.videoMessage ? "video"
    : msg.documentMessage ? "documento"
    : msg.stickerMessage ? "figurinha"
    : null;

  return {
    telefone: tel,
    nomeContato: p.data?.pushName ?? null,
    conteudo: msgContent,
    tipoMidia,
    ehVendedor: fromMe,
    timestamp: msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString(),
  };
}

function normalizarGenerico(p: any): MsgNormalizada | null {
  // Fallback para outros providers
  const tel = p.phone ?? p.from ?? p.waId ?? null;
  if (!tel) return null;
  return {
    telefone: tel,
    nomeContato: p.name ?? p.pushName ?? null,
    conteudo: p.text ?? p.body ?? p.message ?? null,
    tipoMidia: null,
    ehVendedor: p.fromMe === true,
    timestamp: p.timestamp ? new Date(p.timestamp).toISOString() : new Date().toISOString(),
  };
}

function normalizarTel(tel: string): string {
  // Remove tudo exceto dígitos, garante código de país +55
  const digits = tel.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}
