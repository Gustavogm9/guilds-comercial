import { montarCadenciaRows, PASSOS_CADENCIA } from "@/lib/cadencia-templates";

type SupabaseLike = {
  from: (table: string) => any;
};

type FluxoPasso = {
  id: number;
  ordem: number;
  offset_dias: number;
  canal: "email" | "whatsapp" | "call" | "linkedin" | "sms" | "task_manual";
  nome_passo: string;
  assunto: string | null;
  corpo: string | null;
  pular_se_respondeu: boolean | null;
  pular_se_clicou_link: boolean | null;
  condicao_para_executar?: string | null;
};

type FluxoCadencia = {
  id: number;
  nome: string;
  passos: FluxoPasso[];
};

type CadenciaInsert = {
  organizacao_id: string;
  lead_id: number;
  passo: string;
  canal: string | null;
  objetivo: string | null;
  data_prevista: string;
  status: "pendente";
  fluxo_id?: number | null;
  fluxo_passo_id?: number | null;
  ordem?: number | null;
  offset_dias?: number | null;
  assunto_template?: string | null;
  corpo_template?: string | null;
  condicao_para_executar?: string | null;
  pular_se_respondeu?: boolean | null;
  pular_se_clicou_link?: boolean | null;
};

const CANAL_LABEL: Record<FluxoPasso["canal"], string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  call: "Ligação",
  linkedin: "LinkedIn",
  sms: "SMS",
  task_manual: "Tarefa",
};

