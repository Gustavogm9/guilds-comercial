"use server";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import { getServerLocale, getT } from "@/lib/i18n";
import { PASSOS_CADENCIA, type CadenciaPasso } from "@/lib/cadencia-templates";
import { iniciarCadenciaConfiguravel, offsetFromPasso } from "@/lib/cadencia-fluxos";

type StatusCadencia = "pendente" | "enviado" | "respondido" | "pular" | "removido";

const STATUS_VALIDOS: StatusCadencia[] = ["pendente", "enviado", "respondido", "pular", "removido"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateUtc(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function addDaysIso(value: string, days: number): string {
  const date = parseIsoDateUtc(value);
  if (!date) throw new Error("Data inválida.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function sincronizarLeadAposToqueCadencia(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  leadId: number,
  status: Extract<StatusCadencia, "enviado" | "respondido">,
  hoje: string,
) {
  if (status === "respondido") {
    const { error } = await supabase
      .from("leads")
      .update({
        data_ultimo_toque: hoje,
        proxima_acao: "Qualificar resposta da cadência",
        data_proxima_acao: hoje,
      })
      .eq("id", leadId)
      .eq("organizacao_id", orgId);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: proximoPasso, error: proximoError } = await supabase
    .from("cadencia")
    .select("passo, objetivo, data_prevista")
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .eq("status", "pendente")
    .order("data_prevista", { ascending: true, nullsFirst: false })
    .order("ordem", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (proximoError) throw new Error(proximoError.message);

  const { error } = await supabase
    .from("leads")
    .update({
      data_ultimo_toque: hoje,
      proxima_acao: proximoPasso
        ? (proximoPasso.objetivo || `Executar ${proximoPasso.passo}`)
        : "Aguardar resposta da cadência",
      data_proxima_acao: proximoPasso?.data_prevista ?? null,
    })
    .eq("id", leadId)
    .eq("organizacao_id", orgId);
  if (error) throw new Error(error.message);
}

/**
 * Salva a mensagem gerada por IA num passo de cadência específico (lead+passo)
 * e marca como enviado. Usado quando o vendedor copia ou abre WhatsApp do
 * CadenciaPassoCard — antes a mensagem era state local e perdida ao recarregar.
 */
export async function salvarMensagemPassoEnviada(input: {
  leadId: number;
  cadenciaId?: number | null;
  passo: string;
  mensagem: string;
}) {
  const t = getT(await getServerLocale());
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));

  const supabase = createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("cadencia")
    .update({
      status: "enviado",
      data_executada: hoje,
      mensagem_enviada: input.mensagem.slice(0, 5000),
    })
    .eq("organizacao_id", orgId);

  query = input.cadenciaId
    ? query.eq("id", input.cadenciaId).eq("lead_id", input.leadId)
    : query.eq("lead_id", input.leadId).eq("passo", input.passo);

  const { error } = await query;

  if (error) throw new Error(error.message);

  await sincronizarLeadAposToqueCadencia(supabase, orgId, input.leadId, "enviado", hoje);

  revalidatePath("/cadencia");
  revalidatePath("/comunicacao/cadencia");
  revalidatePath(`/vendas/pipeline/${input.leadId}`);
  revalidatePath("/hoje");
  return { ok: true };
}

/**
 * Marca um passo de cadência como enviado / respondido / pular / pendente.
 *
 * Permissões: qualquer usuário autenticado da org. RLS no banco garante isolamento
 * por `organizacao_id`. Se o passo não pertence ao org do user, retorna erro.
 */
export async function marcarPassoCadencia(
  cadenciaId: number,
  novoStatus: StatusCadencia,
  observacoes?: string,
) {
  const t = getT(await getServerLocale());
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));

  if (!STATUS_VALIDOS.includes(novoStatus)) {
    throw new Error("Status invalido.");
  }

  const supabase = createClient();

  const update: Record<string, unknown> = { status: novoStatus };
  const hoje = new Date().toISOString().slice(0, 10);

  if (novoStatus === "enviado" || novoStatus === "respondido") {
    update.data_executada = hoje;
  }
  if (typeof observacoes === "string" && observacoes.trim()) {
    update.observacoes = observacoes.trim();
  }

  // Busca o lead_id antes de atualizar (usado na sugestão de qualificação)
  const { data: cadenciaRow } = await supabase
    .from("cadencia")
    .select("lead_id")
    .eq("id", cadenciaId)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  const { error } = await supabase
    .from("cadencia")
    .update(update)
    .eq("id", cadenciaId)
    .eq("organizacao_id", orgId);

  if (error) throw new Error(error.message);

  if ((novoStatus === "enviado" || novoStatus === "respondido") && cadenciaRow?.lead_id) {
    await sincronizarLeadAposToqueCadencia(supabase, orgId, cadenciaRow.lead_id, novoStatus, hoje);
  }

  revalidatePath("/cadencia");
  revalidatePath("/comunicacao/cadencia");
  revalidatePath("/hoje");
  revalidatePath("/vendas/pipeline");
  if (cadenciaRow?.lead_id) {
    revalidatePath(`/vendas/pipeline/${cadenciaRow.lead_id}`);
  }

  // Quando o lead responde, sugerimos qualificação imediata
  // O componente frontend usa esse flag para exibir um popover contextual
  if (novoStatus === "respondido" && cadenciaRow?.lead_id) {
    return { ok: true, sugerirQualificacao: true, leadId: cadenciaRow.lead_id };
  }

  return { ok: true, sugerirQualificacao: false, leadId: null };
}

