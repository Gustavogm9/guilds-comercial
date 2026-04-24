import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole, listarMembrosDaOrg } from "@/lib/supabase/org";
import FunilSectionExport from "@/components/funil-section-export";
import type { CrmStage, ForecastMes } from "@/lib/types";
import {
  TrendingDown, TrendingUp, Clock, DollarSign,
  Users, AlertTriangle, Target, Percent, Sparkles, Gauge
} from "lucide-react";

export const dynamic = "force-dynamic";

// Ordem canônica das etapas do pipeline (de topo para baixo no funil)
const ORDEM_ETAPAS: CrmStage[] = [
  "Prospecção",
  "Qualificado",
  "Raio-X Ofertado",
  "Raio-X Feito",
  "Call Marcada",
  "Diagnóstico Pago",
  "Proposta",
  "Negociação",
  "Fechado",
];

// cores por posição no funil
const CORES_ETAPA: Record<string, string> = {
  "Prospecção":       "bg-slate-400",
  "Qualificado":      "bg-sky-400",
  "Raio-X Ofertado":  "bg-cyan-400",
  "Raio-X Feito":     "bg-teal-500",
  "Call Marcada":     "bg-indigo-500",
  "Diagnóstico Pago": "bg-violet-500",
  "Proposta":         "bg-fuchsia-500",
  "Negociação":       "bg-amber-500",
  "Fechado":          "bg-emerald-500",
};

type FunilRow = { crm_stage: CrmStage; qtd: number; valor_aberto: number; valor_weighted: number; responsavel_id: string | null };
type TempoRow = { crm_stage: CrmStage; dias_media: number; dias_mediana: number; amostras: number; responsavel_id: string | null };
type ValorRow = { crm_stage: CrmStage; leads_abertos: number; valor_aberto: number; valor_weighted: number; valor_ganho: number; valor_perdido: number; prob_media: number; responsavel_id: string | null };
type CohortRow = { semana: string; entraram: number; ganhos: number; perdidos: number; nutricao: number; em_aberto: number; receita_ganha: number; dias_para_fechar: number | null; responsavel_id: string | null };
type PerdaRow = { motivo: string; qtd: number; valor_perdido: number; responsavel_id: string | null };

