import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { computarFingerprint, gerarQueriesLookalike, mapIcpToFingerprint } from "@/lib/prospeccao-lookalike";
import { buscarEmpresasPorNicho, estimarCusto } from "@/lib/prospeccao";

export const runtime = "nodejs";
export const maxDuration = 120; // campanhas podem ser longas

/**
 * POST /api/prospeccao/campanhas/[id]/executar
 *
 * Executa uma campanha:
 *   1. Carrega a campanha e suas configurações
 *   2. Gera queries (hipótese ou fingerprint ICP geral)
 *   3. Executa Tavily em paralelo
 *   4. Dedup + ativa leads em lote
 *   5. Inicia cadência D0 se configurado
 *   6. Incrementa métricas da hipótese
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

  const { id } = await params;
  const campanhaId = parseInt(id, 10);
  if (isNaN(campanhaId)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const supabase = createClient();

  // Carrega campanha
  const { data: campanha } = await supabase
    .from("campanhas_prospeccao")
    .select("*, icp_hipoteses(id, nome, segmentos, cidades, cargos, produto_id)")
    .eq("id", campanhaId)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (!campanha) return NextResponse.json({ erro: "Campanha não encontrada." }, { status: 404 });
  if (campanha.status === "rodando") {
    return NextResponse.json({ erro: "Campanha já em execução." }, { status: 409 });
  }

  // Marca como rodando
  await supabase.from("campanhas_prospeccao").update({
    status: "rodando",
    iniciada_em: new Date().toISOString(),
  }).eq("id", campanhaId);

  const cfg = campanha.configuracao as {
    max_leads?: number;
    regioes?: string[];
    segmentos?: string[];
    cargos?: string[];
    max_queries?: number;
    iniciar_cadencia?: boolean;
  };

  const maxLeads = cfg.max_leads ?? 10;
  const maxQueries = cfg.max_queries ?? 3;
  const iniciarCadencia = cfg.iniciar_cadencia ?? false;

  try {
    // Gera queries — usa perfil da hipótese se tiver, senão fingerprint geral
    let queries: string[] = [];
    let fingerprint = null;

    const hipotese = campanha.icp_hipoteses;
    if (hipotese) {
      // Usa os critérios exatos da hipótese
      fingerprint = await computarFingerprint(supabase, orgId);
      const fp = {
        ...fingerprint,
        segmentos_top: (hipotese.segmentos ?? []).map((v: string) => ({ valor: v, contagem: 10, percentual: 100 })),
        cidades_top:   (hipotese.cidades   ?? []).map((v: string) => ({ valor: v, contagem: 10, percentual: 100 })),
        cargos_top:    (hipotese.cargos    ?? []).map((v: string) => ({ valor: v, contagem: 10, percentual: 100 })),
      };
      queries = gerarQueriesLookalike(fp, {
        regioes:   cfg.regioes   ?? [],
        segmentos: cfg.segmentos ?? [],
        maxQueries,
      });
    } else if (campanha.produto_id) {
      // Busca o ICP do produto para usar no look-alike
      const { data: p } = await supabase.from("produtos").select("icp_extraido").eq("id", campanha.produto_id).single();
      if (p?.icp_extraido) {
        fingerprint = mapIcpToFingerprint(p.icp_extraido, p.icp_extraido.amostras_usadas || 0);
      } else {
        fingerprint = await computarFingerprint(supabase, orgId);
      }
      queries = gerarQueriesLookalike(fingerprint, {
        regioes:   cfg.regioes   ?? [],
        segmentos: cfg.segmentos ?? [],
        maxQueries,
      });
    } else {
      fingerprint = await computarFingerprint(supabase, orgId);
      queries = gerarQueriesLookalike(fingerprint, {
        regioes:   cfg.regioes   ?? [],
        segmentos: cfg.segmentos ?? [],
        maxQueries,
      });
    }

    if (!queries.length) {
      await supabase.from("campanhas_prospeccao").update({
        status: "concluida",
        leads_encontrados: 0,
        leads_criados: 0,
        concluida_em: new Date().toISOString(),
        erro_detalhes: "Sem queries geradas — base insuficiente.",
      }).eq("id", campanhaId);
      return NextResponse.json({ ok: true, criados: 0, aviso: "Sem queries geradas." });
    }

    // Executa buscas Tavily em lotes de 2
    const { EmpresaBuscada: _, ...__ } = {} as any;
    const resultadosBrutos: any[] = [];
    const maxPorQuery = Math.ceil(maxLeads / queries.length) + 2;

    for (let i = 0; i < queries.length; i += 2) {
      const lote = queries.slice(i, i + 2);
      const respostas = await Promise.allSettled(
        lote.map(q => buscarEmpresasPorNicho({ query: q, maxResults: maxPorQuery }))
      );
      for (const r of respostas) {
        if (r.status === "fulfilled") resultadosBrutos.push(...r.value);
      }
      if (resultadosBrutos.length >= maxLeads * 2) break;
    }

    // Dedup por domínio
    const vistos = new Set<string>();
    const unicos = resultadosBrutos.filter(r => {
      if (vistos.has(r.dominio)) return false;
      vistos.add(r.dominio);
      return true;
    }).slice(0, maxLeads * 2); // margem para dedup fuzzy

    // Ativa leads em lote via a própria rota (reutiliza dedup fuzzy)
    const activateRes = await fetch(
      new URL("/api/prospeccao/ativar", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-campanha": campanhaId.toString() },
        body: JSON.stringify({
          leads: unicos.slice(0, maxLeads).map(e => ({
            nome: null,
            empresa: e.titulo,
            site: e.url,
            dominio: e.dominio,
            descricao: e.snippet,
            _fonte_url: e.url,
            _confianca: "media",
          })),
          job_id: null,
          hipotese_id: campanha.hipotese_id ?? null,
          produto_id: campanha.produto_id ?? null,
          iniciar_cadencia: iniciarCadencia,
        }),
      }
    );

    const ativacao = activateRes.ok ? await activateRes.json() : { criados: 0, duplicados: 0 };
    const custoUsd = estimarCusto("busca") * queries.length;

    await supabase.from("campanhas_prospeccao").update({
      status: "concluida",
      leads_encontrados: unicos.length,
      leads_criados: ativacao.criados ?? 0,
      leads_duplicados: ativacao.duplicados ?? 0,
      custo_estimado_usd: custoUsd,
      concluida_em: new Date().toISOString(),
    }).eq("id", campanhaId);

    return NextResponse.json({
      ok: true,
      campanha_id: campanhaId,
      queries,
      encontrados: unicos.length,
      criados: ativacao.criados ?? 0,
      duplicados: ativacao.duplicados ?? 0,
      custo_usd: custoUsd,
    });
  } catch (err: any) {
    console.error("[campanha/executar]", err);
    await supabase.from("campanhas_prospeccao").update({
      status: "erro",
      erro_detalhes: err.message,
      concluida_em: new Date().toISOString(),
    }).eq("id", campanhaId);
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
