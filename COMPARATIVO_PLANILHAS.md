# Comparativo — Planilhas atuais × Sistema guilds-comercial

Comparação campo a campo entre as duas planilhas existentes e o mini-CRM desenhado.
Objetivo: mostrar o que foi preservado, o que foi simplificado, o que foi normalizado
e o que o sistema ganhou de novo.

Planilhas analisadas:
- **Controle Comercial v2** — `Guilds_Planilha_Controle_Comercial_2026_v2 (1).xlsx` (15 abas, a mais completa)
- **CRM Guilds** — `Planilha_CRM_Guilds.xlsx` (6 abas, versão inicial)

---

## Visão geral da migração

| Planilha Controle Comercial | Planilha CRM Guilds | Sistema (Supabase) |
|---|---|---|
| `BASE BRUTA` (304 linhas × 24 cols) | — | `leads` com `funnel_stage = 'Base'` |
| `BASE QUALIFICADA` (304 × 22) | — | `leads` com `funnel_stage = 'Qualificado'` |
| `PIPELINE` (304 × 33) | `PIPELINE` (127 × 16) | `leads` + `funnel_stage` ∈ {Prospecção…Fechado} |
| `LIGACOES` (304 × 20) | — | `ligacoes` (N por lead) |
| `CADENCIA` (304 × 28) | `CADÊNCIA` (102 × 14) | `cadencia` (1 linha por passo D0/D3/D7/D11/D16/D30) |
| `RAIO-X` (304 × 24) | `RAIO-X` (205 × 11) | `raio_x` (N por lead, histórico de ofertas) |
| `NEWSLETTER` (304 × 15) | `NEWSLETTER` (205 × 9) | `newsletter` |
| `METAS` (30 × 15) | `METAS` (34 × 12) | `meta_semanal` + `meta_mensal` (org) + `meta_individual` (por vendedor) |
| `EQUIPE` (304 × 10) | — | view `v_kpis_por_responsavel` |
| `DASHBOARD` (26 × 9) | `DASHBOARD` (24 × 7) | view `v_kpis_globais` + tela `/time` |
| `VENDEDOR - COMERCIAL/SDR1/SDR2` | — | filtro por vendedor na `/time` |
| `LISTAS` (enums) | — | constraints `CHECK` no Postgres |
| `CANAIS` | — | ver nota "Gaps" abaixo |
| `AUTOMAÇÕES` | — | ver nota "Gaps" abaixo |
| `GUIA` | — | `README.md` + `SETUP_SUPABASE.md` |

**Redução estrutural:** 15 abas da planilha principal → 15 tabelas + 3 views no banco,
mas consolidadas: 4 abas (BASE BRUTA, BASE QUALIFICADA, PIPELINE, EQUIPE) viram
1 tabela `leads` + 1 view. O resto é normalização (1:N).

---

## 1. LEAD — o núcleo

### Planilha Controle Comercial — PIPELINE (33 colunas)

| # | Coluna planilha | Campo no sistema (`leads` ou view) | Observação |
|---|---|---|---|
| 1 | ID | `id` / `legacy_id` | uuid; `legacy_id` guarda o ID antigo da planilha |
| 2 | Responsável | `responsavel_id` | FK → profiles |
| 3 | Nome | `nome` | |
| 4 | Empresa | `empresa` | |
| 5 | Cargo | `cargo` | |
| 6 | Segmento | `segmento` | |
| 7 | Cidade/UF | `cidade_uf` | |
| 8 | WhatsApp | `whatsapp` | |
| 9 | Email | `email` | |
| 10 | LinkedIn | `linkedin` | |
| 11 | Fonte | `fonte` | |
| 12 | Motion | `motion` | |
| 13 | Temperatura | `temperatura` | enum Frio/Morno/Quente |
| 14 | Etapa CRM | `crm_stage` | enum fechado |
| 15 | Decisor? | `decisor` | boolean |
| 16 | Dor principal | `dor_principal` | |
| 17 | 1º contato | `data_primeiro_contato` | |
| 18 | Último toque | `data_ultimo_toque` | atualizado por trigger ao registrar ligação/email |
| 19 | Dias sem tocar | — (view) | calculado em `v_leads_enriched` |
| 20 | Próx. ação | `proxima_acao` | |
| 21 | Data próx. ação | `data_proxima_acao` | |
| 22 | Raio-X status | `raio_x.status` | saiu do lead — é 1:N |
| 23 | Data Raio-X | `raio_x.data_oferta` | |
| 24 | Tipo de call | `ligacoes.tipo_ligacao` | saiu do lead — é 1:N |
| 25 | Data proposta | `data_proposta` | |
| 26 | Data fechamento | `data_fechamento` | |
| 27 | Valor potencial (R$) | `valor_potencial` | |
| 28 | Probab. % | `probabilidade` | 0..1 |
| 29 | Receita ponderada | `receita_ponderada` | **generated column** — calculada automaticamente |
| 30 | Newsletter | `newsletter_optin` + tabela `newsletter` | |
| 31 | Observações | `observacoes` | |
| 32 | Canal principal | `canal_principal` | |
| 33 | Semana próx. ação | — (view) | calculada em `v_leads_enriched` |

