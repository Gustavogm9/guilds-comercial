"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MotivoPerda } from "@/lib/types";
import { MOTIVOS_PERDA } from "@/lib/types";

async function requireOrg() {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização ativa");
  return orgId;
}

/** Cria um novo lead. Por padrão vai para base bruta.
 *  Se `direto_pipeline` = true, já entra em Prospecção e cria cadência D0–D30. */
export async function criarLead(input: {
  nome?: string;
  empresa?: string;
  cargo?: string;
  email?: string;
  whatsapp?: string;
  linkedin?: string;
  segmento?: string;
  cidade_uf?: string;
  fonte?: string;
  observacoes?: string;
  responsavel_id?: string;
  newsletter_optin?: boolean;
  direto_pipeline?: boolean;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  const hoje = new Date().toISOString().slice(0, 10);
  const direto = !!input.direto_pipeline;

  const { data, error } = await supabase.from("leads").insert({
    organizacao_id: orgId,
    nome: input.nome ?? null,
    empresa: input.empresa ?? null,
    cargo: input.cargo ?? null,
    email: input.email ?? null,
    whatsapp: input.whatsapp ?? null,
    linkedin: input.linkedin ?? null,
    segmento: input.segmento ?? null,
    cidade_uf: input.cidade_uf ?? null,
    fonte: input.fonte ?? null,
    observacoes: input.observacoes ?? null,
    responsavel_id: input.responsavel_id ?? user?.id ?? null,
    newsletter_optin: input.newsletter_optin ?? false,
    funnel_stage: direto ? "pipeline" : "base_bruta",
    crm_stage: direto ? "Prospecção" : null,
    data_primeiro_contato: direto ? hoje : null,
    proxima_acao: direto ? "Enviar D0" : null,
    data_proxima_acao: direto ? hoje : null,
  }).select("id").single();

  if (error) throw error;

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: data!.id,
    ator_id: user?.id ?? null,
    tipo: direto ? "criado_pipeline" : "criado",
    payload: { fonte: input.fonte ?? null, direto },
  });

  if (input.newsletter_optin) {
    await supabase.from("newsletter").insert({
      organizacao_id: orgId,
      lead_id: data!.id,
      responsavel_id: input.responsavel_id ?? user?.id ?? null,
      optin: true,
      status: "Ativo",
    });
  }

  if (direto) {
    // Cria os 6 passos de cadência D0/D3/D7/D11/D16/D30
    const baseDate = new Date();
    const passos = [
      { passo: "D0",  dias: 0,  canal: "Email + WhatsApp", objetivo: "Contexto / dor" },
      { passo: "D3",  dias: 3,  canal: "WhatsApp",         objetivo: "Insistência educada" },
      { passo: "D7",  dias: 7,  canal: "Email",            objetivo: "Impacto / custo invisível" },
      { passo: "D11", dias: 11, canal: "WhatsApp",         objetivo: "Quebra padrão" },
      { passo: "D16", dias: 16, canal: "Email",            objetivo: "Prova social / case" },
      { passo: "D30", dias: 30, canal: "Email",            objetivo: "Encerramento elegante" },
    ];
    const cadenciaRows = passos.map(p => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + p.dias);
      return {
        organizacao_id: orgId,
        lead_id: data!.id,
        passo: p.passo,
        canal: p.canal,
        objetivo: p.objetivo,
        data_prevista: d.toISOString().slice(0, 10),
        status: "pendente" as const,
      };
    });
    await supabase.from("cadencia").upsert(cadenciaRows, { onConflict: "lead_id,passo" });
  }

  revalidatePath("/base");
  if (direto) revalidatePath("/pipeline");
  return data!.id;
}

/** Importação em massa via CSV. Recebe array de rows já parseados.
 *  Retorna { criados, ignorados, erros }. */
export async function importarLeadsEmMassa(rows: Array<{
  empresa?: string;
  nome?: string;
  cargo?: string;
  email?: string;
  whatsapp?: string;
  linkedin?: string;
  segmento?: string;
  cidade_uf?: string;
  fonte?: string;
  observacoes?: string;
}>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  const valid = rows.filter(r => (r.empresa ?? "").trim().length > 0);
  if (valid.length === 0) return { criados: 0, ignorados: rows.length, erros: [] as string[] };

  const payload = valid.map(r => ({
    organizacao_id: orgId,
    empresa: (r.empresa ?? "").trim(),
    nome: r.nome?.trim() || null,
    cargo: r.cargo?.trim() || null,
    email: r.email?.trim() || null,
    whatsapp: r.whatsapp?.trim() || null,
    linkedin: r.linkedin?.trim() || null,
    segmento: r.segmento?.trim() || null,
    cidade_uf: r.cidade_uf?.trim() || null,
    fonte: r.fonte?.trim() || "Lista fria",
    observacoes: r.observacoes?.trim() || null,
    responsavel_id: user?.id ?? null,
    funnel_stage: "base_bruta" as const,
  }));

  const { data, error } = await supabase.from("leads").insert(payload).select("id");
  if (error) throw error;

  const eventos = (data ?? []).map(row => ({
    organizacao_id: orgId,
    lead_id: row.id,
    ator_id: user?.id ?? null,
    tipo: "criado",
    payload: { fonte: "importado_csv" },
  }));
  if (eventos.length > 0) await supabase.from("lead_evento").insert(eventos);

  revalidatePath("/base");
  return { criados: data?.length ?? 0, ignorados: rows.length - valid.length, erros: [] as string[] };
}

