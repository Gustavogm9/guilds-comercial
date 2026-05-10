# Dicionário de Dados & Database Schema

O banco de dados do **Guilds Comercial** é hospedado na infraestrutura gerenciada do Supabase (PostgreSQL). A segurança dos dados é assegurada ativamente em nível de banco utilizando RLS (Row Level Security).

## 1. Topologia de Isolamento (Multi-Tenant)

O sistema foi arquitetado nativamente para atender múltiplas organizações simulando um SaaS ou hubs departamentais completamente ilhados.
A espinha dorsal deste isolamento é a tabela `organizacoes` e a view/função RLS associada a ela.

- **`organizacoes`**: Entidade pai (Root tenant).
- **`membros_organizacao`**: Tabela associativa (N:N) vinculando a tabela nativa `auth.users` do Supabase à entidade `organizacoes`.

> [!IMPORTANT]
> A função de banco de dados `orgs_do_usuario()` extrai todas as organizações que o JWT do usuário logado tem vínculo. Essa função é usada como o _guard gate_ de todas as políticas RLS subsequentes (`using (organizacao_id in (select public.orgs_do_usuario()))`). Nunca insira dados em tabelas críticas sem referenciar corretamente o campo `organizacao_id`.

## 2. A Tabela Núcleo: `leads`

Todas as oportunidades (desde contatos frios até contratos assinados) residem em uma única tabela contínua chamada `leads`. Ela foi intencionalmente mesclada das lógicas de planilhas "Bruta" e "Comercial" anteriores para evitar duplicação de entidades.

### Estágios do Funil (`funnel_stage` vs `crm_stage`)
Para distinguir o momento global do Lead da coluna de venda real, utilizamos duas variáveis:
1. `funnel_stage`: Enum amplo do ciclo de vida.
   - `base_bruta` -> `base_qualificada` -> `pipeline` -> `arquivado`
2. `crm_stage`: Status minucioso da tratativa comercial (apenas aplicável se `funnel_stage` for `pipeline`).
   - `Prospecção`, `Qualificação`, `Demonstração`, `Proposta`, `Fechado`, `Perdido`, `Nutrição`.

### Métricas Computadas
A tabela gera _views_ auxiliares (como `v_leads_enriched`) que computam "na base de dados" atributos complexos:
- **`dias_sem_tocar`**: Dias absolutos desde o último `updated_at` ou registro atrelado em `lead_historico`.
- **`receita_ponderada`**: A multiplicação automática de `valor_potencial * probabilidade`.

## 3. Histórico e Tarefas (`lead_historico`)

Cada evento relevante que modifica a expectativa ou relação com o Lead deve inserir uma linha em `lead_historico`.
Essa tabela espelha a timeline "360 graus" e suporta tipos nativos de interação: `LIGAÇÃO`, `WHATSAPP`, `EMAIL`, `SISTEMA`.

## 4. O Motor de Raio-X (`raiox_templates` e `raiox_respostas`)

O sistema de diagnóstico B2B utiliza uma estrutura JSON flexível para não amarrar o banco a hard-columns em cada nova pergunta que a equipe comercial invente.

- **`raiox_templates`**: Mantém as configurações de estrutura do formulário em um campo JSONB (`config_json`). Ex: Array de seções e perguntas do tipo "text" ou "select". Possui 1 registro primário por `organizacao_id`.
- **`raiox_respostas`**: Mantém as submissões reais e o acompanhamento progressivo daquele template em relação a um `lead_id` (`dados` JSONB, preenchimento e `concluido` flag). O resultado analítico dessa entidade alimenta (via AI e backend) a tabela legada `raio_x`.

## 5. Modelagem de Inteligência (`ai_features` e `ai_prompts`)

O núcleo de IA é parametrizado em tabelas, tornando-se agnóstico do provider e passível de A/B testing:

- **`ai_features`**: Define "quais super-poderes existem" (ex: `avaliar_raiox`, `gerar_mensagem_cadencia`). Carrega definições como token limit e temperature.
- **`ai_prompts`**: Define "como falar com a IA". Suporta versionamento e _templating_ Mustache (ex: `Respostas do lead: {{respostas}}`).

---
Para conhecer em detalhes todas as _constraints_ e migrações incrementais (v1 até V10), consulte as dezenas de arquivos `.sql` puristas salvos sequencialmente em `supabase/migrations/`.
