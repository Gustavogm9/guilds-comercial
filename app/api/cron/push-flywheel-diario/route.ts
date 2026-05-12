/**
 * Cron diário 09:00 UTC: enfileira pushes do flywheel.
 *
 * Acionado por pg_cron `push-flywheel-diario`. Auth via X-Cron-Secret.
 *
 * Detecta 3 transições críticas e insere no push_outbox:
 *   - health_risco_critico: clientes que entraram em risco hoje
 *   - renovacao_iminente: contratos vencendo em até 7 dias
 *   - expansao_atrasada: expansões com proxima_acao vencida
 *
 * Não envia push aqui — só enfileira. O cron push-outbox (a cada 10 min)
 * processa a fila respeitando prefs/janela do user.
 *
 * Idempotência: a função SQL filtra duplicados em 3-7d.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { data, error } = await supa.rpc("enfileirar_pushes_diarios_flywheel");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const r = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    ok: true,
    health_risco_enfileirados: r?.health_risco_enfileirados ?? 0,
    renovacoes_enfileiradas: r?.renovacoes_enfileiradas ?? 0,
    expansoes_enfileiradas: r?.expansoes_enfileiradas ?? 0,
  });
}