/** Move um lead da Base Bruta → Base Qualificada (pré-triagem) */
export async function qualificarBase(input: {
  lead_id: number;
  fit_icp: boolean;
  decisor?: boolean;
  dor_principal?: string;
  temperatura?: "Frio" | "Morno" | "Quente";
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from("leads").update({
    funnel_stage: "base_qualificada",
    fit_icp: input.fit_icp,
    decisor: input.decisor ?? null,
    dor_principal: input.dor_principal ?? null,
    temperatura: input.temperatura ?? "Morno",
  }).eq("id", input.lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: await requireOrg(),
    lead_id: input.lead_id,
    ator_id: user?.id ?? null,
    tipo: "qualificado_base",
    payload: { fit: input.fit_icp, decisor: input.decisor ?? null },
  });

  revalidatePath("/base");
}

/** Promove um lead da base → pipeline */
export async function promoverParaPipeline(lead_id: number, proxima_acao: string = "Enviar D0") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  const hoje = new Date().toISOString().slice(0, 10);

  await supabase.from("leads").update({
    funnel_stage: "pipeline",
    crm_stage: "Prospecção",
    data_primeiro_contato: hoje,
    proxima_acao,
    data_proxima_acao: hoje,
  }).eq("id", lead_id);

  // Cria os 6 passos de cadência (D0/D3/D7/D11/D16/D30)
  const baseDate = new Date();
  const passos = [
    { passo: "D0",  dias: 0,  canal: "Email + WhatsApp", objetivo: "Contexto / dor" },
    { passo: "D3",  dias: 3,  canal: "WhatsApp",         objetivo: "Insistência educada" },
    { passo: "D7",  dias: 7,  canal: "Email",            objetivo: "Impacto / custo invisível" },
    { passo: "D11", dias: 11, canal: "WhatsApp",         objetivo: "Quebra padrão" },
    { passo: "D16", dias: 16, canal: "Email",            objetivo: "Prova social / case" },
    { passo: "D30", dias: 30, canal: "Email",            objetivo: "Encerramento elegante" },
  ];

  const cadenciaRows = passos.map(p => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + p.dias);
    return {
      organizacao_id: orgId,
      lead_id,
      passo: p.passo,
      canal: p.canal,
      objetivo: p.objetivo,
      data_prevista: d.toISOString().slice(0, 10),
      status: "pendente" as const,
    };
  });

  await supabase.from("cadencia").upsert(cadenciaRows, { onConflict: "lead_id,passo" });

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id,
    ator_id: user?.id ?? null,
    tipo: "promovido_pipeline",
    payload: { etapa: "Prospecção" },
  });

  revalidatePath("/base");
  revalidatePath("/pipeline");
  redirect(`/pipeline/${lead_id}`);
}

/**
 * Arquiva um lead (sem fit / sem interesse).
 * Motivo é obrigatório e deve ser um dos MOTIVOS_PERDA padrão.
 * Se motivo === 'Outro', detalhe é obrigatório.
 */
export async function arquivarLead(
  lead_id: number,
  motivo: MotivoPerda,
  detalhe?: string,
) {
  if (!motivo || !MOTIVOS_PERDA.includes(motivo)) {
    throw new Error("Motivo de arquivamento é obrigatório.");
  }
  if (motivo === "Outro" && !(detalhe ?? "").trim()) {
    throw new Error("Descreva o motivo quando selecionar 'Outro'.");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();

  await supabase.from("leads").update({
    funnel_stage: "arquivado",
    crm_stage: "Perdido",
    motivo_perda: motivo,
    motivo_perda_detalhe: motivo === "Outro" ? (detalhe ?? "").trim() : null,
  }).eq("id", lead_id);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "arquivado",
    payload: {
      motivo,
      motivo_detalhe: motivo === "Outro" ? detalhe : null,
    },
  });

  revalidatePath("/base");
  revalidatePath("/funil");
}

/** Atribui responsável a um lead */
export async function atribuirResponsavel(lead_id: number, responsavel_id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = await requireOrg();
  await supabase.from("leads").update({ responsavel_id }).eq("id", lead_id);
  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id, ator_id: user?.id ?? null,
    tipo: "responsavel_alterado", payload: { para: responsavel_id },
  });
  revalidatePath("/base");
}
