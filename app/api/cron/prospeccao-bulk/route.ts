/**
 * Cron: processa jobs de prospeccao_bulk_jobs.
 *
 * A cada 2 min pega 1 job pendente OU processando. Consulta BrasilAPI com
 * rate-limit (~333ms entre requests = 3/s, abaixo do limite free 5/s).
 * Upserta empresa em prospeccao_empresa via RPC + opcionalmente cria lead.
 *
 * Itera até max 60s (cron janela). Marca job como concluído quando
 * processados === total.
 *
 * Idempotência: cada item pelo CNPJ; se já foi enriquecido nesse job, pula.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_TIME_MS = 50_000;          // tempo máximo de processamento
const RATE_LIMIT_MS = 350;             // ~2.85 req/s (BrasilAPI free é 5/s)

interface Item {
  cnpj: string;
  linha_original?: string;
  processado?: boolean;
}

interface Resultado {
  cnpj: string;
  status: "ok" | "duplicado" | "erro" | "nao_encontrado";
  empresa_id?: number;
  lead_id?: number;
  erro?: string;
}

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Pega 1 job processando (continua) ou pendente (começa)
  const { data: jobs } = await supa
    .from("prospeccao_bulk_jobs")
    .select("*")
    .in("status", ["processando", "pendente"])
    .order("status", { ascending: true })  // processando vem antes (continua)
    .order("created_at", { ascending: true })
    .limit(1);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const job = jobs[0] as any;
  const startedAt = Date.now();

  // Marca como processando (se ainda era pendente)
  if (job.status === "pendente") {
    await supa.from("prospeccao_bulk_jobs").update({
      status: "processando",
      started_at: new Date().toISOString(),
    }).eq("id", job.id);
  }

  const itens = (job.itens ?? []) as Item[];
  const resultados = (job.resultados ?? []) as Resultado[];
  const jaProcessados = new Set(resultados.map((r) => r.cnpj));

  let processadosNoBatch = 0;
  let novosEnriquecidos = 0;
  let novosDuplicados = 0;
  let novosErros = 0;
  let ultimoErro: string | null = null;

  for (const item of itens) {
    if (jaProcessados.has(item.cnpj)) continue;
    if (Date.now() - startedAt > BATCH_TIME_MS) break;

    try {
      const r = await processarUm(supa, item.cnpj, job);
      resultados.push(r);
      jaProcessados.add(item.cnpj);
      processadosNoBatch += 1;
      if (r.status === "ok") novosEnriquecidos += 1;
      else if (r.status === "duplicado") novosDuplicados += 1;
      else { novosErros += 1; if (r.erro) ultimoErro = r.erro; }
    } catch (e) {
      const erro = e instanceof Error ? e.message : "erro desconhecido";
      resultados.push({ cnpj: item.cnpj, status: "erro", erro });
      jaProcessados.add(item.cnpj);
      processadosNoBatch += 1;
      novosErros += 1;
      ultimoErro = erro;
    }

    // Rate-limit
    await new Promise((res) => setTimeout(res, RATE_LIMIT_MS));
  }

  const totalProcessados = jaProcessados.size;
  const concluido = totalProcessados >= itens.length;

  await supa.from("prospeccao_bulk_jobs").update({
    processados: totalProcessados,
    enriquecidos: job.enriquecidos + novosEnriquecidos,
    duplicados: job.duplicados + novosDuplicados,
    erros: job.erros + novosErros,
    resultados,
    status: concluido ? "concluido" : "processando",
    finished_at: concluido ? new Date().toISOString() : null,
    ultimo_erro: ultimoErro,
  }).eq("id", job.id);

  return NextResponse.json({
    ok: true,
    job_id: job.id,
    processed: processadosNoBatch,
    total: itens.length,
    enriquecidos: novosEnriquecidos,
    duplicados: novosDuplicados,
    erros: novosErros,
    concluido,
  });
}

async function processarUm(supa: any, cnpj: string, job: any): Promise<Resultado> {
  // 1. Consulta BrasilAPI
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 404) return { cnpj, status: "nao_encontrado" };
  if (!res.ok) return { cnpj, status: "erro", erro: `BrasilAPI ${res.status}` };

  const d = await res.json();

  // 2. Normaliza
  const cidade = d.municipio ? titleCase(d.municipio) : null;
  const uf = d.uf ?? null;
  const cnae = d.cnae_fiscal_descricao ? normalizarCnae(d.cnae_fiscal_descricao) : null;

  const socios = (d.qsa ?? []).map((s: any) => ({
    nome: titleCase(s.nome_socio ?? ""),
    qualificacao: s.qualificacao_socio ?? null,
    data_entrada: s.data_entrada_sociedade || null,
    pais_origem: s.pais ?? null,
  })).filter((s: any) => s.nome);

  // 3. Upsert empresa
  const { data: empresaId, error } = await supa.rpc("upsert_prospeccao_empresa", {
    _cnpj: cnpj,
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
    _uf: uf,
    _cep: d.cep ? String(d.cep).replace(/\D/g, "") : null,
    _telefone_rfb: d.ddd_telefone_1 ? normalizarTelefone(d.ddd_telefone_1) : null,
    _email_rfb: d.email?.toLowerCase() ?? null,
    _raw_brasilapi: d,
    _socios: socios,
  });

  if (error) return { cnpj, status: "erro", erro: error.message };

  // 4. Opcional: ativa como lead
  if (job.ativar_como_lead) {
    const empresaNome = d.nome_fantasia?.trim() || titleCase(d.razao_social ?? "");

    // Dedup: já existe lead com este CNPJ na org?
    const { data: existente } = await supa
      .from("leads")
      .select("id")
      .eq("organizacao_id", job.organizacao_id)
      .or(`observacoes.ilike.%${cnpj}%,empresa.eq.${empresaNome.replace(/[,()*]/g, " ").slice(0, 80)}`)
      .limit(1)
      .maybeSingle();

    if (existente) {
      return { cnpj, status: "duplicado", empresa_id: empresaId };
    }

    const cidadeUf = cidade && uf ? `${cidade}/${uf}` : (cidade ?? uf);
    const { data: lead } = await supa.from("leads").insert({
      organizacao_id: job.organizacao_id,
      empresa: empresaNome,
      email: d.email?.toLowerCase() ?? null,
      whatsapp: d.ddd_telefone_1 ? normalizarTelefone(d.ddd_telefone_1) : null,
      segmento: cnae,
      cidade_uf: cidadeUf,
      funnel_stage: "base_bruta",
      crm_stage: null,
      temperatura: "Frio",
      prioridade: "C",
      fonte: "bulk_import",
      observacoes: `CNPJ: ${cnpj} · CNAE: ${d.cnae_fiscal_descricao ?? "—"}`,
      responsavel_id: job.criado_por,
      origem_prospeccao: {
        tipo: "bulk_import",
        bulk_job_id: job.id,
        prospeccao_empresa_id: empresaId,
        cnpj,
      },
    }).select("id").single();

    // Cadência D0 se solicitado
    if (job.iniciar_cadencia && lead?.id) {
      try {
        await supa.from("cadencia").insert({
          organizacao_id: job.organizacao_id,
          lead_id: lead.id,
          passo: "D0",
          canal: "email",
          status: "pendente",
          data_prevista: new Date().toISOString().slice(0, 10),
        });
      } catch {/* swallow — cadência já existir é OK */ }
    }

    return { cnpj, status: "ok", empresa_id: empresaId, lead_id: lead?.id };
  }

  return { cnpj, status: "ok", empresa_id: empresaId };
}

// ─── Helpers (duplicado pra evitar dependência cíclica com rotas) ───────────

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

function normalizarTelefone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return raw;
}
