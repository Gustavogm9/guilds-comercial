import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { ShieldCheck, User, Calendar } from "lucide-react";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

interface EventoEnriched {
  id: number;
  tipo: string;
  ator_id: string | null;
  ator_nome?: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  // só lead_evento
  lead_id?: number | null;
  lead_empresa?: string | null;
  // discriminator
  origem: "lead" | "organizacao";
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: { tipo?: string; ator?: string };
}) {
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");
  const t = getT(await getServerLocale());

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();

  // Carrega últimos 200 eventos de cada tabela em paralelo
  const [leadsRes, orgsRes, profilesRes] = await Promise.all([
    supabase
      .from("lead_evento")
      .select("id, tipo, ator_id, payload, created_at, lead_id, leads(empresa)")
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("organizacao_evento")
      .select("id, tipo, ator_id, payload, created_at")
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("profiles")
      .select("id, display_name"),
  ]);

  const profilesMap = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p: any) => profilesMap.set(p.id, p.display_name));

  const eventos: EventoEnriched[] = [
    ...(leadsRes.data ?? []).map((e: any) => ({
      id: e.id,
      tipo: e.tipo,
      ator_id: e.ator_id,
      ator_nome: e.ator_id ? profilesMap.get(e.ator_id) : "(sistema)",
      payload: e.payload,
      created_at: e.created_at,
      lead_id: e.lead_id,
      lead_empresa: e.leads?.empresa ?? null,
      origem: "lead" as const,
    })),
    ...(orgsRes.data ?? []).map((e: any) => ({
      id: e.id,
      tipo: e.tipo,
      ator_id: e.ator_id,
      ator_nome: e.ator_id ? profilesMap.get(e.ator_id) : "(sistema)",
      payload: e.payload,
      created_at: e.created_at,
      origem: "organizacao" as const,
    })),
  ]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 300);

  // Filtros simples
  const tipoFilter = searchParams.tipo;
  const atorFilter = searchParams.ator;
  const filtered = eventos.filter((e) => {
    if (tipoFilter && !e.tipo.includes(tipoFilter)) return false;
    if (atorFilter && e.ator_id !== atorFilter) return false;
    return true;
  });

  // Tipos únicos pra dropdown
  const tipos = Array.from(new Set(eventos.map((e) => e.tipo))).sort();
  const atores = Array.from(new Set(eventos.map((e) => e.ator_id).filter(Boolean))) as string[];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          {t("paginas.auditoria_titulo")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("paginas.auditoria_sub")}
        </p>
      </header>

      {/* Filtros */}
      <form className="mb-4 flex flex-col sm:flex-row gap-3" action="/auditoria" method="GET">
        <select name="tipo" defaultValue={tipoFilter ?? ""} className="input-base flex-1">
          <option value="">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select name="ator" defaultValue={atorFilter ?? ""} className="input-base flex-1">
          <option value="">Todos os atores</option>
          {atores.map((id) => (
            <option key={id} value={id}>{profilesMap.get(id) ?? id.slice(0, 8)}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">Filtrar</button>
        {(tipoFilter || atorFilter) && (
          <Link href="/auditoria" className="btn-ghost text-sm">Limpar</Link>
        )}
      </form>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-muted-foreground">
          Nenhum evento corresponde ao filtro.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => (
            <li key={`${e.origem}-${e.id}`} className="card p-3">
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                      e.origem === "lead"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-warning-500/10 text-warning-500 border-warning-500/30"
                    }`}
                  >
                    {e.origem === "lead" ? "Lead" : "Org"}
                  </span>
                  <span className="font-medium text-sm">{e.tipo}</span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-3 md:ml-4 flex-1 min-w-0">
                  <span className="flex items-center gap-1 truncate">
                    <User className="w-3 h-3 flex-shrink-0" />
                    {e.ator_nome ?? "(sistema)"}
                  </span>
                  {e.lead_empresa && (
                    <Link
                      href={`/pipeline/${e.lead_id}`}
                      className="truncate hover:text-foreground"
                    >
                      → {e.lead_empresa}
                    </Link>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                  <Calendar className="w-3 h-3" />
                  {new Date(e.created_at).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              {e.payload && Object.keys(e.payload).length > 0 && (
                <details className="mt-2">
                  <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
                    payload ({Object.keys(e.payload).length} campos)
                  </summary>
                  <pre className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
