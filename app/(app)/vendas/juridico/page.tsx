import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileSignature, Scale, Send } from "lucide-react";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import VendasTabs from "../vendas-tabs";
import { adicionarNotaJuridicaAction, atualizarStatusContratoAction } from "./actions";

export const dynamic = "force-dynamic";

type StatusContrato = "rascunho" | "em_revisao" | "aguardando_assinatura" | "assinado" | "cancelado";

type ContratoJuridico = {
  id: number;
  lead_id: number | null;
  proposta_id: number | null;
  lead_nome: string;
  lead_segmento: string | null;
  lead_valor: number | null;
  modo: string;
  status: StatusContrato;
  versao_atual: number;
  template_docx_nome: string | null;
  ultimo_pedido_melhoria: string | null;
  data_envio: string | null;
  data_assinatura: string | null;
  created_at: string | null;
  updated_at: string | null;
  notas: NotaJuridica[];
};

type NotaJuridica = {
  id: number;
  contrato_id: number;
  tipo: string;
  conteudo: string;
  resolvido: boolean;
  created_at: string | null;
};

type LeadFechado = {
  id: number;
  nome: string;
  segmento: string | null;
  valor: number | null;
  data_fechamento: string | null;
};

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStatus(value: unknown): StatusContrato {
  if (value === "em_revisao" || value === "aguardando_assinatura" || value === "assinado" || value === "cancelado") {
    return value;
  }
  return "rascunho";
}

function dataCurta(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
}