export default async function FunilPage({ searchParams }: {
  searchParams: { resp?: string };
}) {
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");
  const role = await getCurrentRole();
  const isGestor = role === "gestor";

  // Filtro de responsável: gestor escolhe; vendedor vê sempre o próprio
  const respFiltro = isGestor ? (searchParams.resp ?? "all") : me.id;

  const supabase = createClient();

  // Helpers para aplicar filtro
  const applyResp = <T,>(q: any): any =>
    respFiltro === "all" ? q : q.eq("responsavel_id", respFiltro);

  const [funilRes, tempoRes, valorRes, cohortRes, perdaRes, forecastRes, membros] = await Promise.all([
    applyResp(supabase.from("v_funil_conversao").select("*").eq("organizacao_id", orgId)),
    applyResp(supabase.from("v_tempo_por_etapa").select("*").eq("organizacao_id", orgId)),
    applyResp(supabase.from("v_valor_por_etapa").select("*").eq("organizacao_id", orgId)),
    applyResp(supabase.from("v_cohort_entrada").select("*").eq("organizacao_id", orgId).order("semana", { ascending: true })),
    applyResp(supabase.from("v_motivos_perda").select("*").eq("organizacao_id", orgId)),
    applyResp(supabase.from("v_forecast_mes").select("*").eq("organizacao_id", orgId)),
    listarMembrosDaOrg(orgId),
  ]);

  const funil = (funilRes.data ?? []) as FunilRow[];
  const tempo = (tempoRes.data ?? []) as TempoRow[];
  const valor = (valorRes.data ?? []) as ValorRow[];
  const cohorts = (cohortRes.data ?? []) as CohortRow[];
  const perdas = (perdaRes.data ?? []) as PerdaRow[];
  const forecast = (forecastRes.data ?? []) as ForecastMes[];
  const profs = membros.map(m => ({ id: m.profile_id, display_name: m.display_name }));

  // Agrega forecast quando filtro = todo o time
  const forecastAgg = forecast.reduce((acc, r) => ({
    forecast_best:   Number(acc.forecast_best)   + Number(r.forecast_best ?? 0),
    forecast_likely: Number(acc.forecast_likely) + Number(r.forecast_likely ?? 0),
    forecast_worst:  Number(acc.forecast_worst)  + Number(r.forecast_worst ?? 0),
    leads_altos:     acc.leads_altos     + (r.leads_altos ?? 0),
    leads_ativos:    acc.leads_ativos    + (r.leads_ativos ?? 0),
  }), { forecast_best: 0, forecast_likely: 0, forecast_worst: 0, leads_altos: 0, leads_ativos: 0 });

  // Agrega por etapa (soma entre responsáveis quando "todo o time")
  const funilPorEtapa = agregarPorEtapa(funil);
  const tempoPorEtapa = agregarTempoPorEtapa(tempo);
  const valorPorEtapa = agregarValorPorEtapa(valor);
  const cohortsAgregados = agregarCohort(cohorts);
  const perdasAgregadas = agregarPerdas(perdas);

  // Totais e métricas topline
  const topoFunil = funilPorEtapa.find(f => f.crm_stage === "Prospecção")?.qtd ?? 0;
  const ganhos = funilPorEtapa.find(f => f.crm_stage === "Fechado")?.qtd ?? 0;
  const perdidosTotal = funil.filter(f => f.crm_stage === "Perdido").reduce((s, r) => s + (r.qtd ?? 0), 0);
  const convGlobal = topoFunil > 0 ? (ganhos / topoFunil) * 100 : 0;
  const totalWeighted = valorPorEtapa.reduce((s, r) => s + Number(r.valor_weighted || 0), 0);
  const totalBruto = valorPorEtapa.reduce((s, r) => s + Number(r.valor_aberto || 0), 0);
  const receitaGanha = valor.reduce((s, r) => s + Number(r.valor_ganho || 0), 0);

  // Tempo médio total no funil (somando etapa por etapa o tempo médio)
  const etapasAtivas = ORDEM_ETAPAS.filter(e => e !== "Fechado");
  const tempoTotal = etapasAtivas.reduce((s, e) => {
    const t = tempoPorEtapa.find(x => x.crm_stage === e);
    return s + (t?.dias_media ?? 0);
  }, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funil</h1>
          <p className="text-sm text-slate-500">
            Conversão, tempo, valor e motivos de perda. Uma visão por onde os leads passam — e por onde somem.
          </p>
        </div>
        {isGestor && (
          <form className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Ver:</label>
            <select name="resp" defaultValue={respFiltro}
              className="input-base !text-xs w-44">
              <option value="all">Todo o time</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <button type="submit" className="btn-secondary text-xs">Filtrar</button>
          </form>
        )}
      </header>

      {/* Topline */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card title="Conversão global"
              v={`${convGlobal.toFixed(1)}%`}
              sub={`${ganhos} ganhos em ${topoFunil} leads`}
              icon={<Percent className="w-4 h-4"/>} tone="success" />
        <Card title="Pipeline weighted"
              v={moeda(totalWeighted)}
              sub={`bruto: ${moeda(totalBruto)}`}
              icon={<Target className="w-4 h-4"/>} />
        <Card title="Receita ganha"
              v={moeda(receitaGanha)}
              sub={`${ganhos} fechados`}
              icon={<DollarSign className="w-4 h-4"/>} tone="success" />
        <Card title="Tempo médio no funil"
              v={`${tempoTotal.toFixed(0)}d`}
              sub={`entrada → fechamento`}
              icon={<Clock className="w-4 h-4"/>} />
      </section>

      {/* Forecast do mês */}
      <section className="card p-5 mb-6 bg-gradient-to-br from-violet-50/50 to-indigo-50/30 border-indigo-100">
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Forecast dos próximos 30 dias
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Baseado em score de fechamento composto: etapa + ICP + decisor + voucher + velocidade + percepção + interações.
            </p>
          </div>
          <div className="text-xs text-slate-500 text-right">
            <div className="font-semibold text-indigo-700 text-sm">{forecastAgg.leads_ativos} leads ativos</div>
            <div>{forecastAgg.leads_altos} com score ≥ 70</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ForecastBox
            tone="worst"
            label="Pessimista"
            sub="Só Proposta + Negociação com score ≥ 50"
            v={moeda(forecastAgg.forecast_worst)}
          />
          <ForecastBox
            tone="likely"
            label="Provável"
            sub="Σ(valor × score/100) — previsão weighted"
            v={moeda(forecastAgg.forecast_likely)}
            featured
          />
          <ForecastBox
            tone="best"
            label="Otimista"
            sub="Todos com score ≥ 70 fecham"
            v={moeda(forecastAgg.forecast_best)}
          />
        </div>
      </section>

      {/* Funil visual */}
      <section className="card p-5 mb-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Funil de conversão</h2>
            <p className="text-xs text-slate-500">
              Quantos leads passam por cada etapa e qual % caem entre uma e outra.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <FunilSectionExport
              data={funilPorEtapa.map(f => ({ etapa: f.crm_stage, quantidade: f.qtd, valor_aberto: f.valor_aberto, valor_weighted: f.valor_weighted }))}
              filename="funil_conversao"
            />
            <div className="text-xs text-slate-500">
              Topo: <span className="font-semibold text-slate-900">{topoFunil}</span>
              {" · "}
              Fundo: <span className="font-semibold text-emerald-600">{ganhos}</span>
            </div>
          </div>
        </div>
        <FunilBarras etapas={ORDEM_ETAPAS} dados={funilPorEtapa} />
      </section>

      {/* Tempo e valor lado a lado */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Tempo médio em cada etapa</h2>
              <p className="text-xs text-slate-500">
                Gargalos em vermelho (acima da mediana de todas as etapas).
              </p>
            </div>
            <FunilSectionExport
              data={tempoPorEtapa.map(t => ({ etapa: t.crm_stage, dias_media: t.dias_media, amostras: t.amostras }))}
              filename="funil_tempo_etapa"
            />
          </div>
          <TempoLista etapas={ORDEM_ETAPAS.filter(e => e !== "Fechado")} dados={tempoPorEtapa} />
        </div>

        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Valor por etapa</h2>
              <p className="text-xs text-slate-500">
                Oportunidades abertas, ponderadas pela probabilidade da etapa.
              </p>
            </div>
            <FunilSectionExport
              data={valorPorEtapa.map(v => ({ etapa: v.crm_stage, leads: v.leads_abertos, valor_aberto: v.valor_aberto, valor_weighted: v.valor_weighted, prob_media: v.prob_media }))}
              filename="funil_valor_etapa"
            />
          </div>
          <ValorLista etapas={ORDEM_ETAPAS.filter(e => e !== "Fechado")} dados={valorPorEtapa} />
        </div>
      </section>

      {/* Cohort + motivos de perda */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Cohort de entrada (últimas semanas)</h2>
              <p className="text-xs text-slate-500">
                Quantos entraram e o que aconteceu com eles — ganho, perda, ainda aberto.
              </p>
            </div>
            <FunilSectionExport
              data={cohortsAgregados.map(c => ({ semana: c.semana, entraram: c.entraram, ganhos: c.ganhos, perdidos: c.perdidos, nutricao: c.nutricao, em_aberto: c.em_aberto, receita_ganha: c.receita_ganha }))}
              filename="funil_cohort"
            />
          </div>
          <CohortLista semanas={cohortsAgregados} />
        </div>

        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Motivos de perda</h2>
              <p className="text-xs text-slate-500">Por que o lead sumiu.</p>
            </div>
            <FunilSectionExport
              data={perdasAgregadas.map(p => ({ motivo: p.motivo, quantidade: p.qtd, valor_perdido: p.valor_perdido }))}
              filename="funil_motivos_perda"
            />
          </div>
          <PerdasLista perdas={perdasAgregadas} total={perdidosTotal} />
        </div>
      </section>

      <p className="text-xs text-slate-400 mt-6 text-center">
        Tempo em cada etapa é calculado a partir do histórico <code>lead_evento</code>.
        Quanto mais dados, mais precisa a média.
      </p>
    </div>
  );
}

// =============================================================
// Agregadores — somam múltiplas linhas (quando filtro = todo o time)
// =============================================================
function agregarPorEtapa(rows: FunilRow[]) {
  const map = new Map<string, { crm_stage: CrmStage; qtd: number; valor_aberto: number; valor_weighted: number }>();
  for (const r of rows) {
    const prev = map.get(r.crm_stage) ?? { crm_stage: r.crm_stage, qtd: 0, valor_aberto: 0, valor_weighted: 0 };
    prev.qtd += Number(r.qtd ?? 0);
    prev.valor_aberto += Number(r.valor_aberto ?? 0);
    prev.valor_weighted += Number(r.valor_weighted ?? 0);
    map.set(r.crm_stage, prev);
  }
  return Array.from(map.values());
}

function agregarTempoPorEtapa(rows: TempoRow[]) {
  const map = new Map<string, { crm_stage: CrmStage; dias_media: number; amostras: number }>();
  for (const r of rows) {
    const prev = map.get(r.crm_stage);
    const amostras = Number(r.amostras ?? 0);
    const media = Number(r.dias_media ?? 0);
    if (!prev) {
      map.set(r.crm_stage, { crm_stage: r.crm_stage, dias_media: media, amostras });
    } else {
      // Média ponderada por amostras
      const totalAmostras = prev.amostras + amostras;
      const novaMedia = totalAmostras > 0
        ? ((prev.dias_media * prev.amostras) + (media * amostras)) / totalAmostras
        : 0;
      map.set(r.crm_stage, { crm_stage: r.crm_stage, dias_media: Number(novaMedia.toFixed(1)), amostras: totalAmostras });
    }
  }
  return Array.from(map.values());
}

function agregarValorPorEtapa(rows: ValorRow[]) {
  const map = new Map<string, ValorRow>();
  for (const r of rows) {
    const prev = map.get(r.crm_stage);
    if (!prev) {
      map.set(r.crm_stage, { ...r });
    } else {
      map.set(r.crm_stage, {
        crm_stage: r.crm_stage,
        responsavel_id: null,
        leads_abertos: prev.leads_abertos + Number(r.leads_abertos ?? 0),
        valor_aberto: Number(prev.valor_aberto) + Number(r.valor_aberto ?? 0),
        valor_weighted: Number(prev.valor_weighted) + Number(r.valor_weighted ?? 0),
        valor_ganho: Number(prev.valor_ganho) + Number(r.valor_ganho ?? 0),
        valor_perdido: Number(prev.valor_perdido) + Number(r.valor_perdido ?? 0),
        prob_media: Number(r.prob_media ?? 0),
      });
    }
  }
  return Array.from(map.values());
}

function agregarCohort(rows: CohortRow[]) {
  const map = new Map<string, CohortRow>();
  for (const r of rows) {
    const prev = map.get(r.semana);
    if (!prev) {
      map.set(r.semana, { ...r });
    } else {
      map.set(r.semana, {
        semana: r.semana,
        responsavel_id: null,
        entraram: prev.entraram + r.entraram,
        ganhos: prev.ganhos + r.ganhos,
        perdidos: prev.perdidos + r.perdidos,
        nutricao: prev.nutricao + r.nutricao,
        em_aberto: prev.em_aberto + r.em_aberto,
        receita_ganha: Number(prev.receita_ganha) + Number(r.receita_ganha),
        dias_para_fechar: r.dias_para_fechar,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.semana.localeCompare(b.semana));
}

function agregarPerdas(rows: PerdaRow[]) {
  const map = new Map<string, { motivo: string; qtd: number; valor_perdido: number }>();
  for (const r of rows) {
    const prev = map.get(r.motivo) ?? { motivo: r.motivo, qtd: 0, valor_perdido: 0 };
    prev.qtd += Number(r.qtd ?? 0);
    prev.valor_perdido += Number(r.valor_perdido ?? 0);
    map.set(r.motivo, prev);
  }
  return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd);
}

// =============================================================
// Sub-componentes visuais
// =============================================================
function FunilBarras({ etapas, dados }: {
  etapas: CrmStage[];
  dados: Array<{ crm_stage: CrmStage; qtd: number }>;
}) {
  const maxQtd = Math.max(1, ...dados.map(d => d.qtd));
  const first = dados.find(d => d.crm_stage === etapas[0])?.qtd ?? 0;

  return (
    <div className="space-y-2">
      {etapas.map((e, i) => {
        const linha = dados.find(d => d.crm_stage === e);
        const qtd = linha?.qtd ?? 0;
        const prev = i > 0 ? (dados.find(d => d.crm_stage === etapas[i - 1])?.qtd ?? 0) : null;
        const convPrev = prev && prev > 0 ? (qtd / prev) * 100 : null;
        const convTotal = first > 0 ? (qtd / first) * 100 : 0;
        const width = (qtd / maxQtd) * 100;
        const cor = CORES_ETAPA[e] ?? "bg-slate-400";
        return (
          <div key={e} className="flex items-center gap-3">
            <div className="w-36 text-xs text-slate-600 text-right shrink-0">{e}</div>
            <div className="flex-1 relative h-8 bg-slate-50 rounded">
              <div
                className={`h-full rounded ${cor} transition-all flex items-center justify-end pr-2`}
                style={{ width: `${Math.max(6, width)}%` }}
              >
                <span className="text-xs font-semibold text-white">{qtd}</span>
              </div>
            </div>
            <div className="w-28 text-xs text-right shrink-0">
              {convPrev !== null ? (
                <span className={convPrev < 40 ? "text-rose-600" : convPrev < 70 ? "text-amber-600" : "text-emerald-600"}>
                  {convPrev.toFixed(0)}% ← etapa
                </span>
              ) : (
                <span className="text-slate-400">100% topo</span>
              )}
            </div>
            <div className="w-14 text-xs text-right text-slate-500 shrink-0">
              {convTotal.toFixed(0)}% tot.
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TempoLista({ etapas, dados }: {
  etapas: CrmStage[];
  dados: Array<{ crm_stage: CrmStage; dias_media: number; amostras: number }>;
}) {
  // mediana para flaggar gargalo
  const medias = etapas
    .map(e => dados.find(d => d.crm_stage === e)?.dias_media ?? 0)
    .filter(v => v > 0);
  const mediana = medias.length > 0
    ? medias.slice().sort((a, b) => a - b)[Math.floor(medias.length / 2)]
    : 0;
  const max = Math.max(1, ...medias);

  if (medias.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        <Clock className="w-6 h-6 mx-auto mb-2 text-slate-300"/>
        Sem histórico de transições ainda.<br/>
        <span className="text-xs">À medida que leads mudam de etapa, o tempo aparece aqui.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {etapas.map(e => {
        const row = dados.find(d => d.crm_stage === e);
        const dias = row?.dias_media ?? 0;
        const amostras = row?.amostras ?? 0;
        const isGargalo = mediana > 0 && dias > mediana * 1.5;
        const width = (dias / max) * 100;
        return (
          <div key={e} className="flex items-center gap-3">
            <div className="w-36 text-xs text-slate-600 text-right shrink-0">{e}</div>
            <div className="flex-1 relative h-6 bg-slate-50 rounded">
              <div
                className={`h-full rounded transition-all ${isGargalo ? "bg-rose-400" : "bg-slate-400"}`}
                style={{ width: `${Math.max(4, width)}%` }}
              />
            </div>
            <div className="w-24 text-xs text-right shrink-0">
              <span className={`font-semibold ${isGargalo ? "text-rose-600" : "text-slate-800"}`}>
                {dias.toFixed(1)}d
              </span>
              <span className="text-slate-400 text-[10px] ml-1">({amostras})</span>
            </div>
            {isGargalo && (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            )}
          </div>
        );
      })}
      <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100 mt-3">
        Mediana das etapas: <b>{mediana.toFixed(1)}d</b>. Gargalos marcados em vermelho.
      </div>
    </div>
  );
}

function ValorLista({ etapas, dados }: {
  etapas: CrmStage[];
  dados: Array<{ crm_stage: CrmStage; leads_abertos: number; valor_aberto: number; valor_weighted: number; prob_media: number }>;
}) {
  const max = Math.max(1, ...dados.map(d => Number(d.valor_aberto ?? 0)));

  return (
    <div className="space-y-2">
      {etapas.map(e => {
        const row = dados.find(d => d.crm_stage === e);
        const aberto = Number(row?.valor_aberto ?? 0);
        const weighted = Number(row?.valor_weighted ?? 0);
        const leads = Number(row?.leads_abertos ?? 0);
        const prob = Number(row?.prob_media ?? 0) * 100;
        const width = (aberto / max) * 100;
        return (
          <div key={e} className="flex items-center gap-3">
            <div className="w-36 text-xs text-slate-600 text-right shrink-0">{e}</div>
            <div className="flex-1 relative h-6 bg-slate-50 rounded">
              <div
                className="h-full rounded bg-indigo-400 transition-all"
                style={{ width: `${Math.max(4, width)}%` }}
              />
              <div
                className="absolute top-0 left-0 h-full rounded bg-indigo-600 opacity-80"
                style={{ width: `${Math.max(1, (weighted / max) * 100)}%` }}
              />
            </div>
            <div className="w-40 text-xs text-right shrink-0">
              <div className="font-semibold text-slate-800">{moedaCurta(aberto)}</div>
              <div className="text-[10px] text-slate-500">
                {leads} leads · {prob.toFixed(0)}% prob
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-2 border-t border-slate-100 mt-3">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 bg-indigo-400 rounded-sm"/> Valor bruto
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 bg-indigo-600 rounded-sm"/> Weighted (× prob)
        </span>
      </div>
    </div>
  );
}

function CohortLista({ semanas }: { semanas: CohortRow[] }) {
  if (semanas.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        <Users className="w-6 h-6 mx-auto mb-2 text-slate-300"/>
        Sem leads suficientes nas últimas 26 semanas.
      </div>
    );
  }
  const ultimas = semanas.slice(-12);
  const maxEntrou = Math.max(1, ...ultimas.map(s => s.entraram));

  return (
    <div className="space-y-1.5">
      {ultimas.map(s => {
        const totalFechados = s.ganhos + s.perdidos;
        const convCohort = s.entraram > 0 ? (s.ganhos / s.entraram) * 100 : 0;
        return (
          <div key={s.semana} className="flex items-center gap-3 text-xs">
            <div className="w-20 text-slate-500 shrink-0">{fmtSemana(s.semana)}</div>
            <div className="flex-1 relative h-6 bg-slate-50 rounded overflow-hidden flex">
              {/* Stacked bar: ganho / perdido / nutrição / aberto */}
              {s.ganhos > 0 && (
                <div className="h-full bg-emerald-500 flex items-center justify-center text-white text-[10px]"
                     style={{ width: `${(s.ganhos / maxEntrou) * 100}%` }}
                     title={`${s.ganhos} ganhos`}>
                  {s.ganhos > 1 ? s.ganhos : ""}
                </div>
              )}
              {s.perdidos > 0 && (
                <div className="h-full bg-rose-400 flex items-center justify-center text-white text-[10px]"
                     style={{ width: `${(s.perdidos / maxEntrou) * 100}%` }}
                     title={`${s.perdidos} perdidos`}>
                  {s.perdidos > 1 ? s.perdidos : ""}
                </div>
              )}
              {s.nutricao > 0 && (
                <div className="h-full bg-amber-300 flex items-center justify-center text-white text-[10px]"
                     style={{ width: `${(s.nutricao / maxEntrou) * 100}%` }}
                     title={`${s.nutricao} nutrição`} />
              )}
              {s.em_aberto > 0 && (
                <div className="h-full bg-sky-400 flex items-center justify-center text-white text-[10px]"
                     style={{ width: `${(s.em_aberto / maxEntrou) * 100}%` }}
                     title={`${s.em_aberto} em aberto`}>
                  {s.em_aberto > 1 ? s.em_aberto : ""}
                </div>
              )}
            </div>
            <div className="w-20 text-right shrink-0">
              <span className="font-medium text-slate-700">{s.entraram}</span>
              <span className="text-slate-400 ml-1">leads</span>
            </div>
            <div className="w-16 text-right text-slate-500 shrink-0">
              {totalFechados > 0 ? `${convCohort.toFixed(0)}%` : "—"}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-2 border-t border-slate-100 mt-2 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500 rounded-sm"/> Ganho</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-rose-400 rounded-sm"/> Perdido</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-300 rounded-sm"/> Nutrição</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-sky-400 rounded-sm"/> Em aberto</span>
      </div>
    </div>
  );
}

function PerdasLista({ perdas, total }: { perdas: Array<{ motivo: string; qtd: number; valor_perdido: number }>; total: number }) {
  if (perdas.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">
        <TrendingDown className="w-6 h-6 mx-auto mb-2 text-slate-300"/>
        Sem leads perdidos ainda — 🙂
      </div>
    );
  }
  const max = Math.max(1, ...perdas.map(p => p.qtd));
  const valorTotal = perdas.reduce((s, p) => s + Number(p.valor_perdido ?? 0), 0);

  return (
    <div className="space-y-2">
      {perdas.slice(0, 6).map(p => {
        const pct = total > 0 ? (p.qtd / total) * 100 : 0;
        return (
          <div key={p.motivo} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 truncate">{p.motivo}</span>
              <span className="text-xs text-slate-500 shrink-0">
                <b className="text-slate-800">{p.qtd}</b> · {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
              <div className="h-full bg-rose-400 rounded-full" style={{ width: `${(p.qtd / max) * 100}%` }}/>
            </div>
          </div>
        );
      })}
      <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 mt-3">
        Total perdido: <b className="text-rose-600">{moedaCurta(valorTotal)}</b> em {total} leads
      </div>
    </div>
  );
}

// =============================================================
// Card topline
// =============================================================
function Card({ title, v, sub, icon, tone = "neutral" }: {
  title: string; v: string; sub?: string; icon?: React.ReactNode;
  tone?: "neutral" | "success" | "warning";
}) {
  const tones = {
    neutral: "text-slate-900",
    success: "text-emerald-700",
    warning: "text-amber-700",
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
        {icon} {title}
      </div>
      <div className={`text-2xl font-semibold leading-tight mt-1.5 ${tones[tone]}`}>{v}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// Forecast box
function ForecastBox({ tone, label, sub, v, featured = false }: {
  tone: "best" | "likely" | "worst";
  label: string; sub: string; v: string; featured?: boolean;
}) {
  const tones = {
    best:   { bg: "bg-emerald-50",  border: "border-emerald-200",  text: "text-emerald-700",  icon: <TrendingUp className="w-4 h-4"/> },
    likely: { bg: "bg-indigo-50",   border: "border-indigo-300",   text: "text-indigo-700",   icon: <Target className="w-4 h-4"/> },
    worst:  { bg: "bg-slate-50",    border: "border-slate-200",    text: "text-slate-700",    icon: <Gauge className="w-4 h-4"/> },
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${tones.bg} ${tones.border} ${featured ? "ring-2 ring-indigo-400 ring-offset-2" : ""}`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${tones.text}`}>
        {tones.icon} {label}
      </div>
      <div className={`text-2xl font-bold mt-1.5 ${tones.text}`}>{v}</div>
      <div className="text-[11px] text-slate-500 mt-1.5 leading-tight">{sub}</div>
    </div>
  );
}

// =============================================================
// Helpers
// =============================================================
function moeda(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  });
}

function moedaCurta(n: number): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function fmtSemana(s: string): string {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
