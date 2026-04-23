// ============================================================
// TEMPLATES DE CADÊNCIA — D0/D3/D7/D11/D16/D30
// Playbook Guilds: Outbound + Inbound, canais Email + WhatsApp
// Variáveis disponíveis: {{nome}}, {{empresa}}, {{dor}}, {{vendedor}}
// Política do Raio-X: R$97 oficial, voucher R$50, gratuito estratégico
// ============================================================

export type CadenciaPasso = "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
export type CadenciaCanal = "Email" | "WhatsApp" | "Ligação";

export interface TemplateCadencia {
  passo: CadenciaPasso;
  canal: CadenciaCanal;
  objetivo: string;
  assunto?: string;        // só email
  corpo: string;
}

export const TEMPLATES: TemplateCadencia[] = [
  // ============== D0 — Contexto / dor ==============
  {
    passo: "D0",
    canal: "WhatsApp",
    objetivo: "Contexto / dor",
    corpo:
`Olá {{nome}}, tudo bem? Aqui é o {{vendedor}}, da Guilds.

Estou estudando como empresas como a {{empresa}} estão lidando com {{dor}} — e percebi que esse tema costuma travar mais coisas do que parece (custo invisível, retrabalho, time apagando incêndio).

Posso te mandar em 1 minuto o que descobri sobre o setor de {{empresa}}? Sem proposta, só insight.`
  },
  {
    passo: "D0",
    canal: "Email",
    objetivo: "Contexto / dor",
    assunto: "{{empresa}} — uma observação rápida sobre {{dor}}",
    corpo:
`Olá {{nome}},

Estou estudando como o setor de {{empresa}} tem lidado com {{dor}} e cheguei em alguns padrões que talvez sejam úteis pra você (custo invisível, retrabalho oculto, perda anual estimada).

Quer que eu te mande um resumo de 2 minutos? Posso enviar por aqui ou pelo WhatsApp — você escolhe.

Abraço,
{{vendedor}} — Guilds`
  },

  // ============== D3 — Impacto / custo invisível ==============
  {
    passo: "D3",
    canal: "WhatsApp",
    objetivo: "Impacto / custo invisível",
    corpo:
`{{nome}}, voltando aqui rápido.

Fiz uma conta simples com 3 empresas parecidas com a {{empresa}} e o custo anual escondido em {{dor}} variou de R$80k a R$300k/ano. Não é hipótese, é o que aparece quando a gente mede.

Posso te mandar nosso Raio-X de Adoção Digital? São 12 perguntas, leva 8 minutos e o relatório quantifica esse custo na sua operação. Custo simbólico de R$97 — uso esse valor justamente pra filtrar quem leva a sério.`
  },
  {
    passo: "D3",
    canal: "Email",
    objetivo: "Impacto / custo invisível",
    assunto: "Re: {{empresa}} — quanto isso está custando?",
    corpo:
`{{nome}},

Voltando rápido. Em empresas parecidas com a {{empresa}}, o custo anual invisível em {{dor}} variou de R$80k a R$300k/ano.

Temos um diagnóstico estruturado pra dimensionar isso na sua operação — Raio-X de Adoção Digital, 12 perguntas, R$97, com relatório que quantifica perda anual e onde atacar primeiro.

Quer que eu mande o link?

{{vendedor}}`
  },

  // ============== D7 — Autoridade / qualificação ==============
  {
    passo: "D7",
    canal: "WhatsApp",
    objetivo: "Autoridade / qualificação",
    corpo:
`{{nome}}, segue um exemplo concreto:

Cliente do setor de {{empresa}}, time de 20 pessoas, descobriu pelo Raio-X que estava perdendo R$142k/ano com retrabalho operacional. Em 60 dias, recuperou 70% disso só com 2 ajustes de processo + 1 automação.

Quer fazer o seu? Posso liberar com voucher de R$50 (sai R$47) só pra essa semana.`
  },
  {
    passo: "D7",
    canal: "Email",
    objetivo: "Autoridade / qualificação",
    assunto: "{{empresa}} + um caso parecido (R$142k/ano)",
    corpo:
`{{nome}},

Trazendo um caso real: cliente do mesmo setor descobriu pelo nosso Raio-X que estava perdendo R$142k/ano com {{dor}}. Em 60 dias, recuperou 70% disso com 2 ajustes de processo + 1 automação.

Quer fazer o seu Raio-X? Libero voucher de R$50 essa semana → R$47.

Link: [enviar manualmente]

{{vendedor}}`
  },

  // ============== D11 — Convite certo ==============
  {
    passo: "D11",
    canal: "WhatsApp",
    objetivo: "Convite (Raio-X, call ou diagnóstico)",
    corpo:
`{{nome}}, percebi que o Raio-X talvez não seja o melhor caminho agora.

Topa 15 minutos numa call comigo essa semana? Sem deck, sem oferta — só uma conversa pra entender se faz sentido pra {{empresa}} mesmo. Se eu não puder ajudar, te aponto quem pode.

Tenho horários quarta às 14h ou quinta às 10h. Qual fecha?`
  },
  {
    passo: "D11",
    canal: "Email",
    objetivo: "Convite (Raio-X, call ou diagnóstico)",
    assunto: "{{empresa}} — 15 minutos comigo essa semana?",
    corpo:
`{{nome}},

Acho que o Raio-X talvez não seja o melhor caminho agora. Que tal 15 minutos comigo essa semana?

Sem deck, sem oferta. Só uma conversa pra entender se faz sentido pra {{empresa}}. Se eu não puder ajudar, te aponto quem pode.

Tenho quarta 14h ou quinta 10h. Qual fecha?

{{vendedor}}`
  },

  // ============== D16 — Porta aberta + newsletter ==============
  {
    passo: "D16",
    canal: "WhatsApp",
    objetivo: "Porta aberta + newsletter",
    corpo:
`{{nome}}, sem stress se agora não é o momento.

Mantenho a porta aberta — quando o tema {{dor}} virar prioridade na {{empresa}}, me chama.

Enquanto isso, posso te incluir no Radar Guilds? É uma newsletter quinzenal curta com 1 caso real + 1 ferramenta + 1 pergunta provocativa. Sem spam, sem cobrança. Topa?`
  },
  {
    passo: "D16",
    canal: "Email",
    objetivo: "Porta aberta + newsletter",
    assunto: "Sem pressa, {{nome}} — só deixando uma porta aberta",
    corpo:
`{{nome}},

Sem stress. Quando {{dor}} virar prioridade na {{empresa}}, me chama.

Enquanto isso, posso te incluir no Radar Guilds? Newsletter quinzenal, 1 caso real + 1 ferramenta + 1 provocação. Sem spam.

Responda "sim" e eu te adiciono.

{{vendedor}}`
  },

  // ============== D30 — Retomada suave ==============
  {
    passo: "D30",
    canal: "WhatsApp",
    objetivo: "Retomada suave",
    corpo:
`{{nome}}, voltando depois de um tempo.

Faz sentido a gente conversar agora sobre {{dor}}? Mudou alguma coisa nos últimos 30 dias na {{empresa}}? Mesmo um "ainda não" me ajuda a saber se mantenho contato ou paro de te incomodar 😉`
  },
  {
    passo: "D30",
    canal: "Email",
    objetivo: "Retomada suave",
    assunto: "{{nome}}, mudou alguma coisa nas últimas 4 semanas?",
    corpo:
`{{nome}},

30 dias depois, voltando sem pressa.

Mudou algo na {{empresa}} sobre {{dor}}? Vale uma conversa? Mesmo um "ainda não" me ajuda a saber se mantenho contato.

{{vendedor}}`
  },
];

