// ============================================================
// TEMPLATES DE CADÊNCIA — D0/D3/D7/D11/D16/D30
// Playbook Guilds: Outbound + Inbound, canais Email + WhatsApp
// Variáveis disponíveis: {{nome}}, {{empresa}}, {{dor}}, {{vendedor}}
// Política do Raio-X: R$97 oficial, voucher R$50, gratuito estratégico
// Suporte multilíngue: pt-BR (default) + en-US
// ============================================================

import type { Locale } from "@/lib/i18n";

export type CadenciaPasso = "D0" | "D3" | "D7" | "D11" | "D16" | "D30";
export type CadenciaCanal = "Email" | "WhatsApp" | "Ligação";

export interface TemplateCadencia {
  passo: CadenciaPasso;
  canal: CadenciaCanal;
  objetivo: string;
  assunto?: string;        // só email
  corpo: string;
  idioma?: Locale;         // pt-BR (default) | en-US
}

// ============================================================
// PT-BR (default)
// ============================================================
export const TEMPLATES_PT_BR: TemplateCadencia[] = [
  // ============== D0 — Contexto / dor ==============
  {
    passo: "D0",
    canal: "WhatsApp",
    objetivo: "Contexto / dor",
    idioma: "pt-BR",
    corpo:
`Olá {{nome}}, tudo bem? Aqui é o {{vendedor}}, da Guilds.

Estou estudando como empresas como a {{empresa}} estão lidando com {{dor}} — e percebi que esse tema costuma travar mais coisas do que parece (custo invisível, retrabalho, time apagando incêndio).

Posso te mandar em 1 minuto o que descobri sobre o setor de {{empresa}}? Sem proposta, só insight.`
  },
  {
    passo: "D0",
    canal: "Email",
    objetivo: "Contexto / dor",
    idioma: "pt-BR",
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
    idioma: "pt-BR",
    corpo:
`{{nome}}, voltando aqui rápido.

Fiz uma conta simples com 3 empresas parecidas com a {{empresa}} e o custo anual escondido em {{dor}} variou de R$80k a R$300k/ano. Não é hipótese, é o que aparece quando a gente mede.

Posso te mandar nosso Raio-X de Adoção Digital? São 12 perguntas, leva 8 minutos e o relatório quantifica esse custo na sua operação. Custo simbólico de R$97 — uso esse valor justamente pra filtrar quem leva a sério.`
  },
  {
    passo: "D3",
    canal: "Email",
    objetivo: "Impacto / custo invisível",
    idioma: "pt-BR",
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
    idioma: "pt-BR",
    corpo:
`{{nome}}, segue um exemplo concreto:

Cliente do setor de {{empresa}}, time de 20 pessoas, descobriu pelo Raio-X que estava perdendo R$142k/ano com retrabalho operacional. Em 60 dias, recuperou 70% disso só com 2 ajustes de processo + 1 automação.

Quer fazer o seu? Posso liberar com voucher de R$50 (sai R$47) só pra essa semana.`
  },
  {
    passo: "D7",
    canal: "Email",
    objetivo: "Autoridade / qualificação",
    idioma: "pt-BR",
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
    idioma: "pt-BR",
    corpo:
`{{nome}}, percebi que o Raio-X talvez não seja o melhor caminho agora.

Topa 15 minutos numa call comigo essa semana? Sem deck, sem oferta — só uma conversa pra entender se faz sentido pra {{empresa}} mesmo. Se eu não puder ajudar, te aponto quem pode.

Tenho horários quarta às 14h ou quinta às 10h. Qual fecha?`
  },
  {
    passo: "D11",
    canal: "Email",
    objetivo: "Convite (Raio-X, call ou diagnóstico)",
    idioma: "pt-BR",
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
    idioma: "pt-BR",
    corpo:
`{{nome}}, sem stress se agora não é o momento.

Mantenho a porta aberta — quando o tema {{dor}} virar prioridade na {{empresa}}, me chama.

Enquanto isso, posso te incluir no Radar Guilds? É uma newsletter quinzenal curta com 1 caso real + 1 ferramenta + 1 pergunta provocativa. Sem spam, sem cobrança. Topa?`
  },
  {
    passo: "D16",
    canal: "Email",
    objetivo: "Porta aberta + newsletter",
    idioma: "pt-BR",
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
    idioma: "pt-BR",
    corpo:
`{{nome}}, voltando depois de um tempo.

Faz sentido a gente conversar agora sobre {{dor}}? Mudou alguma coisa nos últimos 30 dias na {{empresa}}? Mesmo um "ainda não" me ajuda a saber se mantenho contato ou paro de te incomodar 😉`
  },
  {
    passo: "D30",
    canal: "Email",
    objetivo: "Retomada suave",
    idioma: "pt-BR",
    assunto: "{{nome}}, mudou alguma coisa nas últimas 4 semanas?",
    corpo:
`{{nome}},

30 dias depois, voltando sem pressa.

Mudou algo na {{empresa}} sobre {{dor}}? Vale uma conversa? Mesmo um "ainda não" me ajuda a saber se mantenho contato.

{{vendedor}}`
  },
];

