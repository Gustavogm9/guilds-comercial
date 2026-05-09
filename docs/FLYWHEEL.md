# RFC — Flywheel completo: indicações, advocacy e funil borboleta

**Status:** Proposta
**Autor:** Gustavo + Claude (auditoria de Maio/2026)
**Atualizado:** 2026-05-06

## TL;DR

Hoje o sistema é um **funil tradicional** que termina em "Fechado". Falta o lado direito —
o que acontece depois que o lead vira cliente. Esse RFC propõe transformar o produto num
**funil borboleta (bowtie)**, onde o "Fechado" é o **meio**, não o fim. Concretamente:

1. **Adicionar etapa obrigatória "Pedido de indicação"** depois de Fechado.
2. **Nova aba `/indicacoes`** com pedidos pendentes, indicações recebidas, top embaixadores.
3. **KPIs de advocacy no `/funil`**: K-factor, % indicação→fechado, CAC indicação vs outbound.
4. **Modelo de dados pra rastrear de quem veio cada lead** (campo `indicado_por_lead_id`).
5. **Roadmap pra completar o flywheel** (onboarding, health score, expansão).

Essa estrutura cria o ciclo `cliente → embaixador → novo cliente → embaixador` que é o
multiplicador real do crescimento B2B (CAC negativo no longo prazo).

---

## 1. Por que funil borboleta?

### O modelo atual (funil simples)

```
Base bruta  →  Qualificada  →  Pipeline  →  Raio-X  →  Proposta  →  Fechado
                                                                        ↓
                                                                       FIM
```

**Problema:** o cliente sai do CRM no dia que assina. Não sabemos:
- Se ele está usando o serviço
- Se está satisfeito (NPS, CSAT)
- Se vai renovar (churn risk)
- Se conhece outras pessoas pra indicar (advocacy)

A maior fonte de leads B2B alta-margem **é indicação**. E o sistema atual não captura nem
mede isso.

### O modelo proposto (bowtie / funil borboleta)

```
                  AQUISIÇÃO                                    EXPANSÃO
       (lado esquerdo — atual)                          (lado direito — novo)

  Base → Qualif → Pipeline → Raio-X → Proposta  →→→  Onboard → Adopt → Expand → Advocate
                                          ↓               ↑                          ↓
                                    [FECHAMENTO]          ←——————————————— [INDICAÇÃO]
                                          (nó central)
```

**Cada cliente fechado vira gerador de novos leads** via indicação. O ciclo se fecha:
indicação entra como lead novo no topo do funil esquerdo, com origem rastreada.

### Métricas que isso destrava

| Métrica | Hoje | Com bowtie |
|---|---|---|
| CAC | só outbound | outbound vs indicação (geralmente 3-5x menor) |
| LTV | nenhum | LTV por canal de origem |
| K-factor | nenhum | quantos novos clientes cada cliente gera |
| Tempo até churn | nenhum | health score + alerta antes do não-renew |
| % receita expansão | nenhum | upsell/cross-sell tracking |

---

## 2. Feature: Indicação (foco do RFC)

### 2.1 Modelo de dados

#### Tabela nova: `indicacoes`

