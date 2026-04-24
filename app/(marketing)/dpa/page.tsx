export const metadata = {
  title: "Data Processing Agreement (DPA) | Guilds Comercial",
  description: "Acordo de Processamento de Dados (DPA) em conformidade com a LGPD e regulamentações internacionais para usuários B2B.",
};

export default function DPAPage() {
  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 prose prose-slate prose-a:text-guild-600 hover:prose-a:text-guild-500">
        <h1>Acordo de Processamento de Dados (DPA)</h1>
        <p className="lead">
          Este Acordo de Processamento de Dados ("DPA" ou "Acordo") forma parte integral dos Termos de Uso do <strong>Guilds Comercial</strong>.
        </p>
        
        <p className="text-sm text-slate-500">
          Última atualização: 24 de Abril de 2026
        </p>

        <h2>1. Escopo e Propósito</h2>
        <p>
          O presente Acordo aplica-se na medida em que a Plataforma (Processadora) trata Dados Pessoais em nome da Empresa Contratante (Controladora) no decurso do fornecimento do CRM B2B e recursos de Inteligência Artificial.
        </p>

        <h2>2. Definições</h2>
        <ul>
          <li><strong>LGPD:</strong> Lei Geral de Proteção de Dados (Lei nº 13.709/2018) do Brasil.</li>
          <li><strong>Zero-Retention Policy:</strong> Nossa política rigorosa no processamento de IA onde provedores (como OpenAI) não utilizam seus dados para treinar modelos de fundação.</li>
          <li><strong>Subprocessadores:</strong> Terceiros aprovados que podem ter acesso residual à infraestrutura (ex: AWS, Supabase).</li>
        </ul>

        <h2>3. Obrigações da Processadora (Guilds Comercial)</h2>
        <p>A Guilds Comercial compromete-se a:</p>
        <ol>
          <li>Tratar os Dados Pessoais apenas conforme as instruções documentadas da Empresa Controladora, primariamente fornecidas pelo uso das features da Plataforma.</li>
          <li>Assegurar que pessoas autorizadas a tratar os Dados Pessoais assumiram compromisso de confidencialidade ou estão sujeitas a obrigações legais de sigilo.</li>
          <li>Tomar todas as medidas técnicas e organizacionais exigidas para segurança dos dados (Art. 46 LGPD), incluindo criptografia em repouso e trânsito (AES-256 e TLS 1.3).</li>
        </ol>

        <h2>4. Zero-Retention e Inteligência Artificial</h2>
        <p>
          Os recursos do nosso Copiloto de IA processam metadados dos leads (e transcrições de ligações) <strong>exclusivamente de forma efêmera</strong> para gerar outputs (como o "Raio-X"). A Guilds Comercial proíbe ativamente em nível contratual de API que os provedores subjacentes de LLM (Large Language Models) retenham esses dados para aprimoramento de seus algoritmos.
        </p>

        <h2>5. Auditoria, Portabilidade e Anonimização</h2>
        <p>
          A Plataforma dispõe de recursos self-service na API Rest (`/api/v1/lgpd/export` e `/api/v1/lgpd/delete`) para que a Controladora cumpra solicitações de titulares (clientes da Empresa) de forma autônoma. Caso necessite de apoio manual ou relatório de compliance, disponibilizaremos informações suficientes para demonstrar o cumprimento das obrigações deste DPA.
        </p>

        <h2>6. Notificação de Incidente</h2>
        <p>
          Sem demora injustificada e, em qualquer caso, não excedendo 48 horas após ter conhecimento, a Guilds Comercial notificará a Controladora sobre qualquer violação de segurança envolvendo Dados Pessoais.
        </p>

        <hr className="my-8" />
        <p className="text-sm text-slate-500 text-center">
          Dúvidas sobre o DPA ou solicitações específicas do Encarregado (DPO)?<br /> 
          Contate-nos em <a href="mailto:dpo@guilds.com.br">dpo@guilds.com.br</a>.
        </p>
      </div>
    </div>
  );
}
