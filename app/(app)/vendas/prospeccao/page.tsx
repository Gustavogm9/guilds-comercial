import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { Telescope } from "lucide-react";
import ProspeccaoHub from "@/components/prospeccao/prospeccao-hub";
import VendasTabs from "../vendas-tabs";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ hipotese?: string }>;
};

export default async function ProspeccaoPage({ searchParams }: Props) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  const isGestor = role === "gestor";
  const hasExternalProspectingKeys = Boolean(process.env.FIRECRAWL_API_KEY || process.env.TAVILY_API_KEY);

  const params = await searchParams;
  const hipoteseId = params.hipotese ? parseInt(params.hipotese, 10) : undefined;

  const supabase = createClient();

  // Carrega tudo em paralelo
  const [hipotesePre_loaded, jobs, hipoteses, produtos] = await Promise.all([
    // Hipótese da URL
    (async () => {
      if (!hipoteseId || isNaN(hipoteseId)) return null;
      const { data: hip } = await supabase
        .from("icp_hipoteses")
        .select("id, nome, segmentos, cidades, cargos, produto_id, produtos(nome)")
        .eq("id", hipoteseId).eq("organizacao_id", orgId).maybeSingle();
      if (!hip) return null;
      return { ...hip, produtos: Array.isArray(hip.produtos) ? (hip.produtos[0] ?? null) : (hip.produtos ?? null) };
    })(),
    // Histórico de jobs
    supabase.from("prospeccao_jobs")
      .select("id, tipo, status, leads_criados, created_at, input")
      .eq("organizacao_id", orgId).order("created_at", { ascending: false }).limit(5)
      .then(r => r.data),
    // Hipóteses ativas para campanhas
    supabase.from("icp_hipoteses")
      .select("id, nome, cor, segmentos, cidades, cargos")
      .eq("organizacao_id", orgId).eq("status", "ativa")
      .then(r => r.data ?? []),
    // Produtos ativos para campanhas
    supabase.from("produtos")
      .select("id, nome")
      .eq("organizacao_id", orgId).eq("ativo", true).order("ordem")
      .then(r => r.data ?? []),
  ]);

  const hipotesePre = hipotesePre_loaded;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <VendasTabs isGestor={isGestor} />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center">
            <Telescope className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Motor de Prospecção</h1>
            <p className="text-sm text-muted-foreground">
              {hipotesePre
                ? <>Prospectando para hipótese: <span className="font-semibold text-primary">{hipotesePre.nome}</span></>
                : "Descubra e enriqueça leads com IA — alimente o pipeline de forma estruturada."}
            </p>
          </div>
        </div>

        {/* Aviso de chaves não configuradas */}
        {!process.env.FIRECRAWL_API_KEY && !process.env.TAVILY_API_KEY && (
          <div className="mt-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-400">
            ⚠ Configure <strong>FIRECRAWL_API_KEY</strong> e <strong>TAVILY_API_KEY</strong> em{" "}
            <a href="/configuracoes/desenvolvedores" className="underline font-semibold">
              Configurações → Desenvolvedores
            </a>{" "}
            para usar o motor completo. Busca por CNPJ é sempre gratuita.
          </div>
        )}

        {/* Banner da hipótese ativa */}
        {hipotesePre && (
          <div className="mt-4 p-3 rounded-xl border border-primary/20 bg-primary/[0.03] flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <div className="text-xs">
              <span className="font-semibold">ICP Lab: {hipotesePre.nome}</span>
              {hipotesePre.produtos?.nome && <span className="text-muted-foreground"> · Produto: {hipotesePre.produtos.nome}</span>}
              {hipotesePre.segmentos?.length ? (
                <span className="text-muted-foreground"> · {hipotesePre.segmentos.join(", ")}</span>
              ) : null}
            </div>
            <a href="/vendas/prospeccao" className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
              Limpar filtro →
            </a>
          </div>
        )}
      </div>

      {/* Hub principal */}
      <ProspeccaoHub
        orgId={orgId}
        icp={null}
        hipoteseId={hipoteseId}
        hipotesePre={hipotesePre}
        hipoteses={hipoteses as any[]}
        produtos={produtos as any[]}
        hasExternalProspectingKeys={hasExternalProspectingKeys}
      />

      {/* Histórico */}
      {jobs && jobs.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Últimas prospecções
          </h2>
          <div className="space-y-2">
            {jobs.map(job => (
              <div key={job.id} className="card px-4 py-3 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  job.status === "concluido" ? "bg-green-500" :
                  job.status === "erro"      ? "bg-destructive" :
                  "bg-amber-500 animate-pulse"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate">
                    {(job.input as any)?.url ?? (job.input as any)?.query ?? (job.input as any)?.queries?.[0] ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {job.tipo} · {new Date(job.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                {job.leads_criados > 0 && (
                  <div className="text-xs text-green-600 font-semibold shrink-0">
                    +{job.leads_criados} lead{job.leads_criados !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
