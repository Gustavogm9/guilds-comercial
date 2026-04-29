import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { Mail, MessageSquare, PhoneCall, Zap, TrendingDown, TrendingUp } from "lucide-react";
import { getServerLocale, getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type KpiCanal = {
  organizacao_id: string;
  canal_principal: string | null;
  leads: number;
  respondidos: number;
  raiox_ofertado: number;
  raiox_pagos: number;
  calls_marcadas: number;
  propostas: number;
  fechados: number;
  receita_canal: number;
};

const CANAL_ICON: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  "Email":              { icon: Mail,         color: "text-primary bg-primary/10" },
  "WhatsApp":           { icon: MessageSquare, color: "text-success-500 bg-success-500/10" },
  "Email + WhatsApp":   { icon: Zap,          color: "text-primary bg-primary/10" },
  "Ligação":            { icon: PhoneCall,    color: "text-warning-500 bg-warning-500/10" },
};

export default async function CanaisPage() {
  const me = await getCurrentProfile();
  if (!me) return null;
  const t = getT(await getServerLocale());

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  if (role !== "gestor") redirect("/hoje");

  const supabase = createClient();
  const { data } = await supabase
    .from("v_kpis_por_canal")
    .select("*")
    .eq("organizacao_id", orgId)
    .order("leads", { ascending: false });

  const linhas = (data ?? []) as KpiCanal[];
  const total = linhas.reduce(
    (acc, l) => ({
      leads: acc.leads + l.leads,
      respondidos: acc.respondidos + l.respondidos,
      raiox_ofertado: acc.raiox_ofertado + l.raiox_ofertado,
      raiox_pagos: acc.raiox_pagos + l.raiox_pagos,
      calls_marcadas: acc.calls_marcadas + l.calls_marcadas,
      propostas: acc.propostas + l.propostas,
      fechados: acc.fechados + l.fechados,
      receita_canal: acc.receita_canal + Number(l.receita_canal || 0),
    }),
    { leads: 0, respondidos: 0, raiox_ofertado: 0, raiox_pagos: 0, calls_marcadas: 0, propostas: 0, fechados: 0, receita_canal: 0 }
  );

  const melhorCanal = linhas.length > 0
    ? linhas.slice().sort((a, b) => conversao(b) - conversao(a))[0]
    : null;
  const piorCanal = linhas.length > 0
    ? linhas.slice().sort((a, b) => conversao(a) - conversao(b))[0]
    : null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("paginas.canais_titulo")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("paginas.canais_sub")}
        </p>
      </header>

      {/* Resumo */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card title="Total de leads" v={total.leads} />
        <Card title="Taxa de resposta" v={pct(total.respondidos, total.leads)} tone="warning" />
        <Card title="Taxa de fechamento" v={pct(total.fechados, total.leads)} tone="success" />
        <Card title="Receita total"
          v={total.receita_canal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} />
      </section>

      {melhorCanal && piorCanal && melhorCanal.canal_principal !== piorCanal.canal_principal && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div className="card p-4 bg-success-500/10 border-success-500/25 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-success-500/15 text-success-500 grid place-items-center shrink-0">
              <TrendingUp className="w-4 h-4"/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] text-success-500 font-semibold">Canal mais eficiente</div>
              <div className="text-lg font-semibold truncate">{melhorCanal.canal_principal ?? "—"}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {pct(melhorCanal.fechados, melhorCanal.leads)} de conversão · {melhorCanal.fechados} fechados em {melhorCanal.leads} leads
              </div>
            </div>
          </div>
          <div className="card p-4 bg-warning-500/10 border-warning-500/25 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-warning-500/15 text-warning-500 grid place-items-center shrink-0">
              <TrendingDown className="w-4 h-4"/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] text-warning-500 font-semibold">Canal menos eficiente</div>
              <div className="text-lg font-semibold truncate">{piorCanal.canal_principal ?? "—"}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {pct(piorCanal.fechados, piorCanal.leads)} de conversão · repensar cadência ou oferta
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 dark:bg-white/[0.03] text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Canal</th>
                <th className="text-right px-3 py-2 font-semibold">Leads</th>
                <th className="text-right px-3 py-2 font-semibold">Resp.</th>
                <th className="text-right px-3 py-2 font-semibold">Resp %</th>
                <th className="text-right px-3 py-2 font-semibold">Raio-X ofert.</th>
                <th className="text-right px-3 py-2 font-semibold">Raio-X pg.</th>
                <th className="text-right px-3 py-2 font-semibold">Calls</th>
                <th className="text-right px-3 py-2 font-semibold">Propostas</th>
                <th className="text-right px-3 py-2 font-semibold">Fechados</th>
                <th className="text-right px-3 py-2 font-semibold">Conv %</th>
                <th className="text-right px-3 py-2 font-semibold">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-muted-foreground/70">
                    Sem dados de canais. Os leads precisam ter <code className="bg-secondary dark:bg-white/[0.05] px-1 rounded text-[11px]">canal_principal</code> preenchido.
                  </td>
                </tr>
              )}
              {linhas.map((l, i) => {
                const nome = l.canal_principal ?? "(não informado)";
                const meta = CANAL_ICON[nome] ?? { icon: Zap, color: "text-muted-foreground bg-secondary/60 dark:bg-white/[0.03]" };
                const Icon = meta.icon;
                const respPct = pct(l.respondidos, l.leads);
                const convPct = pct(l.fechados, l.leads);
                return (
                  <tr key={i} className="hover:bg-secondary/60 dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg grid place-items-center ${meta.color}`}>
                          <Icon className="w-3.5 h-3.5"/>
                        </div>
                        <Link href={`/base?tab=bruta&canal=${encodeURIComponent(nome)}`}
                              className="font-medium hover:text-primary">
                          {nome}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.respondidos}</td>
                    <td className="px-3 py-2 text-right">
                      <Barra pct={l.leads > 0 ? Math.round((l.respondidos / l.leads) * 100) : 0}
                             label={respPct} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.raiox_ofertado}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.raiox_pagos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.calls_marcadas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.propostas}</td>
                    <td className="px-3 py-2 text-right text-success-500 font-medium tabular-nums">{l.fechados}</td>
                    <td className="px-3 py-2 text-right">
                      <Barra pct={l.leads > 0 ? Math.round((l.fechados / l.leads) * 100) : 0}
                             label={convPct} tone="success" />
                    </td>
                    <td className="px-3 py-2 text-right text-foreground/80 font-medium tabular-nums">
                      {Number(l.receita_canal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {linhas.length > 0 && (
              <tfoot className="bg-secondary/60 dark:bg-white/[0.03] text-xs text-muted-foreground font-medium">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.respondidos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(total.respondidos, total.leads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.raiox_ofertado}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.raiox_pagos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.calls_marcadas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.propostas}</td>
                  <td className="px-3 py-2 text-right text-success-500 tabular-nums">{total.fechados}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(total.fechados, total.leads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {total.receita_canal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function conversao(l: KpiCanal): number {
  return l.leads > 0 ? l.fechados / l.leads : 0;
}

function pct(num: number, den: number): string {
  if (!den) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

function Card({ title, v, tone = "neutral" }: { title: string; v: string | number; tone?: "neutral" | "success" | "warning" }) {
  const tones = {
    neutral: "text-foreground",
    success: "text-success-500",
    warning: "text-warning-500",
  };
  return (
    <div className="card p-4">
      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold">{title}</div>
      <div className={`text-xl font-semibold leading-tight mt-1 truncate tabular-nums ${tones[tone]}`}>{v}</div>
    </div>
  );
}

function Barra({ pct, label, tone = "neutral" }: { pct: number; label: string; tone?: "neutral" | "success" }) {
  const bar = tone === "success" ? "bg-success-500" : "bg-primary";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-14 h-1.5 bg-secondary dark:bg-white/[0.05] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }}/>
      </div>
      <span className="text-xs text-muted-foreground w-9 text-right tabular-nums">{label}</span>
    </div>
  );
}