### Planilha Controle Comercial — BASE BRUTA (24 colunas extras)

Abas `BASE BRUTA` e `BASE QUALIFICADA` viraram o **mesmo registro** em `leads`, com
status evoluindo via `funnel_stage`. Campos específicos dessas abas que foram preservados:

| Coluna | Campo | Observação |
|---|---|---|
| Data entrada | `data_entrada` | |
| Site | `site` | |
| Instagram | `instagram` | **novo** (planilha só tinha LinkedIn) |
| Canal achado | `fonte` | consolidado |
| Fit ICP? | `fit_icp` | boolean |
| Prioridade | `prioridade` | A/B/C |
| Higienização | — | não virou campo — estado implícito em `funnel_stage='Base'` |
| Status base | `funnel_stage` | unificado com pipeline |
| Migrar p/ qualificada? | — | eliminado: muda `funnel_stage` direto |

### Planilha CRM Guilds — PIPELINE (16 colunas)

Todos os 16 campos são subset do schema acima. Nenhum campo exclusivo.

### Ganhos do sistema sobre planilha

- **1 tabela em vez de 3 abas** (BASE BRUTA, BASE QUALIFICADA, PIPELINE) — sem duplicação,
  sem risco de lead migrar e deixar rastro fantasma.
- **Multi-tenant:** cada lead carimbado com `organizacao_id`, RLS bloqueia vazamento entre empresas.
- **Timeline automática:** `lead_evento` grava criação, mudança de etapa, novo responsável etc.
- **Validação:** `crm_stage` e `funnel_stage` são enums no banco, não strings livres.

---

## 2. LIGAÇÕES

### Planilha Controle Comercial — LIGACOES (20 colunas)

| # | Coluna planilha | Campo no sistema | Observação |
|---|---|---|---|
| 1 | ID ligação | `id` | uuid |
| 2 | Lead ID | `lead_id` | FK |
| 3 | Responsável | `responsavel_id` | FK |
| 4 | Nome | (join com lead) | não duplica |
| 5 | Empresa | (join com lead) | não duplica |
| 6 | Segmento | (join com lead) | não duplica |
| 7 | Tipo ligação | `tipo_ligacao` | |
| 8 | Tentativa # | `tentativa` | |
| 9 | Data | `data_hora` (timestamp) | |
| 10 | Hora | `data_hora` (timestamp) | unificado |
| 11 | Duração (min) | `duracao_min` | |
| 12 | Atendeu? | `atendeu` | |
| 13 | Resultado ligação | `resultado` | |
| 14 | Próximo passo | (vai em `leads.proxima_acao`) | |
| 15 | Data próx. ação | (vai em `leads.data_proxima_acao`) | |
| 16 | Call gerou Raio-X? | `call_gerou_raio_x` | |
| 17 | Agendou call? | `agendou_call` | |
| 18 | Resumo | `resumo` | |
| 19 | Observações | `observacoes` | |
| 20 | Canal relacionado | (em `leads.canal_principal`) | |

**Ganho:** 4 campos de duplicação (Nome, Empresa, Segmento, Canal) eliminados — vêm por JOIN.

