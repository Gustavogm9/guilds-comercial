# Prospecção — Módulo completo

Implementado em **mai/2026** para colocar o **Guilds Comercial** no mesmo patamar de ferramentas como **CNPJ.biz, LinkedIn Sales Navigator e RD Station Prospect** — em alguns aspectos superando.

## TL;DR

- Consulta CNPJ ilimitada via **BrasilAPI** (gratuita)
- **Cache global** com pivot de privacidade por org
- **Bulk import** de até 500 CNPJs por job
- **Alertas** automáticos de mudanças (sócios, CNAE, endereço, capital)
- **ICP fit score** via embeddings (pgvector + OpenAI)
- **Enriquecimento web** opcional (Tavily, Firecrawl, Hunter, Similarweb)
- Tudo integrado ao CRM core (vira lead, entra na cadência, etc.)

---

## 1. Páginas e fluxos

### `/vendas/prospeccao` (hub)
Hub com 5 quick-access cards:
1. **Base de empresas** — busca local
2. **Bulk import** — upload de CSV/textarea (gestor-only)
3. **Alertas** — mudanças detectadas
4. **Favoritos** — empresas bookmarked pelo vendedor
5. **ICP fit** — top 30 por similaridade

### `/vendas/prospeccao/base-de-empresas`
Busca interativa.
- Filtros: UF, município, segmento (CNAE), porte, capital social mínimo, status, situação.
- Modos de visualização: empresas, QSA (sócios).
- Export CSV.
- Pagina 50/vez (server-side cursor).
- Resultado mostra: razão social, fantasia, CNAE principal, UF, sócios principais, **ICP fit badge** se calculado.

### `/vendas/prospeccao/bulk-import` (gestor-only)
Upload de CNPJs em massa.
- Aceita CSV upload OU textarea (1 CNPJ por linha).
- Validação: dígitos verificadores, dedup.
- Limite: **500 CNPJs por job** (proteção contra abuso BrasilAPI).
- Cria `prospeccao_jobs` (status `pending`), worker processa em background.
- Push notification quando completa (parcial ou total).
- Audit em `prospeccao_jobs` com `iniciado_por`, `iniciado_em`, `concluido_em`, `progresso`.

### `/vendas/prospeccao/alertas`
Lista de mudanças detectadas pelo cron de refresh.
- Filtros: tipo (sócio, endereço, CNAE, capital, baixa, reativação), data.
- Cada alerta mostra: empresa, tipo, diff (antes → depois), data detectada, ação (ver detalhe, descartar).
- Webhook `prospeccao.alerta` dispara quando criado.

### `/vendas/prospeccao/favoritos`
Bookmarks pessoais do usuário.
- Lista de empresas com `is_favorito=true` no pivot.
- Filtros: tags, segmento, responsável.
- Botão "Adicionar à carteira como lead" (cria lead com origem=`prospeccao`).

### `/vendas/prospeccao/empresa/[id]`
Detalhe completo da empresa.

Seções:
1. **Header**: razão social, fantasia, CNPJ, status (ATIVA/BAIXADA/SUSPENSA).
2. **Endereço**: completo + Google Maps embed.
3. **CNAE**: principal + secundários (com descrição).
4. **Capital social** + natureza jurídica + simples/MEI.
5. **QSA (sócios)**: nome, qualificação, data entrada, **LinkedIn** (preenchido por Tavily search).
6. **Alertas históricos**: timeline de mudanças.
7. **ICP fit score**: similaridade com fechamentos da org (0-100).
8. **Ações**:
   - "Adicionar à minha carteira" → cria lead.
   - "Bookmark" → toggle favorito.
   - "Anotar" → notas privadas no pivot.
   - "Enriquecer site" → Firecrawl scrape (mensagem comercial, preços).
   - "Buscar emails" → Hunter por domínio.
   - "Ver tráfego" → Similarweb.

### `/vendas/prospeccao/icp-fit`
Top 30 empresas da base com maior similaridade ao **centroide ICP** da org (calculado a partir de fechamentos).
- Mostra: empresa, segmento, score 0-100, comparação visual (barra), botão "Adicionar".
- Permite refresh do centroide (recalcular agora) ou aguardar cron diário.

---

## 2. Arquitetura técnica

### 2.1 Consulta BrasilAPI

Endpoint: `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`

Rate limit free: 5 req/s. Worker bulk respeita 2.85 req/s (≈350ms entre chamadas, com margem).

Payload importante (subset que monitoramos):
```json
{
  "razao_social": "...",
  "nome_fantasia": "...",
  "situacao": "ATIVA|BAIXADA|SUSPENSA",
  "cnae_fiscal_descricao": "...",
  "cnae_fiscal_principal": "1234567",
  "cnaes_secundarios": [...],
  "capital_social": 100000,
  "natureza_juridica": "...",
  "logradouro": "...",
  "municipio": "...",
  "uf": "SP",
  "qsa": [
    { "nome_socio": "...", "qualificacao_socio": "...", "data_entrada_sociedade": "..." }
  ]
}
```

