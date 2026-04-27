import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";

function clampLimit(raw: string | null) {
  const n = Number.parseInt(raw || "50", 10);
  if (Number.isNaN(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

function applyStatusFilter(query: any, status: string | null) {
  if (status === "ganho") return query.eq("crm_stage", "Fechado");
  if (status === "perdido") return query.eq("crm_stage", "Perdido");
  if (status === "em_andamento") {
    return query
      .eq("funnel_stage", "pipeline")
      .not("crm_stage", "in", '("Fechado","Perdido","Nutrição")');
  }
  return query;
}

export async function GET(req: Request) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const limit = clampLimit(searchParams.get("limit"));
  const offset = Math.max(Number.parseInt(searchParams.get("offset") || "0", 10) || 0, 0);
  const status = searchParams.get("status");

  let query = auth.supabaseAdmin!
    .from("leads")
    .select("*", { count: "exact" })
    .eq("organizacao_id", auth.organizacao_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  query = applyStatusFilter(query, status);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Database error", details: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    meta: {
      total: count,
      limit,
      offset,
    },
  });
}

export async function POST(req: Request) {
  const auth = await validateApiKey();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    nome,
    empresa,
    email,
    telefone,
    whatsapp,
    cargo,
    segmento,
    valor_estimado,
    valor_potencial,
    fonte,
  } = body;

  if (!nome || !empresa) {
    return NextResponse.json({ error: "Missing required fields: nome, empresa" }, { status: 400 });
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await auth.supabaseAdmin!
    .from("leads")
    .insert({
      organizacao_id: auth.organizacao_id,
      nome,
      empresa,
      email: email || null,
      whatsapp: whatsapp || telefone || null,
      cargo: cargo || null,
      segmento: segmento || null,
      valor_potencial: valor_potencial ?? valor_estimado ?? 0,
      fonte: fonte || "API",
      funnel_stage: "pipeline",
      crm_stage: "Prospecção",
      data_primeiro_contato: hoje,
      proxima_acao: "Enviar D0",
      data_proxima_acao: hoje,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create lead", details: error.message }, { status: 500 });
  }

  const { dispatchWebhook } = await import("@/lib/webhooks");
  await dispatchWebhook(auth.organizacao_id, "lead.created", data);

  return NextResponse.json({ data }, { status: 201 });
}
