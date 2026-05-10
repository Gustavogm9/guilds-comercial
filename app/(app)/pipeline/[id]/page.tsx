import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import LeadDetailActions from "@/components/lead-detail-actions";
import LeadScoreCard from "@/components/lead-score-card";
import CadenciaPassoCard from "@/components/cadencia-passo-card";
import NextActionCard from "@/components/next-action-card";
import PedidoIndicacaoBanner from "@/components/pedido-indicacao-banner";
import RenovacaoConfigCard from "@/components/renovacao-config-card";
import LeadTimeline360 from "@/components/lead-timeline-360";
import LeadProdutosWidget from "@/components/lead-produtos-widget";
import type { TimelineEvento } from "@/components/lead-timeline-360";
import { STAGE_COLORS } from "@/lib/lists";
import type { LeadEnriched, LeadScore } from "@/lib/types";
import { ChevronLeft, PhoneCall, FileText, MapPin, Briefcase, User2, Phone, Mail, Linkedin } from "lucide-react";
import ObjectionHandler from "@/components/objection-handler";
import { getServerLocale, getT, type Locale } from "@/lib/i18n";

/**
 * Detalhe do lead — visão completa pra trabalhar pipeline.
 *
 * Fixes desta rodada:
 *   - Bug 6: validação estrita do params.id (regex em vez de parseInt loose)
 *   - Robustez 11: limit(50) em ligações
 *   - Robustez 12: comentário sobre drift do calcularBreakdown vs SQL
 *   - i18n 18, 21, 22: strings + summarizePayload + fmt usando locale
 *   - i18n 23: currency lê de organizacoes.moeda_padrao
 *   - UX 31: header com sticky (TODO em rodada futura)
 *   - A11y 36: select etapa com aria-label
 *
 * DÍVIDA conhecida:
 *   - Item 12: `calcularBreakdown` duplica lógica de `lead_score_fechamento()` SQL.
 *     Drift se SQL evoluir e este JS não. Fix futuro: criar view
 *     `v_lead_score_breakdown` retornando os 8 fatores já calculados.
 *   - Item 38: 6 queries em paralelo. Fix futuro: view única `v_lead_detail`
 *     consolidando tudo num round-trip.
 */
