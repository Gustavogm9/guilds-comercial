import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; grupoId: string }> };

/**
 * PATCH /api/leads/[id]/grupos/[grupoId]
 * Atualiza status ou dados do grupo.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const { id, grupoId } = await params;
  const leadId = parseInt(id, 10);
  const gId = parseInt(grupoId, 10);
  if (isNaN(leadId) || isNaN(gId)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { status, link_convite, membros_count, observacoes, descricao } = body;

  const STATUS_VALIDOS = ["ativo", "silenciado", "saiu", "arquivado"];
  if (status && !STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(", ")}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (link_convite !== undefined) updates.link_convite = link_convite;
  if (membros_count !== undefined) updates.membros_count = membros_count;
  if (observacoes !== undefined) updates.observacoes = observacoes;
  if (descricao !== undefined) updates.descricao = descricao;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("whatsapp_grupos")
    .update(updates)
    .eq("id", gId)
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .select("nome, status")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // Registra mudança de status na timeline
  if (status) {
    await supabase.from("lead_timeline").insert({
      organizacao_id: orgId,
      lead_id: leadId,
      tipo: "grupo_whatsapp",
      titulo: `Grupo "${data.nome}": ${status}`,
      metadata: { grupo_id: gId, status },
      ref_id: gId,
      ref_tabela: "whatsapp_grupos",
      criado_por: me.id,
    });
  }

  return NextResponse.json({ ok: true, grupo: data });
}

/**
 * DELETE /api/leads/[id]/grupos/[grupoId]
 * Remove grupo (arquiva logicamente via status).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const { id, grupoId } = await params;
  const leadId = parseInt(id, 10);
  const gId = parseInt(grupoId, 10);

  const supabase = createClient();
  await supabase.from("whatsapp_grupos")
    .update({ status: "arquivado" })
    .eq("id", gId).eq("lead_id", leadId).eq("organizacao_id", orgId);

  return NextResponse.json({ ok: true });
}
