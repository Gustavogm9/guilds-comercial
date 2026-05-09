import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import type { EmpresaEnriquecida } from "@/lib/prospeccao";

/**
 * GET /api/prospeccao/cnpj?cnpj=12345678000195
 *
 * Enriquece uma empresa a partir do CNPJ usando a BrasilAPI (gratuita, sem chave).
 * Retorna dados formatados como EmpresaEnriquecida para entrar na fila de ativação.
 */
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ erro: "Sem organização." }, { status: 403 });

  const cnpjRaw = req.nextUrl.searchParams.get("cnpj") ?? "";
  const cnpj = cnpjRaw.replace(/\D/g, "");

  if (cnpj.length !== 14) {
    return NextResponse.json({ erro: "CNPJ inválido. Informe 14 dígitos." }, { status: 400 });
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 }, // cache 1h — dados de CNPJ mudam raramente
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ erro: "CNPJ não encontrado na Receita Federal." }, { status: 404 });
      }
      throw new Error(`BrasilAPI ${res.status}`);
    }

    const d = await res.json();

    // Monta cidade_uf normalizado
    const cidade = d.municipio ? _titleCase(d.municipio) : null;
    const uf = d.uf ?? null;
    const cidade_uf = cidade && uf ? `${cidade}/${uf}` : (cidade ?? uf);

    // Determina confiança baseado na completude dos dados
    const temRazao = !!d.razao_social;
    const temCidade = !!cidade_uf;
    const confianca: EmpresaEnriquecida["_confianca"] =
      temRazao && temCidade ? "alta" : temRazao ? "media" : "baixa";

    // CNAE principal como segmento sugerido
    const cnae = d.cnae_fiscal_descricao
      ? _normalizarCnae(d.cnae_fiscal_descricao)
      : null;

    const empresa: EmpresaEnriquecida = {
      nome:       null,                              // CNPJ não tem pessoa física
      empresa:    d.nome_fantasia?.trim() || _titleCase(d.razao_social ?? "") || null,
      cargo:      null,
      email:      d.email?.toLowerCase() ?? null,
      whatsapp:   d.ddd_telefone_1 ? _normalizarTelefone(d.ddd_telefone_1) : null,
      site:       d.descricao_situacao_cadastral === "ATIVA"
                    ? `https://www.${cnpj}.com.br` // placeholder — Firecrawl pode enriquecer
                    : null,
      linkedin:   null,
      segmento:   cnae,
      cidade_uf,
      descricao:  [
        d.cnae_fiscal_descricao ? `Atividade: ${_titleCase(d.cnae_fiscal_descricao)}` : null,
        d.porte ? `Porte: ${_normalizarPorte(d.porte)}` : null,
        d.capital_social ? `Capital social: ${Number(d.capital_social).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` : null,
        d.descricao_situacao_cadastral !== "ATIVA" ? `Situação: ${d.descricao_situacao_cadastral}` : null,
      ].filter(Boolean).join(" · ") || null,
      _fonte_url: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      _confianca: confianca,
    };

    // Dados extras para exibição (não fazem parte do lead padrão, mas são úteis)
    const extras = {
      cnpj_formatado: _formatarCnpj(cnpj),
      razao_social:   d.razao_social,
      porte:          _normalizarPorte(d.porte ?? ""),
      capital_social: d.capital_social,
      situacao:       d.descricao_situacao_cadastral,
      data_inicio:    d.data_inicio_atividade,
      cnae_codigo:    d.cnae_fiscal,
      socios:         (d.qsa ?? []).slice(0, 3).map((s: any) => ({
        nome: _titleCase(s.nome_socio ?? ""),
        qualificacao: s.qualificacao_socio ?? "",
      })),
    };

    return NextResponse.json({ ok: true, empresa, extras });
  } catch (err: any) {
    console.error("[prospeccao/cnpj]", err);
    return NextResponse.json({ erro: err.message || "Erro ao consultar CNPJ." }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function _normalizarCnae(desc: string): string {
  // Extrai categoria principal do CNAE
  const lower = desc.toLowerCase();
  if (lower.includes("seguro"))     return "Seguros/Corretora";
  if (lower.includes("imóvel") || lower.includes("imovel")) return "Imóveis";
  if (lower.includes("saúde") || lower.includes("medic")) return "Saúde";
  if (lower.includes("tecnolog") || lower.includes("software")) return "Tecnologia";
  if (lower.includes("educaç"))    return "Educação";
  if (lower.includes("jurídic") || lower.includes("advocac")) return "Jurídico";
  if (lower.includes("financ") || lower.includes("contab")) return "Financeiro";
  if (lower.includes("constru"))   return "Construção";
  if (lower.includes("varejo") || lower.includes("comércio")) return "Comércio";
  return _titleCase(desc.split("/")[0].trim());
}

function _normalizarPorte(porte: string): string {
  const map: Record<string, string> = {
    "MICRO EMPRESA": "Micro",
    "EMPRESA DE PEQUENO PORTE": "Pequena",
    "DEMAIS": "Médio/Grande",
  };
  return map[porte?.toUpperCase()] ?? porte ?? "—";
}

function _normalizarTelefone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  return raw;
}

function _formatarCnpj(cnpj: string): string {
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