```sql
CREATE TABLE indicacoes (
  id              BIGSERIAL PRIMARY KEY,
  organizacao_id  UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,

  -- De quem veio (cliente embaixador)
  embaixador_lead_id  BIGINT NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  -- Vendedor que pediu/recebeu a indicação
  solicitado_por      UUID REFERENCES profiles(id),

  -- Dados do indicado (texto livre antes de virar lead)
  indicado_nome      TEXT NOT NULL,
  indicado_empresa   TEXT,
  indicado_cargo     TEXT,
  indicado_email     TEXT,
  indicado_whatsapp  TEXT,
  indicado_linkedin  TEXT,
  contexto           TEXT,  -- "Trabalham juntos no projeto X", "Sócio dele"

  -- Quando vira lead, vinculamos
  lead_convertido_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,

  -- Estado da indicação
  status TEXT NOT NULL DEFAULT 'recebida' CHECK (status IN (
    'recebida',         -- vendedor anotou
    'contactado',       -- já fez primeiro toque
    'virou_lead',       -- foi convertido em lead na base
    'fechado',          -- virou cliente fechado (success!)
    'perdido',          -- não rolou
    'descartado'        -- vendedor decidiu não trabalhar
  )),

  -- Auditoria
  data_recebida    TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_contactado  TIMESTAMPTZ,
  data_convertido  TIMESTAMPTZ,
  data_fechado     TIMESTAMPTZ,
  data_perdido     TIMESTAMPTZ,

  -- Recompensa (opcional, fase 2)
  recompensa_tipo  TEXT,    -- "desconto_renovacao", "credito", "produto", "nenhum"
  recompensa_valor NUMERIC(12,2),
  recompensa_paga  BOOLEAN DEFAULT FALSE,

  observacoes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_indicacoes_org ON indicacoes(organizacao_id);
CREATE INDEX idx_indicacoes_embaixador ON indicacoes(embaixador_lead_id);
CREATE INDEX idx_indicacoes_lead_convertido ON indicacoes(lead_convertido_id);
CREATE INDEX idx_indicacoes_status ON indicacoes(organizacao_id, status);
```

#### Tabela nova: `pedidos_indicacao`

Rastreia **quando o vendedor pediu** a indicação (mesmo sem retorno):

```sql
CREATE TABLE pedidos_indicacao (
  id              BIGSERIAL PRIMARY KEY,
  organizacao_id  UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  lead_id         BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  solicitado_por  UUID REFERENCES profiles(id),

  -- Quando pediu e em que momento do funil
  momento TEXT NOT NULL CHECK (momento IN (
    'pos_fechamento',
    'pos_raio_x',
    'pos_resultado',
    'renovacao',
    'outro'
  )),
  canal TEXT CHECK (canal IN ('call', 'whatsapp', 'email', 'pessoalmente', 'outro')),

  -- Resposta
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente',     -- pediu, esperando
    'respondido',   -- recebeu N indicações
    'negado',       -- cliente disse que não tem
    'ignorado',     -- cliente não respondeu
    'agendado'      -- combinou pra outra hora
  )),
  qtd_indicacoes_recebidas INT NOT NULL DEFAULT 0,

  data_pedido     TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_resposta   TIMESTAMPTZ,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_indicacao_lead ON pedidos_indicacao(lead_id);
CREATE INDEX idx_pedidos_indicacao_status ON pedidos_indicacao(organizacao_id, status);

-- Constraint: 1 pedido pendente por lead+momento (evita duplicar pedido)
CREATE UNIQUE INDEX uniq_pedido_lead_momento
  ON pedidos_indicacao(lead_id, momento)
  WHERE status = 'pendente';
```

#### Coluna nova em `leads`

```sql
ALTER TABLE leads
  ADD COLUMN indicacao_id BIGINT REFERENCES indicacoes(id) ON DELETE SET NULL;
-- Quando um lead é criado a partir de uma indicação, gravamos aqui.
-- Permite rastrear "este lead veio de uma indicação ID 42, que veio do cliente X".
```

E aproveita o `fonte` que já existe — adiciona "Indicação" como valor canônico.

### 2.2 Etapa obrigatória de pedir indicação

#### Onde aparece

Quando lead muda pra `crm_stage = "Fechado"`, o sistema:

1. **Cria automaticamente um `pedido_indicacao`** com status `pendente`, momento `pos_fechamento`.
2. **Adiciona uma ação em /hoje** pro vendedor responsável: "Pedir indicação ao [empresa]".
3. **Bloqueia o "completar pós-venda"** até o pedido sair do estado pendente.

#### Configurável em `/equipe → config`

```
☑ Pedir indicação obrigatório após fechamento
☐ Pedir indicação obrigatório após raio-x bem sucedido
☑ Pedir indicação obrigatório no aniversário de 6 meses (renovação)
```

Se desligar, o pedido vira só **sugerido** (não bloqueia, mas aparece em /hoje).

#### Fluxo na tela do lead

Em `/pipeline/[id]`, depois que crm_stage = "Fechado":

