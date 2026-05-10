# Guia de Onboarding para Desenvolvedores

Bem-vindo ao repositório do **Guilds Comercial**! 
Seja você um novo engenheiro no time ou apenas fazendo um setup em uma máquina nova, este guia resume os padrões arquiteturais de pastas e como configurar o projeto localmente do zero.

---

## 🛠️ 1. Ambiente Local vs. Nuvem (Setup do Supabase)

O projeto depende criticamente do Supabase (para Auth, Edge Functions, Banco de Dados Relacional e RLS). Você possui duas alternativas de setup:

### Opção A: Desenvolvimento 100% Local (Recomendado)
Usa o Docker para subir o container do Postgres e a API do Supabase na sua própria máquina. Ideal para quando for modificar tabelas ou criar _migrations_.
1. Instale o **Docker Desktop** e certifique-se de que ele está rodando.
2. Certifique-se de ter o `supabase-cli` instalado (`npm install -g supabase`).
3. Rode na raiz do projeto:
   ```bash
   npx supabase start
   ```
4. As _migrations_ contidas em `supabase/migrations/` serão rodadas automaticamente, construindo as tabelas e o RLS (Row Level Security).
5. O console local subirá em `http://127.0.0.1:54323`.

### Opção B: Conectado a um Projeto Remoto (Nuvem)
Útil quando não quiser rodar o Docker ou se quiser se conectar ao ambiente de **Staging/Produção**.
1. Renomeie `.env.local.example` para `.env.local`.
2. Obtenha a URL e as chaves de API (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) pelo Painel do Supabase.
3. Se houver alterações locais não aplicadas no banco remoto, você deve aplicar via:
   ```bash
   npx supabase db push
   ```

---

## 📂 2. Navegando na Arquitetura de Pastas

Como utilizamos o **Next.js 14 App Router**, as convenções de pasta são essenciais:

```text
guilds-comercial/
├── app/                  # Rotas da aplicação (App Router)
│   ├── (app)/            # Grupo de rotas PROTEGIDAS pela sessão Auth
│   │   ├── base/         # Tela de Triagem e Importação de Leads
│   │   ├── configuracoes/# Telas de ajustes e integrações dos gestores
│   │   ├── pipeline/     # Kanban de Vendas e Modal de Detalhamento
│   │   └── raio-x/       # Histórico de Diagnósticos Ofertados/Concluídos
│   ├── api/              # API Routes tradicionais (incluindo Webhooks)
│   ├── layout.tsx        # Layout Raiz (injetores de providers e toast)
├── components/           # Componentes Visuais (React) e Shadcn/UI
├── lib/                  # Código Utilitário
│   ├── ai/               # Lógica do Dispatcher do Copiloto de IA
│   ├── supabase/         # Clientes tipados para SSR e CSR do Supabase
│   └── webhooks.ts       # Fila de enfileiramento e despacho de Webhooks
├── supabase/             
│   ├── migrations/       # Evolução do esquema de banco (SQL puro)
│   └── functions/        # Edge Functions e rotinas de backend serverless
```

---

## 🎨 3. Padrões de Código e UI

1. **Estilização:** Utilize **Tailwind CSS**. Evite criar classes CSS manuais a menos que seja para animações extremas que o Tailwind não suporte bem via arbritary variants.
2. **Componentes Base:** O projeto usa `shadcn/ui`. Antes de criar um componente primitivo (botões, inputs, modais), veja se não há um similar dentro da pasta `components/ui/`.
3. **Fetching de Dados (Client vs Server):**
   - Prefira **Server Components** (`await supabase.from...`) sempre que possível, para performance e menor bundle de JS.
   - Utilize `"use client"` apenas no topo de componentes que dependem de hooks (`useState`, `useEffect`) ou interatividade complexa (Kanban, Formulários dinâmicos).
4. **Server Actions:** Mutações (edição de leads, avanço de pipeline) devem viver em arquivos `actions.ts` exportando funções assíncronas puras, acopladas com a funcionalidade `revalidatePath(...)` do Next.js.

---

## 🚀 4. Levantando o Frontend

Com o banco de dados configurado e rodando (seja local via Docker ou na nuvem), instale os pacotes e inicie o ambiente de dev:
```bash
npm install
npm run dev
```

A aplicação subirá em `http://localhost:3000`. Se o banco foi populado corretamente via seeds, você poderá logar usando um usuário de teste (verifique `supabase/seed.sql` para encontrar as credenciais padrão de "Gestor" e "SDR").

> **Atenção:** Mantenha sempre um olho no terminal onde o `npm run dev` está rodando, pois o `console.error` de erros críticos do Supabase e falhas de Server Actions aparecerão lá primeiro.

Pronto para codar! Dirija-se aos outros arquivos na pasta `docs/` se precisar se aprofundar em conceitos específicos do domínio.
