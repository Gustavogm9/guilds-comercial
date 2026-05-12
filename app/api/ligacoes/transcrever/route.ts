/**
 * POST /api/ligacoes/transcrever
 * multipart/form-data: { audio: Blob, ligacao_id: number }
 *
 * Upload de gravação de ligação. Cria row em ligacao_transcricao status='pendente'
 * pra cron audio-processor analisar (Whisper + GPT).
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
    const ligacaoIdRaw = form.get("ligacao_id");

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ erro: "Arquivo ausente." }, { status: 400 });
    }
    const ligacaoId = Number(ligacaoIdRaw);
    if (!Number.isInteger(ligacaoId) || ligacaoId <= 0) {
      return NextResponse.json({ erro: "ligacao_id inválido." }, { status: 400 });
    }
    if (audio.size > 50 * 1024 * 1024) {
      return NextResponse.json({ erro: "Arquivo muito grande (max 50MB)." }, { status: 413 });
    }

    // Verifica que ligação pertence à org
    const supabase = createClient();
    const { data: lig } = await supabase
      .from("ligacoes")
      .select("id")
      .eq("id", ligacaoId)
      .eq("organizacao_id", orgId)
      .maybeSingle();
    if (!lig) return NextResponse.json({ erro: "Ligação não encontrada." }, { status: 404 });

    // Upload pro Storage
    const supa = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await supa.storage.createBucket("ligacoes-audio", { public: false }).catch(() => {});

    const ext = audio.type.includes("webm") ? "webm" :
                audio.type.includes("mp4") ? "mp4" :
                audio.type.includes("wav") ? "wav" : "mp3";
    const filename = `${orgId}/${ligacaoId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supa.storage
      .from("ligacoes-audio")
      .upload(filename, audio, { contentType: audio.type, upsert: false });
    if (uploadErr) {
      return NextResponse.json({ erro: `Upload: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: signed } = await supa.storage
      .from("ligacoes-audio")
      .createSignedUrl(filename, 7 * 24 * 60 * 60);

    // Upsert row em ligacao_transcricao
    const { data: row, error: insertErr } = await supabase
      .from("ligacao_transcricao")
      .upsert({
        ligacao_id: ligacaoId,
        organizacao_id: orgId,
        audio_url: signed?.signedUrl ?? "",
        status: "pendente",
      }, { onConflict: "ligacao_id" })
      .select("id")
      .single();

    if (insertErr || !row) {
      return NextResponse.json({ erro: insertErr?.message ?? "Falha." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, transcricao_id: row.id });
  } catch (e: any) {
    console.error("[ligacoes/transcrever]", e);
    return NextResponse.json({ erro: e.message || "Erro." }, { status: 500 });
  }
}