```
┌─────────────────────────────────────────────────────┐
│  ⭐ Pedido de indicação pendente                     │
│  Pedido em 06/05  |  via WhatsApp                   │
│                                                     │
│  [✓ Recebi indicações]  [✗ Não tinha]  [⏰ Adiar]   │
└─────────────────────────────────────────────────────┘
```

Clicar em "Recebi indicações" abre modal:

```
┌─────────────────────────────────────────────────────┐
│  Quem foi indicado?                                 │
│                                                     │
│  Nome*    [_____________]                           │
│  Empresa  [_____________]                           │
│  Cargo    [_____________]                           │
│  Email    [_____________]                           │
│  WhatsApp [_____________]                           │
│  Contexto [Trabalham juntos no projeto X]           │
│                                                     │
│  [+ Adicionar outra indicação]                      │
│                                                     │
│           [Cancelar]  [Salvar e criar leads]        │
└─────────────────────────────────────────────────────┘
```

Ao salvar:
- Insere N rows em `indicacoes` (uma por indicado)
- Atualiza `pedidos_indicacao.status = 'respondido'` + `qtd_indicacoes_recebidas = N`
- **Cria N leads novos** na base bruta com `indicacao_id` apontando + `fonte = "Indicação"`
- Grava evento `pediu_indicacao` em `lead_evento` no embaixador
- Grava evento `criado_por_indicacao` em cada novo lead
- Toast: "3 leads adicionados à base. Trabalhe pelo menos um nesta semana!"

### 2.3 Aba `/indicacoes` — UI

#### 4 sub-abas

**Tab 1: Pendentes** (default)
- Lista de `pedidos_indicacao` com `status = 'pendente'` da org
- Colunas: Cliente | Vendedor | Pedido em | Dias parado | Ações
- Filtros: vendedor, momento (pós-fechamento/raio-x/etc)
- Cada linha tem botão "Pedir agora" que abre o modal acima

**Tab 2: Indicações ativas**
- Lista de `indicacoes` com status `recebida`, `contactado`, `virou_lead`
- Colunas: Indicado | Embaixador | Vendedor | Status | Data
- Sublinha quando virou lead (link pra `/pipeline/[id]`)
- Mostra de quem veio: "indicado por [Cliente Y]"

**Tab 3: Top embaixadores**
- Ranking de quem mais indica e quem indica leads que fecham
- Métrica composta: `qtd_indicacoes * taxa_conversao`
- Mostra `LTV gerado` (soma de valor_potencial dos leads convertidos)
- Permite filtrar por gestor/vendedor/segmento

**Tab 4: Recompensas** (fase 2)
- Indicações que viraram fechamento e ainda não pagaram recompensa ao embaixador
- Botão "Marcar como paga"

#### Estado vazio

Primeira vez:
```
Você ainda não pediu nenhuma indicação.
Cliente fechado é cliente que confia — peça já no ato da assinatura.

[Configurar regras em /equipe]   [Começar pelo último fechado →]
```

### 2.4 KPIs no `/funil`

Adicionar uma seção **"Advocacy"** ao final da página:

```
┌────────────────────── Advocacy ──────────────────────┐
│                                                       │
│  📊 K-factor        0.7    leads novos por cliente   │
│  📈 % indicação     23%    do pipeline atual         │
│  💰 CAC indicação   R$ 180  vs R$ 870 outbound       │
│  ⏱  Tempo p/ pedir  8 dias média após fechar         │
│  ⭐ Top embaixador   Carlos (Empresa X) — 5 fech.   │
│                                                       │
│  Conversão por origem:                                │
│  Indicação ████████████████ 42%                      │
│  Outbound  ████████ 18%                              │
│  Inbound   ██████ 12%                                │
│  CSV       ███ 6%                                     │
└───────────────────────────────────────────────────────┘
```

#### Views SQL pra alimentar isso