### 2.2 Cache global + privacy pivot

Tabela `prospeccao_empresa` **NÃO** tem `organizacao_id` — cache global compartilhado entre todas as orgs. Privacidade:
- Tabela `prospeccao_empresa_org` (pivot) liga `(cnpj, org_id)` → flags pessoais (favorito, tags, notas, responsável).
- RLS no pivot: org só vê seu próprio pivot.
- Org só "descobre" empresa se: (a) consultou diretamente, ou (b) está na base global e ela própria fez query.

### 2.3 RPC `upsert_prospeccao_empresa`

Atomicidade ao mesclar empresa + array de sócios:

```sql
upsert_prospeccao_empresa(
  payload JSONB,  -- payload completo da BrasilAPI
  org_id UUID     -- pra criar/atualizar pivot
)
RETURNS empresa_id BIGINT
```

Faz:
1. UPSERT em `prospeccao_empresa` (chave: cnpj).
2. DELETE sócios antigos + INSERT array novo em `prospeccao_socio`.
3. UPSERT em `prospeccao_empresa_org` (cria pivot se novo).
4. Calcula `payload_fingerprint = md5(...)` para detecção futura.
5. Insere `prospeccao_alerta` se houve mudança de fingerprint.

### 2.4 Cron `prospeccao-refresh-cnpj`

Schedule: diário 04 UTC.

Lógica:
```
1. Selecionar CNPJs ativos com pivot ativo em alguma org (LIMIT N por dia).
2. Para cada CNPJ:
   a. Consulta BrasilAPI.
   b. Calcula MD5 do payload importante.
   c. Se != fingerprint atual:
      - Detecta tipo de mudança (sócio, endereço, CNAE, capital, baixa, reativação).
      - Insere prospeccao_alerta com payload_anterior/atual.
      - Atualiza prospeccao_empresa com novo payload + fingerprint.
      - Dispara webhook prospeccao.alerta para orgs com pivot.
3. Aguarda 350ms entre chamadas (rate limit).
```

### 2.5 Cron `prospeccao-bulk`

Schedule: a cada 2min.

Lógica:
```
1. Selecionar 1 job com status='pending' (oldest first).
2. Marcar status='processing', iniciado_em=now().
3. Para cada CNPJ do array:
   a. Consulta BrasilAPI.
   b. Chama upsert_prospeccao_empresa(payload, org_id).
   c. Incrementa progresso.
   d. Sleep 350ms.
4. Se completou todos: status='done'. Se alguns falharam: status='partial'.
5. Push notification ao iniciado_por.
6. Webhook prospeccao.bulk_concluido.
```

---

## 3. Enriquecimento web (opcional)

Cada enriquecedor é ativado por env var. Sem a key, botão fica desabilitado com tooltip.

### 3.1 Tavily Search (sócios → LinkedIn)
Endpoint: `POST /api/prospeccao/enriquecer-socios`.

Para cada sócio sem `linkedin_url`:
1. Query: `"<nome do sócio>" "<razão social>" linkedin`.
2. Pega top 3 resultados, filtra por `linkedin.com/in/` ou `linkedin.com/pub/`.
3. Persiste em `prospeccao_socio.linkedin_url`.

Custo: ~$0.005/sócio. Cap mensal por org em `app_config.tavily_cap_mes`.

### 3.2 Firecrawl (scrape de site)
Endpoint: `POST /api/prospeccao/enriquecer-site`.

Faz scrape do site da empresa (se `prospeccao_empresa.site` ou inferido pelo CNPJ), extrai:
- Mensagem comercial principal (h1, primeiros parágrafos).
- Produtos/serviços (sections com price tags ou listas).
- Tecnologias detectadas (gtag, hotjar, etc.).
- Salva em `prospeccao_empresa_enriquecimento.dados_site JSONB`.

### 3.3 Hunter.io (emails por domínio)
Endpoint: `POST /api/prospeccao/hunter`.

Por domínio retorna lista de emails com confidence score. Persiste em `prospeccao_empresa_email`.

### 3.4 Similarweb (tráfego + tecnologias)
Endpoint: `POST /api/prospeccao/similarweb`.

Retorna: tráfego mensal estimado, top sources, tech stack, ranking de mercado.

---

## 4. ICP Fit Score

### 4.1 Pipeline de embedding

