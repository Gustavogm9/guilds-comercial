"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { revalidatePath } from "next/cache";
import { trackFlywheelEvent } from "@/lib/analytics/flywheel";

/** Refresh manual de um CNPJ (sem esperar cron). */
export async function refreshEmpresaCnpj(empresa_id: number): Promise<{ ok: true; mudou: boolean }> {
  if (!Number.isInteger(empresa_id) || empresa_id <= 0) throw new Error("ID inválido.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  const { data: emp } = await supabase
    .from("prospeccao_empresa")
    .select("cnpj, fingerprint")
    .eq("id", empresa_id)
    .maybeSingle();

  if (!emp) throw new Error("Empresa não encontrada.");

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${emp.cnpj}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("CNPJ não encontrado na Receita Federal.");
    throw new Error(`BrasilAPI ${res.status}`);
  }

  const d = await res.json();
  const cidade = d.municipio ? titleCase(d.municipio) : null;
  const socios = (d.qsa ?? []).map((s: any) => ({
    nome: titleCase(s.nome_socio ?? ""),
    qualificacao: s.qualificacao_socio ?? null,
    data_entrada: s.data_entrada_sociedade || null,
    pais_origem: s.pais ?? null,
  })).filter((s: any) => s.nome);

  const cnae = d.cnae_fiscal_descricao ? normalizarCnae(d.cnae_fiscal_descricao) : null;
  const fpAnterior = emp.fingerprint;

  await supabase.rpc("upsert_prospeccao_empresa", {
    _cnpj: emp.cnpj,
    _razao: d.razao_social ?? null,
    _nome_fantasia: d.nome_fantasia?.trim() || null,
    _cnae_codigo: d.cnae_fiscal?.toString() ?? null,
    _cnae_descricao: d.cnae_fiscal_descricao ?? null,
    _cnae_normalizado: cnae,
    _porte: normalizarPorte(d.porte ?? ""),
    _capital: d.capital_social ?? null,
    _situacao: d.descricao_situacao_cadastral ?? null,
    _data_inicio: d.data_inicio_atividade ?? null,
    _data_situacao: d.data_situacao_cadastral ?? null,
    _natureza: d.natureza_juridica ?? null,
    _logradouro: d.logradouro ?? null,
    _numero: d.numero ?? null,
    _complemento: d.complemento ?? null,
    _bairro: d.bairro ?? null,
    _cidade: cidade,
    _uf: d.uf ?? null,
    _cep: d.cep ? String(d.cep).replace(/\D/g, "") : null,
    _telefone_rfb: d.ddd_telefone_1 ?? null,
    _email_rfb: d.email?.toLowerCase() ?? null,
    _raw_brasilapi: d,
    _socios: socios,
  });

  // Verifica se fingerprint mudou
  const { data: empNovo } = await supabase
    .from("prospeccao_empresa")
    .select("fingerprint")
    .eq("id", empresa_id)
    .maybeSingle();

  const mudou = !!(empNovo && empNovo.fingerprint !== fpAnterior);

  revalidatePath(`/vendas/prospeccao/empresa/${empresa_id}`);
  revalidatePath("/vendas/prospeccao/base-de-empresas");
  return { ok: true, mudou };
}

/** Salva nota/tag/flag por org pra uma empresa. */
export async function salvarMetaEmpresaOrg(input: {
  empresa_id: number;
  tags?: string[];
  notas_internas?: string | null;
  evitar?: boolean;
  evitar_motivo?: string | null;
  prioridade_icp?: "alta" | "media" | "baixa" | null;
}): Promise<{ ok: true }> {
  if (!Number.isInteger(input.empresa_id) || input.empresa_id <= 0) throw new Error("ID inválido.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from("prospeccao_empresa_meta_org").upsert({
    empresa_id: input.empresa_id,
    organizacao_id: orgId,
    tags: input.tags ?? [],
    notas_internas: input.notas_internas ?? null,
    evitar: input.evitar ?? false,
    evitar_motivo: input.evitar_motivo ?? null,
    prioridade_icp: input.prioridade_icp ?? null,
    atualizado_por: user?.id ?? null,
  }, { onConflict: "empresa_id,organizacao_id" });

  revalidatePath(`/vendas/prospeccao/empresa/${input.empresa_id}`);
  return { ok: true };
}

/** Toggle bookmark pessoal. */
export async function toggleBookmark(empresa_id: number): Promise<{ ok: true; favoritado: boolean }> {
  if (!Number.isInteger(empresa_id) || empresa_id <= 0) throw new Error("ID inválido.");
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: existente } = await supabase
    .from("prospeccao_empresa_bookmark")
    .select("id")
    .eq("empresa_id", empresa_id)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existente) {
    await supabase.from("prospeccao_empresa_bookmark").delete().eq("id", existente.id);
    revalidatePath(`/vendas/prospeccao/empresa/${empresa_id}`);
    return { ok: true, favoritado: false };
  } else {
    await supabase.from("prospeccao_empresa_bookmark").insert({
      empresa_id, profile_id: user.id, organizacao_id: orgId,
    });
    revalidatePath(`/vendas/prospeccao/empresa/${empresa_id}`);
    return { ok: true, favoritado: true };
  }
}

/** Marca alertas como vistos. */
export async function marcarAlertasVistos(empresa_id: number) {
  if (!Number.isInteger(empresa_id) || empresa_id <= 0) throw new Error("ID inválido.");
  const supabase = createClient();
  await supabase
    .from("prospeccao_alerta_mudanca")
    .update({ visto: true })
    .eq("empresa_id", empresa_id)
    .eq("visto", false);
  revalidatePath(`/vendas/prospeccao/empresa/${empresa_id}`);
  revalidatePath("/vendas/prospeccao/alertas");
  return { ok: true };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function normalizarCnae(desc: string): string {
  const lower = desc.toLowerCase();
  if (lower.includes("seguro")) return "Seguros/Corretora";
  if (lower.includes("imóvel") || lower.includes("imovel")) return "Imóveis";
  if (lower.includes("saúde") || lower.includes("medic")) return "Saúde";
  if (lower.includes("tecnolog") || lower.includes("software")) return "Tecnologia";
  if (lower.includes("educaç")) return "Educação";
  if (lower.includes("jurídic") || lower.includes("advocac")) return "Jurídico";
  if (lower.includes("financ") || lower.includes("contab")) return "Financeiro";
  if (lower.includes("constru")) return "Construção";
  if (lower.includes("varejo") || lower.includes("comércio")) return "Comércio";
  return titleCase(desc.split("/")[0].trim());
}
function normalizarPorte(porte: string): string {
  const map: Record<string, string> = {
    "MICRO EMPRESA": "Micro",
    "EMPRESA DE PEQUENO PORTE": "Pequena",
    "DEMAIS": "Médio/Grande",
  };
  return map[porte?.toUpperCase()] ?? porte ?? "—";
}
