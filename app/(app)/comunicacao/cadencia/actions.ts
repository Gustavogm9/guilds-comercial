"use server";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import { getServerLocale, getT } from "@/lib/i18n";
import { montarCadenciaRows } from "@/lib/cadencia-templates";

type StatusCadencia = "pendente" | "enviado" | "respondido" | "pular" | "removido";

const STATUS_VALIDOS: StatusCadencia[] = ["pendente", "enviado", "respondido", "pular", "removido"];

/**
 * Salva a mensagem gerada por IA num passo de cadência específico (lead+passo)
 * e marca como enviado. Usado quando o vendedor copia ou abre WhatsApp do
 * CadenciaPassoCard — antes a mensagem era state local e perdida ao recarregar.
 */
export async function salvarMensagemPassoEnviada(input: {
  leadId: number;
  passo: "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
  mensagem: string;
}) {
  const t = getT(await getServerLocale());
  const me = await getCurrentProfile();
  if (!me) throw new Error(t("erros.usuario_nao_autenticado"));

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error(t("erros.sem_org"));

  const supabase = createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("cadencia")
    .update({
      status: "enviado",
      data_executada: hoje,
      mensagem_enviada: input.mensagem.slice(0, 5000),
    })
    .eq("lead_id", input.leadId)
    .eq("passo", input.passo)
    .eq("organizacao_id", orgId);

  if (error) throw new Error(error.message);

  revalidatePath("/cadencia");
  revalidatePath(`/vendas/pipeline/${input.leadId}`);
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

  if (novoStatus === "enviado" || novoStatus === "respondido") {
    update.data_executada = new Date().toISOString().slice(0, 10);
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

  revalidatePath("/cadencia");
  revalidatePath("/hoje");
  revalidatePath("/vendas/pipeline");

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
  return { ok: true, novaData };
}

/**
 * Inicia ou reinicia a cadência de um lead manualmente.
 *
 * Comportamento:
 *   - PRESERVA passos já executados (status='enviado' ou 'respondido') — histórico
 *     real de comunicação não é apagado. Esses passos viram "histórico" e ficam
 *     visíveis no detalhe do lead.
 *   - REMOVE passos pendentes ou marcados como pular — serão recriados do zero.
 *   - RECRIA os 6 passos D0/D3/D7/D11/D16/D30 com data_prevista a partir de hoje.
 *
 * Usa `upsert` com `onConflict: "lead_id,passo"` — bate com o padrão de
 * `app/(app)/base/actions.ts` quando promove lead pra pipeline.
 */
export async function iniciarCadenciaManual(leadId: number) {
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

  // Remove APENAS passos pendentes ou pular — preserva enviados/respondidos
  // (histórico real de comunicação não pode ser apagado por reiniciar cadência).
  await supabase
    .from("cadencia")
    .delete()
    .eq("lead_id", leadId)
    .eq("organizacao_id", orgId)
    .in("status", ["pendente", "pular"]);

  // Constrói os 6 rows da cadência (D0/D3/D7/D11/D16/D30) com canal + objetivo
  // canônicos (lib/cadencia-templates → PASSOS_CADENCIA).
  const cadenciaRows = montarCadenciaRows({ organizacao_id: orgId, lead_id: leadId });

  // upsert com onConflict — se um passo D0 já estiver marcado como enviado/respondido,
  // o passo NÃO foi apagado acima e o upsert vai pular pelo unique (lead_id,passo).
  // Resultado: só passos novos/recriados entram, histórico preservado.
  const { error } = await supabase
    .from("cadencia")
    .upsert(cadenciaRows, { onConflict: "lead_id,passo", ignoreDuplicates: true });

  if (error) throw new Error(error.message);

  revalidatePath("/cadencia");
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