function moeda(value?: number | null) {
  if (!value) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function statusLabel(status: StatusContrato) {
  const labels: Record<StatusContrato, string> = {
    rascunho: "Rascunho",
    em_revisao: "Em revisao",
    aguardando_assinatura: "Aguardando assinatura",
    assinado: "Assinado",
    cancelado: "Cancelado",
  };
  return labels[status];
}

function modoLabel(modo: string) {
  if (modo === "briefing_juridico") return "Briefing juridico";
  if (modo === "revisao_juridica") return "Revisao juridica";
  return "Template DOCX";
}

export default async function JuridicoPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/hoje");

  const role = await getCurrentRole();
  const isGestor = role === "gestor";
  const supabase = createClient();

  const [contratosResult, leadsResult, feedbackResult] = await Promise.all([
    supabase
      .from("contratos")
      .select("id, lead_id, proposta_id, modo, status, versao_atual, template_docx_nome, ultimo_pedido_melhoria, data_envio, data_assinatura, created_at, updated_at")
      .eq("organizacao_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("v_leads_enriched")
      .select("id, empresa, nome, segmento, valor_potencial, crm_stage, data_fechamento")
      .eq("organizacao_id", orgId)
      .eq("crm_stage", "Fechado")
      .order("data_fechamento", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("contrato_feedback")
      .select("id, contrato_id, tipo, conteudo, resolvido, created_at")
      .eq("organizacao_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const leads: LeadFechado[] = ((leadsResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((lead) => typeof lead.id === "number")
    .map((lead) => ({
      id: Number(lead.id),
      nome: typeof lead.empresa === "string" && lead.empresa.trim()
        ? lead.empresa
        : typeof lead.nome === "string" && lead.nome.trim()
          ? lead.nome
          : `Lead #${lead.id}`,
      segmento: typeof lead.segmento === "string" ? lead.segmento : null,
      valor: asNumber(lead.valor_potencial),
      data_fechamento: typeof lead.data_fechamento === "string" ? lead.data_fechamento : null,
    }));

  const leadPorId = new Map(leads.map((lead) => [lead.id, lead]));

  const notasPorContrato = new Map<number, NotaJuridica[]>();
  for (const nota of (feedbackResult.data ?? []) as Array<Record<string, unknown>>) {
    if (typeof nota.id !== "number" || typeof nota.contrato_id !== "number" || typeof nota.conteudo !== "string") continue;
    const item: NotaJuridica = {
      id: Number(nota.id),
      contrato_id: Number(nota.contrato_id),
      tipo: typeof nota.tipo === "string" ? nota.tipo : "juridico",
      conteudo: nota.conteudo,
      resolvido: Boolean(nota.resolvido),
      created_at: typeof nota.created_at === "string" ? nota.created_at : null,
    };
    notasPorContrato.set(item.contrato_id, [...(notasPorContrato.get(item.contrato_id) ?? []), item].slice(0, 3));
  }

  const contratos: ContratoJuridico[] = ((contratosResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((contrato) => typeof contrato.id === "number")
    .map((contrato) => {
      const leadId = typeof contrato.lead_id === "number" ? Number(contrato.lead_id) : null;
      const lead = leadId ? leadPorId.get(leadId) : null;
      const id = Number(contrato.id);
      return {
        id,
        lead_id: leadId,
        proposta_id: typeof contrato.proposta_id === "number" ? Number(contrato.proposta_id) : null,
        lead_nome: lead?.nome ?? (leadId ? `Lead #${leadId}` : "Lead sem vinculo"),
        lead_segmento: lead?.segmento ?? null,
        lead_valor: lead?.valor ?? null,
        modo: typeof contrato.modo === "string" ? contrato.modo : "contrato_template",
        status: asStatus(contrato.status),
        versao_atual: typeof contrato.versao_atual === "number" ? contrato.versao_atual : 1,
        template_docx_nome: typeof contrato.template_docx_nome === "string" ? contrato.template_docx_nome : null,
        ultimo_pedido_melhoria: typeof contrato.ultimo_pedido_melhoria === "string" ? contrato.ultimo_pedido_melhoria : null,
        data_envio: typeof contrato.data_envio === "string" ? contrato.data_envio : null,
        data_assinatura: typeof contrato.data_assinatura === "string" ? contrato.data_assinatura : null,
        created_at: typeof contrato.created_at === "string" ? contrato.created_at : null,
        updated_at: typeof contrato.updated_at === "string" ? contrato.updated_at : null,
        notas: notasPorContrato.get(id) ?? [],
      };
    });

  const leadsComContrato = new Set(contratos.map((contrato) => contrato.lead_id).filter(Boolean));
  const leadsSemContrato = leads.filter((lead) => !leadsComContrato.has(lead.id)).slice(0, 8);
  const emRevisao = contratos.filter((contrato) => contrato.status === "em_revisao");
  const aguardandoAssinatura = contratos.filter((contrato) => contrato.status === "aguardando_assinatura");
  const assinados = contratos.filter((contrato) => contrato.status === "assinado");
  const foraPadrao = contratos.filter((contrato) => contrato.modo !== "contrato_template" || contrato.notas.some((nota) => !nota.resolvido));
  const filaRevisao = [...emRevisao, ...contratos.filter((contrato) => contrato.status === "rascunho")];
  const filaConcluidos = [...assinados, ...contratos.filter((contrato) => contrato.status === "cancelado")];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <VendasTabs isGestor={isGestor} />

      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Juridico</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe contratos gerados, briefings para advogados, revisoes e assinatura.
            </p>
          </div>
        </div>
        <Link href="/vendas/contratos" className="btn-primary text-sm self-start">
          <FileSignature className="w-4 h-4" /> Gerar contrato
        </Link>
      </header>

      <section className="grid md:grid-cols-4 gap-3 mb-6">
        <Kpi icon={<Clock3 className="w-4 h-4" />} label="Em revisao" value={emRevisao.length} />
        <Kpi icon={<Send className="w-4 h-4" />} label="Assinatura" value={aguardandoAssinatura.length} />
        <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Assinados" value={assinados.length} />
        <Kpi icon={<AlertTriangle className="w-4 h-4" />} label="Fora do padrao" value={foraPadrao.length} />
      </section>

      {leadsSemContrato.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 mb-6">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">Fechados sem contrato</h2>
              <p className="text-xs text-amber-800">Esses clientes ja estao fechados, mas ainda nao entraram no fluxo contratual.</p>
            </div>
          </div>
          <div className="divide-y divide-amber-200">
            {leadsSemContrato.map((lead) => (
              <div key={lead.id} className="py-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-amber-950">{lead.nome}</p>
                  <p className="text-xs text-amber-800">{lead.segmento ?? "sem segmento"} | {moeda(lead.valor)} | fechado em {dataCurta(lead.data_fechamento)}</p>
                </div>
                <Link href={`/vendas/contratos?lead=${lead.id}`} className="btn-secondary text-xs shrink-0">
                  Criar contrato <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid lg:grid-cols-3 gap-4">
        <ColunaTitulo titulo="Revisao juridica" subtitulo="Briefings, ajustes e contratos fora do padrao" />
        <ColunaTitulo titulo="Assinatura" subtitulo="Contratos prontos para envio ou em assinatura" />
        <ColunaTitulo titulo="Concluidos" subtitulo="Assinados ou cancelados" />

        <div className="space-y-3">
          {filaRevisao.length === 0 && <FilaVazia texto="Nada pendente para revisao." />}
          {filaRevisao.map((contrato) => (
            <ContratoCard key={contrato.id} contrato={contrato} foco="revisao" />
          ))}
        </div>

        <div className="space-y-3">
          {aguardandoAssinatura.length === 0 && <FilaVazia texto="Nenhum contrato em assinatura." />}
          {aguardandoAssinatura.map((contrato) => (
            <ContratoCard key={contrato.id} contrato={contrato} foco="assinatura" />
          ))}
        </div>

        <div className="space-y-3">
          {filaConcluidos.length === 0 && <FilaVazia texto="Nenhum contrato concluido ainda." />}
          {filaConcluidos.map((contrato) => (
            <ContratoCard key={contrato.id} contrato={contrato} foco="concluido" />
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ColunaTitulo({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="hidden lg:block">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <p className="text-xs text-muted-foreground">{subtitulo}</p>
    </div>
  );
}

function FilaVazia({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

function ContratoCard({ contrato, foco }: { contrato: ContratoJuridico; foco: "revisao" | "assinatura" | "concluido" }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold">{contrato.lead_nome}</p>
          <p className="text-xs text-muted-foreground">
            {modoLabel(contrato.modo)} | v{contrato.versao_atual} | {moeda(contrato.lead_valor)}
          </p>
        </div>
        <span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground whitespace-nowrap">
          {statusLabel(contrato.status)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <dt className="text-muted-foreground">Atualizado</dt>
          <dd className="font-medium">{dataCurta(contrato.updated_at ?? contrato.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Template</dt>
          <dd className="font-medium truncate">{contrato.template_docx_nome ?? "-"}</dd>
        </div>
      </dl>

      {contrato.ultimo_pedido_melhoria && (
        <p className="text-xs rounded-md bg-muted p-2 mb-3">{contrato.ultimo_pedido_melhoria}</p>
      )}

      {contrato.notas.length > 0 && (
        <div className="space-y-2 mb-3">
          {contrato.notas.map((nota) => (
            <p key={nota.id} className="text-xs border-l-2 border-primary/40 pl-2 text-muted-foreground">
              {nota.conteudo}
            </p>
          ))}
        </div>
      )}

      <form action={atualizarStatusContratoAction} className="grid grid-cols-[1fr_auto] gap-2 mb-2">
        <input type="hidden" name="contratoId" value={contrato.id} />
        <select name="status" defaultValue={contrato.status} className="input-base text-xs h-9">
          <option value="rascunho">Rascunho</option>
          <option value="em_revisao">Em revisao</option>
          <option value="aguardando_assinatura">Aguardando assinatura</option>
          <option value="assinado">Assinado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button className="btn-secondary text-xs h-9" type="submit">Atualizar</button>
        <input
          name="nota"
          className="input-base text-xs col-span-2"
          placeholder={foco === "assinatura" ? "Nota sobre envio/assinatura" : "Nota juridica opcional"}
        />
      </form>

      <form action={adicionarNotaJuridicaAction} className="space-y-2">
        <input type="hidden" name="contratoId" value={contrato.id} />
        <textarea name="conteudo" className="input-base text-xs min-h-[70px]" placeholder="Registrar orientacao, pendencia ou pedido ao comercial" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-xs" type="submit">Adicionar nota</button>
          {contrato.lead_id && (
            <>
              <Link href={`/vendas/contratos?lead=${contrato.lead_id}`} className="btn-secondary text-xs">Abrir contrato</Link>
              <Link href={`/vendas/pipeline/${contrato.lead_id}`} className="btn-secondary text-xs">Lead</Link>
            </>
          )}
        </div>
      </form>
    </article>
  );
}