---

## 3. CADÊNCIA

### Planilha Controle Comercial — CADENCIA (28 colunas, D0/D3/D7/D11/D16/D30)

A planilha tem **3 colunas por passo** (objetivo, previsto, status) × 6 passos = 18 cols,
mais 10 de contexto. **Total: 28 colunas por lead.**

### Sistema — tabela `cadencia` (normalizada)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `organizacao_id` | uuid | RLS |
| `lead_id` | uuid | FK |
| `passo` | enum `D0`/`D3`/`D7`/`D11`/`D16`/`D30` | **1 linha por passo** |
| `canal` | text | Email / WhatsApp / LinkedIn |
| `objetivo` | text | |
| `data_prevista` | date | |
| `data_executada` | date | |
| `status` | enum | pendente / enviado / respondido / pulado |
| `mensagem_enviada` | text | — **novo**, armazena o texto real enviado |
| `observacoes` | text | |

**Ganhos:**
- 28 colunas por lead → 6 linhas com 10 campos cada. Mais fácil de consultar, adicionar passos novos (ex: D45) sem mexer em schema.
- Guarda **o texto da mensagem enviada** (planilha não guardava).
- Filtro por "quem tem D7 pendente hoje?" vira `WHERE passo='D7' AND status='pendente'` — na planilha você precisaria de um filtro multicoluna.

### Compatibilidade com CRM Guilds antigo

A planilha CRM Guilds usava passos **D0/D2/D5/D9/D14**. O sistema padronizou em
**D0/D3/D7/D11/D16/D30** (que é o que a Controle Comercial v2 já usa).
Se você tiver leads antigos com D2/D5/D9/D14, eles precisam ser mapeados na importação.

---

## 4. RAIO-X

### Planilha Controle Comercial — RAIO-X (24 colunas)

| # | Coluna | Campo no sistema | Observação |
|---|---|---|---|
| 1 | Lead ID | `lead_id` | FK |
| 2 | Nome / Empresa / Segmento | (join) | — |
| 5 | Origem | (em `leads.fonte`) | |
| 6 | Data oferta | `data_oferta` | |
| 7 | Preço lista (R$) | `preco_lista` | default 97 |
| 8 | Voucher desconto (R$) | `voucher_desconto` | |
| 9 | Gratuito? | `gratuito` | |
| 10 | Preço final (R$) | `preco_final` | **generated column** |
| 11 | Pago? | `pago` | |
| 12 | Data pagamento | `data_pagamento` | |
| 13 | Score | `score` | 0..100 |
| 14 | Perda anual estimada | `perda_anual_estimada` | |
| 15 | Nível | `nivel` | enum Alto/Médio/Baixo/Pendente |
| 16 | Saída recomendada | `saida_recomendada` | |
| 17 | Call revisão? | `call_revisao` | |
| 18 | Data call | `data_call` | |
| 19 | Diagnóstico pago sugerido? | `diagnostico_pago_sugerido` | |
| 20-21 | Próxima ação | (vai em `leads`) | |
| 22 | Observações | `observacoes` | |
| 23 | Canal principal | (em `leads.canal_principal`) | |
| 24 | Responsável | `responsavel_id` | |

### CRM Guilds — RAIO-X (11 colunas)

Subset. Diferença mais forte: CRM Guilds antigo usa "PAGAMENTO R$47" como coluna.
A Controle Comercial v2 já usa 97 como padrão com voucher. Sistema segue a v2.

---

## 5. NEWSLETTER

### Planilha Controle Comercial — NEWSLETTER (15 colunas)

Todos os 15 campos batem 1-para-1 com a tabela `newsletter` no sistema.
CRM Guilds tem 9 campos (subset).

---

## 6. METAS

### Planilha — MET AS (15 colunas)

Linhas = semanas, colunas = pares **meta/realizado** para cada dimensão:
leads, respostas, Raio-X, calls, propostas, fechamentos, receita.

### Sistema — 3 tabelas

| Tabela | Para quê | Origem |
|---|---|---|
| `meta_semanal` | meta semanal da **organização inteira** | equivalente à planilha |
| `meta_mensal` | meta mensal da **organização inteira** | **novo** — planilha só tinha semanal |
| `meta_individual` | meta por **vendedor** (semanal ou mensal) | **novo** — planilha não tinha |

