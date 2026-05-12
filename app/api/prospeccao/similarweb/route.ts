/**
 * POST /api/prospeccao/similarweb
 * Body: { empresa_id: number }
 *
 * Similarweb API: estima tráfego web do domínio.
 * Atualiza colunas web_* em prospeccao_empresa.
 *
 * SIMILARWEB_API_KEY: required. Free tier: 100 requests/mo.
 * Pricing: ~$199/mo (5k req), $499/mo (50k req).
 *
 * Fallback (sem key): tenta scraping leve do similarweb.com/website/{dominio}
 * via Firecrawl se FIRECRAWL_API_KEY estiver setada — menos preciso mas funciona.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentProfile();
    if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ erro: "Sem org." }, { status: 403 });

    const { empresa_id } = await req.json();
    if (!Number.isInteger(empresa_id) || empresa_id <= 0) {
      return NextResponse.json({ erro: "empresa_id inválido." }, { status: 400 });
    }

    const supabase = createClient();
    const { data: empresa } = await supabase
      .from("prospeccao_empresa")
      .select("id, site")
      .eq("id", empresa_id)
      .maybeSingle();

    if (!empresa) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
    if (!empresa.site) return NextResponse.json({ erro: "Empresa sem site cadastrado." }, { status: 400 });

    let dominio = empresa.site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    if (!dominio || !dominio.includes(".")) {
      return NextResponse.json({ erro: "Domínio inválido." }, { status: 400 });
    }

    const apiKey = process.env.SIMILARWEB_API_KEY;
    let data: any = null;
    let provider = "similarweb_api";

    if (apiKey) {
      // Similarweb Digital Marketing Intelligence API
      const res = await fetch(`https://api.similarweb.com/v1/website/${encodeURIComponent(dominio)}/total-traffic-and-engagement/visits?api_key=${apiKey}&start_date=2025-11&end_date=2026-04&country=br&granularity=monthly&main_domain_only=false&format=json`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        return NextResponse.json({ erro: `Similarweb ${res.status}` }, { status: 502 });
      }
      const json = await res.json();
      const visits = json?.visits ?? [];
      const ultimoMes = visits[visits.length - 1]?.visits ?? 0;
      const primeiroMes = visits[0]?.visits ?? 0;
      const trendPct = primeiroMes > 0 ? ((ultimoMes - primeiroMes) / primeiroMes) * 100 : 0;

      data = {
        web_visits_mes: Math.round(ultimoMes),
        web_visits_trend_pct: Number(trendPct.toFixed(1)),
        // Outras chamadas (canais, países) seriam endpoints separados — implementar quando necessário
      };
    } else {
      // Fallback: tenta Firecrawl scrape no similarweb.com/website/{dominio}
      const firecrawlKey = process.env.FIRECRAWL_API_KEY;
      if (!firecrawlKey) {
        return NextResponse.json({
          erro: "Nem SIMILARWEB_API_KEY nem FIRECRAWL_API_KEY configurada. Configure 1 dos 2.",
        }, { status: 503 });
      }
      provider = "similarweb_scrape";

      const fcRes = await fetch("https://api.firecrawl.dev/v1/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey}` },
        body: JSON.stringify({
          urls: [`https://www.similarweb.com/website/${dominio}/`],
          prompt: "Extract monthly visits estimate and 6-month traffic trend (% change) from this page.",
          schema: {
            type: "object",
            properties: {
              monthly_visits: { type: "number", description: "Estimated monthly visits" },
              trend_pct: { type: "number", description: "6-month trend percentage" },
              top_countries: { type: "array", items: { type: "string" }, description: "Top 3 countries by traffic" },
              channels: { type: "object", description: "Traffic sources breakdown" },
            },
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!fcRes.ok) {
        return NextResponse.json({ erro: `Firecrawl fallback falhou: ${fcRes.status}` }, { status: 502 });
      }
      const fcJson = await fcRes.json();
      const extracted = fcJson?.data ?? {};
      data = {
        web_visits_mes: extracted.monthly_visits ?? null,
        web_visits_trend_pct: extracted.trend_pct ?? null,
        web_paises_top: extracted.top_countries ?? null,
        web_canais_pct: extracted.channels ?? null,
      };
    }

    await supabase
      .from("prospeccao_empresa")
      .update({
        ...data,
        similarweb_atualizado_em: new Date().toISOString(),
      })
      .eq("id", empresa_id);

    return NextResponse.json({ ok: true, provider, dados: data });
  } catch (e: any) {
    console.error("[prospeccao/similarweb]", e);
    return NextResponse.json({ erro: e.message || "Erro." }, { status: 500 });
  }
}
