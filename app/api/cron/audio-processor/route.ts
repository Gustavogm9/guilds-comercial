/**
 * Cron: processa voice notes + transcrições de ligação pendentes.
 *
 * A cada 2 min pega até 5 jobs pendentes de cada tipo:
 *   1. lead_voice_nota status=pendente → Whisper + GPT extrai ação
 *   2. ligacao_transcricao status=pendente → Whisper + GPT analisa
 *
 * Rate-limit OpenAI: Whisper ~50 req/s (OK), GPT-4o-mini ~500 req/s.
 * Aqui sequencial pra controlar custo + facilitar debug.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processarVoiceNota, transcreverAudio, analisarChamada } from "@/lib/ai/audio";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_TIME_MS = 50_000;

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const startedAt = Date.now();
  let voiceProcessadas = 0;
  let ligacoesProcessadas = 0;
  let erros = 0;

  // 1. Voice notes
  const { data: voiceNotas } = await supa
    .from("lead_voice_nota")
    .select("id, lead_id, audio_url, organizacao_id")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(5);

  for (const vn of (voiceNotas ?? []) as any[]) {
    if (Date.now() - startedAt > BATCH_TIME_MS) break;
    try {
      await supa.from("lead_voice_nota").update({ status: "processando" }).eq("id", vn.id);

      // Contexto do lead
      const { data: lead } = await supa
        .from("leads")
        .select("empresa, nome, dor_principal, crm_stage")
        .eq("id", vn.lead_id)
        .maybeSingle();
      const contexto = lead ? `${lead.empresa ?? ""} - ${lead.nome ?? ""} - ${lead.crm_stage ?? ""} - dor: ${lead.dor_principal ?? "?"}` : undefined;

      const r = await processarVoiceNota(vn.audio_url, contexto);

      await supa.from("lead_voice_nota").update({
        transcricao: r.transcricao,
        resumo: r.resumo,
        acoes_extraidas: r.acoes_extraidas,
        custo_usd: r.custo_usd,
        status: "concluido",
        processado_em: new Date().toISOString(),
      }).eq("id", vn.id);

      voiceProcessadas += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.warn(`[audio-processor voice ${vn.id}]`, e);
      await supa.from("lead_voice_nota").update({
        status: "erro",
        resumo: `Erro: ${msg.slice(0, 200)}`,
      }).eq("id", vn.id);
      erros += 1;
    }
  }

  // 2. Transcrições de ligação
  if (Date.now() - startedAt < BATCH_TIME_MS) {
    const { data: ligacoes } = await supa
      .from("ligacao_transcricao")
      .select("id, ligacao_id, audio_url, organizacao_id")
      .eq("status", "pendente")
      .not("audio_url", "is", null)
      .order("created_at", { ascending: true })
      .limit(3);

    for (const lt of (ligacoes ?? []) as any[]) {
      if (Date.now() - startedAt > BATCH_TIME_MS) break;
      try {
        await supa.from("ligacao_transcricao").update({ status: "transcrevendo" }).eq("id", lt.id);

        const tr = await transcreverAudio(lt.audio_url);
        await supa.from("ligacao_transcricao").update({
          transcricao: tr.transcricao,
          duracao_seg: tr.duracao_seg,
          status: "analisando",
        }).eq("id", lt.id);

        // Contexto: pega lead via ligacao
        const { data: lig } = await supa
          .from("ligacoes")
          .select("lead_id, leads(empresa, nome, dor_principal, crm_stage)")
          .eq("id", lt.ligacao_id)
          .maybeSingle();
        const leadCtx = (lig as any)?.leads;
        const contexto = leadCtx ? `${leadCtx.empresa ?? ""} - ${leadCtx.crm_stage ?? ""} - dor: ${leadCtx.dor_principal ?? "?"}` : undefined;

        const analise = await analisarChamada(tr.transcricao, contexto);

        await supa.from("ligacao_transcricao").update({
          resumo: analise.resumo,
          pontos_chave: analise.pontos_chave,
          objecoes: analise.objecoes,
          proximas_acoes: analise.proximas_acoes,
          sentimento: analise.sentimento,
          nivel_interesse: analise.nivel_interesse,
          custo_usd: tr.custo_usd + analise.custo_usd,
          status: "concluido",
        }).eq("id", lt.id);

        ligacoesProcessadas += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        console.warn(`[audio-processor ligacao ${lt.id}]`, e);
        await supa.from("ligacao_transcricao").update({
          status: "erro",
          erro_mensagem: msg.slice(0, 500),
        }).eq("id", lt.id);
        erros += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    voice_processadas: voiceProcessadas,
    ligacoes_processadas: ligacoesProcessadas,
    erros,
  });
}