// ============================================================
// EN-US
// Equivalent business logic adapted to US/global market norms
// (USD pricing, "Diagnosis" instead of "Raio-X", direct tone)
// ============================================================
export const TEMPLATES_EN_US: TemplateCadencia[] = [
  // ============== D0 — Context / pain ==============
  {
    passo: "D0",
    canal: "WhatsApp",
    objetivo: "Context / pain",
    idioma: "en-US",
    corpo:
`Hey {{nome}}, this is {{vendedor}} from Guilds.

I've been studying how companies like {{empresa}} are dealing with {{dor}} — and I've noticed this issue tends to lock up more things than it seems (hidden cost, rework, team firefighting).

Mind if I share what I found about your sector in 1 minute? No pitch, just insight.`
  },
  {
    passo: "D0",
    canal: "Email",
    objetivo: "Context / pain",
    idioma: "en-US",
    assunto: "{{empresa}} — quick observation about {{dor}}",
    corpo:
`Hi {{nome}},

I've been studying how the {{empresa}} sector has been dealing with {{dor}} and found a few patterns that might be useful (hidden cost, invisible rework, estimated annual loss).

Want me to send a 2-minute summary? Either by email or WhatsApp — your call.

Best,
{{vendedor}} — Guilds`
  },

  // ============== D3 — Impact / hidden cost ==============
  {
    passo: "D3",
    canal: "WhatsApp",
    objetivo: "Impact / hidden cost",
    idioma: "en-US",
    corpo:
`{{nome}}, quick follow-up.

I ran simple math on 3 companies similar to {{empresa}} and the hidden annual cost in {{dor}} ranged from $20k to $80k/year. Not a hypothesis — that's what shows up when you measure.

Mind if I send our Digital Adoption Diagnosis? 12 questions, takes 8 minutes, and the report quantifies that cost in your operation. Symbolic fee of $29 — that price exists to filter out who's not serious.`
  },
  {
    passo: "D3",
    canal: "Email",
    objetivo: "Impact / hidden cost",
    idioma: "en-US",
    assunto: "Re: {{empresa}} — how much is this costing?",
    corpo:
`{{nome}},

Quick follow-up. In companies similar to {{empresa}}, hidden annual cost on {{dor}} ranged from $20k to $80k/year.

We have a structured diagnosis to size this in your operation — Digital Adoption Diagnosis, 12 questions, $29, with a report that quantifies annual loss and where to attack first.

Want me to send the link?

{{vendedor}}`
  },

  // ============== D7 — Authority / qualification ==============
  {
    passo: "D7",
    canal: "WhatsApp",
    objetivo: "Authority / qualification",
    idioma: "en-US",
    corpo:
`{{nome}}, here's a concrete example:

Client in your same sector, 20-person team, found out via our Diagnosis they were losing $38k/year in operational rework. In 60 days, they recovered 70% of that with just 2 process tweaks + 1 automation.

Want yours? I can unlock it with a $15 voucher (final $14) just this week.`
  },
  {
    passo: "D7",
    canal: "Email",
    objetivo: "Authority / qualification",
    idioma: "en-US",
    assunto: "{{empresa}} + a similar case ($38k/year)",
    corpo:
`{{nome}},

Real case: a client in the same sector found out via our Diagnosis they were losing $38k/year on {{dor}}. In 60 days, they recovered 70% with 2 process tweaks + 1 automation.

Want to run yours? I'll release a $15 voucher this week → $14.

Link: [send manually]

{{vendedor}}`
  },

  // ============== D11 — Right invite ==============
  {
    passo: "D11",
    canal: "WhatsApp",
    objetivo: "Invite (Diagnosis, call or assessment)",
    idioma: "en-US",
    corpo:
`{{nome}}, I think the Diagnosis might not be the right path right now.

Up for 15 minutes on a call this week? No deck, no pitch — just a conversation to figure out if it makes sense for {{empresa}}. If I can't help, I'll point you to who can.

I have Wednesday 2pm or Thursday 10am open. Which works?`
  },
  {
    passo: "D11",
    canal: "Email",
    objetivo: "Invite (Diagnosis, call or assessment)",
    idioma: "en-US",
    assunto: "{{empresa}} — 15 minutes this week?",
    corpo:
`{{nome}},

I think the Diagnosis might not be the right path right now. How about 15 minutes this week?

No deck, no pitch. Just a conversation to figure out if it makes sense for {{empresa}}. If I can't help, I'll point you to who can.

Wednesday 2pm or Thursday 10am — which works?

{{vendedor}}`
  },

  // ============== D16 — Open door + newsletter ==============
  {
    passo: "D16",
    canal: "WhatsApp",
    objetivo: "Open door + newsletter",
    idioma: "en-US",
    corpo:
`{{nome}}, no stress if it's not the right time.

Door stays open — when {{dor}} becomes a priority at {{empresa}}, hit me up.

In the meantime, mind if I add you to Radar Guilds? Short biweekly newsletter with 1 real case + 1 tool + 1 provocative question. No spam, no charge. Cool?`
  },
  {
    passo: "D16",
    canal: "Email",
    objetivo: "Open door + newsletter",
    idioma: "en-US",
    assunto: "No rush, {{nome}} — just leaving a door open",
    corpo:
`{{nome}},

No stress. When {{dor}} becomes a priority at {{empresa}}, reach out.

In the meantime, mind if I add you to Radar Guilds? Biweekly newsletter, 1 real case + 1 tool + 1 provocation. No spam.

Reply "yes" and I'll add you.

{{vendedor}}`
  },

  // ============== D30 — Soft revival ==============
  {
    passo: "D30",
    canal: "WhatsApp",
    objetivo: "Soft revival",
    idioma: "en-US",
    corpo:
`{{nome}}, coming back after a while.

Does it make sense to chat now about {{dor}}? Did anything change in the last 30 days at {{empresa}}? Even a "not yet" helps me know whether to keep in touch or stop bothering you 😉`
  },
  {
    passo: "D30",
    canal: "Email",
    objetivo: "Soft revival",
    idioma: "en-US",
    assunto: "{{nome}}, did anything change in the last 4 weeks?",
    corpo:
`{{nome}},

30 days later, no pressure.

Did anything change at {{empresa}} on {{dor}}? Worth a conversation? Even a "not yet" helps me know whether to keep in touch.

{{vendedor}}`
  },
];

