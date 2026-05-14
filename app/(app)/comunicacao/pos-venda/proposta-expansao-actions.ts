"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";

/**
 * Gera template de proposta de expansão personalizado pelo tipo + contexto do cliente.
 *
 * Sem IA externa — template estático parametrizado. Cobre 80% do valor de
 * "vendedor não tem o que falar" sem custo de tokens.
 *
 * Variáveis injetadas:
 *   - {nome_cliente}: primeiro nome
 *   - {empresa}: razão da empresa
 *   - {valor}: valor potencial formatado
 *   - {tipo_label}: rótulo humano do tipo de expansão
 *   - {meses_cliente}: quanto tempo é cliente
 *   - {dor_atual}: dor que continua aberta (se houver)
 *
 * Retorna 3 versões:
 *   - email_assunto + email_corpo (longo, formal)
 *   - whatsapp (curto, casual)
 *   - call_script (bullet points pra conduzir reunião)
 */
export async function gerarPropostaExpansao(input: {
  expansao_id: number;
}): Promise<{
  email_assunto: string;
  email_corpo: string;
  whatsapp: string;
  call_script: string;
  contexto_usado: string[];
}> {
  if (!Number.isInteger(input.expansao_id) || input.expansao_id <= 0) {
    throw new Error("Expansão inválida.");
  }

  const supabase = createClient();
  const orgId = await getCurrentOrgId();
  if (!orgId) throw new Error("Sem organização.");

  // Busca expansão + cliente
  const { data: exp } = await supabase
    .from("expansoes")
    .select("id, tipo, titulo, descricao, valor_potencial, valor_recorrente_mensal, cliente_lead_id, produto_id, data_identificada")
    .eq("id", input.expansao_id)
    .eq("organizacao_id", orgId)
    .maybeSingle();

  if (!exp) throw new Error("Expansão não encontrada.");

  const { data: produto } = exp.produto_id
    ? await supabase
      .from("produtos")
      .select("nome, descricao, categoria, recorrente, valor_base, valor_max")
      .eq("id", exp.produto_id)
      .eq("organizacao_id", orgId)
      .maybeSingle()
    : { data: null };

  const { data: lead } = await supabase
    .from("leads")
    .select("nome, empresa, dor_principal, cargo, data_fechamento")
    .eq("id", exp.cliente_lead_id)
    .maybeSingle();

  // Último NPS (se promotor, usar como prova social)
  const { data: nps } = await supabase
    .from("nps_responses")
    .select("score")
    .eq("lead_id", exp.cliente_lead_id)
    .not("score", "is", null)
    .order("respondido_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const primeiroNome = lead?.nome?.split(" ")[0] ?? "";
  const empresa = lead?.empresa ?? "sua empresa";
  const cargo = lead?.cargo;
  const dor = lead?.dor_principal;
  const npsScore = nps?.score;

  const valor = Number(exp.valor_potencial ?? 0);
  const valorMensal = Number(exp.valor_recorrente_mensal ?? 0);

  // Calcula meses de cliente (se data_fechamento existir)
  let mesesCliente: number | null = null;
  if (lead?.data_fechamento) {
    const diff = Date.now() - new Date(lead.data_fechamento).getTime();
    mesesCliente = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24 * 30)));
  }

  // Rótulo humano por tipo
  const tipoLabel: Record<string, string> = {
    upsell: "upgrade de plano",
    cross_sell: "novo produto/serviço",
    expansao_seats: "expansão de usuários",
    renovacao: "renovação",
    recompra: "nova rodada",
    outro: "expansão",
  };
  const tipoHumano = tipoLabel[String(exp.tipo)] ?? "expansão";

  const contextoUsado: string[] = ["tipo de expansão"];
  if (primeiroNome) contextoUsado.push("nome do cliente");
  if (empresa) contextoUsado.push("empresa");
  if (mesesCliente) contextoUsado.push(`${mesesCliente} mês(es) de relacionamento`);
  if (npsScore != null && npsScore >= 9) contextoUsado.push("NPS promotor");
  if (dor) contextoUsado.push("dor atual");

  const ofertaNome = produto?.nome ?? exp.titulo;
  const ofertaDescricao = produto?.descricao ?? null;
  if (produto?.nome) contextoUsado.push("oferta recomendada");

  const valorFmt = valor > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor)
    : null;
  const valorMensalFmt = valorMensal > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valorMensal)
    : null;

  // -------- EMAIL --------
  const email_assunto =
    exp.tipo === "renovacao"
      ? `Renovação do contrato — ${empresa}`
      : exp.tipo === "upsell"
        ? `Próximo passo na ${empresa}: ${exp.titulo}`
        : exp.tipo === "cross_sell"
          ? `Algo novo pro time da ${empresa}`
          : `Continuando o trabalho na ${empresa}: ${exp.titulo}`;

  const email_corpo = montarEmailCorpo({
    primeiroNome,
    empresa,
    cargo,
    tipoHumano,
    tipoCode: String(exp.tipo),
    titulo: exp.titulo,
    ofertaNome,
    ofertaDescricao,
    descricao: exp.descricao ?? null,
    valorFmt,
    valorMensalFmt,
    mesesCliente,
    dor,
    npsPromotor: npsScore != null && npsScore >= 9,
  });

  // -------- WHATSAPP --------
  const whatsapp = montarWhatsapp({
    primeiroNome,
    empresa,
    tipoHumano,
    tipoCode: String(exp.tipo),
    titulo: exp.titulo,
    ofertaNome,
    valorFmt,
    mesesCliente,
    npsPromotor: npsScore != null && npsScore >= 9,
  });

  // -------- CALL SCRIPT --------
  const call_script = montarCallScript({
    primeiroNome,
    empresa,
    tipoHumano,
    titulo: exp.titulo,
    ofertaNome,
    ofertaDescricao,
    descricao: exp.descricao ?? null,
    valorFmt,
    valorMensalFmt,
    dor,
    npsPromotor: npsScore != null && npsScore >= 9,
  });

  return {
    email_assunto,
    email_corpo,
    whatsapp,
    call_script,
    contexto_usado: contextoUsado,
  };
}

