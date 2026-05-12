/**
 * POST /api/prospeccao/enriquecer-socios
 * Body: { empresa_id: number }
 *
 * Para cada sócio da empresa (que ainda não tem LinkedIn URL), faz busca no
 * Tavily com query "<nome> <razao_social> linkedin" — pega a 1ª URL de
 * linkedin.com/in/ que aparece. Atualiza prospeccao_socio.linkedin_url.
 *
 * Custos: ~$0.002 por sócio buscado (Tavily). Limit ~5 sócios por chamada
 * pra controlar custo. Idempotente — só busca os que ainda não têm URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SocioInfo {
  id: number;
  nome: string;
  linkedin_url: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentProfile();
    if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ erro: "Sem organização." }, { status: 403 });

    const { empresa_id } = await req.json();
    if (!Number.isInteger(empresa_id) || empresa_id <= 0) {
      return NextResponse.json({ erro: "empresa_id inválido." }, { status: 400 });
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    if (!tavilyKey) {
      return NextResponse.json({ erro: "TAVILY_API_KEY não configurada." }, { status: 503 });
    }

    const supabase = createClient();

    // Empresa + sócios sem LinkedIn
    const { data: empresa } = await supabase
      .from("prospeccao_empresa")
      .select("id, razao_social, nome_fantasia, cnpj")
      .eq("id", empresa_id)
      .maybeSingle();

    if (!empresa) {
      return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
    }

    const { data: socios } = await supabase
      .from("prospeccao_socio")
      .select("id, nome, linkedin_url")
      .eq("empresa_id", empresa_id)
      .is("linkedin_url", null)
      .limit(5);

    const lista = (socios ?? []) as SocioInfo[];
    if (lista.length === 0) {
      return NextResponse.json({ ok: true, enriquecidos: 0, mensagem: "Todos os sócios já têm LinkedIn ou não há sócios." });
    }

    let enriquecidos = 0;
    const nomeEmpresa = (empresa as any).nome_fantasia || (empresa as any).razao_social || "";
    const empresaQuery = nomeEmpresa.split(" ").slice(0, 4).join(" "); // limita ruído

    for (const socio of lista) {
      try {
        // Tavily search
        const tavilyRes = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: `${socio.nome} ${empresaQuery} site:linkedin.com/in`,
            search_depth: "basic",
            max_results: 3,
            include_domains: ["linkedin.com"],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!tavilyRes.ok) continue;
        const td = await tavilyRes.json();
        const results = (td.results ?? []) as Array<{ url: string; title: string }>;

        // Pega 1ª URL linkedin.com/in/
        const linkedinUrl = results
          .map((r) => r.url)
          .find((u) => /linkedin\.com\/in\//i.test(u));

        if (linkedinUrl) {
          await supabase
            .from("prospeccao_socio")
            .update({ linkedin_url: linkedinUrl })
            .eq("id", socio.id);
          enriquecidos += 1;
        }
      } catch (e) {
        console.warn(`[enriquecer-socios] falha sócio ${socio.id}:`, e);
      }

      // Rate-limit (Tavily 1 req/s no free)
      await new Promise((r) => setTimeout(r, 1100));
    }

    return NextResponse.json({
      ok: true,
      total_tentados: lista.length,
      enriquecidos,
    });
  } catch (err: any) {
    console.error("[enriquecer-socios]", err);
    return NextResponse.json({ erro: err.message || "Erro." }, { status: 500 });
  }
}