/**
 * Adia um passo pendente em N dias.
 */
export async function adiarPassoCadencia(cadenciaId: number, dias: number) {
  const t = getT(await getServerLocale());
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));

  if (!Number.isFinite(dias) || dias < 1 || dias > 30) {
    throw new Error("Dias invalido (1-30).");
  }

  const supabase = createClient();

  // Lê data atual
  const { data: row } = await supabase
    .from("cadencia")
    .select("data_prevista")
    .eq("id", cadenciaId)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  const base = row?.data_prevista ? new Date(row.data_prevista) : new Date();
  base.setDate(base.getDate() + dias);
  const novaData = base.toISOString().slice(0, 10);

  const { error } = await supabase
    .from("cadencia")
    .update({ data_prevista: novaData })
    .eq("id", cadenciaId)
    .eq("organizacao_id", orgId);

  if (error) throw new Error(error.message);

  revalidatePath("/cadencia");
  revalidatePath("/comunicacao/cadencia");
  return { ok: true, novaData };
}

export async function ajustarDiaCadenciaLead(input: {
  leadId: number;
  cadenciaIdAtual?: number | null;
  passoAtual: string;
  dataPrevistaPasso: string;
}) {
  const t = getT(await getServerLocale());
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));

  if (!Number.isInteger(input.leadId) || input.leadId <= 0) {
    throw new Error("Lead inválido.");
  }

  if (!parseIsoDateUtc(input.dataPrevistaPasso)) {
    throw new Error("Data inválida.");
  }

  const supabase = createClient();

  const { data: leadCheck } = await supabase
    .from("leads")
    .select("id")
    .eq("id", input.leadId)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!leadCheck) throw new Error(t("erros.lead_nao_encontrado"));

  if (input.cadenciaIdAtual) {
    const { data: linhas, error: linhasError } = await supabase
      .from("cadencia")
      .select("id, passo, status, ordem, offset_dias")
      .eq("lead_id", input.leadId)
      .eq("organizacao_id", orgId)
      .order("ordem", { ascending: true, nullsFirst: false })
      .order("data_prevista", { ascending: true, nullsFirst: false });
    if (linhasError) throw new Error(linhasError.message);

    const rows = (linhas ?? []) as Array<{
      id: number;
      passo: string;
      status: StatusCadencia;
      ordem: number | null;
      offset_dias: number | null;
    }>;
    const selecionada = rows.find((row) => row.id === input.cadenciaIdAtual);
    if (!selecionada) throw new Error("Passo inválido.");

    const offsetSelecionado = selecionada.offset_dias ?? offsetFromPasso(selecionada.passo) ?? 0;
    const ordemSelecionada = selecionada.ordem ?? rows.findIndex((row) => row.id === selecionada.id) + 1;
    const dataPrimeiroContatoCustom = addDaysIso(input.dataPrevistaPasso, -offsetSelecionado);

    for (const row of rows) {
      if (row.status === "enviado" || row.status === "respondido") continue;
      const ordem = row.ordem ?? rows.findIndex((item) => item.id === row.id) + 1;
      const offset = row.offset_dias ?? offsetFromPasso(row.passo) ?? 0;
      const status: Extract<StatusCadencia, "pendente" | "pular"> =
        ordem < ordemSelecionada ? "pular" : "pendente";
      const { error } = await supabase
        .from("cadencia")
        .update({
          data_prevista: addDaysIso(dataPrimeiroContatoCustom, offset),
          data_executada: null,
          status,
          ...(status === "pular" ? { observacoes: "Pulado ao ajustar dia da cadência" } : {}),
        })
        .eq("id", row.id)
        .eq("organizacao_id", orgId);
      if (error) throw new Error(error.message);
    }

    const { data: proximoPasso, error: proximoError } = await supabase
      .from("cadencia")
      .select("passo, objetivo, data_prevista")
      .eq("lead_id", input.leadId)
      .eq("organizacao_id", orgId)
      .eq("status", "pendente")
      .order("data_prevista", { ascending: true, nullsFirst: false })
      .order("ordem", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (proximoError) throw new Error(proximoError.message);

    const proximaAcaoCustom = proximoPasso
      ? (proximoPasso.objetivo || `Enviar ${proximoPasso.passo}`)
      : "Aguardar resposta da cadência";
    const { error: leadError } = await supabase
      .from("leads")
      .update({
        data_primeiro_contato: dataPrimeiroContatoCustom,
        proxima_acao: proximaAcaoCustom,
        data_proxima_acao: proximoPasso?.data_prevista ?? null,
      })
      .eq("id", input.leadId)
      .eq("organizacao_id", orgId);
    if (leadError) throw new Error(leadError.message);

    await supabase.from("lead_evento").insert({
      organizacao_id: orgId,
      lead_id: input.leadId,
      ator_id: me.id,
      tipo: "cadencia_ajustada",
      payload: {
        cadencia_id_atual: input.cadenciaIdAtual,
        passo_atual: selecionada.passo,
        data_prevista_passo: input.dataPrevistaPasso,
        data_primeiro_contato: dataPrimeiroContatoCustom,
      },
    });

    revalidatePath("/cadencia");
    revalidatePath("/comunicacao/cadencia");
    revalidatePath("/vendas/pipeline");
    revalidatePath(`/vendas/pipeline/${input.leadId}`);
    revalidatePath("/hoje");

    return {
      ok: true,
      proxima_acao: proximaAcaoCustom,
      data_proxima_acao: proximoPasso?.data_prevista ?? null,
      data_primeiro_contato: dataPrimeiroContatoCustom,
    };
  }

  const passoAtual = PASSOS_CADENCIA.find((p) => p.passo === input.passoAtual);
  if (!passoAtual) throw new Error("Passo inválido.");

  const dataPrimeiroContato = addDaysIso(input.dataPrevistaPasso, -passoAtual.dias);

  const { data: existentes, error: existentesError } = await supabase
    .from("cadencia")
    .select("id, passo, status")
    .eq("lead_id", input.leadId)
    .eq("organizacao_id", orgId);
  if (existentesError) throw new Error(existentesError.message);

  const porPasso = new Map(
    (existentes ?? []).map((row) => [
      row.passo as CadenciaPasso,
      row as { id: number; passo: CadenciaPasso; status: StatusCadencia },
    ]),
  );

  for (const passo of PASSOS_CADENCIA) {
    const existente = porPasso.get(passo.passo);
    if (existente?.status === "enviado" || existente?.status === "respondido") {
      continue;
    }

    const status: Extract<StatusCadencia, "pendente" | "pular"> =
      passo.dias < passoAtual.dias ? "pular" : "pendente";
    const payload = {
      canal: passo.canal,
      objetivo: passo.objetivo,
      data_prevista: addDaysIso(dataPrimeiroContato, passo.dias),
      data_executada: null,
      status,
      ...(status === "pular" ? { observacoes: "Pulado ao ajustar dia da cadência" } : {}),
    };

    if (existente) {
      const { error } = await supabase
        .from("cadencia")
        .update(payload)
        .eq("id", existente.id)
        .eq("organizacao_id", orgId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("cadencia").insert({
        organizacao_id: orgId,
        lead_id: input.leadId,
        passo: passo.passo,
        ...payload,
      });
      if (error) throw new Error(error.message);
    }
  }

  const { data: proximoPasso, error: proximoError } = await supabase
    .from("cadencia")
    .select("passo, data_prevista")
    .eq("lead_id", input.leadId)
    .eq("organizacao_id", orgId)
    .eq("status", "pendente")
    .order("data_prevista", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (proximoError) throw new Error(proximoError.message);

  const proximaAcao = proximoPasso ? `Enviar ${proximoPasso.passo}` : "Aguardar resposta da cadência";

  const { error: leadError } = await supabase
    .from("leads")
    .update({
      data_primeiro_contato: dataPrimeiroContato,
      proxima_acao: proximaAcao,
      data_proxima_acao: proximoPasso?.data_prevista ?? null,
    })
    .eq("id", input.leadId)
    .eq("organizacao_id", orgId);
  if (leadError) throw new Error(leadError.message);

  await supabase.from("lead_evento").insert({
    organizacao_id: orgId,
    lead_id: input.leadId,
    ator_id: me.id,
    tipo: "cadencia_ajustada",
    payload: {
      passo_atual: input.passoAtual,
      data_prevista_passo: input.dataPrevistaPasso,
      data_primeiro_contato: dataPrimeiroContato,
    },
  });

  revalidatePath("/cadencia");
  revalidatePath("/comunicacao/cadencia");
  revalidatePath("/vendas/pipeline");
  revalidatePath(`/vendas/pipeline/${input.leadId}`);
  revalidatePath("/hoje");

  return {
    ok: true,
    proxima_acao: proximaAcao,
    data_proxima_acao: proximoPasso?.data_prevista ?? null,
    data_primeiro_contato: dataPrimeiroContato,
  };
}

/**
 * Inicia ou reinicia a cadência de um lead manualmente.
 *
 * Comportamento:
 *   - PRESERVA passos já executados (status='enviado' ou 'respondido') — histórico
 *     real de comunicação não é apagado. Esses passos viram "histórico" e ficam
 *     visíveis no detalhe do lead.
 *   - REMOVE passos pendentes ou marcados como pular — serão recriados do zero.
 *   - RECRIA os passos a partir do fluxo publicado/default da organização.
 *     Se não houver fluxo configurado, cai no playbook legado D0/D3/D7/D11/D16/D30.
 */
export async function iniciarCadenciaManual(leadId: number, fluxoId?: number | null) {
  const t = getT(await getServerLocale());
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));

  const supabase = createClient();

  // Valida que o lead pertence à org. RLS já bloqueia leak, mas damos erro claro
  // em vez de "0 rows affected" silencioso.
  const { data: leadCheck } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("organizacao_id", orgId)
    .maybeSingle();
  if (!leadCheck) throw new Error(t("erros.lead_nao_encontrado"));

  await iniciarCadenciaConfiguravel({
    supabase,
    organizacao_id: orgId,
    lead_id: leadId,
    fluxoId,
    preservarExecutados: true,
  });
  revalidatePath("/cadencia");
  revalidatePath("/comunicacao/cadencia");
  revalidatePath("/vendas/pipeline");
  revalidatePath(`/vendas/pipeline/${leadId}`);
  return { ok: true };
}

/**
 * Busca leads do pipeline da org por termo (empresa, nome ou email).
 * Sanitiza o termo pra não quebrar o parser do `.or()` PostgREST.
 */
export async function buscarLeadsParaCadencia(q: string) {
  const t = getT(await getServerLocale());
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));

  // Sanitização: o `.or(string)` do PostgREST usa `,` `(` `)` `*` como separadores
  // de expressão. Caracteres no termo podem quebrar a query. Removemos.
  // (O `.ilike()` usa `*` como curinga; trocamos por `_` quando aparece literal.)
  const termoLimpo = q.replace(/[,()]/g, " ").replace(/\*/g, "_").trim();
  if (termoLimpo.length < 2) return [];
  const termo = `%${termoLimpo}%`;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, empresa, email")
    .eq("organizacao_id", orgId)
    .eq("funnel_stage", "pipeline")
    .or(`nome.ilike.${termo},empresa.ilike.${termo},email.ilike.${termo}`)
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}