```sql
CREATE OR REPLACE VIEW v_advocacy_kpis AS
WITH fechados AS (
  SELECT id, organizacao_id, valor_potencial
  FROM leads WHERE crm_stage = 'Fechado'
),
pedidos AS (
  SELECT lead_id, organizacao_id,
         (data_resposta - data_pedido) AS tempo_p_responder
  FROM pedidos_indicacao
  WHERE momento = 'pos_fechamento' AND status = 'respondido'
),
indicacoes_convertidas AS (
  SELECT i.organizacao_id, i.embaixador_lead_id,
         l.valor_potencial AS valor_lead_indicado
  FROM indicacoes i
  JOIN leads l ON l.id = i.lead_convertido_id
  WHERE i.status = 'fechado'
)
SELECT
  f.organizacao_id,
  COUNT(DISTINCT f.id) AS clientes_fechados,
  COUNT(DISTINCT ic.embaixador_lead_id) AS clientes_que_indicaram,
  COUNT(ic.embaixador_lead_id)::NUMERIC / NULLIF(COUNT(DISTINCT f.id), 0) AS k_factor,
  AVG(EXTRACT(EPOCH FROM tempo_p_responder)/86400) AS dias_media_p_responder,
  SUM(ic.valor_lead_indicado) AS receita_via_indicacao
FROM fechados f
LEFT JOIN pedidos p ON p.lead_id = f.id
LEFT JOIN indicacoes_convertidas ic ON ic.organizacao_id = f.organizacao_id
GROUP BY f.organizacao_id;

CREATE OR REPLACE VIEW v_top_embaixadores AS
SELECT
  i.organizacao_id,
  i.embaixador_lead_id,
  emb.empresa AS embaixador_empresa,
  emb.nome    AS embaixador_nome,
  COUNT(*)                                     AS qtd_indicacoes,
  COUNT(*) FILTER (WHERE i.status = 'virou_lead' OR i.status = 'fechado') AS qtd_viraram_lead,
  COUNT(*) FILTER (WHERE i.status = 'fechado') AS qtd_fecharam,
  COALESCE(SUM(l.valor_potencial) FILTER (WHERE i.status = 'fechado'), 0) AS receita_gerada,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE i.status = 'fechado')
          / NULLIF(COUNT(*), 0),
    1
  ) AS taxa_conversao_pct
FROM indicacoes i
JOIN leads emb ON emb.id = i.embaixador_lead_id
LEFT JOIN leads l ON l.id = i.lead_convertido_id
GROUP BY i.organizacao_id, i.embaixador_lead_id, emb.empresa, emb.nome
ORDER BY receita_gerada DESC NULLS LAST;
```

### 2.5 Server actions necessárias

`app/(app)/indicacoes/actions.ts`:

```ts
// Criar pedido (gestor pode criar ad-hoc, sistema cria automático em fechamento)
criarPedidoIndicacao(input: { lead_id, momento, canal? })

// Vendedor registra resposta do cliente
responderPedidoIndicacao(input: {
  pedido_id,
  status: 'respondido' | 'negado' | 'ignorado' | 'agendado',
  indicacoes?: Array<{ nome, empresa, email, whatsapp, cargo, contexto }>,
  observacoes?
})

// Quando indicação vira lead (manual)
converterIndicacaoEmLead(indicacao_id)
// Auto: ao criar lead via responderPedidoIndicacao, já vincula

// Atualizar status conforme indicação evolui
atualizarStatusIndicacao(indicacao_id, novo_status)
// Trigger automático: quando lead.crm_stage muda pra "Fechado",
// indicacao.status muda pra "fechado" (via trigger SQL ou webhook interno)

// Recompensa
marcarRecompensaPaga(indicacao_id)
```

Hooks SQL pra automatizar:

