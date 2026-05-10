import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/leads/[id]/timeline
 * Lista a timeline 360° do lead, com paginação e filtro por tipo.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const { id } = await params;
  const leadId = parseInt(id, 10);
  if (isNaN(leadId)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo");       // filtra por tipo
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const before = url.searchParams.get("before");   // cursor: created_at ISO

  const supabase = createClient();

  // Verifica acesso ao lead
  const { data: lead } = await supabase
    .from("leads").select("id").eq("id", leadId).eq("organizacao_id", orgId).maybeSingle();
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado." }, { status: 404 });

  let query = supabase
    .from("lead_timeline")
    .select("id, tipo, titulo, conteudo, resumo_ia, metadata, ref_id, ref_tabela, criado_por, created_at, profiles(display_name)")
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (tipo && tipo !== "todos") query = query.eq("tipo", tipo);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, eventos: data ?? [], total: data?.length ?? 0 });
}

/**
 * POST /api/leads/[id]/timeline
 * Adiciona uma interação manual (nota, reunião, documento, etc.).
 *
 * Body: { tipo, titulo, conteudo, metadata? }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const { id } = await params;
  const leadId = parseInt(id, 10);
  if (isNaN(leadId)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { tipo, titulo, conteudo, metadata } = body;

  const TIPOS_MANUAIS = ["nota", "reuniao", "documento", "sistema"];
  if (!tipo || !TIPOS_MANUAIS.includes(tipo)) {
    return NextResponse.json({ erro: `Tipo inválido. Use: ${TIPOS_MANUAIS.join(", ")}` }, { status: 400 });
  }

  const supabase = createClient();
  const { data: lead } = await supabase
    .from("leads").select("id").eq("id", leadId).eq("organizacao_id", orgId).maybeSingle();
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado." }, { status: 404 });

  const { data, error } = await supabase
    .from("lead_timeline")
    .insert({
      organizacao_id: orgId,
      lead_id: leadId,
      tipo,
      titulo: titulo ?? null,
      conteudo: conteudo ?? null,
      metadata: metadata ?? {},
      criado_por: me.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // Atualiza data_ultimo_toque do lead
  await supabase.from("leads")
    .update({ data_ultimo_toque: new Date().toISOString() })
    .eq("id", leadId);

  return NextResponse.json({ ok: true, id: data.id });
}
