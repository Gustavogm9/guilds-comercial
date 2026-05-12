"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId, getCurrentRole } from "@/lib/supabase/org";
import { trackFlywheelEvent } from "@/lib/analytics/flywheel";
import { revalidatePath } from "next/cache";

const MAX_ITENS = 500;

/**
 * Cria job de bulk import. Valida CNPJs e enfileira pro cron processar.
 */
export async function criarBulkJob(input: {
  cnpjs_raw: string;            // texto cru — CSV ou linhas
  ativar_como_lead: boolean;
  iniciar_cadencia: boolean;
}): Promise<{
  ok: true;
  job_id: number;
  total_validos: number;
  total_invalidos: number;
}> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores podem importar em massa.");

  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Parse: aceita CSV (vírgula/ponto-vírgula/tab) OU 1 por linha
  const linhas = input.cnpjs_raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const itens: Array<{ cnpj: string; linha_original: string }> = [];
  let invalidos = 0;
  const cnpjsVistos = new Set<string>();

  for (const linha of linhas) {
    // Pega o primeiro grupo de dígitos que parece CNPJ
    const apenasDigitos = linha.replace(/[^\d]/g, "");
    // Procura 14 dígitos contíguos (CNPJ completo)
    const match = apenasDigitos.match(/(\d{14})/);
    if (!match) {
      invalidos += 1;
      continue;
    }
    const cnpj = match[1];
    if (cnpjsVistos.has(cnpj)) continue;
    cnpjsVistos.add(cnpj);
    itens.push({ cnpj, linha_original: linha.slice(0, 200) });
    if (itens.length >= MAX_ITENS) break;
  }

  if (itens.length === 0) {
    throw new Error("Nenhum CNPJ válido encontrado. Verifique o formato (14 dígitos, com ou sem máscara).");
  }

  const { data: job, error } = await supabase
    .from("prospeccao_bulk_jobs")
    .insert({
      organizacao_id: orgId,
      criado_por: user?.id ?? null,
      itens,
      total: itens.length,
      status: "pendente",
      ativar_como_lead: input.ativar_como_lead,
      iniciar_cadencia: input.iniciar_cadencia,
    })
    .select("id")
    .single();

  if (error || !job) throw new Error(error?.message ?? "Falha ao criar job.");

  revalidatePath("/vendas/prospeccao/bulk-import");
  trackFlywheelEvent("prospeccao_bulk_criado", {
    job_id: job.id,
    total: itens.length,
    invalidos,
    ativar_lead: input.ativar_como_lead,
    cadencia: input.iniciar_cadencia,
  }).catch(() => {});
  return {
    ok: true,
    job_id: job.id,
    total_validos: itens.length,
    total_invalidos: invalidos,
  };
}

export async function cancelarBulkJob(job_id: number): Promise<{ ok: true }> {
  const role = await getCurrentRole();
  if (role !== "gestor") throw new Error("Apenas gestores.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem org.");

  const supabase = createClient();
  await supabase
    .from("prospeccao_bulk_jobs")
    .update({ status: "cancelado", finished_at: new Date().toISOString() })
    .eq("id", job_id)
    .eq("organizacao_id", orgId)
    .in("status", ["pendente", "processando"]);

  revalidatePath("/vendas/prospeccao/bulk-import");
  return { ok: true };
}
