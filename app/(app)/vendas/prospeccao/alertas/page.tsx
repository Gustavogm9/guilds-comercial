import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, Building2 } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import VendasTabs from "../../vendas-tabs";

export const dynamic = "force-dynamic";

/**
 * /vendas/prospeccao/alertas — mudanças detectadas em CNPJs que já viraram
 * leads na org. Cron diário enche, gestor revisa aqui.
 */
export default async function AlertasPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();
  const { data: alertas } = await supabase
    .from("v_prospeccao_alertas_org")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  const lista = (alertas ?? []) as any[];
  const naoVistos = lista.filter((a) => !a.visto).length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <VendasTabs />
      <Link href="/vendas/prospeccao" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-3 h-3" /> Voltar
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-warning-500" aria-hidden="true" />
          Alertas de mudança
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mudanças detectadas em CNPJs de empresas que viraram leads da sua org.
          Cron diário 04 UTC checa empresas com 30+ dias sem update.
          {naoVistos > 0 && (
            <span className="ml-2 text-warning-500 font-medium">· {naoVistos} novo(s)</span>
          )}
        </p>
      </header>

      {lista.length === 0 ? (
        <div className="card p-12 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Nenhum alerta ainda.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Cron de refresh roda diariamente. Você verá aqui quando algum CNPJ mudar
            de situação, capital social ≥20%, sócio entrar/sair, etc.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((a) => (
            <li key={a.id} className={`card p-4 ${!a.visto ? "border-warning-500/30 bg-warning-500/[0.03]" : ""}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-warning-500 px-1.5 py-0.5 rounded bg-warning-500/10 border border-warning-500/30">
                      {a.tipo.replace(/_/g, " ")}
                    </span>
                    {!a.visto && (
                      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30">
                        novo
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/vendas/prospeccao/empresa/${a.empresa_id}`}
                    className="font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    {a.nome_fantasia || a.razao_social || a.cnpj}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1">
                    {a.tipo === "situacao_mudou" && `Situação: ${a.payload?.situacao_anterior ?? "?"} → ${a.payload?.situacao_atual ?? "?"}`}
                    {a.tipo === "capital_mudou" && `Capital: ${Number(a.payload?.anterior).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} → ${Number(a.payload?.atual).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} (${a.payload?.variacao_pct}%)`}
                    {a.tipo === "novo_socio" && `Novos sócios: ${(a.payload?.nomes ?? []).join(", ")}`}
                    {a.tipo === "socio_saiu" && `Saíram: ${(a.payload?.nomes ?? []).join(", ")}`}
                    {a.tipo === "cnae_mudou" && "CNAE principal mudou"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    Lead vinculado: {" "}
                    <Link href={`/vendas/pipeline/${a.lead_id}`} className="text-primary hover:underline">
                      {a.lead_empresa}
                    </Link>
                  </p>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
