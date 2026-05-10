import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; grupoId?: string }> };

/**
 * POST /api/leads/[id]/grupos
 * Adiciona grupo WhatsApp ao lead.
 *
 * Body: { nome, link_convite?, status?, membro_desde?, membros_count?, descricao?, observacoes? }
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
  const { nome, link_convite, status, membro_desde, membros_count, descricao, observacoes } = body;
  if (!nome?.trim()) return NextResponse.json({ erro: "Nome do grupo é obrigatório." }, { status: 400 });

  const supabase = createClient();
  const { data: lead } = await supabase
    .from("leads").select("id").eq("id", leadId).eq("organizacao_id", orgId).maybeSingle();
  if (!lead) return NextResponse.json({ erro: "Lead não encontrado." }, { status: 404 });

  const { data, error } = await supabase
    .from("whatsapp_grupos")
    .insert({
      organizacao_id: orgId,
      lead_id: leadId,
      nome,
      link_convite: link_convite ?? null,
      status: status ?? "ativo",
      membro_desde: membro_desde ?? null,
      membros_count: membros_count ?? null,
      descricao: descricao ?? null,
      observacoes: observacoes ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // Registra na timeline
  await supabase.from("lead_timeline").insert({
    organizacao_id: orgId,
    lead_id: leadId,
    tipo: "grupo_whatsapp",
    titulo: `Grupo adicionado: ${nome}`,
    metadata: { grupo_id: data.id, status: status ?? "ativo", link_convite },
    ref_id: data.id,
    ref_tabela: "whatsapp_grupos",
    criado_por: me.id,
  });

  return NextResponse.json({ ok: true, id: data.id });
}

/**
 * GET /api/leads/[id]/grupos
 * Lista grupos WhatsApp do lead.
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
    .from("whatsapp_grupos")
    .select("*")
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, grupos: data ?? [] });
}
