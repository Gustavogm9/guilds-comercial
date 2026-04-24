export const metadata = {
  title: "Central de Ajuda - Guilds Comercial",
  description: "Dúvidas frequentes e suporte sobre a plataforma Guilds Comercial.",
};

const faqs = [
  {
    pergunta: "Como funciona a inteligência artificial do CRM?",
    resposta: "Nossa IA atua como um co-piloto para o seu time de vendas. O 'Raio-X' analisa dados do lead, interações passadas e o mercado para prever a probabilidade de fechamento (Score). Além disso, a IA gera automaticamente sugestões de cadência de e-mails (follow-ups) baseados no seu segmento."
  },
  {
    pergunta: "Meus dados são usados para treinar IAs públicas?",
    resposta: "Não. Nós utilizamos APIs corporativas com políticas de zero-retention (retenção zero). Isso significa que as informações dos seus leads, propostas e histórico são processadas apenas no momento da requisição e descartadas, garantindo o sigilo comercial."
  },
  {
    pergunta: "Posso mudar de plano a qualquer momento?",
    resposta: "Sim, você pode fazer o upgrade ou downgrade do seu plano diretamente pelo painel administrativo (Billing). Mudanças de plano aplicam-se no ciclo de cobrança seguinte, e upgrades desbloqueiam os limites adicionais instantaneamente."
  },
  {
    pergunta: "Qual a diferença entre um usuário comum e o Gestor?",
    resposta: "O Gestor possui privilégios de administração da Organização. Ele pode convidar novos membros, configurar integrações, ajustar limites de IA e gerenciar os pagamentos da assinatura. Usuários comuns apenas gerenciam e visualizam os negócios no pipeline."
  },
  {
    pergunta: "O que acontece se eu atingir o limite de invocações de IA do meu plano?",
    resposta: "Se você ultrapassar o limite (ex: 2.000 invocações no plano Pro), o sistema alertará o Gestor. Dependendo da sua configuração, novas invocações poderão ser faturadas como Add-on (ex: R$ 0,05 por requisição adicional) ou o recurso inteligente será bloqueado até o mês seguinte."
  }
];

export default function AjudaPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
      <div className="text-center mb-16">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
          Como podemos ajudar?
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Encontre respostas rápidas para as dúvidas mais comuns sobre o Guilds Comercial.
        </p>
      </div>

      <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-sm border border-slate-200">
        <div className="space-y-6">
          {faqs.map((faq, idx) => (
            <details
              key={idx}
              className="group border border-slate-200 bg-slate-50 rounded-2xl open:bg-white open:ring-1 open:ring-guild-200 open:shadow-sm transition-all"
            >
              <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-slate-900 marker:content-none select-none">
                {faq.pergunta}
                <span className="ml-4 flex-shrink-0 transition-transform duration-300 group-open:rotate-180">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </summary>
              <div className="px-6 pb-6 text-slate-600 leading-relaxed">
                <p>{faq.resposta}</p>
              </div>
            </details>
          ))}
        </div>

        <div className="mt-12 p-6 bg-guild-50 rounded-2xl border border-guild-100 text-center">
          <h3 className="text-lg font-semibold text-guild-900 mb-2">Ainda precisa de ajuda?</h3>
          <p className="text-guild-700 mb-6">
            Nosso time de suporte está disponível para atender clientes dos planos Pro e Business.
          </p>
          <a
            href="mailto:suporte@guilds.com.br"
            className="inline-flex items-center justify-center rounded-xl bg-guild-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-guild-700 transition-all"
          >
            Falar com o Suporte
          </a>
        </div>
      </div>
    </div>
  );
}
