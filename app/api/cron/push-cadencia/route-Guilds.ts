/**
 * Cron: notifica vendedores sobre cadências D7/D11 que vencem em ~1h.
 *
 * Acionado por pg_cron a cada hora. Auth via X-Cron-Secret.
 *
 * Lógica:
 *   - Busca cadência com data_prevista numa JANELA (ontem/hoje/amanhã UTC) +
 *     status='pendente' nos passos D7/D11
 *   - Pra cada cadência, filtra pelo "hoje no fuso da org" — caso contrário
 *     cron rodando 23h UTC pegaria "amanhã" no BR e enviaria push errado.
 *   - Pra cada cadência válida → push para responsavel_id do lead com tag única
 *
 * Tag única previne duplicação se cron rodar duas vezes no mesmo dia da org.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { buildPushPayload, getOrgLocale } from "@/lib/push-i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Retorna YYYY-MM-DD no timezone informado. */
function dataLocal(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Cache de timezone por organizacao_id pra evitar N queries no mesmo cron run. */
const tzCache = new Map<string, { tz: string; at: number }>();
const TZ_CACHE_TTL_MS = 5 * 60_000;

async function getOrgTimezone(supa: any, orgId: string): Promise<string> {
  const cached = tzCache.get(orgId);
  if (cached && Date.now() - cached.at < TZ_CACHE_TTL_MS) return cached.tz;
  const { data } = await supa.from("organizacoes").select("timezone").eq("id", orgId).maybeSingle();
  const tz = (data?.timezone as string | null) || "America/Sao_Paulo";
  tzCache.set(orgId, { tz, at: Date.now() });
  return tz;
}

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

  // Janela de busca: ontem/hoje/amanhã (UTC). Filtragem fina por fuso da org
  // acontece in-memory abaixo. Cobre todos os fusos do globo num único cron run.
  const now = new Date();
  const dataAmanha = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dataOntem = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dataHoje = now.toISOString().slice(0, 10);

  const { data: cadencias } = await supa
    .from("cadencia")
    .select("id, lead_id, passo, canal, data_prevista, organizacao_id, leads(empresa, nome, responsavel_id)")
    .in("passo", ["D7", "D11"])
    .eq("status", "pendente")
    .in("data_prevista", [dataOntem, dataHoje, dataAmanha])
    .limit(1500);

  if (!cadencias || cadencias.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let enviados = 0;
  let pulados = 0;
  let foraDoFuso = 0;

  for (const c of cadencias as any[]) {
    const lead = c.leads as any;
    if (!lead?.responsavel_id) {
      pulados++;
      continue;
    }

    // É hoje no fuso da ORG? (não em UTC)
    const tz = await getOrgTimezone(supa, c.organizacao_id);
    const hojeNaOrg = dataLocal(now, tz);
    if (c.data_prevista !== hojeNaOrg) {
      foraDoFuso++;
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
      // Tag inclui o dia local da org pra evitar dedup entre execuções de dias diferentes
      tag: `cadencia-${c.id}-${hojeNaOrg}`,
    });
    if (r.enviados > 0) enviados++;
    else pulados++;
  }

  return NextResponse.json({
    ok: true,
    processed: cadencias.length,
    enviados,
    pulados,
    fora_do_fuso: foraDoFuso,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