```typescript
// lib/embeddings.ts
function textoEmpresaPraEmbedding(empresa) {
  return [
    empresa.razao_social,
    empresa.cnae_fiscal_descricao,
    empresa.cnaes_secundarios?.map(c => c.descricao).join(", "),
    empresa.porte,
    `${empresa.municipio}/${empresa.uf}`,
    empresa.socios?.map(s => s.nome).join("; "),
  ].filter(Boolean).join(" | ");
}

async function gerarEmbedding(texto: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texto,
  });
  return r.data[0].embedding; // 1536 dims
}
```

### 4.2 Centroide ICP per-org

```sql
-- Recalcular centroide a partir dos fechamentos da org
CREATE OR REPLACE FUNCTION recalcular_centroide_org(p_org_id UUID)
RETURNS VOID AS $$
DECLARE
  v_centroide vector(1536);
  v_qtd INT;
BEGIN
  SELECT
    AVG(pe.embedding)::vector,
    COUNT(*)
  INTO v_centroide, v_qtd
  FROM leads l
  JOIN prospeccao_empresa pe ON pe.cnpj = l.cnpj
  WHERE l.organizacao_id = p_org_id
    AND l.crm_stage = 'Fechado'
    AND pe.embedding IS NOT NULL;

  INSERT INTO org_icp_centroide (organizacao_id, centroide, qtd_empresas_fonte, calculado_em)
  VALUES (p_org_id, v_centroide, v_qtd, now())
  ON CONFLICT (organizacao_id)
  DO UPDATE SET centroide = EXCLUDED.centroide,
                qtd_empresas_fonte = EXCLUDED.qtd_empresas_fonte,
                calculado_em = now();
END;
$$ LANGUAGE plpgsql;
```

### 4.3 Cálculo de fit

```sql
CREATE OR REPLACE FUNCTION icp_fit_score(p_cnpj TEXT, p_org_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_similarity NUMERIC;
BEGIN
  SELECT
    100 * (1 - (pe.embedding <=> oc.centroide))  -- cosine distance → similarity
  INTO v_similarity
  FROM prospeccao_empresa pe, org_icp_centroide oc
  WHERE pe.cnpj = p_cnpj
    AND oc.organizacao_id = p_org_id
    AND pe.embedding IS NOT NULL;

  RETURN COALESCE(v_similarity, NULL);
END;
$$ LANGUAGE plpgsql STABLE;
```

### 4.4 Top empresas

```sql
CREATE OR REPLACE FUNCTION top_empresas_icp_fit(p_org_id UUID, p_limit INT DEFAULT 30)
RETURNS TABLE (
  cnpj TEXT,
  razao_social TEXT,
  segmento TEXT,
  fit_score NUMERIC
) AS $$
  SELECT
    pe.cnpj,
    pe.razao_social,
    pe.cnae_fiscal_descricao AS segmento,
    100 * (1 - (pe.embedding <=> oc.centroide)) AS fit_score
  FROM prospeccao_empresa pe
  JOIN prospeccao_empresa_org peo ON peo.cnpj = pe.cnpj AND peo.organizacao_id = p_org_id
  JOIN org_icp_centroide oc ON oc.organizacao_id = p_org_id
  WHERE pe.embedding IS NOT NULL
  ORDER BY pe.embedding <=> oc.centroide  -- menor distância = mais similar
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```

### 4.5 Fallback determinístico

Quando `OPENAI_API_KEY` ausente: hash MD5 + Jaccard sobre tokens CNAE/segmento.

```typescript
function fitFallback(empresa, fechamentosOrg) {
  const tokensEmpresa = tokenizar(empresa.cnae_descricao);
  const tokensCentroide = fechamentosOrg.flatMap(f => tokenizar(f.cnae_descricao));
  const intersecao = tokensEmpresa.filter(t => tokensCentroide.includes(t)).length;
  const uniao = new Set([...tokensEmpresa, ...tokensCentroide]).size;
  return uniao > 0 ? Math.round(100 * intersecao / uniao) : 0;
}
```

---

## 5. Integração com CRM

Toda empresa de prospecção pode ser **convertida em lead** com 1 clique:

1. Botão "Adicionar à minha carteira" no detalhe da empresa.
2. Modal pré-preenche: empresa (razão social), cargo (selecionar sócio principal), email (se Hunter rodou), site, segmento (CNAE descrição), cidade/UF.
3. Vendedor confirma → cria lead com:
   - `fonte = 'prospeccao'`
   - `origem_prospeccao_empresa_id = <id>`
   - `funnel_stage = 'base_qualificada'`
   - `responsavel_id = <usuário atual>`
4. Trigger SQL enfileira passos da cadência default da org.
5. Push notification ao gestor (se configurado).

Lead criado por prospecção mantém **link bidirecional** com empresa:
- No detalhe do lead: badge "Veio da prospecção" + link.
- No detalhe da empresa: linha "Já é lead de [vendedor]".

---

## 6. Comparativo competitivo (mai/2026)