function calcularBreakdown(lead: LeadEnriched, raioxPago: boolean, ultimasLigacoes: Array<{ tom_interacao: string | null }>) {
  const etapaMap: Record<string, number> = {
    "Prospecção": 2, "Qualificado": 5, "Raio-X Ofertado": 8, "Raio-X Feito": 12,
    "Call Marcada": 14, "Diagnóstico Pago": 18, "Proposta": 21, "Negociação": 25,
    "Fechado": 25, "Perdido": 0, "Nutrição": 3,
  };
  const etapa = lead.crm_stage ? (etapaMap[lead.crm_stage] ?? 0) : 0;
  const fit_icp = lead.fit_icp === true ? 10 : lead.fit_icp === false ? 0 : 3;
  const decisor = lead.decisor === true ? 8 : lead.decisor === false ? 0 : 2;
  const tempMap: Record<string, number> = { Quente: 10, Morno: 5, Frio: 1 };
  const temperatura = tempMap[lead.temperatura] ?? 3;
  const voucher = raioxPago ? 10 : 0;
  const dias = lead.dias_sem_tocar ?? 0;
  const velocidade = Math.max(0, 12 - Math.min(12, Math.floor(dias / 2)));
  const percMap: Record<string, number> = {
    "Muito alta": 15, Alta: 11, Média: 6, Baixa: 2, "Muito baixa": 0,
  };
  const percepcao = lead.percepcao_vendedor ? (percMap[lead.percepcao_vendedor] ?? 5) : 5;
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

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const locale = await getServerLocale();
  const t = getT(locale);

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  // Bug 6: validação estrita — parseInt aceita "123abc" silenciosamente
  if (!/^\d+$/.test(params.id)) notFound();
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();

  // i18n 23: currency da org (default BRL)
  const { data: orgRow } = await supabase
    .from("organizacoes")
    .select("moeda_padrao")
    .eq("id", orgId)
    .maybeSingle();
  const currency = ((orgRow as any)?.moeda_padrao as string) || "BRL";

  // Robustez 11: limit(50) em ligações pra não estourar payload em leads com muitas calls
  const [
    { data: leadRow },
    { data: ligacoes },
    { data: cadencia },
    { data: raiox },
    { data: eventos },
    { data: scoreRow },
    { data: pedidosIndicacaoPendentes },
    { data: timeline360 },
    { data: leadProdutosData },
    { data: todosProdutosData },
  ] = await Promise.all([
    supabase.from("v_leads_enriched").select("*").eq("organizacao_id", orgId).eq("id", id).maybeSingle(),
    supabase.from("ligacoes").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("data_hora", { ascending: false }).limit(50),
    supabase.from("cadencia").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("passo"),
    supabase.from("raio_x").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("lead_evento").select("*").eq("organizacao_id", orgId).eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("v_lead_score").select("*").eq("organizacao_id", orgId).eq("id", id).maybeSingle(),
    supabase
      .from("pedidos_indicacao")
      .select("id, data_pedido, momento, observacoes")
      .eq("organizacao_id", orgId)
      .eq("lead_id", id)
      .eq("status", "pendente")
      .order("data_pedido", { ascending: true }),
    supabase
      .from("lead_timeline")
      .select("id, tipo, titulo, conteudo, resumo_ia, metadata, ref_id, ref_tabela, criado_por, created_at, profiles(display_name)")
      .eq("lead_id", id)
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("lead_produtos")
      .select("lead_id, produto_id, status, produtos(nome, categoria, recorrente)")
      .eq("lead_id", id),
    supabase.from("produtos")
      .select("id, nome, categoria")
      .eq("organizacao_id", orgId)
      .eq("ativo", true)
      .order("ordem"),
  ]);

  if (!leadRow) notFound();
  const lead = leadRow as LeadEnriched;
  const leadProdutos = (leadProdutosData ?? []) as any[];
  const todosProdutos = (todosProdutosData ?? []) as { id: number; nome: string; categoria?: string }[];
  const score = scoreRow as LeadScore | null;
  const stage = lead.crm_stage ? STAGE_COLORS[lead.crm_stage] : null;
  const stageLabel = lead.crm_stage ? t(`pipeline_etapas.${lead.crm_stage}`) : null;

  const raioxPago = (raiox ?? []).some((r: { status_oferta?: string }) =>
    r.status_oferta === "Pago" || r.status_oferta === "Concluído");
  const breakdown = calcularBreakdown(
    lead,
    raioxPago,
    (ligacoes ?? []).map((l: { tom_interacao: string | null }) => ({ tom_interacao: l.tom_interacao })),
  );

  // Busca outras oportunidades da mesma empresa
  let outrasOportunidades: LeadEnriched[] = [];
  if (lead.empresa) {
    const { data } = await supabase
      .from("v_leads_enriched")
      .select("*")
      .eq("organizacao_id", orgId)
      .eq("empresa", lead.empresa)
      .neq("id", id)
      .order("created_at", { ascending: false });
    if (data) outrasOportunidades = data as LeadEnriched[];
  }

  // Helper para formatação de data curta
  const fmt = (d: string, l: string) => {
    return new Date(d).toLocaleDateString(l, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <Link href="/pipeline" className="btn-ghost text-xs mb-3">
        <ChevronLeft className="w-3.5 h-3.5"/> {t("pipeline.detail_voltar")}
      </Link>

      <div className="card p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {lead.empresa || lead.nome || t("pipeline.card_sem_nome")}
              </h1>
              {lead.is_demo && (
                <span className="text-[10px] uppercase tracking-[0.12em] bg-warning-500/10 text-warning-500 px-2 py-0.5 rounded border border-warning-500/25">
                  {t("pipeline.detail_demo_badge")}
                </span>
              )}
              {lead.crm_stage && stage && (
                <span className={`text-xs px-2 py-1 rounded border ${stage.bg} ${stage.text} ${stage.border}`}>
                  {stageLabel}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {lead.nome && <span>{lead.nome}{lead.cargo && ` · ${lead.cargo}`}</span>}
              {lead.responsavel_nome && <span> · resp: {lead.responsavel_nome}</span>}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <LeadDetailActions lead={lead} vendedor={me.display_name} />
          {/* Produtos de interesse — widget de tags de produto */}
          {todosProdutos.length > 0 && (
            <div className="mt-3">
              <LeadProdutosWidget
                leadId={lead.id}
                leadProdutosIniciais={leadProdutos}
                produtos={todosProdutos}
              />
            </div>
          )}
          {/* Banner de pedido de indicação pendente — só aparece se houver. */}
          {pedidosIndicacaoPendentes && pedidosIndicacaoPendentes.length > 0 && (
            <div className="mt-3">
              <PedidoIndicacaoBanner
                pedidos={(pedidosIndicacaoPendentes as Array<{
                  id: number;
                  data_pedido: string;
                  momento: string;
                  observacoes: string | null;
                }>).map((p) => ({
                  pedido_id: p.id,
                  data_pedido: p.data_pedido,
                  momento: p.momento,
                  observacoes: p.observacoes,
                }))}
                empresaLead={lead.empresa}
              />
            </div>
          )}
          {/* Card de próxima ação recomendada por etapa — orienta o vendedor */}
          <NextActionCard crmStage={lead.crm_stage} leadId={lead.id} />

          {/* P5: Configuração de renovação automática (só aparece em Fechado) */}
          <RenovacaoConfigCard
            lead={{
              lead_id: lead.id,
              crm_stage: lead.crm_stage,
              data_renovacao: (lead as any).data_renovacao ?? null,
              ciclo_renovacao_meses: (lead as any).ciclo_renovacao_meses ?? null,
              valor_renovacao: (lead as any).valor_renovacao ?? null,
              valor_potencial: lead.valor_potencial ?? null,
            }}
          />
        </div>

        {/* Dados do lead */}
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 mt-6 text-sm">
          <Field icon={Briefcase} label={t("pipeline.detail_field_segmento")} value={lead.segmento} />
          <Field icon={MapPin}    label={t("pipeline.detail_field_cidade")}   value={lead.cidade_uf} />
          <Field icon={Phone}     label={t("pipeline.detail_field_whatsapp")} value={lead.whatsapp} />
          <Field icon={Mail}      label={t("pipeline.detail_field_email")}    value={lead.email} />
          <Field icon={Linkedin}  label={t("pipeline.detail_field_linkedin")} value={lead.linkedin} />
          <Field
            icon={User2}
            label={t("pipeline.detail_decisor_label")}
            value={lead.decisor === true ? t("pipeline.detail_decisor_sim") : lead.decisor === false ? t("pipeline.detail_decisor_nao") : "—"}
          />
        </div>

        <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
          <KV
            label={t("pipeline.detail_proxima_acao")}
            v={lead.proxima_acao ?? "—"}
            sub={lead.data_proxima_acao ? fmt(lead.data_proxima_acao, locale) : ""}
          />
          <KV
            label={t("pipeline.detail_ultimo_toque")}
            v={lead.data_ultimo_toque ? fmt(lead.data_ultimo_toque, locale) : "—"}
            sub={lead.dias_sem_tocar > 0 ? t("hoje.lead_dias_sem_tocar").replace("{{n}}", String(lead.dias_sem_tocar)) : ""}
          />
          <KV
            label={t("pipeline.detail_valor_potencial")}
            v={(lead.valor_potencial ?? 0).toLocaleString(locale, { style: "currency", currency })}
            sub={`${t("pipeline.detail_prob").replace("{{n}}", String(Math.round((lead.probabilidade ?? 0)*100)))} · ${t("pipeline.detail_ponderado").replace("{{v}}", (lead.receita_ponderada ?? 0).toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 }))}`}
          />
          {lead.valor_setup > 0 && (
            <KV
              label="Valor de Setup"
              v={lead.valor_setup.toLocaleString(locale, { style: "currency", currency })}
            />
          )}
          {lead.valor_mensal > 0 && (
            <KV
              label="Mensalidade / MRR"
              v={lead.valor_mensal.toLocaleString(locale, { style: "currency", currency })}
            />
          )}
        </div>

        {lead.link_proposta && (
          <div className="mt-4 border-t border-border/50 pt-4">
            <div className="label mb-2">Proposta</div>
            <a href={lead.link_proposta} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex items-center gap-1.5 px-3 py-1.5">
              🔗 Acessar Proposta Original
            </a>
          </div>
        )}

        {lead.dor_principal && (
          <div className="mt-4">
            <div className="label">{t("pipeline.detail_dor_principal")}</div>
            <p className="text-sm mt-1">{lead.dor_principal}</p>
          </div>
        )}
        {lead.observacoes && (
          <div className="mt-4">
            <div className="label">{t("pipeline.detail_observacoes")}</div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{lead.observacoes}</p>
          </div>
        )}

        {/* --- Potencial Agregado da Empresa --- */}
        {outrasOportunidades.length > 0 && (
          <div className="mt-8 border border-border/50 rounded-lg p-4 bg-secondary/20">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" />
              Histórico da Empresa: {lead.empresa}
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xs text-muted-foreground">LTV Potencial (Todas)</div>
                <div className="text-sm font-medium">
                  {(
                    (lead.valor_potencial ?? 0) + 
                    outrasOportunidades.reduce((acc, curr) => acc + (curr.valor_potencial ?? 0), 0)
                  ).toLocaleString(locale, { style: "currency", currency })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Projetos Fechados</div>
                <div className="text-sm font-medium">
                  {outrasOportunidades.filter(o => o.crm_stage === "Fechado").length + (lead.crm_stage === "Fechado" ? 1 : 0)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Setup Agregado</div>
                <div className="text-sm font-medium">
                  {(
                    (lead.valor_setup ?? 0) + 
                    outrasOportunidades.reduce((acc, curr) => acc + (curr.valor_setup ?? 0), 0)
                  ).toLocaleString(locale, { style: "currency", currency })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">MRR Agregado</div>
                <div className="text-sm font-medium">
                  {(
                    (lead.valor_mensal ?? 0) + 
                    outrasOportunidades.reduce((acc, curr) => acc + (curr.valor_mensal ?? 0), 0)
                  ).toLocaleString(locale, { style: "currency", currency })}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Outras Oportunidades:</div>
              {outrasOportunidades.map(op => (
                <Link key={op.id} href={`/pipeline/${op.id}`} className="flex items-center justify-between p-2 rounded hover:bg-secondary/40 border border-transparent hover:border-border/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${STAGE_COLORS[op.crm_stage ?? "Base"]?.bg ?? "bg-border"}`} />
                    <div>
                      <div className="text-sm font-medium">{op.nome} {op.cargo ? `(${op.cargo})` : ""}</div>
                      <div className="text-xs text-muted-foreground">{op.crm_stage} · Criado em {fmt(op.created_at, locale)}</div>
                    </div>
                  </div>
                  <div className="text-sm text-right">
                    <div>{(op.valor_potencial ?? 0).toLocaleString(locale, { style: "currency", currency })}</div>
                    <div className="text-xs text-muted-foreground">Resp: {op.responsavel_nome ?? "—"}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Score de fechamento — só para leads ativos no pipeline */}
      {lead.funnel_stage === "pipeline" && lead.crm_stage !== "Fechado" && lead.crm_stage !== "Perdido" && (
        <section className="mt-6">
          <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
            {t("pipeline.detail_potencial_fechamento")}
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

      {/* Contorno de objeções + link para proposta */}
      {lead.funnel_stage === "pipeline" && lead.crm_stage !== "Fechado" && lead.crm_stage !== "Perdido" && (
        <section className="mt-6 space-y-4">
          <ObjectionHandler leadId={lead.id} empresa={lead.empresa} segmento={lead.segmento} />
          {(lead.crm_stage === "Proposta" || lead.crm_stage === "Negociação") && (
            <Link href={`/proposta/${lead.id}`} className="btn-secondary text-xs inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> {t("pipeline.actions_proposta_ai")}
            </Link>
          )}
        </section>
      )}

      {/* Cadência */}
      <section className="mt-6">
        <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
          {t("pipeline.detail_section_cadencia")}
        </h2>
        <div className="card p-3 md:p-4">
          {(cadencia?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t("pipeline.detail_section_cadencia_vazio")}</p>
          )}
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(["D0","D3","D7","D11","D16","D30"] as const).map(p => {
              const c = (cadencia ?? []).find((x: any) => x.passo === p);
              return (
                <CadenciaPassoCard
                  key={p}
                  cadenciaId={c?.id ?? null}
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
                  paisOrg={(lead as any).pais_org ?? "BR"}
                />
              );
            })}
          </ul>
        </div>
      </section>

      {/* Ligações */}
      <section className="mt-6">
        <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2 flex items-center gap-1">
          <PhoneCall className="w-3.5 h-3.5"/> {t("pipeline.detail_section_ligacoes").replace("{{n}}", String((ligacoes ?? []).length))}
        </h2>
        <div className="card divide-y">
          {(ligacoes ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">{t("pipeline.detail_section_ligacoes_vazio")}</p>
          )}
          {(ligacoes ?? []).map((l: any) => (
            <div key={l.id} className="p-3 text-sm flex items-start gap-3">
              <div className="text-xs text-muted-foreground w-28 shrink-0 tabular-nums">{fmtDateTime(l.data_hora, locale)}</div>
              <div className="flex-1">
                <div className="font-medium">{l.resultado}</div>
                {l.observacoes && <div className="text-muted-foreground text-xs mt-0.5">{l.observacoes}</div>}
              </div>
            </div>
          ))}
          {(ligacoes ?? []).length === 50 && (
            <p className="p-2 text-[10px] text-muted-foreground/70 text-center italic">{t("pipeline.limit_50_ligacoes")}</p>
          )}
        </div>
      </section>

      {/* Raio-X */}
      {(raiox ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5"/> {t("pipeline.detail_section_raiox")}
          </h2>
          <div className="card p-4 grid md:grid-cols-3 gap-4 text-sm">
            <KV
              label={t("pipeline.detail_raiox_score")}
              v={String((raiox ?? [])[0].score ?? "—")}
              sub={(raiox ?? [])[0].nivel ?? ""}
            />
            <KV
              label={t("pipeline.detail_raiox_perda")}
              v={((raiox ?? [])[0].perda_anual_estimada ?? 0).toLocaleString(locale, { style: "currency", currency })}
            />
            <KV
              label={t("pipeline.detail_raiox_pago")}
              v={(raiox ?? [])[0].pago ? t("pipeline.detail_decisor_sim") : t("pipeline.detail_decisor_nao")}
              sub={(raiox ?? [])[0].preco_final?.toLocaleString(locale, { style: "currency", currency })}
            />
          </div>
        </section>
      )}

      {/* Timeline 360° — substitui a seção estática anterior */}
      <section className="mt-6">
        <h2 className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2">
          Histórico 360°
        </h2>
        <div className="card p-4">
          <LeadTimeline360
            leadId={lead.id}
            orgId={orgId}
            eventosIniciais={(timeline360 ?? []) as unknown as TimelineEvento[]}
            nomeVendedor={me.display_name}
            whatsapp={lead.whatsapp}
          />
        </div>
      </section>
    </div>
  );
}

function Field({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"/>
      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="truncate">{value || "—"}</span>
    </div>
  );
}

function KV({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-base font-medium leading-tight mt-0.5 tabular-nums">{v}</div>
      {sub && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}

// i18n 22: locale-aware
function fmt(d: string, locale: Locale = "pt-BR") {
  return new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtDateTime(d: string, locale: Locale = "pt-BR") {
  return new Date(d).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// i18n 21: traduz `→ ${para}` quando possível
function summarizePayload(p: any, t: (k: string) => string) {
  if (!p) return "";
  if (p.para) {
    // Traduz a etapa quando aparece em payload de "etapa_alterada"
    const etapaTraduzida = t(`pipeline_etapas.${p.para}`);
    return t("pipeline.evento_seta").replace("{{para}}", etapaTraduzida || p.para);
  }
  if (p.resultado)   return p.resultado;
  if (p.canal)       return `${p.canal}${p.passo ? ` (${p.passo})` : ""}${p.obs ? ` — ${p.obs}` : ""}`;
  return JSON.stringify(p);
}
