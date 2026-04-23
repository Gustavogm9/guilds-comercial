# Camada de IA — Setup e operação

O guilds-comercial tem 15 features de IA cobrindo todo o fluxo do vendedor.
Cada feature tem prompt versionado, provedor/modelo/temperature configuráveis
e log completo de invocações (custo, latência, tokens, status).

> **Gestor configura tudo em `/admin/ai`.** Este documento é o manual de setup
> e referência técnica.

---

## Conceitos

- **Provider** — fornecedor de LLM (Anthropic, OpenAI, Google). Cada um tem
  API key referenciada por nome de `env var` (não armazenamos a chave em si no DB),
  base URL opcional e tabela de custos por 1k tokens.
- **Feature** — caso de uso (ex: `gerar_mensagem_cadencia`). Define qual
  provider/modelo/temperature/max_tokens usar, se está ativa, budget diário e
  papel mínimo (sdr/comercial/gestor).
- **Prompt** — biblioteca versionada. Uma versão ativa por `(org, feature)`.
  Gestor pode editar, criar nova versão e reverter pra anterior.
- **Invocation** — cada chamada gera uma row em `ai_invocations` com input vars,
  output, tokens, latência, custo e status (sucesso/erro/bloqueado_budget/timeout).

---

## As 15 features

| Código                       | Quando usar                                                 | Output |
|------------------------------|-------------------------------------------------------------|--------|
| `enriquecer_lead`            | Importou CSV, quer preencher cargo/segmento/decisor          | JSON   |
| `gerar_oferta_raiox`         | Hora de enviar oferta do Raio-X (WhatsApp/email)             | Texto  |
| `gerar_documento_raiox`      | Depois da call de diagnóstico, gerar score + recomendações   | JSON   |
| `gerar_mensagem_cadencia`    | Passo D0/D3/D7/D11/D16/D30 personalizado                     | Texto  |
| `extrair_ligacao`            | Transformar transcrição/resumo em campos estruturados         | JSON   |
| `next_best_action`           | Narrativa contextual ao lado do score no detalhe do lead     | Texto  |
| `briefing_pre_call`          | 30min antes da call: dossiê executivo                        | Texto  |
| `objection_handler`          | "Cliente disse X" → 3 abordagens com script                  | JSON   |
| `gerar_proposta`             | Minuta em 3 versões a partir do raio-x + histórico           | JSON   |
| `sugerir_motivo_perda`       | Texto livre do vendedor → motivo padronizado                 | JSON   |
| `detectar_risco`             | Cron diário — flaga leads esfriando                          | JSON   |
| `resumo_diario`              | Cron 19h — o que foi feito + foco de amanhã                  | Texto  |
| `digest_semanal`             | Cron sexta 17h — insights executivos da semana pro gestor    | Texto  |
| `reativar_nutricao`          | Momento certo de reengajar lead parado em Nutrição           | JSON   |
| `forecast_ml`                | Ajuste do forecast heurístico com padrões do histórico        | JSON   |

Os códigos são fixos — não renomear (quebra o dispatcher).

---

## Setup inicial

### 1. Rodar a migration v5

No SQL Editor do Supabase, execute `supabase/migration_v5_ai.sql`.
Cria as 4 tabelas (`ai_providers`, `ai_features`, `ai_prompts`, `ai_invocations`)
+ a view `v_ai_uso_30d` + **seeds dos 15 features e prompts iniciais em português**.

### 2. Configurar API keys como env vars

As chaves nunca ficam no banco. O campo `api_key_ref` aponta pra um `env var`.

