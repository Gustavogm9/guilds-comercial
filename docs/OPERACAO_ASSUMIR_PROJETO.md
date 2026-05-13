# Plano para assumir a operacao

Atualizado em 2026-05-13, apos auditoria da wave de melhorias de produto, billing,
onboarding, prospeccao, pos-venda, growth/flywheel, push, webhooks e IA.

## Estado atual

O sistema esta em bom estado funcional para uma base SaaS B2B, mas ainda precisa de
disciplina operacional antes de producao ampla. A auditoria local validou:

- TypeScript: `tsc --noEmit` passa.
- Lint: `eslint .` passa com 2 warnings de performance em `<img>`.
- Testes unitarios: 7 arquivos e 89 testes passam.
- Build de producao: `next build` passa.
- Testes Supabase/DB: `vitest --config vitest.config.db.ts` passa com PAT valido
  da Management API.
- Risco operacional ativo: o repositorio esta dentro do OneDrive e a pasta `.git`
  esta parcialmente offline. Com isso, comandos Git falham com `fatal: mmap failed:
  Invalid argument` e alguns objetos retornam erro do provedor de nuvem.

## Correcoes ja feitas nesta rodada

- Impersonificacao deixou de confiar em cookie simples e passou a exigir payload
  assinado por HMAC com `IMPERSONATION_SECRET`.
- Rotas publicas por token, webhooks, cron e push foram liberadas no `proxy.ts`.
- Backups `*-Guilds.ts/tsx` foram excluidos do `tsconfig.json` para nao quebrar
  o typecheck.
- ESLint foi migrado para `eslint.config.mjs`, compativel com ESLint 9 / Next 16.
- Script `lint` agora usa `eslint .`.
- Evento push `health_risco_critico` foi tipado e ganhou templates pt-BR/en-US.
- Paginas dinamicas que usam cookies foram marcadas como `force-dynamic`.
- `VendasTabs` voltou a aceitar chamadas sem `isGestor`.
- `.env.local.example` passou a documentar `IMPERSONATION_SECRET` e removeu valor
  com aparencia real de `PROSPECCAO_ENGINE_SECRET`.
- Warnings de hooks foram corrigidos em paineis de ligacao, NPS e onboarding.

## Bloqueadores antes de producao

1. Recuperar Git fora do OneDrive.
   - Mover ou clonar o projeto para uma pasta local sem sincronizacao, por exemplo
     `C:\dev\guilds-comercial`.
   - Garantir que todos os arquivos estejam "Always keep on this device" antes de
     copiar, ou fazer um clone limpo do remoto.
   - Restaurar o indice Git: a auditoria moveu o indice antigo para
     `.git/index.codex-backup-20260513081803` ao tentar diagnosticar o erro.

2. Rotacionar segredos reais.
   - Supabase service role key.
   - Supabase personal access token usado em auditoria.
   - Cron secrets.
   - Stripe secrets e webhook secret.
   - Brevo, Sentry, OpenAI, Anthropic, Google, Firecrawl, Tavily.

3. Configurar variaveis obrigatorias em producao.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - `IMPERSONATION_SECRET`
   - `BREVO_API_KEY`, `FROM_EMAIL`, `FROM_NAME`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   - chaves de IA e prospeccao conforme features habilitadas

4. Confirmar infraestrutura Supabase.
   - Migrations aplicadas em ordem.
   - RLS e views `security_invoker` conferidas por `npm run test:db`.
   - Buckets: `voice-notes`, `ligacoes-audio`, `propostas-pdf`.
   - `pg_cron`, `pgvector` e jobs agendados.
   - Webhooks/Edge Functions com secrets corretos.

5. Observabilidade e resposta a incidentes.
   - Sentry com release/source maps funcionando.
   - Alertas de erro para build, cron, webhooks, email outbox e push outbox.
   - Runbook de rollback: Vercel rollback + migration down/manual.

## Roadmap de assuncao

### Semana 1: estabilizacao