**Ganho relevante:** metas por vendedor. Na planilha, o gestor só via o total
da equipe. No sistema, o vendedor abre a tela `/time` e vê a **própria** meta
vs. realizado, e o gestor vê o ranking na aba Metas em `/equipe`.

Os campos de "realizado" não são digitados — são **calculados** pelas views
(`v_kpis_globais`, `v_kpis_por_responsavel`) a partir de ligações, propostas e
fechamentos registrados.

---

## 7. EQUIPE / DASHBOARD

### Planilha — EQUIPE (10 cols) + DASHBOARD + 3 painéis por vendedor

Tudo derivado: contagens por responsável, ações vencidas, fechados, etc.

### Sistema — tudo virou **views** ou tela **live**

| Métrica planilha | Origem no sistema |
|---|---|
| Leads ativos | `v_kpis_por_responsavel.leads_ativos` |
| Qualificados | `v_kpis_por_responsavel.qualificados` |
| Raio-X pagos | `v_kpis_por_responsavel.raio_x_pagos` |
| Calls registradas | `v_kpis_por_responsavel.calls_total` |
| Propostas | `v_kpis_por_responsavel.propostas` |
| Fechados | `v_kpis_por_responsavel.fechados` |
| Ações vencidas | `v_kpis_por_responsavel.acoes_vencidas` |
| Ações hoje | `v_kpis_por_responsavel.acoes_hoje` |
| Newsletter ativos | `v_kpis_por_responsavel.news_ativos` |
| Dashboard global | `v_kpis_globais` (view) |
| VENDEDOR - COMERCIAL/SDR1/SDR2 | tela `/time` com filtro por vendedor |

Na planilha esses números dependiam de fórmulas manuais. No sistema são
recalculados a cada consulta automaticamente.

---

## 8. ENUMS / LISTAS

Planilha tinha 1 aba só de validação (`LISTAS`, 19 colunas de listas suspensas).
No sistema viraram `CHECK constraints` direto nas colunas. Lista pra lista:

| Lista planilha | Onde no sistema |
|---|---|
| Etapas CRM | `leads.crm_stage` (check enum) |
| Motion | `leads.motion` (free text — pode virar enum) |
| Status Touch | `cadencia.status` |
| Segmentos | `leads.segmento` (free text + `vendedor_segmento` p/ territórios) |
| Fonte | `leads.fonte` |
| Temperatura | `leads.temperatura` (check enum) |
| Canal | `leads.canal_principal` |
| RaioXStatus | `raio_x.nivel` + `pago` |
| TipoCall | `ligacoes.tipo_ligacao` |
| NewsletterStatus | `newsletter.status` |
| ProxAcao | `leads.proxima_acao` |
| AtivoCadencia | `cadencia.status` |
| Responsável | `profiles.display_name` via `membros_organizacao` |
| Resultado Ligação | `ligacoes.resultado` |
| Prioridade | `leads.prioridade` (check A/B/C) |
| Higienização | — (implícito em `funnel_stage`) |
| Status Base | `leads.funnel_stage` |

---

## 9. O que o sistema tem que a planilha NÃO TINHA

| Recurso | Descrição | Motivo |
|---|---|---|
| **Multi-tenant** | Tabela `organizacoes` + `membros_organizacao` + RLS | Empresa pode servir múltiplos clientes / Gustavo pode ter mais de uma empresa |
| **RLS (Row-Level Security)** | Vendedor só vê leads da sua org | Segurança — impossível na planilha |
| **Convites por token** | Gestor convida novo membro via email + link único | Onboarding sem compartilhar senha |
| **Transferência de carteira** | Gestor move leads em massa de A→B com 1 clique + auditoria | Na planilha, substituir "Responsável" em 50 células à mão |
| **Distribuição automática** | Novo lead é atribuído por regra (round-robin, segmento, carga) | Planilha atribuía manualmente |
| **Auditoria (`lead_evento`)** | Toda mudança de etapa/responsável/valor gera linha de evento | Planilha não tinha timeline |
| **Edge Function diária** | Email 7h da manhã com ações do dia pra cada vendedor | Planilha dependia do cara entrar e ver |
| **Metas individuais** | Meta por vendedor, não só total | Planilha tinha só meta da org |
| **`mensagem_enviada`** | Registra o texto real enviado em cada passo de cadência | Planilha só marcava "enviado" |
| **`legacy_id`** | Guarda o ID antigo da planilha pra rastreabilidade | Para reconciliar após migração |
| **Generated columns** | `preco_final` e `receita_ponderada` calculadas automaticamente | Planilha dependia de fórmula manual |

