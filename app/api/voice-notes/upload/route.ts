/**
 * POST /api/voice-notes/upload
 * multipart/form-data: { audio: Blob, lead_id: number }
 *
 * Recebe gravação curta do vendedor (até 60s) e:
 *   1. Faz upload pro Supabase Storage (bucket "voice-notes")
 *   2. Insere row em lead_voice_nota status='pendente'
 *   3. Cron audio-processor (a cada 2min) processa via Whisper+GPT
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentProfile();
    if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

    const form = await req.formData();
    const audio = form.get("audio");
    const leadIdRaw = form.get("lead_id");

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ erro: "Arquivo de áudio ausente." }, { status: 400 });
    }
    const leadId = Number(leadIdRaw);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ erro: "lead_id inválido." }, { status: 400 });
    }

    // Limite: 5MB (audio comprimido ~ 60s)
    if (audio.size > 5 * 1024 * 1024) {
      return NextResponse.json({ erro: "Arquivo muito grande (max 5MB / ~60s)." }, { status: 413 });
    }

    const supabase = createClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("organizacao_id", orgId)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ erro: "Lead não encontrado nesta organização." }, { status: 404 });
    }

    // Upload pro Storage (bucket "voice-notes")
    const supa = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Garante bucket
    await supa.storage.createBucket("voice-notes", { public: false }).catch(() => {});

    const ext = audio.type.includes("webm") ? "webm" : audio.type.includes("mp4") ? "mp4" : "mp3";
    const filename = `${orgId}/${leadId}/${Date.now()}-${me.id.slice(0, 8)}.${ext}`;

    const { error: uploadErr } = await supa.storage
      .from("voice-notes")
      .upload(filename, audio, { contentType: audio.type, upsert: false });
    if (uploadErr) {
      return NextResponse.json({ erro: `Upload falhou: ${uploadErr.message}` }, { status: 500 });
    }

    // Signed URL pra processor cron acessar (validade longa)
    const { data: signed } = await supa.storage
      .from("voice-notes")
      .createSignedUrl(filename, 7 * 24 * 60 * 60);  // 7 dias

    const audioUrl = signed?.signedUrl ?? "";

    // Insere row
    const { data: row, error: insertErr } = await supabase
      .from("lead_voice_nota")
      .insert({
        organizacao_id: orgId,
        lead_id: leadId,
        criado_por: me.id,
        audio_url: audioUrl,
        status: "pendente",
      })
      .select("id")
      .single();
    if (insertErr || !row) {
      return NextResponse.json({ erro: insertErr?.message ?? "Falha." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, voice_note_id: row.id });
  } catch (e: any) {
    console.error("[voice-notes/upload]", e);
    return NextResponse.json({ erro: e.message || "Erro." }, { status: 500 });
  }
}