No Vercel / Supabase (ou `.env.local` pra dev):

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...         # opcional
GOOGLE_API_KEY=AIzaSy...           # opcional
```

### 3. Verificar em `/admin/ai → Providers`

Cada provider mostra:
- Nome do env var usado (`api_key_ref`)
- Modelo default
- Custos por 1k tokens (pra estimativa de custo)
- Base URL (editável — use self-hosted ou proxies)
- Toggle ativo/inativo

### 4. Habilitar as features desejadas em `/admin/ai → Features`

Todas vêm **desabilitadas por padrão** pra org. Gestor liga uma a uma
(evita surpresa na fatura).

Cada feature tem:
- Toggle on/off
- Provider e modelo específicos (pode usar Gemini pra uma, Claude pra outra)
- Temperature (0-2) e max_tokens
- Limite diário por org e por usuário (budget cap)
- Papel mínimo (sdr/comercial/gestor)

---

## Editor de prompts (`/admin/ai → Prompts`)

Interface completa de edição de prompt com:

- **System prompt** (instruções gerais do papel)
- **User template** com variáveis `{{empresa}}`, `{{nome}}`, etc.
- **Variáveis esperadas** — lista declarada que o action do TS deve preencher
- **Notas da versão** — justificativa do ajuste pra auditoria

**Salvar cria nova versão e marca como ativa.** A versão anterior fica no histórico.
Botão "Reverter" em qualquer versão antiga torna ela ativa novamente.

### Variáveis no template

Use `{{nome_variavel}}` no `user_template`. Todas as variáveis declaradas
em `variaveis_esperadas` devem estar presentes no input do action TS — senão
o template renderiza vazio. O dispatcher aceita qualquer tipo (string, number,
array, object — objetos viram `JSON.stringify`).

Exemplo:

```text
Lead: {{empresa}} — score {{score}} ({{rotulo_score}})
Etapa atual: {{crm_stage}}
Dias sem tocar: {{dias_sem_tocar}}
```

---

## Arquitetura interna

```
UI (client)  →  Server Action (lib/ai/actions/)
                     │
                     └─> invokeAI({feature, vars, leadId})
                              │
                              ├─ carrega ai_feature (org override → global)
                              ├─ verifica papel + budget (últimas 24h)
                              ├─ carrega ai_prompt ativo
                              ├─ renderiza user_template substituindo {{vars}}
                              ├─ carrega ai_provider (lê api_key do env)
                              ├─ chama adapter (anthropicAdapter|openai|google)
                              ├─ loga em ai_invocations (sucesso|erro|timeout)
                              └─ parse JSON se outputMode='json'
```

Código em:
- `lib/ai/dispatcher.ts` — `invokeAI` (coração)
- `lib/ai/providers/{anthropic,openai,google}.ts` — adapters HTTP
- `lib/ai/actions/index.ts` — 15 server actions tipadas
- `app/(app)/admin/ai/` — UI de admin
- `components/ai/` — componentes client reusáveis (`NextBestActionCard`, `GerarCadenciaAI`)

---

## Monitoramento e auditoria

Em `/admin/ai → Logs` (últimas 50 invocações):

- Timestamp, feature, provider, modelo
- Status (sucesso / erro / bloqueado_budget / timeout)
- Tokens entrada/saída
- Custo estimado (USD)
- Latência (ms)
- Erro (se houver)
- Input vars e output completo ao clicar

Agregação em `v_ai_uso_30d` (por feature, últimos 30d): invocações OK/erro/bloqueadas,
custo total, latência média. Aparece no card de cada feature.

---

## Controle de custo

Dois budgets por feature:
- `limite_dia_org` — total de invocações bem-sucedidas na org em 24h
- `limite_dia_usuario` — mesmo mas por ator

Quando atinge, as próximas chamadas retornam erro `bloqueado_budget` e são
logadas com esse status. Não travam o app — caem de volta pro fluxo manual.

Defaults conservadores (200/org/dia, 50/usuário/dia). Ajustáveis por feature.

---

## Boas práticas

1. **Teste antes de ligar em produção** — crie prompt v2, rode manualmente,
   leia output nos logs, compare com v1 antes de ativar pra toda org.
2. **Temperature baixa pra extração estruturada** (0.1-0.3) — evita variabilidade.
3. **Temperature média pra copy** (0.5-0.7) — equilibra criatividade e consistência.
4. **JSON mode pra dados** — use `outputMode: "json"` quando o prompt pede
   JSON explícito. O dispatcher faz `JSON.parse` tolerando ```` ```json ```` fences.
5. **Nunca edite prompts diretamente no SQL.** Sempre passe pela UI — garante
   versionamento e tracking de `criado_por`.
6. **Variáveis esperadas** devem bater exatamente com as do action. Se adicionar
   variável no prompt, adicione também em `variaveis_esperadas` E no action TS.

---

## Troubleshooting

| Sintoma                                    | Provável causa                              |
|--------------------------------------------|---------------------------------------------|
| `API key ausente (env ANTHROPIC_API_KEY)` | Env var não configurada no deploy            |
| `Feature desativada pelo admin`           | Feature com toggle off em `/admin/ai`        |
| `Limite diário da org atingido`           | Ajuste `limite_dia_org` ou investigue abuso  |
| `Permissão insuficiente`                  | Papel do usuário < `papel_minimo` da feature |
| `Resposta não é JSON válido`              | Prompt precisa forçar JSON mais firme        |
| `Anthropic 401 / OpenAI 401`              | API key inválida — regerar no painel do provider |
| Latência alta                             | Modelo muito grande pra tarefa simples; teste com `gpt-4o-mini` / `haiku` |

---

## Próximos passos

- Integração com **Supabase Vault** para API keys em repouso cifradas (hoje é via env).
- Retries automáticos em caso de 429/5xx com backoff exponencial.
- Webhook pra dashboards externos (Grafana) a partir de `ai_invocations`.
- Fine-tuning por org — armazenar exemplos favoritos e injetar como few-shot.
