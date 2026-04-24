export const metadata = {
  title: "Política de Privacidade - Guilds Comercial",
  description: "Política de Privacidade e Proteção de Dados da plataforma Guilds Comercial.",
};

export default function PrivacidadePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
      <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-sm border border-slate-200">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-8">
          Política de Privacidade
        </h1>
        
        <div className="prose prose-slate prose-headings:text-slate-900 prose-a:text-guild-600">
          <p className="text-sm text-slate-500 mb-8">Última atualização: 24 de Abril de 2026</p>

          <p>
            A sua privacidade é nossa prioridade. Esta Política de Privacidade descreve como a Guilds Comercial ("nós", "nosso" ou "Plataforma") coleta, usa, protege e compartilha suas informações pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
          </p>

          <h2>1. Informações que Coletamos</h2>
          <p>Podemos coletar as seguintes categorias de informações:</p>
          <ul>
            <li><strong>Dados de Identificação:</strong> Nome, e-mail corporativo, cargo e nome da empresa (coletados no momento do cadastro).</li>
            <li><strong>Dados de CRM:</strong> Informações de leads, oportunidades de negócio, históricos de comunicação e valores financeiros inseridos por você ou sua equipe.</li>
            <li><strong>Dados de Uso e Navegação:</strong> Endereço IP, tipo de navegador, sistema operacional e páginas visitadas dentro do sistema.</li>
          </ul>

          <h2>2. Como Utilizamos Suas Informações</h2>
          <p>Utilizamos os dados coletados para:</p>
          <ul>
            <li>Fornecer e manter o funcionamento da Plataforma, isolando seus dados através do nosso sistema multi-tenant.</li>
            <li>Alimentar o "Raio-X Impulsionado por IA" e automações de cadência exclusivamente para os seus leads. A inteligência artificial opera sobre seus dados para gerar análises, porém <strong>seus dados não são utilizados para treinar modelos globais de IA de terceiros.</strong></li>
            <li>Enviar comunicações sobre atualizações do sistema, faturamento e suporte técnico.</li>
          </ul>

          <h2>3. Compartilhamento de Dados</h2>
          <p>
            Nós não vendemos ou alugamos seus dados pessoais. O compartilhamento ocorre estritamente para o funcionamento do serviço:
          </p>
          <ul>
            <li><strong>Provedores de Nuvem e Banco de Dados:</strong> Utilizamos parceiros de infraestrutura seguros (ex: Supabase, Vercel) que atuam como operadores dos dados.</li>
            <li><strong>Processadores de Pagamento:</strong> (ex: Stripe) para processamento de assinaturas seguras.</li>
            <li><strong>Serviços de IA:</strong> Utilizamos APIs de terceiros (ex: OpenAI, Anthropic) para as funções inteligentes do CRM. O processamento é via API corporativa (zero-retention policy na maioria dos provedores), garantindo que os dados não alimentem LLMs públicos.</li>
          </ul>

          <h2>4. Segurança dos Dados</h2>
          <p>
            Implementamos controles técnicos rigorosos para proteger suas informações, incluindo Row Level Security (RLS) no banco de dados, encriptação em trânsito (HTTPS/TLS) e isolamento lógico.
          </p>

          <h2>5. Seus Direitos (LGPD)</h2>
          <p>Você tem o direito de:</p>
          <ul>
            <li>Solicitar o acesso, a correção ou a exclusão dos seus dados pessoais.</li>
            <li>Exportar seus dados do CRM a qualquer momento (portabilidade).</li>
            <li>Revogar seu consentimento ou solicitar o encerramento da conta e o apagamento da sua base de dados associada.</li>
          </ul>

          <hr className="my-10 border-slate-200" />
          
          <p className="text-sm font-semibold">Contato do DPO (Encarregado de Dados):</p>
          <p className="text-sm">Para exercer seus direitos ou tirar dúvidas sobre esta política, envie um e-mail para dpo@guilds.com.br.</p>
        </div>
      </div>
    </div>
  );
}
