/**
 * Cron diário: refresh CNPJ + detecção de mudanças.
 *
 * Pega 50 empresas com updated_at > 30 dias atrás. Consulta BrasilAPI.
 * Compara fingerprint anterior vs novo. Se mudou, insere alerta.
 * Se mudança crítica (situação → BAIXADA), dispara push pro responsável
 * de leads ligados a essa empresa.
 *
 * Rate-limit 3 req/s. Em 60s = max ~180 empresas/dia. Pra ~10k empresas
 * isso ciclaria ~55 dias — aceitável (CNPJ raramente muda mensalmente).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_TIME_MS = 55_000;
const RATE_LIMIT_MS = 350;

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

  // Empresas que não foram atualizadas há 30+ dias, priorizando ATIVAs
  const dataLimite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: empresas } = await supa
    .from("prospeccao_empresa")
    .select("id, cnpj, fingerprint, situacao, capital_social")
    .lt("updated_at", dataLimite)
    .order("updated_at", { ascending: true })
    .limit(200);

  if (!empresas || empresas.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, mensagem: "Nada pra atualizar." });
  }

  const startedAt = Date.now();
  let atualizadas = 0;
  let alertasGerados = 0;
  let erros = 0;

  for (const emp of empresas as any[]) {
    if (Date.now() - startedAt > BATCH_TIME_MS) break;

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${emp.cnpj}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        if (res.status === 404) {
          // Empresa baixada da Receita
          await registrarAlerta(supa, emp.id, "situacao_mudou", emp.fingerprint, null, {
            situacao_anterior: emp.situacao,
            situacao_atual: "REMOVIDA_DA_RFB",
          });
          alertasGerados += 1;
        } else {
          erros += 1;
        }
        continue;
      }

      const d = await res.json();
      const socios = (d.qsa ?? []).map((s: any) => ({
        nome: (s.nome_socio ?? "").toLowerCase(),
        qualificacao: s.qualificacao_socio ?? "",
      }));

      const novoFingerprint = await md5(
        (d.razao_social ?? "") +
        (d.capital_social ?? "") +
        (d.descricao_situacao_cadastral ?? "") +
        JSON.stringify(socios)
      );

      if (novoFingerprint === emp.fingerprint) {
        // Sem mudança — só atualiza updated_at
        await supa.from("prospeccao_empresa").update({
          ultima_consulta_em: new Date().toISOString(),
        }).eq("id", emp.id);
        atualizadas += 1;
        continue;
      }

      // Detectou mudança — identifica tipo
      const situacaoAtual = d.descricao_situacao_cadastral ?? null;
      const capitalAtual = d.capital_social ?? null;
      const cnaeAtual = d.cnae_fiscal?.toString() ?? null;

      if (situacaoAtual !== emp.situacao) {
        await registrarAlerta(supa, emp.id, "situacao_mudou", emp.fingerprint, novoFingerprint, {
          situacao_anterior: emp.situacao,
          situacao_atual: situacaoAtual,
        });
        alertasGerados += 1;

        // Push pra responsáveis de leads dessa empresa
        if (situacaoAtual !== "ATIVA") {
          await pushAlertaSituacao(supa, emp.cnpj, situacaoAtual ?? "?");
        }
      }

      if (capitalAtual != null && emp.capital_social != null) {
        const variacaoPct = Math.abs((Number(capitalAtual) - Number(emp.capital_social)) / Number(emp.capital_social)) * 100;
        if (variacaoPct >= 20) {
          await registrarAlerta(supa, emp.id, "capital_mudou", emp.fingerprint, novoFingerprint, {
            anterior: emp.capital_social,
            atual: capitalAtual,
            variacao_pct: Math.round(variacaoPct),
          });
          alertasGerados += 1;
        }
      }

      // Sócios — compara nomes
      const { data: sociosAtuais } = await supa
        .from("prospeccao_socio")
        .select("nome")
        .eq("empresa_id", emp.id);
      const nomesAntigos = new Set(((sociosAtuais ?? []) as any[]).map((s) => (s.nome ?? "").toLowerCase()));
      const nomesNovos = new Set(socios.map((s: any) => s.nome));
      const entrou = [...nomesNovos].filter((n) => !nomesAntigos.has(n));
      const saiu = [...nomesAntigos].filter((n) => !nomesNovos.has(n));
      if (entrou.length > 0) {
        await registrarAlerta(supa, emp.id, "novo_socio", emp.fingerprint, novoFingerprint, { nomes: entrou });
        alertasGerados += 1;
      }
      if (saiu.length > 0) {
        await registrarAlerta(supa, emp.id, "socio_saiu", emp.fingerprint, novoFingerprint, { nomes: saiu });
        alertasGerados += 1;
      }

      // Re-upsert via RPC com dados frescos
      const cidade = d.municipio ? titleCase(d.municipio) : null;
      const cnae = d.cnae_fiscal_descricao ? normalizarCnae(d.cnae_fiscal_descricao) : null;
      const sociosNormalizados = (d.qsa ?? []).map((s: any) => ({
        nome: titleCase(s.nome_socio ?? ""),
        qualificacao: s.qualificacao_socio ?? null,
        data_entrada: s.data_entrada_sociedade || null,
        pais_origem: s.pais ?? null,
      })).filter((s: any) => s.nome);

      await supa.rpc("upsert_prospeccao_empresa", {
        _cnpj: emp.cnpj,
        _razao: d.razao_social ?? null,
        _nome_fantasia: d.nome_fantasia?.trim() || null,
        _cnae_codigo: cnaeAtual,
        _cnae_descricao: d.cnae_fiscal_descricao ?? null,
        _cnae_normalizado: cnae,
        _porte: normalizarPorte(d.porte ?? ""),
        _capital: capitalAtual,
        _situacao: situacaoAtual,
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
        _socios: sociosNormalizados,
      });

      atualizadas += 1;
    } catch (e) {
      console.warn(`[refresh-cnpj] erro CNPJ ${emp.cnpj}:`, e);
      erros += 1;
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  return NextResponse.json({
    ok: true,
    candidatos: empresas.length,
    atualizadas,
    alertas: alertasGerados,
    erros,
  });
}

async function registrarAlerta(
  supa: any,
  empresa_id: number,
  tipo: string,
  fp_ant: string | null,
  fp_atual: string | null,
  payload: any,
) {
  await supa.from("prospeccao_alerta_mudanca").insert({
    empresa_id,
    tipo,
    fingerprint_anterior: fp_ant,
    fingerprint_atual: fp_atual,
    payload,
  });
}

async function pushAlertaSituacao(supa: any, cnpj: string, situacao: string) {
  // Acha responsáveis de leads ligados a este CNPJ
  const { data: leads } = await supa
    .from("leads")
    .select("id, empresa, responsavel_id, organizacao_id")
    .or(`origem_prospeccao->>cnpj.eq.${cnpj},observacoes.ilike.%${cnpj}%`)
    .not("responsavel_id", "is", null);

  for (const lead of (leads ?? []) as any[]) {
    try {
      await sendPushToUser(lead.responsavel_id, {
        evento: "health_risco_critico",  // reusa um dos eventos do flywheel
        title: `⚠ CNPJ mudou: ${lead.empresa ?? cnpj}`,
        body: `Situação cadastral agora é "${situacao}". Verifique antes de continuar prospecção.`,
        url: `/pipeline/${lead.id}`,
        tag: `cnpj-${cnpj}-${situacao}`,
      });
    } catch (e) {
      console.warn(`[push CNPJ mudou] falhou pra lead ${lead.id}:`, e);
    }
  }
}

// MD5 helpers (web crypto compat node)
async function md5(input: string): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("md5").update(input).digest("hex");
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
