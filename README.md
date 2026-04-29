# Guilds Comercial

Mini-CRM interno da Guilds Lab.
Construído sobre as duas planilhas de controle (v1 + v2) — agora um web app
multi-usuário, mobile-friendly, com pipeline arrastável, cadência D0/D3/D7/D11/D16/D30
e digest diário por email às 7h.

> Stack: **Next.js 14 (App Router)** + **Supabase (Postgres + Auth + Edge Functions)**
> + **Tailwind CSS** + **TypeScript**.

---

## Quem usa

| Pessoa     | Papel        | O que vê                                   |
|------------|--------------|--------------------------------------------|
| Gustavo    | `gestor`     | Tudo (todo o time + ranking + KPIs globais)|
| Comercial  | `comercial`  | Apenas a própria carteira                  |
| SDR 1      | `sdr`        | Apenas a própria carteira                  |
| SDR 2      | `sdr`        | Apenas a própria carteira                  |

Filtros por responsável são feitos na UI (gestor pode trocar para "Todo o time"
quando quiser).

---

## Telas

| Rota           | Quem vê     | Para quê                                                             |
|----------------|-------------|----------------------------------------------------------------------|
| `/hoje`        | todos       | Cockpit do dia: vencidas, hoje, **top oportunidades** (ranked por score) |
| `/pipeline`    | todos       | Kanban arrastável (9 colunas). Perdido/Nutrição abre modal obrigatório |
| `/pipeline/:id`| todos       | Detalhe: cadência, ligações, raio-x, **score composto + NBA via IA** |
| `/funil`       | todos       | Conversão, tempo, valor, cohort, motivos de perda + **forecast do mês** |
| `/base`        | todos       | Triagem: Bruta → Qualificada → Pipeline (arquivar exige motivo)      |
| `/base/importar` | todos     | Upload de CSV em lote com preview e validação                        |
| `/raio-x`      | todos       | Diagnósticos ofertados/pagos/concluídos (voucher R$50 ⭐)              |
| `/newsletter`  | todos       | Lista de nutrição, devidos hoje, envios                              |
| `/ligacoes`    | todos       | Log de ligações com taxa de atendimento                              |
| `/canais`      | **gestor**  | KPIs por canal (Indicação, LinkedIn, Lista fria, etc.)               |
| `/time`        | **gestor**  | KPIs globais + ranking semanal + meta da semana                      |
| `/equipe`      | **gestor**  | Gestão de membros e convites                                         |
| `/admin/ai`    | **gestor**  | Config da camada de IA: features, prompts, providers, logs            |

---

## Como começar (dev local)

1. **Instalar dependências:**

   ```bash
   cd guilds-comercial
   npm install
   ```

2. **Variáveis de ambiente:** copie `.env.example` para `.env.local` e
   preencha com suas chaves do Supabase (`Project Settings > API`):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

   # Camada de IA (opcional, mas recomendado)
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...       # opcional
   GOOGLE_API_KEY=AIza...      # opcional
   ```

3. **Subir o banco:** veja [`SETUP_SUPABASE.md`](./SETUP_SUPABASE.md) — roda
   os schemas (v1 → v5), popula seed e cria os 4 usuários no Auth.

4. **Configurar camada de IA:** veja [`AI_SETUP.md`](./AI_SETUP.md) — habilita
   as 15 features de copiloto, ajusta prompts e define budgets.

---

## Documentação

| Documento | Quando usar |
|-----------|-------------|
| [`PRD.md`](./PRD.md) | Entender o produto, roadmap, personas, modelo de negócio — **ponto de partida pra qualquer pessoa nova no time** |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Decisões de arquitetura, schema v1-v5, fluxo de dados end-to-end |
| [`AI_SETUP.md`](./AI_SETUP.md) | Setup e operação da camada de IA (15 features, providers, prompts) |
| [`SETUP_SUPABASE.md`](./SETUP_SUPABASE.md) | Setup passo a passo do ambiente (migrations, Auth, env vars, Edge Functions) |
| [`COMPARATIVO_PLANILHAS.md`](./COMPARATIVO_PLANILHAS.md) | Mapeamento das planilhas originais → schema atual |
| [`docs/DISASTER_RECOVERY.md`](./docs/DISASTER_RECOVERY.md) | Backups, RPO/RTO, procedimento de restore |
| [`docs/PWA.md`](./docs/PWA.md) | PWA — manifest, service worker, install prompt, push (TODO) |
| [`docs/AI_OVERAGE_BILLING.md`](./docs/AI_OVERAGE_BILLING.md) | Cobrança por consumo de IA — preços, Stripe metered, auditoria |
| [`docs/I18N.md`](./docs/I18N.md) | Internacionalização — locales, países, multi-currency, IA/push/email locale-aware |

4. **Rodar:**

   ```bash
   npm run dev
   ```

   Abrir `http://localhost:3000` → fazer login com email/senha do Supabase.

---

## Deploy (produção)

- **Front:** Vercel — clique em "Import" no projeto e adicione as duas envs.
- **Banco:** já tá no Supabase (managed).
- **Edge Function (`daily-digest`):** veja `SETUP_SUPABASE.md`. Rodando
  em pg_cron, dispara às 7h BRT seg-sex.