```sql
-- Trigger: quando lead vira "Fechado", cria pedido automático
CREATE OR REPLACE FUNCTION trg_criar_pedido_apos_fechamento()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.crm_stage = 'Fechado' AND OLD.crm_stage <> 'Fechado' THEN
    INSERT INTO pedidos_indicacao (organizacao_id, lead_id, solicitado_por, momento)
    VALUES (NEW.organizacao_id, NEW.id, NEW.responsavel_id, 'pos_fechamento')
    ON CONFLICT (lead_id, momento) WHERE status = 'pendente' DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_fechado_pede_indicacao
AFTER UPDATE OF crm_stage ON leads
FOR EACH ROW EXECUTE FUNCTION trg_criar_pedido_apos_fechamento();

-- Trigger: quando indicação.lead_convertido_id é setado e esse lead vira Fechado,
-- atualiza indicacao.status = 'fechado'
CREATE OR REPLACE FUNCTION trg_atualizar_indicacao_quando_lead_fecha()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.crm_stage = 'Fechado' AND OLD.crm_stage <> 'Fechado' THEN
    UPDATE indicacoes
       SET status = 'fechado',
           data_fechado = now()
     WHERE lead_convertido_id = NEW.id
       AND status NOT IN ('fechado', 'descartado');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_fechado_atualiza_indicacao
AFTER UPDATE OF crm_stage ON leads
FOR EACH ROW EXECUTE FUNCTION trg_atualizar_indicacao_quando_lead_fecha();
```

### 2.6 Integração com `/hoje`

A query do "hoje" hoje busca leads com `data_proxima_acao <= today`. Adicionar:

```sql
-- Em v_acoes_pendentes ou similar, união com pedidos pendentes
UNION ALL
SELECT
  p.lead_id,
  l.empresa,
  'Pedir indicação' AS acao,
  p.data_pedido AS data,
  'pedido_indicacao' AS tipo,
  p.id AS ref_id
FROM pedidos_indicacao p
JOIN leads l ON l.id = p.lead_id
WHERE p.status = 'pendente'
  AND p.organizacao_id = current_org_id();
```

A tela `/hoje` mostra a card especial:

```
[⭐] Pedir indicação ao Carlos (Empresa X)
     Fechou há 8 dias  |  Cliente promotor (NPS 9)
     [Pedir agora]   [Adiar 7 dias]   [Não vou pedir]
```

---

## 3. KPIs e indicadores adicionais

Além dos do bowtie, vale instrumentar:

### Por embaixador (já coberto em /indicacoes)
- Qtd indicações dadas
- Taxa conversão lead→fechado das indicações
- Receita gerada

### Por origem (já no `leads.fonte`, expandir)
- CAC por origem
- LTV por origem
- Velocidade do funil por origem (indicação fecha em quantos dias vs outbound?)

### Coortes
- Coorte de fechamento Q1 → quantos pediram indicação?
- Coorte que pediu vs não pediu → diferença em LTV (advocacy é proxy de retenção)

### Health score (futuro — bowtie completo)
- Última interação
- NPS coletado
- Adoção de feature (se aplicável)
- Pagamento em dia

---

## 4. O que mais falta pro flywheel ficar completo

Ordem da minha recomendação. Indicação é o item 1 — mas tem muita coisa atrás.

### Prioridade 1 — Indicação (este RFC)
**Esforço:** ~3-4 dias eng + 1 dia produto/QA
**Por que primeiro:** ROI gigante (CAC 3-5x menor) e bate na prática que você já faz
informalmente. Captura o que tá perdido hoje.

### Prioridade 2 — Pós-venda mínimo (Onboarding + NPS)
**Esforço:** ~5 dias
**Por que:** sem retenção, não tem advocate. Mínimo viável:
- Após Fechado, cria checklist de onboarding (template configurável em /equipe)
- 7 dias depois: pedido automático de NPS via email/WhatsApp
- Score < 7 → alerta pro vendedor "atender primeiro"
- Score >= 9 → trigger pra pedir indicação (timing perfeito)

Tabela:
```sql
CREATE TABLE onboarding_checklist (id, lead_id, item, status, due_at, completed_at)
CREATE TABLE nps_responses (id, lead_id, score, comentario, respondido_em)
```

### Prioridade 3 — Health score + Churn risk
**Esforço:** ~4 dias
**Por que:** ataca churn antes que aconteça. Composição:
- 30% recência da última interação
- 30% NPS médio
- 20% % de itens onboarding completos
- 20% pagamento em dia (se rolar billing tracking)

Score < 50 vira alerta vermelho em /hoje pro CSM (ou vendedor responsável).

