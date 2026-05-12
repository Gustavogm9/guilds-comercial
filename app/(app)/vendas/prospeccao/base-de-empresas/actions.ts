"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { iniciarCadenciaManual } from "@/app/(app)/comunicacao/cadencia/actions";
import { trackFlywheelEvent } from "@/lib/analytics/flywheel";
import { revalidatePath } from "next/cache";

/**
 * Ativa uma empresa do cache local (`prospeccao_empresa`) como lead na org.
 *
 * - Cria lead na base bruta com `origem_prospeccao` rastreado
 * - Opcionalmente cria contato (responsavel da empresa) usando sócio
 * - Opcionalmente inicia cadência D0 já após criar
 * - Dedup fuzzy: se já existe lead com CNPJ ou empresa similar, retorna duplicado=true
 */
export async function ativarEmpresaComoLead(input: {
  empresa_id: number;
  socio_id?: number | null;
  iniciar_cadencia?: boolean;
}): Promise<{
  ok: true;
  lead_id?: number;
  lead_empresa: string;
  duplicado?: boolean;
}> {
  if (!Number.isInteger(input.empresa_id) || input.empresa_id <= 0) {
    throw new Error("ID inválido.");
  }
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Busca empresa + sócio (se informado)
  const { data: empresa } = await supabase
    .from("v_prospeccao_empresa")
    .select("*")
    .eq("id", input.empresa_id)
    .maybeSingle();

  if (!empresa) throw new Error("Empresa não encontrada.");

  const empresaNome = (empresa as any).nome_fantasia || (empresa as any).razao_social || (empresa as any).cnpj_formatado;
  const cnpj = (empresa as any).cnpj as string;

  // Sócio selecionado (opcional)
  let socioNome: string | null = null;
  let socioCargo: string | null = null;
  let socioEmail: string | null = null;
  let socioLinkedin: string | null = null;
  if (input.socio_id) {
    const { data: socio } = await supabase
      .from("prospeccao_socio")
      .select("nome, qualificacao, cargo_atual, linkedin_url, email")
      .eq("id", input.socio_id)
      .eq("empresa_id", input.empresa_id)
      .maybeSingle();
    if (socio) {
      socioNome = socio.nome;
      socioCargo = (socio as any).cargo_atual || (socio as any).qualificacao || null;
      socioEmail = (socio as any).email || null;
      socioLinkedin = (socio as any).linkedin_url || null;
    }
  }

  // Dedup: já existe lead com este CNPJ ou empresa similar?
  const { data: existente } = await supabase
    .from("leads")
    .select("id, empresa")
    .eq("organizacao_id", orgId)
    .or(`empresa.ilike.${empresaNome.replace(/[,()*]/g, " ").slice(0, 40)}%,observacoes.ilike.%${cnpj}%`)
    .limit(1)
    .maybeSingle();

  if (existente) {
    return { ok: true, lead_empresa: empresaNome, duplicado: true };
  }

  // Cria lead
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      organizacao_id: orgId,
      empresa: empresaNome,
      nome: socioNome,
      cargo: socioCargo,
      email: socioEmail || (empresa as any).email_enriquecido || (empresa as any).email_rfb || null,
      whatsapp: (empresa as any).whatsapp_enriquecido || (empresa as any).telefone_rfb || null,
      linkedin: socioLinkedin || (empresa as any).linkedin_url || null,
      site: (empresa as any).site || null,
      segmento: (empresa as any).cnae_normalizado || null,
      cidade_uf: (empresa as any).cidade && (empresa as any).uf
        ? `${(empresa as any).cidade}/${(empresa as any).uf}` : null,
      funnel_stage: "base_bruta",
      crm_stage: "Base",
      temperatura: "Frio",
      prioridade: "C",
      fonte: "base_empresas_local",
      observacoes: `CNPJ: ${(empresa as any).cnpj_formatado}${(empresa as any).descricao_negocio ? ` · ${(empresa as any).descricao_negocio}` : ""}`,
      responsavel_id: user?.id ?? null,
      origem_prospeccao: {
        tipo: "base_empresas",
        prospeccao_empresa_id: input.empresa_id,
        socio_id: input.socio_id ?? null,
        cnpj,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Inicia cadência se solicitado
  if (input.iniciar_cadencia && lead?.id) {
    try {
      await iniciarCadenciaManual(lead.id);
    } catch (e) {
      console.warn("[ativarEmpresaComoLead] cadencia falhou:", e);
    }
  }

  revalidatePath("/vendas/base");
  revalidatePath("/vendas/prospeccao/base-de-empresas");
  trackFlywheelEvent("prospeccao_empresa_ativada", {
    empresa_id: input.empresa_id,
    com_socio: !!input.socio_id,
    com_cadencia: !!input.iniciar_cadencia,
  }).catch(() => {});
  return { ok: true, lead_id: lead.id, lead_empresa: empresaNome };
}

/**
 * Exporta empresas filtradas como CSV. Aplica os MESMOS filtros da listagem.
 * Limite de 5000 linhas (empresas) por export.
 *
 * Modos:
 *   - "empresas": 1 linha por empresa (default, leitura humana rápida)
 *   - "qsa":      1 linha por (empresa × sócio) — fica longo, mas tem QSA
 *                  completo pra integração externa (CRM/ERP)
 */
export async function exportarEmpresasCsv(filtros: {
  q: string;
  porte: string;
  uf: string;
  cnae: string;
  situacao: string;
  capital_min: number | null;
}, modo: "empresas" | "qsa" = "empresas"): Promise<{ csv: string; linhas: number }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const supabase = createClient();
  let query = supabase.from("v_prospeccao_empresa").select("*");

  if (filtros.situacao !== "all") query = query.eq("situacao", filtros.situacao);
  if (filtros.porte !== "all") query = query.eq("porte", filtros.porte);
  if (filtros.uf !== "all") query = query.eq("uf", filtros.uf);
  if (filtros.cnae) query = query.ilike("cnae_normalizado", `%${filtros.cnae}%`);
  if (filtros.capital_min != null) query = query.gte("capital_social", filtros.capital_min);
  if (filtros.q) {
    const safeQ = filtros.q.replace(/[,()*]/g, " ");
    query = query.or(
      `razao_social.ilike.%${safeQ}%,nome_fantasia.ilike.%${safeQ}%,descricao_negocio.ilike.%${safeQ}%,cnpj.ilike.%${safeQ.replace(/\D/g, "")}%`
    );
  }

  const { data } = await query.limit(5000);
  const rows = (data ?? []) as any[];

  let csvLines: string[];
  let totalLinhas: number;

  if (modo === "qsa") {
    // 1 linha por sócio — quem não tem sócio aparece com campos vazios
    const header = [
      "CNPJ", "Razao Social", "Nome Fantasia", "CNAE Categoria", "Porte",
      "Capital Social", "Situacao", "Cidade", "UF", "Site", "Email Empresa",
      "Socio Nome", "Socio Qualificacao", "Socio Cargo Atual",
      "Socio Email", "Socio LinkedIn", "Socio Data Entrada",
    ];
    const linhas: string[] = [header.map(csvEscape).join(",")];
    for (const r of rows) {
      const socios = (r.socios ?? []) as any[];
      const baseEmpresa = [
        r.cnpj_formatado,
        r.razao_social ?? "",
        r.nome_fantasia ?? "",
        r.cnae_normalizado ?? "",
        r.porte ?? "",
        r.capital_social ?? "",
        r.situacao ?? "",
        r.cidade ?? "",
        r.uf ?? "",
        r.site ?? "",
        r.email_enriquecido ?? r.email_rfb ?? "",
      ];
      if (socios.length === 0) {
        linhas.push([...baseEmpresa, "", "", "", "", "", ""].map(csvEscape).join(","));
      } else {
        for (const s of socios) {
          linhas.push([
            ...baseEmpresa,
            s.nome ?? "",
            s.qualificacao ?? "",
            s.cargo_atual ?? "",
            s.email ?? "",
            s.linkedin_url ?? "",
            s.data_entrada ?? "",
          ].map(csvEscape).join(","));
        }
      }
    }
    csvLines = linhas;
    totalLinhas = linhas.length - 1; // exclui header
  } else {
    const header = [
      "CNPJ", "Razao Social", "Nome Fantasia", "CNAE", "CNAE Categoria",
      "Porte", "Capital Social", "Situacao", "Data Inicio",
      "Cidade", "UF", "Site", "LinkedIn", "Email", "WhatsApp",
      "Total Socios", "Descricao",
    ];
    csvLines = [
      header.map(csvEscape).join(","),
      ...rows.map((r) => [
        r.cnpj_formatado,
        r.razao_social ?? "",
        r.nome_fantasia ?? "",
        r.cnae_descricao ?? "",
        r.cnae_normalizado ?? "",
        r.porte ?? "",
        r.capital_social ?? "",
        r.situacao ?? "",
        r.data_inicio_atividade ?? "",
        r.cidade ?? "",
        r.uf ?? "",
        r.site ?? "",
        r.linkedin_url ?? "",
        r.email_enriquecido ?? r.email_rfb ?? "",
        r.whatsapp_enriquecido ?? r.telefone_rfb ?? "",
        r.total_socios ?? 0,
        r.descricao_negocio ?? "",
      ].map(csvEscape).join(",")),
    ];
    totalLinhas = rows.length;
  }

  // BOM UTF-8 pra Excel abrir com acentos certinhos
  const csv = "﻿" + csvLines.join("\r\n");
  trackFlywheelEvent("prospeccao_csv_exportado", { linhas: totalLinhas, filtros, modo }).catch(() => {});
  return { csv, linhas: totalLinhas };
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
