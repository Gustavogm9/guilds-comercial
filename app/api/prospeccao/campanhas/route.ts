import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/prospeccao/campanhas
 * Lista campanhas da org com métricas.
 */
export async function GET(_req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("campanhas_prospeccao")
    .select(`
      *,
      icp_hipoteses(nome, cor, taxa_conversao),
      produtos(nome)
    `)
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, campanhas: data ?? [] });
}

/**
 * POST /api/prospeccao/campanhas
 * Cria uma nova campanha (não executa ainda — execução via /campanhas/[id]/executar).
 *
 * Body: {
 *   nome: string;
 *   hipotese_id?: number;
 *   produto_id?: number;
 *   configuracao: {
 *     max_leads: number;
 *     regioes?: string[];
 *     segmentos?: string[];
 *     cargos?: string[];
 *     max_queries?: number;
 *     iniciar_cadencia?: boolean;
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { nome, hipotese_id, produto_id, configuracao } = body;

  if (!nome?.trim()) return NextResponse.json({ erro: "Nome é obrigatório." }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("campanhas_prospeccao")
    .insert({
      organizacao_id: orgId,
      nome,
      hipotese_id: hipotese_id ?? null,
      produto_id: produto_id ?? null,
      criado_por: me.id,
      configuracao: configuracao ?? { max_leads: 10, max_queries: 3, iniciar_cadencia: false },
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