### Prioridade 4 — Expansão (upsell/cross-sell)
**Esforço:** ~5 dias
**Por que:** Net revenue retention é o KPI rei. Concretamente:
- Coluna `oportunidade_expansao` em leads/clientes
- Sub-pipeline de expansão dentro do mesmo CRM
- Trigger automático: "Cliente X passou 90 dias sem nova interação — sugira upsell"

### Prioridade 5 — Renovação automática
**Esforço:** ~3 dias
**Por que:** evita esquecimento e dá visibilidade do MRR. Concretamente:
- Coluna `data_renovacao` em leads (ou tabela `contratos`)
- 60 dias antes: cria pedido de indicação + alerta em /hoje
- 30 dias antes: alerta vermelho
- 7 dias antes: alerta crítico ao gestor

### Prioridade 6 — Programa formal de embaixadores
**Esforço:** ~4 dias
**Por que:** sistematiza a recompensa, escala o efeito.
- Portal próprio do cliente embaixador (ele entra e indica direto)
- Sistema de pontos/recompensas
- Relatório do que ele indicou e o status (transparência gera confiança)

---

## 5. Arquitetura: estrutura de arquivos proposta

```
app/(app)/indicacoes/
  page.tsx                      ← server component (carrega dados)
  indicacoes-client.tsx         ← client (4 abas, igual /equipe)
  actions.ts                    ← criarPedido, responderPedido, etc.
  components/
    pedido-card.tsx             ← card de pedido pendente em /hoje
    indicacao-modal.tsx         ← modal pra adicionar N indicados
    embaixadores-table.tsx
    indicacoes-table.tsx

components/
  pedido-indicacao-banner.tsx   ← banner em /pipeline/[id] após Fechado
  hoje-pedido-indicacao-card.tsx ← card especial em /hoje

lib/
  indicacao-helpers.ts          ← getStatusLabel, calculateKFactor, etc.

supabase/migrations/
  20260507000000_indicacoes.sql ← migration completa (schemas, indexes, RLS, triggers, views)

lib/i18n/messages/
  pt-BR.json                    ← namespace indicacoes.*
  en-US.json
```

### RLS policies (multi-tenant)

```sql
ALTER TABLE indicacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY indicacoes_tenant ON indicacoes
  USING (organizacao_id = current_org_id())
  WITH CHECK (organizacao_id = current_org_id());

ALTER TABLE pedidos_indicacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY pedidos_tenant ON pedidos_indicacao
  USING (organizacao_id = current_org_id())
  WITH CHECK (organizacao_id = current_org_id());
```

E nas views, `WITH (security_invoker = true)` (padrão atual do projeto).

---

## 6. Roadmap em fases (decisão sua)

| Fase | Escopo | Esforço | Resultado |
|------|--------|---------|-----------|
| **0** | RFC aprovado + decisões abertas | 1h conversa | Clareza de escopo |
| **1** | Schema + RLS + triggers + 1 migration | 0.5d | Banco preparado |
| **2** | Server actions + helpers TS + i18n | 1d | Lógica de domínio |
| **3** | Etapa obrigatória após Fechado + modal | 1d | UX core funciona |
| **4** | Aba `/indicacoes` (4 sub-abas) | 1.5d | Listagem + KPIs |
| **5** | KPIs Advocacy em `/funil` | 0.5d | Visibilidade gestor |
| **6** | Integração `/hoje` (card de pedido pendente) | 0.5d | Lembretes diários |
| **7** | Testes Vitest invariant + e2e crítico | 0.5d | Confiança |
| **TOTAL fase 1 (indicação)** | | **~5-6d** | |
| **8** | Onboarding + NPS (P2) | 5d | Pós-venda mínimo |
| **9** | Health score (P3) | 4d | Churn alerta |
| **10** | Expansão / upsell (P4) | 5d | NRR > 100% |
| **11** | Renovação automática (P5) | 3d | MRR previsível |
| **12** | Portal embaixador (P6) | 4d | Self-service |

**Sugestão:** entrega fase 1 fechada em sprint de 1 semana. Mede impacto por 30 dias antes
de decidir P2.

---