// ============================================================
// API pública
// ============================================================

// Compat: exporta TEMPLATES default (pt-BR) para código legado.
export const TEMPLATES: TemplateCadencia[] = TEMPLATES_PT_BR;

// Resolve por idioma com fallback para pt-BR
export function getTemplatesByLocale(locale: Locale = "pt-BR"): TemplateCadencia[] {
  if (locale === "en-US") return TEMPLATES_EN_US;
  return TEMPLATES_PT_BR;
}

// Aplica variáveis num template (i18n: fallbacks adaptados ao idioma)
export function aplicarTemplate(
  tpl: TemplateCadencia,
  vars: { nome?: string; empresa?: string; dor?: string; vendedor?: string }
): { assunto?: string; corpo: string } {
  const isEN = tpl.idioma === "en-US";
  const fallbackNome = isEN ? "there" : "amigo(a)";
  const fallbackEmpresa = isEN ? "your company" : "sua empresa";
  const fallbackDor = isEN ? "this topic" : "esse tema";
  const fallbackVendedor = "Guilds";

  const sub = (s: string) =>
    s
      .replaceAll("{{nome}}",     vars.nome     ?? fallbackNome)
      .replaceAll("{{empresa}}",  vars.empresa  ?? fallbackEmpresa)
      .replaceAll("{{dor}}",      vars.dor      ?? fallbackDor)
      .replaceAll("{{vendedor}}", vars.vendedor ?? fallbackVendedor);
  return {
    assunto: tpl.assunto ? sub(tpl.assunto) : undefined,
    corpo: sub(tpl.corpo),
  };
}

// Pega templates de um passo específico, para o canal preferencial do lead
// Aceita locale opcional (default pt-BR para compat)
export function getTemplates(
  passo: CadenciaPasso,
  canal?: string,
  locale: Locale = "pt-BR"
): TemplateCadencia[] {
  const base = getTemplatesByLocale(locale);
  if (!canal || canal === "Email + WhatsApp") {
    return base.filter((t) => t.passo === passo);
  }
  if (canal === "WhatsApp" || canal === "Ligação") {
    return base.filter((t) => t.passo === passo && t.canal === "WhatsApp");
  }
  if (canal === "Email") {
    return base.filter((t) => t.passo === passo && t.canal === "Email");
  }
  return base.filter((t) => t.passo === passo);
}
