# Módulo de Inteligência Artificial e Automações

O **Guilds Comercial** utiliza uma camada arquitetural avançada para lidar de forma assíncrona com Modelos de Linguagem e Despacho de Eventos, garantindo a integridade e escalabilidade da experiência de Vendas.

## 🧠 1. Dispatcher de Inteligência Artificial (`invokeAI`)

Para evitar *vendor lock-in* (ficar preso apenas à OpenAI ou Anthropic) e também garantir versionamento de engenharia de prompt (A/B testing), todas as chamadas aos Large Language Models (LLMs) fluem através da interface de orquestração interna (o módulo `lib/ai/`).

### A Tabela `ai_features`
Cada "Módulo de Venda Inteligente" que exige o modelo tem uma feature declarada. Exemplo: `avaliar_raiox`, `next_best_action`, `gerar_cadencia`.
É ali que limitamos o custo definindo a *temperature* e o teto de *tokens* que a funcionalidade pode consumir.

### A Função de Despacho
No código de Server Actions (ex: `app/(app)/raio-x/actions.ts`), o desenvolvedor nunca instancia um cliente do ChatGPT puro. O modelo exigido deve ser esse:

```typescript
// Exemplo de Invocação Correta
const iaResponse = await invokeAI("avaliar_raiox", {
  respostas: respostasFormatadas,
  nomeEmpresa: lead.nome_empresa
}, lead.organizacao_id);
```

> [!TIP]
> A função `invokeAI` automaticamente puxa do Supabase qual é o provider configurado no momento para a Organização (gemini, openai ou anthropic), extrai o Prompt de Sistema templateado com suas variáveis (`{{respostas}}`, `{{nomeEmpresa}}`) e efetua a requisição HTTPS formatando a resposta estruturada.

## 🪝 2. Webhooks e Sistema de Assinaturas (Events)

O mini-CRM não opera isolado. Ele tem a obrigação de propagar suas mudanças de estado (e insights recém-gerados pela IA) para o ecossistema do cliente (n8n, Make, Zapier, RD Station).

### Orquestrador em `lib/webhooks.ts`
Implementamos uma biblioteca server-side agnóstica para emissões confiáveis, através da função `dispatchWebhook(eventType, orgId, payload)`.

### Eventos Catalogados Atualmente:
- `raiox.completed`: Disparado sempre que o fluxo dinâmico do Raio-X termina e a AI já inferiu o novo _Score_ e risco de _Perda Anual_. Esse webhook expõe todo o JSONB do template e a recomendação da inteligência.

### Sistema de Delivery e Retentativas (Retries)
O webhook implementa debaixo dos panos estratégias de retry assíncrono (Exponential Backoff - ex: tentar em 1min, depois 5min, depois 30min) caso o endpoint do cliente devolva `5xx` (Internal Server Error) ou timeout de recepção.

## ⏳ 3. Tarefas Cronometradas (pg_cron)
Em certos workflows automáticos diários (como o Digest de Email para Gestores às 7:00 AM sobre Oportunidades Frias), utilizamos a extensão **pg_cron** ativada no PostgreSQL do Supabase e vinculada às **Edge Functions**.

Isso poupa o nosso servidor frontend em Node.js Next de gerenciar *polling* ou memória long-running, jogando toda a carga de automação escalonada (time-based) para instâncias serverless blindadas do próprio DB.