## 7. Decisões abertas (preciso de você)

Antes de codar, preciso ler tua intuição em:

1. **Obrigatoriedade**: bloqueia o fluxo (não deixa mexer no lead até registrar pedido) ou
   só mostra alerta visível? Vermelho em /hoje vs modal sem dismiss?
   - **Minha aposta:** alerta forte mas dismissível. Bloquear gera atrito que vendedor odeia.

2. **Recompensa**: implementa logo na fase 1 ou fica pra fase 2?
   - **Minha aposta:** fase 1 já cataloga (campos na tabela), mas UX de pagar recompensa
     fica pra depois.

3. **Múltiplas indicações por pedido**: o modal deixa N de uma vez, certo?
   - **Minha aposta:** sim, mas com soft cap em 5 (UI fica caótica).

4. **Indicação de quem perdeu**: pode pedir indicação a quem foi "Perdido" mas teve boa
   experiência (ex: lead foi qualificado, recebeu raio-X, mas o orçamento não bateu)?
   - **Minha aposta:** sim, mas só após Raio-X Feito. Antes disso, não tem relação suficiente.

5. **Embaixador anônimo / cold lead**: posso criar um lead "indicado por: João da Silva
   (ex-cliente que saiu)" sem ter `embaixador_lead_id` populado?
   - **Minha aposta:** sim. Adicionar campo `embaixador_externo_nome TEXT` opcional. Mantém
     `embaixador_lead_id NULLABLE` e a constraint passa a ser "um dos dois deve existir".

6. **K-factor é métrica de gestor ou de cada vendedor?**
   - **Minha aposta:** ambos. Topline para gestor, breakdown por vendedor (quem mais
     transforma cliente em embaixador).

---

## 8. Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Vendedor ignora a etapa obrigatória | Alta | Tornar config-driven; default suave; dashboard expõe quem ignora |
| Modal de N indicações fica chato | Média | Cap em 5, single-column form, Esc cancela |
| Trigger SQL de fechamento dispara em backfills antigos | Alta | Migration tem `WHERE crm_stage = 'Fechado' AND ...` + flag de "criar pedido só pra fechamentos novos a partir de YYYY-MM-DD" |
| RLS bloqueia leitura de v_top_embaixadores | Média | Testar explicitamente com user comum; ajustar policies |
| Lead "indicado_por" vaza informação cross-org | Catastrófico | RLS na coluna + view tem `security_invoker` |
| K-factor inflado por gestores criando indicações fake pra bater meta | Baixa | Auditoria via `lead_evento`; alerta se mesmo embaixador gera >10 indicações/mês |
| Cliente embaixador exposto na URL `/indicacoes/[id]` | Médio | Páginas internas, sem URLs públicas. Só client logado vê. |

---

## 9. Próximos passos imediatos

Se você aprovar o RFC:

1. **Eu** crio a migration `20260507000000_indicacoes.sql` (schema + RLS + triggers + views)
2. **Eu** crio o esqueleto de `/indicacoes` (page + client + actions vazias)
3. **Você** roda a migration no Supabase Studio ou via `supabase migration up`
4. **Eu** implemento fase a fase, commitando cada uma separadamente
5. **Você** testa cada fase em produção atrás de feature flag (já temos GrowthBook?
   se não, env var `INDICACOES_ENABLED`)

Tempo até MVP utilizável: **~5-6 dias úteis** se priorizado.

---

## Apêndice A — Comparação com produtos de referência

| Produto | Tem indicação nativa? | Como fazem |
|---------|----------------------|-----------|
| HubSpot | ❌ tem só via app extra | Workflow + tag manual |
| Salesforce | ❌ via AppExchange | Customização em N tabelas |
| Pipedrive | ❌ | Campo custom + filtro |
| Close.io | ⚠️ parcial | Campo "Source" mas sem tracking de embaixador |
| Attio | ⚠️ parcial | Bom CRM mas sem flow de pedido |

Conclusão: **diferencial competitivo real**. Nenhum CRM B2B sério faz isso bem. A
narrativa "CRM que cresce sua receita por indicação" é pitch poderoso.
