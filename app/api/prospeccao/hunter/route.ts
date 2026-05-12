/**
 * POST /api/prospeccao/hunter
 * Body: { empresa_id: number }
 *
 * Hunter.io domain-search: dado o domínio (extraído do site), retorna emails
 * encontrados publicamente + confidence + departamento. Atualiza emails_hunter
 * em prospeccao_empresa.
 *
 * Free tier: 25 buscas/mês. Plans: $49/mo (500), $149/mo (5k).
 * Vendedor decide quando enriquecer (custo = 1 search por empresa).
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

    const apiKey = process.env.HUNTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        erro: "HUNTER_API_KEY não configurada. Adicione em Vercel Settings → Environment Variables.",
        provider: "hunter",
      }, { status: 503 });
    }

    const { empresa_id } = await req.json();
    if (!Number.isInteger(empresa_id) || empresa_id <= 0) {
      return NextResponse.json({ erro: "empresa_id inválido." }, { status: 400 });
    }

    const supabase = createClient();
    const { data: empresa } = await supabase
      .from("prospeccao_empresa")
      .select("id, site, hunter_atualizado_em")
      .eq("id", empresa_id)
      .maybeSingle();

    if (!empresa) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });
    if (!empresa.site) {
      return NextResponse.json({ erro: "Empresa sem site cadastrado — Hunter precisa de domínio." }, { status: 400 });
    }

    // Extrai domínio do site
    let dominio = empresa.site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    dominio = dominio.toLowerCase();
    if (!dominio || !dominio.includes(".")) {
      return NextResponse.json({ erro: "Domínio inválido." }, { status: 400 });
    }

    // Hunter.io domain-search
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(dominio)}&limit=10&api_key=${apiKey}`, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const erro = await res.text().catch(() => "");
      return NextResponse.json({ erro: `Hunter ${res.status}: ${erro.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const emails = (data?.data?.emails ?? []).map((e: any) => ({
      value: e.value,
      first_name: e.first_name,
      last_name: e.last_name,
      position: e.position,
      department: e.department,
      seniority: e.seniority,
      confidence: e.confidence,        // 0-100
      linkedin: e.linkedin,
      twitter: e.twitter,
      verification: e.verification?.status,  // valid/accept_all/disposable
    }));

    await supabase
      .from("prospeccao_empresa")
      .update({
        emails_hunter: emails,
        hunter_atualizado_em: new Date().toISOString(),
      })
      .eq("id", empresa_id);

    // Tentativa de match com sócios já cadastrados (mesmo nome)
    const { data: socios } = await supabase
      .from("prospeccao_socio")
      .select("id, nome")
      .eq("empresa_id", empresa_id);

    for (const socio of (socios ?? []) as any[]) {
      const nomeLower = socio.nome.toLowerCase();
      const match = emails.find((e: any) => {
        const fullName = `${e.first_name ?? ""} ${e.last_name ?? ""}`.toLowerCase().trim();
        if (!fullName) return false;
        // Match parcial: pelo menos 1ª e última palavra batem
        const partsNome = nomeLower.split(" ");
        const partsMatch = fullName.split(" ");
        return partsNome[0] === partsMatch[0] && partsNome[partsNome.length - 1] === partsMatch[partsMatch.length - 1];
      });
      if (match) {
        await supabase
          .from("prospeccao_socio")
          .update({
            email: match.value,
            cargo_atual: match.position ?? null,
            emails_provaveis: [match],
            hunter_confidence: match.confidence,
          })
          .eq("id", socio.id);
      }
    }

    return NextResponse.json({
      ok: true,
      dominio,
      total_emails: emails.length,
      total_socios_matched: (socios ?? []).filter((s: any) =>
        emails.some((e: any) => {
          const fullName = `${e.first_name ?? ""} ${e.last_name ?? ""}`.toLowerCase().trim();
          return fullName && s.nome.toLowerCase().split(" ")[0] === fullName.split(" ")[0];
        })
      ).length,
    });
  } catch (e: any) {
    console.error("[prospeccao/hunter]", e);
    return NextResponse.json({ erro: e.message || "Erro." }, { status: 500 });
  }
}
