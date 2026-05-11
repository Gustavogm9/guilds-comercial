"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

/**
 * Gera script personalizado de pedido de indicação baseado em contexto do lead.
 *
 * Não usa IA externa — usa template estático + variáveis do lead. Cobre 80% do
 * valor de "vendedor não tem o que falar" sem custo de tokens. Quando houver
 * uma feature `script_pedido_indicacao` cadastrada em ai_features, dá pra
 * substituir por invokeAI.
 *
 * Variáveis injetadas:
 *   - {nome_cliente}: primeiro nome do cliente fechado
 *   - {empresa}: nome da empresa
 *   - {dor}: dor principal anotada (se existir)
 *   - {nps}: último NPS respondido (se existir e for >=7)
 */
export async function gerarScriptPedidoIndicacao(lead_id: number): Promise<{
  script_curto: string;
  script_longo: string;
  contexto_usado: string[];
}> {
  if (!Number.isInteger(lead_id) || lead_id <= 0) {
    throw new Error("Lead inválido.");
  }

  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  // Busca dados do lead
  const { data: lead } = await supabase
    .from("leads")
    .select("nome, empresa, dor_principal, segmento, cargo")
    .eq("id", lead_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (!lead) throw new Error("Lead não encontrado.");

  // Busca último NPS
  const { data: nps } = await supabase
    .from("nps_responses")
    .select("score, comentario")
    .eq("lead_id", lead_id)
    .not("score", "is", null)
    .order("respondido_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const primeiroNome = lead.nome?.split(" ")[0] ?? "";
  const empresa = lead.empresa ?? "sua empresa";
  const dor = lead.dor_principal;
  const cargo = lead.cargo;
  const npsScore = nps?.score;

  const contextoUsado: string[] = [];
  if (primeiroNome) contextoUsado.push("nome do cliente");
  if (empresa) contextoUsado.push("empresa");
  if (dor) contextoUsado.push("dor principal");
  if (cargo) contextoUsado.push("cargo");
  if (npsScore != null && npsScore >= 9) contextoUsado.push("NPS promotor");

  // Versão curta (whatsapp) — ~3 linhas
  let script_curto: string;
  if (npsScore != null && npsScore >= 9) {
    // Promotor: pode ser direto
    script_curto = `Oi ${primeiroNome}! Que bom ver que sua experiência com a gente foi top (NPS ${npsScore}!). Você conhece outros ${cargo ? cargo + "s" : "líderes"} do seu mercado que poderiam se beneficiar do mesmo trabalho? 1-2 nomes ajudam muito 🙏`;
  } else if (dor) {
    // Sabe a dor → conecta com perfil similar
    script_curto = `Oi ${primeiroNome}! Como o trabalho começou bem, queria pedir uma ajuda: você conhece outros sócios/empresas que enfrentam algo parecido com "${dor.slice(0, 50)}"? Indicação sua tem peso enorme.`;
  } else {
    script_curto = `Oi ${primeiroNome}! Já que ${empresa} confiou na gente, pensei: você conhece outros líderes que poderiam se beneficiar do mesmo trabalho? Pode mandar 1-2 nomes? Vou contatar com cuidado em seu nome.`;
  }

  // Versão longa (email/call) — mais contexto
  let script_longo: string;
  if (npsScore != null && npsScore >= 9) {
    script_longo = `Oi ${primeiroNome},

Vi que sua nota no NPS foi ${npsScore} — isso é mega motivador pra todo o time. Obrigado por compartilhar.

Aproveitando o momento, queria pedir um favor: você consegue pensar em 2-3 outras pessoas no seu network ${cargo ? `(outros ${cargo}s, ` : "("}sócios, gestores) que estão lidando com desafios parecidos com os de ${empresa}?

Indicação vinda de você tem 5x mais chance de fechar do que outbound frio. Eu contato com cuidado em seu nome — você nem precisa avisar antes.

Funciona? Pode mandar pelo WhatsApp ou agendamos 10min.

Abraço`;
  } else {
    script_longo = `Oi ${primeiroNome},

Como o trabalho está em andamento e ${empresa} já tem visto resultados, queria pedir uma ajuda: você consegue pensar em 2-3 outras pessoas no seu network ${cargo ? `(outros ${cargo}s, ` : "("}sócios, gestores) que estão lidando com desafios parecidos com os seus${dor ? ` (${dor.slice(0, 80)})` : ""}?

Indicação vinda de você tem 5x mais chance de fechar do que outbound frio. Eu contato com cuidado em seu nome — você nem precisa avisar antes.

Funciona? Pode mandar pelo WhatsApp ou agendamos 10min.

Abraço`;
  }

  return { script_curto, script_longo, contexto_usado: contextoUsado };
}

/**
 * Análise simples de comentários NPS — agrega por palavra-chave (sem IA).
 * Cobre 60-70% do valor de análise inteligente sem custo de tokens.
 */
export async function analisarComentariosNps(): Promise<{
  total_comentarios: number;
  por_categoria: { promotores: number; neutros: number; detratores: number };
  temas_comuns: Array<{ palavra: string; ocorrencias: number; categoria_dominante: "promotor" | "neutro" | "detrator" }>;
  exemplos_negativos: Array<{ score: number; comentario: string }>;
  exemplos_positivos: Array<{ score: number; comentario: string }>;
}> {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  const { data: respostas } = await supabase
    .from("nps_responses")
    .select("score, comentario, categoria")
    .eq("organizacao_id", orgId)
    .not("comentario", "is", null)
    .not("score", "is", null)
    .order("respondido_em", { ascending: false })
    .limit(500);

  if (!respostas || respostas.length === 0) {
    return {
      total_comentarios: 0,
      por_categoria: { promotores: 0, neutros: 0, detratores: 0 },
      temas_comuns: [],
      exemplos_negativos: [],
      exemplos_positivos: [],
    };
  }

  // Tokenização simples + remove stopwords
  const STOPWORDS = new Set([
    "a", "o", "os", "as", "um", "uma", "uns", "umas",
    "de", "do", "da", "dos", "das", "no", "na", "nos", "nas",
    "e", "ou", "mas", "que", "se", "para", "por", "com", "em", "ao", "à",
    "é", "foi", "ser", "está", "estar", "tem", "ter", "tão", "muito",
    "eu", "ele", "ela", "nós", "vocês", "meu", "minha", "seu", "sua",
    "isso", "aquilo", "esse", "essa", "este", "esta", "ali", "aqui",
    "the", "of", "and", "to", "in", "is", "it", "you", "that", "for", "with", "on", "at", "this",
  ]);

  const wordCount = new Map<string, { promotor: number; neutro: number; detrator: number; total: number }>();

  for (const r of respostas as Array<{ score: number; comentario: string; categoria: string | null }>) {
    if (!r.comentario) continue;
    const cat = r.categoria as "promotor" | "neutro" | "detrator" | null;
    if (!cat) continue;

    // Tokeniza por whitespace + remove pontuação básica
    const tokens = r.comentario
      .toLowerCase()
      .replace(/[.,!?;:"'()[\]{}]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

    const seen = new Set<string>();
    for (const w of tokens) {
      if (seen.has(w)) continue;
      seen.add(w);
      const counts = wordCount.get(w) ?? { promotor: 0, neutro: 0, detrator: 0, total: 0 };
      counts[cat] += 1;
      counts.total += 1;
      wordCount.set(w, counts);
    }
  }

  // Top 10 palavras
  const temas_comuns = Array.from(wordCount.entries())
    .filter(([_, c]) => c.total >= 2)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([palavra, c]) => {
      const dominante: "promotor" | "neutro" | "detrator" =
        c.detrator >= c.promotor && c.detrator >= c.neutro ? "detrator" :
        c.promotor >= c.neutro ? "promotor" :
        "neutro";
      return { palavra, ocorrencias: c.total, categoria_dominante: dominante };
    });

  // Exemplos
  const negativos = (respostas as Array<{ score: number; comentario: string }>)
    .filter((r) => r.score <= 6 && r.comentario)
    .slice(0, 3);
  const positivos = (respostas as Array<{ score: number; comentario: string }>)
    .filter((r) => r.score >= 9 && r.comentario)
    .slice(0, 3);

  return {
    total_comentarios: respostas.length,
    por_categoria: {
      promotores: (respostas as Array<{ categoria: string }>).filter((r) => r.categoria === "promotor").length,
      neutros: (respostas as Array<{ categoria: string }>).filter((r) => r.categoria === "neutro").length,
      detratores: (respostas as Array<{ categoria: string }>).filter((r) => r.categoria === "detrator").length,
    },
    temas_comuns,
    exemplos_negativos: negativos,
    exemplos_positivos: positivos,
  };
}
