/**
 * Cron: notifica vendedores sobre cadências D7/D11 que vencem em ~1h.
 *
 * Acionado por pg_cron a cada hora. Auth via X-Cron-Secret.
 *
 * Lógica:
 *   - Busca cadência onde `data_prevista` é HOJE e status='pendente' nos passos D7 ou D11
 *   - Filtra por janela "vence em ~1h": hora atual em [data_prevista - 1h, data_prevista]
 *     Como `data_prevista` é DATE (sem hora), usamos heurística: alerta na 1ª hora útil do dia (~9h)
 *     ou customizar quando passar pra timestamptz.
 *   - Para cada cadência → push para responsavel_id do lead com tag única
 *
 * Se passou da hora e não foi marcado como `enviado`, o cron seguinte não duplica
 * graças à `tag` (a notificação substitui a anterior).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { buildPushPayload, getOrgLocale } from "@/lib/push-i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hoje = new Date().toISOString().slice(0, 10);

  // Busca cadências pendentes hoje nos passos críticos (incluindo organizacao_id pra locale)
  const { data: cadencias } = await supa
    .from("cadencia")
    .select("id, lead_id, passo, canal, organizacao_id, leads(empresa, nome, responsavel_id)")
    .in("passo", ["D7", "D11"])
    .eq("status", "pendente")
    .eq("data_prevista", hoje)
    .limit(500);

  if (!cadencias || cadencias.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let enviados = 0;
  let pulados = 0;

  for (const c of cadencias) {
    const lead = c.leads as any;
    if (!lead?.responsavel_id) {
      pulados++;
      continue;
    }
    const empresa = lead.empresa || lead.nome || `Lead #${c.lead_id}`;
    const locale = await getOrgLocale(supa, c.organizacao_id);
    const tpl = buildPushPayload("cadencia_vencendo", locale, {
      passo: c.passo,
      empresa,
      canal: c.canal ?? "WhatsApp",
    });
    const r = await sendPushToUser(lead.responsavel_id, {
      evento: "cadencia_vencendo",
      title: tpl.title,
      body: tpl.body,
      url: `/pipeline/${c.lead_id}`,
      tag: `cadencia-${c.id}`,
    });
    if (r.enviados > 0) enviados++;
    else pulados++;
  }

  return NextResponse.json({ ok: true, processed: cadencias.length, enviados, pulados });
}

export async function GET(req: Request) {
  return POST(req);
}