// =============================================================================
// Builders por canal
// =============================================================================

function montarEmailCorpo(c: {
  primeiroNome: string;
  empresa: string;
  cargo: string | null | undefined;
  tipoHumano: string;
  tipoCode: string;
  titulo: string;
  ofertaNome: string;
  ofertaDescricao: string | null;
  descricao: string | null;
  valorFmt: string | null;
  valorMensalFmt: string | null;
  mesesCliente: number | null;
  dor: string | null | undefined;
  npsPromotor: boolean;
}): string {
  const intro = c.npsPromotor
    ? `Vi sua resposta no NPS — fico animado de saber que a gente tem entregado valor real pra ${c.empresa}.`
    : c.mesesCliente && c.mesesCliente >= 6
      ? `Já são ${c.mesesCliente} meses de trabalho juntos com a ${c.empresa} — quis fazer uma proposta pra próxima fase.`
      : `Conversando com o time aqui, identifiquei uma oportunidade pra ${c.empresa} que vale apresentar.`;

  let racional: string;
  if (c.tipoCode === "renovacao") {
    racional = `Estamos chegando no fim do ciclo atual${c.valorFmt ? ` (${c.valorFmt})` : ""}. Quero fechar a renovação cedo pra garantir continuidade sem buracos${c.valorMensalFmt ? ` — mantendo o mensal em ${c.valorMensalFmt}` : ""}.`;
  } else if (c.tipoCode === "upsell") {
    racional = `Pelo histórico que a gente tem aqui, faz sentido avançar para ${c.ofertaNome}${(c.ofertaDescricao ?? c.descricao) ? `: ${c.ofertaDescricao ?? c.descricao}` : ""}. ${c.valorFmt ? `Investimento estimado: ${c.valorFmt}.` : ""}`;
  } else if (c.tipoCode === "cross_sell") {
    racional = `Sou capaz de pegar a próxima frente — ${c.ofertaNome}${(c.ofertaDescricao ?? c.descricao) ? ` (${c.ofertaDescricao ?? c.descricao})` : ""}. ${c.valorFmt ? `Proposta: ${c.valorFmt}.` : ""} ${c.dor ? `Ataca diretamente o ponto que você levantou: "${String(c.dor).slice(0, 100)}".` : ""}`;
  } else if (c.tipoCode === "expansao_seats") {
    racional = `Vi que o time da ${c.empresa} cresceu. Faz sentido expandir os acessos${c.valorFmt ? ` — proposta: ${c.valorFmt}` : ""}.`;
  } else {
    racional = `${c.ofertaNome}${(c.ofertaDescricao ?? c.descricao) ? `: ${c.ofertaDescricao ?? c.descricao}` : ""}.${c.valorFmt ? ` Investimento: ${c.valorFmt}.` : ""}`;
  }

  const cta = c.npsPromotor
    ? "Posso mandar a proposta formal por aqui ou prefere agendar 20min pra conversar?"
    : "Prefere que eu mande a proposta detalhada por aqui ou agendamos uma call rápida?";

  return `Oi ${c.primeiroNome || (c.cargo ?? "")},

${intro}

${racional}

${cta}

Abraço`;
}