export function dataIsoHoje() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(baseIso: string, days: number) {
  const [year, month, day] = baseIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function offsetFromPasso(passo: string | null | undefined) {
  const match = passo?.match(/\bD(\d+)\b/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export function passoLegadoFromOffset(offset: number, ordem: number) {
  const legado = PASSOS_CADENCIA.find((p) => p.dias === offset);
  return legado?.passo ?? `P${ordem}`;
}

export function montarCadenciaRowsLegado(input: {
  organizacao_id: string;
  lead_id: number;
  baseDate?: Date;
}): CadenciaInsert[] {
  return montarCadenciaRows(input).map((row, idx) => ({
    ...row,
    ordem: idx + 1,
    offset_dias: PASSOS_CADENCIA[idx]?.dias ?? offsetFromPasso(row.passo) ?? idx,
    fluxo_id: null,
    fluxo_passo_id: null,
    assunto_template: null,
    corpo_template: null,
    condicao_para_executar: "sempre",
    pular_se_respondeu: true,
    pular_se_clicou_link: false,
  }));
}

export async function buscarFluxoPublicado(
  supabase: SupabaseLike,
  orgId: string,
  fluxoId?: number | null,
): Promise<FluxoCadencia | null> {
  let fluxoQuery = supabase
    .from("cadencia_fluxo")
    .select("id, nome")
    .eq("organizacao_id", orgId)
    .eq("status", "publicado")
    .eq("ativo", true)
    .limit(1);

  if (fluxoId) {
    fluxoQuery = fluxoQuery.eq("id", fluxoId);
  } else {
    fluxoQuery = fluxoQuery.eq("default_template", true);
  }

  const { data: fluxo, error } = await fluxoQuery.maybeSingle();
  if (error) throw new Error(error.message);
  if (!fluxo) return null;

  const { data: passos, error: passosError } = await supabase
    .from("cadencia_fluxo_passo")
    .select("id, ordem, offset_dias, canal, nome_passo, assunto, corpo, pular_se_respondeu, pular_se_clicou_link, condicao_para_executar")
    .eq("fluxo_id", fluxo.id)
    .order("ordem", { ascending: true });
  if (passosError) throw new Error(passosError.message);

  return {
    id: fluxo.id,
    nome: fluxo.nome,
    passos: ((passos ?? []) as FluxoPasso[]).filter((p) => p.nome_passo),
  };
}

export async function montarCadenciaRowsConfiguravel(input: {
  supabase: SupabaseLike;
  organizacao_id: string;
  lead_id: number;
  baseIso?: string;
  fluxoId?: number | null;
}): Promise<CadenciaInsert[]> {
  const baseIso = input.baseIso ?? dataIsoHoje();
  const fluxo = await buscarFluxoPublicado(input.supabase, input.organizacao_id, input.fluxoId);

  if (!fluxo || fluxo.passos.length === 0) {
    return montarCadenciaRowsLegado({
      organizacao_id: input.organizacao_id,
      lead_id: input.lead_id,
      baseDate: new Date(`${baseIso}T00:00:00.000Z`),
    });
  }

  return fluxo.passos.map((p) => ({
    organizacao_id: input.organizacao_id,
    lead_id: input.lead_id,
    passo: passoLegadoFromOffset(p.offset_dias, p.ordem),
    canal: CANAL_LABEL[p.canal] ?? p.canal,
    objetivo: p.nome_passo,
    data_prevista: addDaysIso(baseIso, p.offset_dias),
    status: "pendente",
    fluxo_id: fluxo.id,
    fluxo_passo_id: p.id,
    ordem: p.ordem,
    offset_dias: p.offset_dias,
    assunto_template: p.assunto ?? null,
    corpo_template: p.corpo ?? null,
    condicao_para_executar: p.condicao_para_executar ?? "sempre",
    pular_se_respondeu: p.pular_se_respondeu ?? true,
    pular_se_clicou_link: p.pular_se_clicou_link ?? false,
  }));
}

async function atualizarProximaAcaoLead(
  supabase: SupabaseLike,
  orgId: string,
  leadId: number,
  dataPrimeiroContato: string,
) {
  const { data: proximoPasso, error } = await supabase
    .from("cadencia")
    .select("passo, objetivo, data_prevista")
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .eq("status", "pendente")
    .order("data_prevista", { ascending: true, nullsFirst: false })
    .order("ordem", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const proximaAcao = proximoPasso
    ? (proximoPasso.objetivo || `Enviar ${proximoPasso.passo}`)
    : "Aguardar resposta da cadência";

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      data_primeiro_contato: dataPrimeiroContato,
      proxima_acao: proximaAcao,
      data_proxima_acao: proximoPasso?.data_prevista ?? null,
    })
    .eq("id", leadId)
    .eq("organizacao_id", orgId);
  if (leadError) throw new Error(leadError.message);

  return {
    proxima_acao: proximaAcao,
    data_proxima_acao: proximoPasso?.data_prevista ?? null,
  };
}

export async function iniciarCadenciaConfiguravel(input: {
  supabase: SupabaseLike;
  organizacao_id: string;
  lead_id: number;
  baseIso?: string;
  fluxoId?: number | null;
  preservarExecutados?: boolean;
}) {
  const baseIso = input.baseIso ?? dataIsoHoje();
  const preservarExecutados = input.preservarExecutados ?? true;

  const { data: executados, error: executadosError } = await input.supabase
    .from("cadencia")
    .select("ordem, passo, status")
    .eq("lead_id", input.lead_id)
    .eq("organizacao_id", input.organizacao_id)
    .in("status", ["enviado", "respondido"]);
  if (executadosError) throw new Error(executadosError.message);

  const ordensExecutadas = new Set(
    preservarExecutados
      ? (executados ?? [])
          .map((row: { ordem: number | null; passo: string | null }) => row.ordem ?? null)
          .filter((ordem: number | null): ordem is number => ordem != null)
      : [],
  );

  const rows = (await montarCadenciaRowsConfiguravel({
    supabase: input.supabase,
    organizacao_id: input.organizacao_id,
    lead_id: input.lead_id,
    baseIso,
    fluxoId: input.fluxoId,
  })).filter((row) => !row.ordem || !ordensExecutadas.has(row.ordem));

  const { error: deleteError } = await input.supabase
    .from("cadencia")
    .delete()
    .eq("lead_id", input.lead_id)
    .eq("organizacao_id", input.organizacao_id)
    .in("status", ["pendente", "pular", "removido"]);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length > 0) {
    const { error } = await input.supabase.from("cadencia").insert(rows as any[]);
    if (error) throw new Error(error.message);
  }

  return atualizarProximaAcaoLead(input.supabase, input.organizacao_id, input.lead_id, baseIso);
}
