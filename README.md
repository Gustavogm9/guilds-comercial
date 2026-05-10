# Guilds Comercial

**Guilds Comercial** é o Mini-CRM interno (e escalável) da Guilds Lab.
Criado originalmente para absorver o controle de planilhas complexas, o sistema evoluiu para uma plataforma robusta, **multi-tenant** e impulsionada por **Inteligência Artificial**.

> 💡 **Tech Stack:**
> - **Framework:** Next.js 14 (App Router)
> - **Backend & Auth:** Supabase (PostgreSQL, Edge Functions, Row Level Security)
> - **Styling:** Tailwind CSS + shadcn/ui
> - **Linguagem:** TypeScript

---

## 🚀 Quick Start (Desenvolvimento Local)

### 1. Instalação
Clone o repositório e instale as dependências:
```bash
git clone <repo-url>
cd guilds-comercial
npm install
```

### 2. Variáveis de Ambiente
Copie o arquivo de exemplo e preencha com as credenciais do seu projeto Supabase (seja o ambiente de staging/produção ou seu contêiner local):
```bash
cp .env.local.example .env.local
```

### 3. Banco de Dados (Local vs Nuvem)
O projeto depende de uma série de Views, Funções SQL e Cron Jobs configurados no Supabase.
- **Opção A (Recomendada para dev completo):** Rode `npx supabase start` para subir os containers locais do Postgres. Em seguida, as migrations serão aplicadas automaticamente.
- **Opção B (Conectando à Nuvem):** Conecte-se a um projeto Supabase existente e rode `npx supabase db push` para aplicar o schema.
*(Veja o [Guia de Onboarding](./docs/ONBOARDING.md) para o passo-a-passo detalhado).*

### 4. Rodando a Aplicação
Inicie o servidor de desenvolvimento:
```bash
npm run dev
```
Acesse `http://localhost:3000` no seu navegador.

---

## 📚 Base de Conhecimento (Docs)

Para garantir que a equipe mantenha o mesmo padrão arquitetural, toda a documentação foi modularizada. **Se você é um novo desenvolvedor na equipe, comece lendo a pasta `docs/`.**

| Documento | O que você vai encontrar |
|-----------|--------------------------|
| 🛣️ **[ONBOARDING.md](./docs/ONBOARDING.md)** | Guia do 1º dia: Padrões de código, como testar e rodar o projeto do zero. |
| 🏛️ **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | Core da arquitetura: Como funciona o RLS, Multi-Tenant, Impersonation (Shadowing) e o Motor de Raio-X. |
| 🗄️ **[DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md)** | Dicionário de Dados: Entenda as tabelas de `leads`, `organizacoes`, `raiox_templates` e o funil. |
| 🤖 **[AI_AND_AUTOMATIONS.md](./docs/AI_AND_AUTOMATIONS.md)** | Como operam os Webhooks (`lib/webhooks.ts`), os cron jobs e o Dispatcher de IA (`invokeAI`). |
| 📖 **[PRD.md](./docs/PRD.md)** | Documento de Requisitos do Produto (Regras de negócio, personas e roadmap histórico). |

---

## 🎯 Principais Features (Overview)

- **Funil e Pipeline Arrastável:** Gestão visual de cards (Optimistic UI).
- **Multi-Tenant:** Isolamento rigoroso de dados usando `organizacao_id` integrado nativamente às políticas do PostgreSQL (RLS).
- **Impersonificação (Shadowing):** Gestores podem acessar a plataforma simulando a visão e permissões de seus SDRs (via injeção de cookie no Server-Side).
- **Motor de Raio-X Dinâmico:** Construtor de formulários em JSONB por organização, avaliado automaticamente por LLMs na submissão.
- **Copiloto IA:** 15+ features de inteligência artificial acopladas ao fluxo do vendedor (geração de mensagens, resumos diários, análise de ligações).

---

## 🤝 Como Contribuir

Siga os padrões definidos no [ONBOARDING.md](./docs/ONBOARDING.md).
Lembre-se sempre de rodar o linter (`npm run lint`) e garantir que suas migrations locais sejam geradas corretamente (`supabase migration new <nome_da_feature>`) antes de abrir um PR.
