import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Workflow, CheckCircle2, Archive, Edit2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";

export const dynamic = "force-dynamic";

/**
 * /configuracoes/cadencia/fluxos — gestor lista e edita fluxos de cadência.
 *
 * Cada fluxo tem N passos sequenciais customizáveis. Substitui o D0/D3/D7/D11
 * hardcoded em cadencia_templates.
 */
export default async function FluxosPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const { data: fluxos } = await supabase
    .from("v_cadencia_fluxo_completo")
    .select("*")
    .eq("organizacao_id", orgId)
    .neq("status", "arquivado")
    .order("default_template", { ascending: false })
    .order("created_at", { ascending: false });

  const lista = (fluxos ?? []) as any[];

  return (
    <div className="max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="w-6 h-6 text-primary" aria-hidden="true" />
            Fluxos de cadência
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure sequências customizadas de passos (email/WhatsApp/call/LinkedIn) com
            timing e regras. Substitui o D0/D3/D7/D11 fixo. Marque um como default — esse
            é usado quando vendedor clica "iniciar cadência" sem escolher fluxo.
          </p>
        </div>
        <Link href="/configuracoes/cadencia/fluxos/novo" className="btn-primary text-sm">
          <Plus className="w-3.5 h-3.5" /> Novo fluxo
        </Link>
      </header>

      {lista.length === 0 ? (
        <div className="card p-12 text-center">
          <Workflow className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum fluxo configurado.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {lista.map((f) => (
            <li key={f.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/configuracoes/cadencia/fluxos/${f.id}`} className="font-semibold text-foreground hover:text-primary">
                      {f.nome}
                    </Link>
                    {f.default_template && (
                      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded border border-primary/30">
                        default
                      </span>
                    )}
                    <span className={`text-[10px] uppercase tracking-[0.12em] font-semibold px-1.5 py-0.5 rounded border ${
                      f.status === "publicado" ? "text-success-500 bg-success-500/10 border-success-500/30" :
                      f.status === "draft" ? "text-warning-500 bg-warning-500/10 border-warning-500/30" :
                      "text-muted-foreground bg-muted border-border"
                    }`}>
                      {f.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {f.trigger}
                      {f.trigger_valor ? `: ${f.trigger_valor}` : ""}
                    </span>
                  </div>
                  {f.descricao && <p className="text-xs text-muted-foreground mt-1">{f.descricao}</p>}
                  <div className="text-xs text-muted-foreground mt-2 tabular-nums">
                    {f.total_passos} passo(s)
                    {f.passos && f.passos.length > 0 && (
                      <span className="ml-2">
                        · Span: D0 → D{Math.max(...f.passos.map((p: any) => p.offset_dias))}
                      </span>
                    )}
                  </div>
                </div>
                <Link href={`/configuracoes/cadencia/fluxos/${f.id}`} className="btn-ghost text-xs">
                  <Edit2 className="w-3 h-3" /> Editar
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