function montarWhatsapp(c: {
  primeiroNome: string;
  empresa: string;
  tipoHumano: string;
  tipoCode: string;
  titulo: string;
  ofertaNome: string;
  valorFmt: string | null;
  mesesCliente: number | null;
  npsPromotor: boolean;
}): string {
  if (c.tipoCode === "renovacao") {
    return `Oi ${c.primeiroNome}! Estamos chegando no fim do ciclo do contrato${c.mesesCliente ? ` (já são ${c.mesesCliente}m juntos)` : ""}. Posso preparar a renovação${c.valorFmt ? ` em ${c.valorFmt}` : ""}? Confirma se mantém os mesmos termos.`;
  }
  if (c.npsPromotor) {
    return `Oi ${c.primeiroNome}! Já que o NPS deu top, queria propor o próximo passo: ${c.ofertaNome}.${c.valorFmt ? ` Estimativa: ${c.valorFmt}.` : ""} Posso mandar detalhes?`;
  }
  return `Oi ${c.primeiroNome}! Identifiquei uma oportunidade pra ${c.empresa}: ${c.ofertaNome}.${c.valorFmt ? ` Investimento: ${c.valorFmt}.` : ""} Te explico em 5min?`;
}

function montarCallScript(c: {
  primeiroNome: string;
  empresa: string;
  tipoHumano: string;
  titulo: string;
  ofertaNome: string;
  ofertaDescricao: string | null;
  descricao: string | null;
  valorFmt: string | null;
  valorMensalFmt: string | null;
  dor: string | null | undefined;
  npsPromotor: boolean;
}): string {
  const linhas = [
    `Roteiro de call — ${c.tipoHumano} ${c.primeiroNome ? "(" + c.primeiroNome + ")" : ""}`,
    "",
    "Abertura (30s):",
    `  • Quebra-gelo curto. Reconhece o tempo de trabalho com a ${c.empresa}.`,
    c.npsPromotor ? "  • Mencionar NPS promotor: 'sua resposta foi 9 ou 10, valeu muito.'" : "  • Lembrar de um resultado entregue recentemente.",
    "",
    "Contexto (1min):",
    `  • Por que essa conversa agora: ${c.ofertaNome}.`,
    (c.ofertaDescricao ?? c.descricao) ? `  • Detalhe: ${c.ofertaDescricao ?? c.descricao}` : "  • Detalhar o escopo em 1-2 frases.",
    c.dor ? `  • Conectar com a dor original: "${String(c.dor).slice(0, 100)}"` : "  • Reforçar dor atual ou nova oportunidade.",
    "",
    "Proposta (2min):",
    c.valorFmt ? `  • Investimento: ${c.valorFmt}${c.valorMensalFmt ? ` (mensal: ${c.valorMensalFmt})` : ""}` : "  • Apresentar faixa de investimento.",
    "  • Prazo de entrega / próximos marcos.",
    "  • Diferencial vs. parar agora.",
    "",
    "Pergunta de fechamento:",
    "  • 'Faz sentido pro momento da empresa?'",
    "  • Se sim: alinhar próximo passo (proposta formal, contrato, kickoff).",
    "  • Se hesitar: 'O que faltaria pra esse ser um sim óbvio?'",
    "",
    "Objeções comuns:",
    "  • Preço: comparar com custo de NÃO fazer.",
    "  • Timing: oferecer começar com escopo menor.",
    "  • Decisor: identificar quem mais precisa estar na conversa.",
  ];
  return linhas.join("\n");
}