---

## 10. Gaps — o que a planilha tinha e o sistema ainda NÃO cobre (conferir)

| Aba planilha | Observação | Status |
|---|---|---|
| **CANAIS** (indicadores por canal) | Planilha tem aba "CANAIS" com KPIs agrupados por canal (Email/WhatsApp/LinkedIn). O sistema tem o campo `canal_principal` mas não tem view consolidada nem tela dedicada. | **Pendente** — sugestão: criar view `v_kpis_por_canal` e expor no `/time` |
| **AUTOMAÇÕES** (mapa de integrações) | Planilha lista as automações planejadas (import de lead, envio WhatsApp, etc). É documentação estática. | **Não é funcional** — entra no README se você quiser |
| **GUIA** | Aba de como usar a planilha. | Substituída pelo `README.md` + `SETUP_SUPABASE.md` |
| **DASHBOARD** (colunas específicas) | Planilha tem chips específicos tipo "Taxa resposta", "Ticket médio". | Precisa conferir se as views cobrem todos os mesmos KPIs |
| **Painéis individuais por vendedor** | 3 abas separadas (VENDEDOR - COMERCIAL / SDR 1 / SDR 2). | Sistema tem `/time` com filtro, mas não rota dedicada `/vendedor/[id]`. Fácil de adicionar se você quiser. |
| **Taxa de resposta** (coluna de METAS) | Campo derivado. | Precisa estar na view global — vou conferir. |

---

## 11. Resumo executivo

| Dimensão | Planilha | Sistema | Ganho |
|---|---|---|---|
| Armazenamento | 15 abas × ~304 linhas × 15–33 cols | 15 tabelas normalizadas + 3 views | Sem duplicação, sem fórmulas frágeis |
| Multi-empresa | 1 empresa por arquivo | N empresas no mesmo banco, RLS ativo | Atende múltiplos clientes |
| Colaboração | Google Sheets compartilhado | App web + login por usuário | Auditoria + segurança |
| KPI em tempo real | Fórmulas manuais | Views + edge function diária | Confiável |
| Auditoria | `Ctrl+Z` do Sheets | Timeline por lead + eventos | Rastreabilidade total |
| Mobilidade | Só abre no browser, mal no celular | App responsivo + email 7h | Vendedor usa no celular |
| Integrações | Manual (copy/paste) | Supabase API + Edge Functions | Extensível (Gmail, WhatsApp etc.) |
| Escalabilidade | ~500 leads antes de lentidão | ilimitado (Postgres) | Escala sem esforço |

---

## 12. Validação recomendada

Antes de subir o Supabase, sugiro você passar por esta checklist:

1. Os 3 gaps do bloco 10 (CANAIS, painéis por vendedor, taxa de resposta)
   são dealbreakers? Se sim, antes de rodar o seed, adiciono view/tela.
2. Os passos de cadência vão ser **D0/D3/D7/D11/D16/D30** mesmo? Porque a
   CRM Guilds antiga usava D0/D2/D5/D9/D14 — precisa casar com o
   que o time usa na prática hoje.
3. O preço do Raio-X é **R$ 97** (Controle Comercial v2) ou **R$ 47**
   (CRM Guilds v1)? Default no schema está em 97.
4. O enum de `funnel_stage` hoje é `Base / Qualificado / Prospecção /
   Descoberta / Proposta / Negociação / Fechado / Perdido`. Confirme se é
   isso que vocês usam.

Se todos os 4 itens estão ok, o sistema é um **superset** do que as
planilhas fazem hoje, com tudo que elas faziam preservado.
