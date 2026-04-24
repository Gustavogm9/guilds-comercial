import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import LeadDetailActions from "@/components/lead-detail-actions";
import LeadScoreCard from "@/components/lead-score-card";
import CadenciaPassoCard from "@/components/cadencia-passo-card";
import { STAGE_COLORS } from "@/lib/lists";
import type { LeadEnriched, LeadScore } from "@/lib/types";
import { ChevronLeft, MessageSquare, PhoneCall, FileText, MapPin, Briefcase, User2, Phone, Mail, Linkedin } from "lucide-react";

// Calcula breakdown do score — mesma lógica do SQL, replicada aqui pra mostrar visualmente.
function calcularBreakdown(lead: LeadEnriched, raioxPago: boolean, ultimasLigacoes: Array<{ tom_interacao: string | null }>) {
  // Etapa (25)
  const etapaMap: Record<string, number> = {
    "Prospecção": 2, "Qualificado": 5, "Raio-X Ofertado": 8, "Raio-X Feito": 12,
    "Call Marcada": 14, "Diagnóstico Pago": 18, "Proposta": 21, "Negociação": 25,
    "Fechado": 25, "Perdido": 0, "Nutrição": 3,
  };
  const etapa = lead.crm_stage ? (etapaMap[lead.crm_stage] ?? 0) : 0;
  // Fit (10)
  const fit_icp = lead.fit_icp === true ? 10 : lead.fit_icp === false ? 0 : 3;
  // Decisor (8)
  const decisor = lead.decisor === true ? 8 : lead.decisor === false ? 0 : 2;
  // Temperatura (10)
  const tempMap: Record<string, number> = { Quente: 10, Morno: 5, Frio: 1 };
  const temperatura = tempMap[lead.temperatura] ?? 3;
  // Raio-X pago (10)
  const voucher = raioxPago ? 10 : 0;
  // Velocidade (12)
  const dias = lead.dias_sem_tocar ?? 0;
  const velocidade = Math.max(0, 12 - Math.min(12, Math.floor(dias / 2)));
  // Percepção (15)
  const percMap: Record<string, number> = {
    "Muito alta": 15, Alta: 11, Média: 6, Baixa: 2, "Muito baixa": 0,
  };
  const percepcao = lead.percepcao_vendedor ? (percMap[lead.percepcao_vendedor] ?? 5) : 5;
  // Interações (10)
  const pos = ultimasLigacoes.slice(0, 3).filter(l => l.tom_interacao === "positivo").length;
  const neg = ultimasLigacoes.slice(0, 3).filter(l => l.tom_interacao === "negativo").length;
  let interacoes = 3;
  if (pos >= 2) interacoes = 10;
  else if (pos === 1 && neg === 0) interacoes = 7;
  else if (pos === 0 && neg === 0) interacoes = 4;
  else if (neg === 1 && pos === 1) interacoes = 5;
  else if (neg >= 2) interacoes = 0;
  return { etapa, fit_icp, decisor, temperatura, voucher, velocidade, percepcao, interacoes };
}

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();

  const [{ data: leadRow }, { data: ligacoes }, { data: cadencia }, { data: raiox }, { data: eventos }, { data: scoreRow }] =
    await Promise.all([
      supabase.from("v_leads_enriched").select("*").eq("organizacao_id", orgId).eq("id", id).maybeSingle(),
      supabase.from("ligacoes").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("data_hora", { ascending: false }),
      supabase.from("cadencia").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("passo"),
      supabase.from("raio_x").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("lead_evento").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("v_lead_score").select("*").eq("organizacao_id", orgId).eq("id", id).maybeSingle(),
    ]);

  if (!leadRow) notFound();
  const lead = leadRow as LeadEnriched;
  const score = scoreRow as LeadScore | null;
  const stage = lead.crm_stage ? STAGE_COLORS[lead.crm_stage] : null;

  // Breakdown (idempotente com a função SQL lead_score_fechamento)
  const raioxPago = (raiox ?? []).some((r: { status_oferta?: string }) =>
    r.status_oferta === "Pago" || r.status_oferta === "Concluído");
  const breakdown = calcularBreakdown(
    lead,
    raioxPago,
    (ligacoes ?? []).map((l: { tom_interacao: string | null }) => ({ tom_interacao: l.tom_interacao })),
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href="/pipeline" className="btn-ghost text-xs mb-3"><ChevronLeft className="w-3.5 h-3.5"/> Voltar ao pipeline</Link>

      <div className="card p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {lead.empresa || lead.nome || "(sem nome)"}
              </h1>
              {lead.is_demo && <span className="text-[10px] uppercase bg-amber-50 text-warning-500 px-2 py-0.5 rounded border border-amber-200">demo</span>}
              {lead.crm_stage && stage && (
                <span className={`text-xs px-2 py-1 rounded border ${stage.bg} ${stage.text} ${stage.border}`}>
                  {lead.crm_stage}
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              {lead.nome && <span>{lead.nome}{lead.cargo && ` · ${lead.cargo}`}</span>}
              {lead.responsavel_nome && <span> · resp: {lead.responsavel_nome}</span>}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <LeadDetailActions lead={lead} vendedor={me.display_name} />
        </div>

        {/* Dados do lead */}
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 mt-6 text-sm">
          <Field icon={Briefcase} label="Segmento" value={lead.segmento} />
          <Field icon={MapPin}    label="Cidade/UF" value={lead.cidade_uf} />
          <Field icon={Phone}     label="WhatsApp" value={lead.whatsapp} />
          <Field icon={Mail}      label="Email" value={lead.email} />
          <Field icon={Linkedin}  label="LinkedIn" value={lead.linkedin} />
          <Field icon={User2}     label="Decisor?" value={lead.decisor === true ? "Sim" : lead.decisor === false ? "Não" : "—"} />
        </div>

        <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
          <KV label="Próxima ação" v={lead.proxima_acao ?? "—"} sub={lead.data_proxima_acao ? fmt(lead.data_proxima_acao) : ""} />
          <KV label="Último toque" v={lead.data_ultimo_toque ? fmt(lead.data_ultimo_toque) : "—"}
              sub={lead.dias_sem_tocar > 0 ? `${lead.dias_sem_tocar}d sem tocar` : ""} />
          <KV label="Valor potencial" v={(lead.valor_potencial ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              sub={`${Math.round((lead.probabilidade ?? 0)*100)}% prob · ${(lead.receita_ponderada ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} ponderado`} />
        </div>

        {lead.dor_principal && (
          <div className="mt-4">
            <div className="label">Dor principal</div>
            <p className="text-sm mt-1">{lead.dor_principal}</p>
          </div>
        )}
        {lead.observacoes && (
          <div className="mt-4">
            <div className="label">Observações</div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{lead.observacoes}</p>
          </div>
        )}
      </div>

      {/* Score de fechamento — só para leads ativos no pipeline */}
      {lead.funnel_stage === "pipeline" && lead.crm_stage !== "Fechado" && lead.crm_stage !== "Perdido" && (
        <section className="mt-6">
          <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 mb-2">
            Potencial de fechamento
          </h2>
          <LeadScoreCard
            leadId={lead.id}
            score={score?.score ?? 0}
            valorPotencial={lead.valor_potencial ?? 0}
            valorEsperado={score?.valor_esperado_score ?? 0}
            breakdown={breakdown}
            percepcaoAtual={lead.percepcao_vendedor}
            temLigacoes={(ligacoes ?? []).length > 0}
            empresa={lead.empresa ?? "—"}
            crmStage={lead.crm_stage ?? "—"}
            diasSemTocar={lead.dias_sem_tocar ?? 0}
            ultimaInteracao={(ligacoes ?? [])[0]?.resultado ?? "Sem interações"}
            tomAnterior={(ligacoes ?? [])[0]?.tom_interacao ?? "neutro"}
            dorPrincipal={lead.dor_principal ?? "Não registrada"}
            cadenciaPendente={
              (cadencia ?? [])
                .find((c: { status: string }) => c.status === "pendente")
                ? "Sim"
                : "Nenhuma"
            }
          />
        </section>
      )}

      {/* Cadência */}
      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 mb-2">Cadência</h2>
        <div className="card p-3 md:p-4">
          {(cadencia?.length ?? 0) === 0 && <p className="text-sm text-slate-500">Nenhum passo de cadência registrado.</p>}
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(["D0","D3","D7","D11","D16","D30"] as const).map(p => {
              const c = (cadencia ?? []).find((x: any) => x.passo === p);
              return (
                <CadenciaPassoCard
                  key={p}
                  passo={p}
                  status={c?.status ?? "pendente"}
                  objetivo={c?.objetivo ?? "—"}
                  canal={c?.canal ?? "Email"}
                  dataPrevista={c?.data_prevista ?? ""}
                  leadId={lead.id}
                  empresa={lead.empresa ?? "—"}
                  nome={lead.nome ?? "—"}
                  cargo={lead.cargo ?? undefined}
                  dorPrincipal={lead.dor_principal ?? undefined}
                  ultimaInteracao={(ligacoes ?? [])[0]?.resultado ?? "Sem interações"}
                  tomAnterior={(ligacoes ?? [])[0]?.tom_interacao ?? null}
                  raioxStatus={(raiox ?? [])[0]?.status_oferta ?? "Não ofertado"}
                  raioxScore={(raiox ?? [])[0]?.score ?? undefined}
                  vendedor={me.display_name}
                  whatsapp={lead.whatsapp ?? undefined}
                />
              );
            })}
          </ul>
        </div>
      </section>

      {/* Ligações */}
      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 mb-2 flex items-center gap-1">
          <PhoneCall className="w-3.5 h-3.5"/> Ligações ({(ligacoes ?? []).length})
        </h2>
        <div className="card divide-y">
          {(ligacoes ?? []).length === 0 && <p className="p-4 text-sm text-slate-500">Sem ligações registradas.</p>}
          {(ligacoes ?? []).map((l: any) => (
            <div key={l.id} className="p-3 text-sm flex items-start gap-3">
              <div className="text-xs text-slate-500 w-28 shrink-0">{fmtDateTime(l.data_hora)}</div>
              <div className="flex-1">
                <div className="font-medium">{l.resultado}</div>
                {l.observacoes && <div className="text-slate-500 text-xs mt-0.5">{l.observacoes}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Raio-X */}
      {(raiox ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 mb-2 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5"/> Raio-X
          </h2>
          <div className="card p-4 grid md:grid-cols-3 gap-4 text-sm">
            <KV label="Score" v={String((raiox ?? [])[0].score ?? "—")} sub={(raiox ?? [])[0].nivel ?? ""}/>
            <KV label="Perda anual estim." v={((raiox ?? [])[0].perda_anual_estimada ?? 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}/>
            <KV label="Pago" v={(raiox ?? [])[0].pago ? "Sim" : "Não"}
                sub={(raiox ?? [])[0].preco_final?.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}/>
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="mt-6">
        <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-500 mb-2 flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5"/> Timeline
        </h2>
        <div className="card divide-y">
          {(eventos ?? []).length === 0 && <p className="p-4 text-sm text-slate-500">Sem eventos.</p>}
          {(eventos ?? []).map((ev: any) => (
            <div key={ev.id} className="p-3 text-sm flex items-start gap-3">
              <div className="text-xs text-slate-500 w-28 shrink-0">{fmtDateTime(ev.created_at)}</div>
              <div className="flex-1">
                <span className="text-xs uppercase tracking-wider text-slate-500 mr-2">{ev.tipo}</span>
                <span>{summarizePayload(ev.payload)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0"/>
      <span className="text-xs uppercase tracking-wider text-slate-500 w-24 shrink-0">{label}</span>
      <span className="truncate">{value || "—"}</span>
    </div>
  );
}
function KV({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-base font-medium leading-tight mt-0.5">{v}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function summarizePayload(p: any) {
  if (!p) return "";
  if (p.para)        return `→ ${p.para}`;
  if (p.resultado)   return p.resultado;
  if (p.canal)       return `${p.canal}${p.passo ? ` (${p.passo})` : ""}${p.obs ? ` — ${p.obs}` : ""}`;
  return JSON.stringify(p);
}