---

## Arquitetura

```
guilds-comercial/
├─ app/
│  ├─ login/                 # tela de login
│  ├─ (app)/                 # rotas protegidas (sidebar + bottom-nav)
│  │  ├─ hoje/               # cockpit
│  │  ├─ pipeline/[id]/      # detalhe do lead
│  │  ├─ base/               # triagem
│  │  ├─ raio-x/             # diagnósticos
│  │  ├─ newsletter/         # nutrição
│  │  ├─ ligacoes/           # log
│  │  └─ time/               # KPIs (gestor)
│  └─ api/logout/            # logout endpoint
├─ components/               # client components reutilizáveis
├─ lib/
│  ├─ supabase/{client,server}.ts
│  ├─ types.ts               # espelha o schema
│  ├─ lists.ts               # dropdowns + cores das etapas
│  └─ cadencia-templates.ts  # 12 templates D0-D30
├─ supabase/
│  ├─ schema.sql             # tabelas + views + RLS
│  ├─ seed.sql               # dados das duas planilhas migrados
│  ├─ cron.sql               # agendamento da edge function
│  └─ functions/daily-digest # edge function (Deno)
├─ middleware.ts             # gate auth
└─ scripts/migrate-excel.py  # gerador do seed.sql
```

### Decisões de modelagem

- **Tabela única `leads`** com `funnel_stage` (`base_bruta` → `base_qualificada`
  → `pipeline` → `arquivado`) e `crm_stage` (`Prospecção` … `Fechado`/`Perdido`/`Nutrição`).
  Permite consultas simples e mantém o histórico em um lugar só.
- **Cadência por linha:** cada passo D-N é uma row, com `status` próprio.
  Mais flexível que 6 colunas.
- **`v_leads_enriched`** computa `dias_sem_tocar` e `urgencia` (vencida/hoje/amanha/...)
  no banco. UI nunca calcula isso na mão.
- **`receita_ponderada`** é coluna gerada (`valor_potencial * probabilidade`).
- **Score composto (`lead_score_fechamento`)** — função SQL retornando 0-100 a partir de
  8 fatores: etapa (25) + percepção do vendedor (15) + velocidade (12) + tom das últimas
  interações (10) + temperatura (10) + fit ICP (10) + Raio-X pago (10) + decisor (8).
  Alimenta `v_lead_score`, `v_forecast_mes` e `v_top_oportunidades`.
- **Motivos de perda padronizados** — enum fixo (Preço, Timing, Concorrência, Sumiu,
  Sem orçamento, Sem fit, Decisor errado, Outro). Obrigatórios ao mover para
  Perdido/Nutrição ou arquivar da Base bruta. Alimentam ranking em `/funil`.
- **Camada de IA versionada** — 4 tabelas (`ai_providers`, `ai_features`, `ai_prompts`,
  `ai_invocations`). Gestor controla tudo em `/admin/ai`. Veja [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- **RLS simples:** "qualquer authenticated tem acesso total" — time pequeno e
  todos confiáveis. Filtros por responsável ficam na UI.
- **Optimistic UI** no Kanban (drag & drop atualiza local antes de bater no banco).

### Camada de IA

15 features configuráveis cobrindo todo o fluxo do vendedor:

| Etapa do fluxo    | Features                                                       |
|-------------------|----------------------------------------------------------------|
| Base/qualificação | `enriquecer_lead`                                              |
| Raio-X            | `gerar_oferta_raiox`, `gerar_documento_raiox`                  |
| Cadência          | `gerar_mensagem_cadencia`                                      |
| Ligações          | `extrair_ligacao`, `briefing_pre_call`, `objection_handler`    |
| Score/pipeline    | `next_best_action`                                             |
| Proposta          | `gerar_proposta`                                               |
| Perda             | `sugerir_motivo_perda`                                         |
| Insights          | `detectar_risco`, `resumo_diario`, `digest_semanal`, `reativar_nutricao`, `forecast_ml` |

Todos os prompts são editáveis pelo gestor em `/admin/ai` (com versionamento e reverter).
Providers suportados: **Anthropic** (default), **OpenAI**, **Google Gemini**. Veja
[`AI_SETUP.md`](./AI_SETUP.md) para detalhes.

---

## Migração de dados

Os dados foram migrados das duas planilhas:
- `Planilha_CRM_Guilds.xlsx` (v1) — 41 leads
- `Guilds_Planilha_Controle_Comercial_2026_v2.xlsx` (v2) — 4 leads (3 demo + 1 real)

O script `scripts/migrate-excel.py` lê os dois arquivos, deduplica
(Marcos e Fernanda existem em ambos — fica a versão da v2) e gera `seed.sql`.

```bash
python scripts/migrate-excel.py
```

Total no seed: **3 demo + 42 reais = 45 leads**, com cadência inicial,
raio-x e newsletter para cada um quando aplicável.

---

## Roadmap próximo (depois do MVP)

- [ ] Importação de CSV em lote (drag & drop)
- [ ] Webhook do WhatsApp (registrar toques automáticos)
- [ ] Integração com Resend para envio direto da newsletter
- [ ] Forecast com base em ciclo médio por etapa
- [ ] Aplicativo mobile real (React Native via Expo)
