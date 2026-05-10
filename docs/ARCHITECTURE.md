# Arquitetura e Decisões de Engenharia

O ecossistema **Guilds Comercial** evoluiu de uma ferramenta baseada em Excel (onde "todo mundo tem acesso a tudo") para um SaaS real de CRM projetado sob fortes paradigmas de isolamento e Server-Side Rendering (SSR).

Este documento mapeia o "Porquê" das macro decisões estruturais tomadas no repositório.

## 1. Stack Tecnológico Primário
- **Frontend / API API Orchestration:** Next.js 14 (App Router) em TypeScript. Todo roteamento utiliza a pasta `app/` garantindo reatividade de componentes do lado do servidor (RSC). 
- **Componentização:** Tailwind CSS acoplado nativamente com [shadcn/ui] permitindo customização agressiva de marcação sem o peso de libraries fechadas como MaterialUI.
- **Banco e Autenticação:** Supabase. Diferente de arquiteturas MERN clássicas, não escrevemos APIs CRUD Node expressas do zero; o PostgreSQL gerenciado via Data API do Supabase nos devolve segurança relacional já serializada em tempo real.

## 2. A Camada de Multilocação (Multi-Tenant)
Como múltiplos times (ou as próprias empresas filhas da Guilds) podem operar neste CRM, o princípio absoluto foi proibir vazamento cruzado.
- Adotamos o modelo "Single DB, Logical Schema". Existe um **`organizacao_id`** em todas as tabelas transacionais.
- Em cada requisição logada no servidor (`await supabase.auth.getUser()`), ativamos uma função no Postgres `orgs_do_usuario()`. O motor RLS injeta silenciosamente restrições em toda instrução SELECT/UPDATE onde a linha não contenha o ID do qual o usuário tem permissão para visualizar.
- **Consequência:** Na UI e no backend, o Dev **não precisa se preocupar em ficar inserindo** `WHERE organizacao_id = X` em todas as queries para segurança, o RLS bloqueia invasões na raiz do driver.

## 3. O Paradoxo da Impersonificação (Shadowing Segura)

Um dos maiores desafios era permitir que o Gestor Comercial entrasse "na pele e nos sapatos" de um SDR na plataforma (ver a timeline do SDR, sem a poluição do painel global do Gerente), porém os JWT Tokens do Auth do Supabase são imutáveis em nível de permissionamento real.

### A Solução: Injeção de Cookie Segura
Quando um Gerente (permissão `gestor` validada) aciona a Impersonificação:
1. Uma **Server Action** cria um cookie HTTPOnly seguro chamado `x-impersonate-user` contendo o ID do SDR alvo e gera um log auditável na tabela `impersonation_logs`.
2. Criamos uma "Gambiarra Genial" no cliente SSR do Supabase (`lib/supabase/server.ts`). O código _intercepta_ cada vez que a página vai puxar a Role original do usuário. Se o cookie existir (e o usuário real for de fato um Gestor), nós reescrevemos o objeto `{ user }` em runtime de memória, substituindo a Role dele por "sdr" para fins de filtragem da UI.
3. Isso garante flexibilidade máxima de suporte aos times, sem ferir a integridade criptográfica do DB.

## 4. Formulários Baseados em Metadados (O Novo Raio-X Dinâmico)

Ao invés de adicionar hard-columns no Postgres (`pergunta_faturamento`, `pergunta_tamanho_time`) sempre que os gestores queriam inovar nas suas abordagens de Qualificação, foi construído o Motor Dinâmico de Raio-X.

1. Uma tabela mantem o JSON Schema (`raiox_templates`), definindo o layout (Inputs numéricos, de texto, multiseleções).
2. O componente Frontend (`DynamicRaioXShell`) atua como uma fábrica de UI reativa: Ele lê o JSON da organização do usuário logado e constrói dinamicamente o Componente React correspondente sem precisar re-escrever código ou realizar deployments no Vercel/Railway para publicar novas perguntas de Vendas.
3. No submit, os dados formatados não apenas são salvos no banco, como engatilham o ciclo de Inference da nossa Camada de IA para extrair predições métricas valiosas do prospect antes de voltar ao Frontend.

## 5. Abordagem de Estado Mutável (Optimistic Updates)

Em certas interações de altíssima latência sensorial, como "arrastar um lead pelo Kanban" de `Qualificação` para `Proposta`, não queremos que o Vendedor sofra a latência de roundtrip (Request -> Postgres -> Response -> NextJS Paint).
Aplicamos no módulo `/pipeline` ferramentas como `useOptimistic` do React e _Draggable Hooks_, onde a UI salta instantaneamente para a coluna correta sob a premissa de que a rede irá corresponder. Se o Backend recusar o arrasto (ex: Validações ou Queda de Conexão), o Hook fará o rollback elástico visual daquele elemento em tela.
