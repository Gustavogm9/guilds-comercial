export const metadata = {
  title: "Termos de Uso - Guilds Comercial",
  description: "Termos de Uso e Condições de Serviço da plataforma Guilds Comercial.",
};

export default function TermosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
      <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-sm border border-slate-200">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-8">
          Termos de Uso
        </h1>
        
        <div className="prose prose-slate prose-headings:text-slate-900 prose-a:text-guild-600">
          <p className="text-sm text-slate-500 mb-8">Última atualização: 24 de Abril de 2026</p>

          <h2>1. Aceitação dos Termos</h2>
          <p>
            Ao acessar e utilizar o Guilds Comercial ("Plataforma"), você ("Usuário" ou "Cliente") concorda em cumprir e vincular-se a estes Termos de Uso ("Termos"). Se você não concorda com qualquer parte destes Termos, não deve utilizar nossos serviços.
          </p>

          <h2>2. Descrição do Serviço</h2>
          <p>
            O Guilds Comercial é uma plataforma B2B de Gestão de Relacionamento com o Cliente (CRM) potencializada por Inteligência Artificial (IA), desenhada para gerenciamento de funis de venda, automação de cadências e análise preditiva.
          </p>

          <h2>3. Contas e Segurança</h2>
          <ul>
            <li>Você é responsável por manter a confidencialidade das credenciais de acesso da sua organização.</li>
            <li>Qualquer atividade realizada sob a sua conta é de sua inteira responsabilidade.</li>
            <li>O Guilds Comercial utiliza isolamento lógico de dados (Row Level Security) para garantir que os dados de uma organização não sejam acessíveis a outras.</li>
          </ul>

          <h2>4. Planos, Cobrança e Consumo de IA</h2>
          <p>
            O acesso a funcionalidades específicas e limites de consumo de Inteligência Artificial variam conforme o plano escolhido (Free, Pro, Business, Enterprise). 
          </p>
          <ul>
            <li><strong>Pagamentos:</strong> Os pagamentos são processados antecipadamente no início de cada ciclo de faturamento.</li>
            <li><strong>Invocações de IA:</strong> O uso da IA é medido por "invocação" (geração de e-mail, raio-x, motivos de perda). Excedido o limite do plano, invocações adicionais poderão ser bloqueadas ou cobradas como add-on, dependendo da configuração da sua conta.</li>
          </ul>

          <h2>5. Propriedade Intelectual</h2>
          <p>
            Todos os direitos de propriedade intelectual da plataforma, incluindo código, design, algoritmos e documentação pertencem exclusivamente à Guilds Tecnologia. É proibida a cópia, engenharia reversa ou reprodução sem autorização prévia.
          </p>
          <p>
            Os dados de leads, negócios e informações inseridas por você na plataforma são de sua propriedade exclusiva. A Guilds Comercial não os utilizará para nenhum outro fim senão a prestação do serviço.
          </p>

          <h2>6. Cancelamento e Rescisão</h2>
          <p>
            Você pode cancelar sua assinatura a qualquer momento através do painel de administração da sua organização. O acesso permanecerá ativo até o final do ciclo de cobrança vigente. Dados de contas inativas poderão ser retidos por 30 dias antes da exclusão permanente.
          </p>

          <h2>7. Limitação de Responsabilidade</h2>
          <p>
            Em nenhuma hipótese a Guilds Comercial será responsável por lucros cessantes, perda de dados ou danos indiretos decorrentes do uso ou incapacidade de uso da Plataforma. A responsabilidade total máxima não excederá o valor pago por você nos 12 meses anteriores ao evento gerador.
          </p>

          <h2>8. Alterações nos Termos</h2>
          <p>
            Podemos revisar estes Termos a qualquer momento. Notificaremos os administradores da sua organização por e-mail sobre alterações materiais com pelo menos 30 dias de antecedência.
          </p>

          <hr className="my-10 border-slate-200" />
          
          <p className="text-sm font-semibold">Contato Jurídico:</p>
          <p className="text-sm">Para questões sobre estes Termos de Uso, contate suporte@guilds.com.br.</p>
        </div>
      </div>
    </div>
  );
}
