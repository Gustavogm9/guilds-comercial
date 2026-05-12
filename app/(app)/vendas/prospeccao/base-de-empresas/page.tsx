import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Building2, Users, FileText } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import VendasTabs from "../../vendas-tabs";
import BaseEmpresasClient from "./base-empresas-client";

export const dynamic = "force-dynamic";

/**
 * /vendas/prospeccao/base-de-empresas — busca local nas empresas já enriquecidas.
 *
 * Cache compartilhado entre orgs. Filtros estruturados: porte, UF, CNAE,
 * capital social, situação, nº de sócios. Full-text em razão social + descrição.
 *
 * Cada empresa pode ser "ativada como lead" → entra na base bruta da org com
 * tracking de origem ('base_empresas_local').
 */
export default async function BaseEmpresasPage(props: {
  searchParams: Promise<{
    q?: string;
    porte?: string;
    uf?: string;
    cnae?: string;
    situacao?: string;
    capital_min?: string;
    page?: string;
  }>;
}) {
  const me = await getCurrentProfile();
  if (!me) return null;
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const sp = await props.searchParams;
  const q = sp.q?.trim() ?? "";
  const porte = sp.porte ?? "all";
  const uf = sp.uf ?? "all";
  const cnae = sp.cnae?.trim() ?? "";
  const situacao = sp.situacao ?? "ATIVA";
  const capitalMin = sp.capital_min ? Number(sp.capital_min) : null;
  const page = Math.max(1, Number(sp.page ?? 1));
  const PAGE_SIZE = 25;

  const supabase = createClient();
  let query = supabase
    .from("v_prospeccao_empresa")
    .select("*", { count: "exact" });

  if (situacao !== "all") query = query.eq("situacao", situacao);
  if (porte !== "all") query = query.eq("porte", porte);
  if (uf !== "all") query = query.eq("uf", uf);
  if (cnae) query = query.ilike("cnae_normalizado", `%${cnae}%`);
  if (capitalMin != null && Number.isFinite(capitalMin)) query = query.gte("capital_social", capitalMin);
  if (q) {
    // Sanitiza chars que quebram parser PostgREST .or()
    const safeQ = q.replace(/[,()*]/g, " ");
    query = query.or(
      `razao_social.ilike.%${safeQ}%,nome_fantasia.ilike.%${safeQ}%,descricao_negocio.ilike.%${safeQ}%,cnpj.ilike.%${safeQ.replace(/\D/g, "")}%`
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count } = await query
    .order("ultima_consulta_em", { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Lista única de UFs e portes pra filtros
  const { data: ufsData } = await supabase
    .from("prospeccao_empresa")
    .select("uf")
    .not("uf", "is", null);
  const ufs = Array.from(new Set((ufsData ?? []).map((r: any) => r.uf as string).filter(Boolean))).sort();

  // Estatísticas
  const { count: totalEmpresas } = await supabase
    .from("prospeccao_empresa")
    .select("id", { count: "exact", head: true });
  const { count: totalSocios } = await supabase
    .from("prospeccao_socio")
    .select("id", { count: "exact", head: true });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <VendasTabs />
      <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" aria-hidden="true" />
            Base de empresas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cache local de tudo que já foi consultado via CNPJ + enriquecido na web. Filtre
            por porte, UF, CNAE, capital social, etc., e ative direto como lead.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card">
            <Building2 className="w-3 h-3" aria-hidden="true" />
            {(totalEmpresas ?? 0).toLocaleString("pt-BR")} empresas
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card">
            <Users className="w-3 h-3" aria-hidden="true" />
            {(totalSocios ?? 0).toLocaleString("pt-BR")} sócios
          </span>
          <Link href="/vendas/prospeccao/bulk-import" className="btn-secondary text-xs">
            <FileText className="w-3 h-3" aria-hidden="true" /> Import CSV
          </Link>
        </div>
      </header>

      <BaseEmpresasClient
        empresas={(data ?? []) as any[]}
        ufs={ufs}
        currentFilters={{ q, porte, uf, cnae, situacao, capital_min: capitalMin }}
        total={total}
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