// Aplica variáveis num template
export function aplicarTemplate(
  tpl: TemplateCadencia,
  vars: { nome?: string; empresa?: string; dor?: string; vendedor?: string }
): { assunto?: string; corpo: string } {
  const sub = (s: string) =>
    s
      .replaceAll("{{nome}}",     vars.nome     ?? "amigo(a)")
      .replaceAll("{{empresa}}",  vars.empresa  ?? "sua empresa")
      .replaceAll("{{dor}}",      vars.dor      ?? "esse tema")
      .replaceAll("{{vendedor}}", vars.vendedor ?? "Guilds");
  return {
    assunto: tpl.assunto ? sub(tpl.assunto) : undefined,
    corpo: sub(tpl.corpo),
  };
}

// Pega templates de um passo específico, para o canal preferencial do lead
export function getTemplates(passo: CadenciaPasso, canal?: string): TemplateCadencia[] {
  if (!canal || canal === "Email + WhatsApp") {
    return TEMPLATES.filter((t) => t.passo === passo);
  }
  if (canal === "WhatsApp" || canal === "Ligação") {
    return TEMPLATES.filter((t) => t.passo === passo && t.canal === "WhatsApp");
  }
  if (canal === "Email") {
    return TEMPLATES.filter((t) => t.passo === passo && t.canal === "Email");
  }
  return TEMPLATES.filter((t) => t.passo === passo);
}
