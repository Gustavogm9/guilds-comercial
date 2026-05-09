import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { Telescope } from "lucide-react";
import ProspeccaoHub from "@/components/prospeccao/prospeccao-hub";

export const dynamic = "force-dynamic";

export default async function ProspeccaoPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();

  // Carrega ICP da org para contextualizar sugestões
  const { data: config } = await supabase
    .from("organizacao_config")
    .select("*")
    .eq("organizacao_id", orgId)
    .maybeSingle();

  // Histórico resumido de jobs
  const { data: jobs } = await supabase
    .from("prospeccao_jobs")
    .select("id, tipo, status, leads_criados, created_at, input")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5);

  const icp = null; // Expandir se org tiver ICP salvo

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center">
            <Telescope className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Motor de Prospecção</h1>
            <p className="text-sm text-muted-foreground">
              Descubra e enriqueça leads com IA — alimente o pipeline de forma estruturada.
            </p>
          </div>
        </div>

        {/* Chaves não configuradas — aviso */}
        {!process.env.FIRECRAWL_API_KEY && !process.env.TAVILY_API_KEY && (
          <div className="mt-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-400">
            ⚠ Configure suas chaves <strong>FIRECRAWL_API_KEY</strong> e <strong>TAVILY_API_KEY</strong> em{" "}
            <a href="/configuracoes/desenvolvedores" className="underline font-semibold">
              Configurações → Desenvolvedores
            </a>{" "}
            para usar o motor de prospecção.
          </div>
        )}
      </div>

      {/* Hub principal */}
      <ProspeccaoHub orgId={orgId} icp={icp} />

      {/* Histórico de jobs */}
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
                    {(job.input as any)?.url ?? (job.input as any)?.query ?? "—"}
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