| Recurso                              | CNPJ.biz | LinkedIn Sales Nav | RD Station Prospect | **Guilds** |
|--------------------------------------|:--------:|:------------------:|:-------------------:|:----------:|
| Consulta CNPJ ilimitada              |    ✅    |         ❌         |          ✅         |     ✅      |
| QSA / sócios                         |    ✅    |         ⚠️         |          ✅         |     ✅      |
| LinkedIn de sócios                   |    ❌    |         ✅         |          ⚠️         |     ✅ (via Tavily) |
| Filtros avançados (CNAE/porte/etc)   |    ✅    |         ✅         |          ✅         |     ✅      |
| Bulk import                          |    ✅    |         ❌         |          ✅         |     ✅      |
| Alertas de mudança                   |    ⚠️    |         ❌         |          ❌         |     ✅      |
| ICP fit score (embeddings)           |    ❌    |         ⚠️         |          ❌         |     ✅      |
| Enriquecimento web                   |    ❌    |         ❌         |          ⚠️         |     ✅      |
| Integração nativa com CRM            |    ❌    |         ⚠️         |          ✅         |     ✅      |
| Cadência automática pós-conversão    |    ❌    |         ❌         |          ✅         |     ✅      |
| Webhook de alerta                    |    ❌    |         ❌         |          ❌         |     ✅      |
| Multi-tenant + RLS                   |    ❌    |         ❌         |          ❌         |     ✅      |
| Custo p/ usuário                     |  ~R$300  |     ~R$1500       |       ~R$400        |   Incluído |

Diferenciais únicos:
- **Cache compartilhado entre orgs** (CNPJ consultado 1× serve todas as orgs que pivot tem) — reduz custo BrasilAPI em escala.
- **Alertas automáticos** (CNPJ.biz só faz on-demand).
- **ICP fit via embeddings** (nenhum concorrente brasileiro tem).
- **Tudo num só CRM** (não precisa migrar dados entre 3 ferramentas).

---

## 7. APIs e endpoints

| Endpoint                                            | Método | Auth     | Função                                            |
|-----------------------------------------------------|--------|----------|---------------------------------------------------|
| `/api/prospeccao/cnpj`                              | POST   | required | Consulta 1 CNPJ + persiste via RPC                |
| `/api/prospeccao/bulk-import`                       | POST   | gestor   | Cria job bulk com array de CNPJs                  |
| `/api/prospeccao/enriquecer-socios`                 | POST   | required | Tavily search LinkedIn dos sócios                 |
| `/api/prospeccao/enriquecer-site`                   | POST   | required | Firecrawl scrape do site                          |
| `/api/prospeccao/hunter`                            | POST   | required | Hunter.io por domínio                             |
| `/api/prospeccao/similarweb`                        | POST   | required | Similarweb (tráfego + tech)                       |
| `/api/cron/prospeccao-bulk`                         | POST   | bearer   | Worker bulk (chamado por pg_cron)                 |
| `/api/cron/prospeccao-refresh-cnpj`                 | POST   | bearer   | Worker refresh (chamado por pg_cron)              |
| `/api/cron/prospeccao-recalcular-centroide`         | POST   | bearer   | Recalcula centroides ICP de todas orgs            |

Bearer token está em `app_config.cron_bearer_token` (editável em `/configuracoes/desenvolvedores`).

---

## 8. Eventos webhook outbound

| Evento                       | Quando                                          | Payload (essencial)                            |
|------------------------------|-------------------------------------------------|------------------------------------------------|
| `prospeccao.alerta`          | Cron detecta mudança                            | `{cnpj, tipo, anterior, atual, empresa}`       |
| `prospeccao.bulk_concluido`  | Job bulk termina                                | `{job_id, total, sucesso, falhou, duracao}`    |
| `prospeccao.icp_fit_alto`    | Nova empresa com fit ≥ 80 entra na base         | `{cnpj, empresa, fit_score, similaridade_com}` |
| `prospeccao.virou_lead`      | Empresa de prospecção convertida em lead        | `{cnpj, lead_id, vendedor_id, empresa}`        |

---

## 9. Próximos passos (roadmap prospecção)

- **Re-embedding automático** (cron 6h) quando empresa muda.
- **Filtros salvos** — vendedor salva busca "Tech B2B SP 50-200 funcionários" e recebe alerta quando nova empresa cai.
- **Lookalike audience** — encontrar empresas similares a uma específica (não só ao centroide).
- **Score de contato** — quão fácil é contatar (tem email? tem LinkedIn? site funciona?).
- **Mirror parcial RFB** — manter localmente apenas as 5M empresas mais relevantes (filtros: porte, CNAE B2B-friendly), reduzir consultas à BrasilAPI em 80%.
- **Hunter alternatives** — RocketReach, Apollo.io (mas custo maior).
- **Compras públicas integration** — base do governo (empresas que vendem pra ente público).
