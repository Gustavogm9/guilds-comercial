import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import {
  Activity, Eye, MousePointerClick, Sparkles, ArrowLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface Linha {
  organizacao_id: string;
  event_name: string;
  total_eventos: number;
  usuarios_distintos: number;
  dias_com_atividade: number;
  ultimo_evento_em: string;
}

/**
 * Dashboard de uso do flywheel — últimos 30 dias.
 *
 * Pergunta-chave do gestor: meu time tá usando? Quem usa?
 * Restrito a gestores (RLS já filtra na view, mas redireciona pra UX).
 */
export default async function FlywheelUsoPage() {
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/flywheel");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("v_flywheel_uso_30d")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("total_eventos", { ascending: false });

  const linhas = (rows ?? []) as Linha[];

  const total = linhas.reduce((s, l) => s + l.total_eventos, 0);
  const usuariosUnicos = Math.max(0, ...linhas.map((l) => l.usuarios_distintos));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href="/flywheel" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="w-3 h-3" aria-hidden="true" />
        Voltar pro flywheel
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ letterSpacing: "-0.3px" }}>
          Uso do flywheel — últimos 30 dias
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quem usa cada feature do lado direito do funil. Sem PII — apenas contagens.
        </p>
      </header>

      {/* Topline */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Card icon={<Activity className="w-4 h-4" />} label="Eventos totais" value={total.toLocaleString("pt-BR")} />
        <Card icon={<Eye className="w-4 h-4" />} label="Usuários ativos" value={usuariosUnicos.toString()} />
        <Card icon={<Sparkles className="w-4 h-4" />} label="Eventos distintos" value={linhas.length.toString()} />
      </section>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {linhas.length === 0 ? (
          <div className="p-12 text-center">
            <MousePointerClick className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Sem eventos registrados nos últimos 30 dias.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Tracking começa a aparecer conforme o time usa a feature.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Evento</th>
                <th className="text-right px-3 py-2 font-semibold">Total</th>
                <th className="text-right px-3 py-2 font-semibold">Usuários</th>
                <th className="text-right px-3 py-2 font-semibold">Dias ativos</th>
                <th className="text-left px-3 py-2 font-semibold">Último</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((l) => (
                <tr key={l.event_name} className="hover:bg-secondary/60 dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-2 font-mono text-xs">{prettyName(l.event_name)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{l.total_eventos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.usuarios_distintos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={l.dias_com_atividade >= 7 ? "text-success-500" : "text-muted-foreground"}>
                      {l.dias_com_atividade}/30
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {new Date(l.ultimo_evento_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground/80 mt-3 italic">
        RLS isola por org. Dados expiram naturalmente conforme novos eventos chegam (rolling 30d).
      </p>
    </div>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span className="uppercase tracking-[0.12em] font-semibold text-[10px]">{label}</span>
        <span className="text-primary" aria-hidden="true">{icon}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums" style={{ letterSpacing: "-0.3px" }}>
        {value}
      </div>
    </div>
  );
}

function prettyName(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