- Tirar o projeto do OneDrive ou criar clone limpo em pasta local.
- Commitar a rodada de correcoes depois de recuperar Git.
- Rodar `typecheck`, `lint`, `test`, `build` em ambiente limpo.
- Manter `test:db` como gate manual antes de deploys com migrations ou mudancas
  de RLS.
- Rotacionar todos os segredos expostos em conversa, arquivos locais ou historico.
- Criar checklist de deploy em Vercel e Supabase.

### Semanas 2-3: producao controlada

- Ativar billing/trial em ambiente real com Stripe test mode e depois live mode.
- Validar convite por email ponta a ponta com Brevo.
- Criar smoke E2E: cadastro/onboarding, convite, criar lead, mover pipeline,
  fechar venda, NPS, indicacao, billing.
- Definir metricas de ativacao:
  - org criou conta;
  - concluiu onboarding;
  - convidou primeiro vendedor;
  - criou/importou 10 leads;
  - moveu lead no pipeline;
  - fechou primeira venda;
  - disparou primeiro NPS/indicacao;
  - configurou billing.
- Criar dashboards operacionais para ativacao, erros, cron e funil.

### Dias 30-60: produto e crescimento

- Onboarding mais completo por papel: gestor, vendedor e admin.
- Convite por email com estados de expirado, reenviar, revogar e aceite guiado.
- Trial com limite claro por plano e paywall educado.
- Melhorar UX vendedor: tela Hoje, proxima melhor acao, detalhes do lead mais
  rapido, menos cliques em cadencia.
- Melhorar UX gestor: painel executivo, ranking do time, metas, forecast,
  comissoes e alertas de risco.
- Rate limit em endpoints publicos e webhooks.
- Substituir os 2 `<img>` restantes por `next/image` quando os dominios de origem
  estiverem definidos.

### Dias 60-90: escala operacional

- Playwright E2E em CI.
- Backup e restore testado no Supabase.
- Auditoria LGPD: exportacao, exclusao, retencao e DPA.
- Logs de auditoria exportaveis para clientes maiores.
- Consolidar Server Actions multi-step em RPCs transacionais.
- Criar view agregada para detalhe do lead e reduzir round trips.
- Reprocessamento automatico de embeddings quando dados de empresa mudarem.

## Jornada do usuario

### Gestor

1. Cria organizacao e finaliza onboarding.
2. Configura pipeline, campos, cadencias e plano.
3. Convida vendedores.
4. Acompanha metas, forecast, comissao e gargalos.
5. Usa impersonificacao para suporte e coaching.

Falhas a observar:

- Onboarding ainda precisa diferenciar melhor o caminho de gestor e vendedor.
- Billing/trial precisa deixar claro limite, dias restantes e proximo passo.
- Metricas de ativacao ainda nao devem depender so de feeling.

### Vendedor

1. Entra por convite.
2. Trabalha a tela Hoje.
3. Cria/importa leads.
4. Move oportunidades no pipeline.
5. Registra ligacoes, cadencia, WhatsApp e proximas acoes.
6. Fecha venda e dispara flywheel de NPS/indicacao.

Falhas a observar:

- Detalhe do lead tem muito valor, mas pode ficar pesado visualmente.
- IA e prospeccao precisam aparecer como "proxima acao" e nao como modulo isolado.
- Upload/transcricao e NPS funcionam, mas precisam de feedback de status mais
  visivel para o vendedor.

## Definicao de pronto para producao

O sistema esta pronto para producao quando:

- Git estiver saudavel e todo patch estiver commitado.
- `typecheck`, `lint`, `test`, `build` passarem em maquina limpa.
- `test:db` passar contra o projeto Supabase de producao/staging.
- Segredos estiverem rotacionados e fora do repositorio.
- Stripe, Brevo, VAPID, Sentry e cron estiverem configurados.
- Fluxos criticos tiverem smoke test manual ou E2E.
- Houver plano de rollback e dono operacional definido.
