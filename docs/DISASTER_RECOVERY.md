# Disaster Recovery & Backups — guilds-comercial

Documento operacional. Audiência: time de engenharia + gestor de risco.

---

## Resumo executivo

| Aspecto | Estado | Compromisso |
|---|---|---|
| Backup automático do banco | ✅ Supabase Pro+ daily backups | RPO ≤ 24h |
| Point-in-time recovery (PITR) | ⚠️ Requer Supabase Pro+ ($25/mês) | RPO ≤ 2 min com PITR ligado |
| Restore documentado e testado | ❌ Procedimento aqui, ainda não testado em fogo | RTO ≤ 4h |
| Backup do código | ✅ GitHub (origem) + clones locais | RPO ≈ 0 |
| Backup de Edge Functions | ⚠️ Versionadas no repo, mas deploy é manual | RPO = último commit |
| Backup de prompts de IA | ✅ `ai_prompts` tem versionamento por feature/org | RPO = última versão ativa |
| Backup de variáveis de ambiente | ⚠️ Só no Vercel/Supabase Dashboard. Não exportadas | RTO depende de re-criação manual |

**Definições:**
- **RPO** (Recovery Point Objective): quanto dado podemos perder no pior caso. Quanto menor, melhor.
- **RTO** (Recovery Time Objective): em quanto tempo voltamos ao ar após incidente. Quanto menor, melhor.

---

## Backups do banco (Postgres / Supabase)

### Plano Free
- **Sem backup automatizado.** Único snapshot é o `seed.sql` versionado e backups manuais via `pg_dump`.
- Ação manual recomendada: `supabase db dump > backup-AAAAMMDD.sql` semanalmente, salvar em local seguro.

### Plano Pro+ (recomendado para produção)
- **Daily backups** automáticos retidos por 7 dias (Pro) ou 14 dias (Team) ou 30 dias (Enterprise).
- **Point-in-time recovery (PITR)**: opcional ($25/mês). Permite restaurar o banco para qualquer instante dos últimos 7-30 dias com granularidade de ~2 minutos.
- Acesso: Supabase Dashboard → Project → Database → Backups.

**Recomendação:** ao subir para Pro, ativar PITR. Custo de $25/mês compensa qualquer corrupção de dados ou drop acidental.

### Backup manual on-demand (qualquer plano)

```bash
# Schema apenas
supabase db dump --schema public > schema-AAAAMMDD.sql

# Schema + dados (pode ser grande)
PGPASSWORD=$DB_PASS pg_dump -h db.<ref>.supabase.co -U postgres \
  --no-owner --no-privileges \
  -f full-AAAAMMDD.dump postgres
```

Recomendar 1×/semana antes de operações de migração arriscadas. Guardar em S3/GCS criptografado.

---

## Procedimento de restore

### Cenário 1: drop de tabela acidental ou corrupção localizada

**RTO alvo: < 1h**

1. Identificar instante anterior à corrupção (logs do app, Sentry).
2. Supabase Dashboard → Database → Backups → "Restore to point in time" (PITR) → escolher timestamp.
3. **Avaliação cuidadosa**: PITR substitui o banco inteiro. Considere primeiro:
   - Restaurar para um *novo projeto branch* via Supabase Branching e copiar só a tabela afetada.
   - Para dados específicos: restaurar `pg_dump` em projeto separado, exportar a tabela, importar de volta no prod.

### Cenário 2: perda total do projeto Supabase

**RTO alvo: < 4h**

1. Criar novo projeto Supabase em `sa-east-1` (mesmo nome ou similar).
2. Aplicar migrations: `supabase link --project-ref <novo>` → `supabase db push`.
3. Restore do último backup disponível (se houver): Dashboard → Backups.
4. Re-deployar Edge Functions: `supabase functions deploy daily-digest`.
5. Re-criar secrets: `supabase secrets set RESEND_API_KEY=... CRON_SECRET=...`.
6. Atualizar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no Vercel.
7. Re-criar usuários no `auth.users` (se backup não cobriu) — gestores comunicam ao time pra refazer signup.
8. Validação: rodar `npm run test:db` apontando para o novo project_ref.

### Cenário 3: deploy ruim no Vercel

**RTO alvo: < 5min**

- Vercel Dashboard → Project → Deployments → escolher deploy anterior funcional → "Promote to Production".
- Não envolve banco.

---

## Backup de itens fora do Postgres

### Edge Functions
- Versionadas em `supabase/functions/`.
- Backup = git push.
- Restore: `supabase functions deploy <nome>`.

### Prompts de IA (`ai_prompts`)
- Cada versão é persistida na tabela. `ativo` indica a versão ativa por (org, feature).
- Backup = parte do backup de banco.
- Recuperação granular: `update ai_prompts set ativo = true where versao = N and feature_codigo = ...`.

### Configuração de ambiente
- `.env.local` é gitignored e cada dev tem o seu.
- Produção: variáveis no Vercel + secrets do Supabase Vault.
- **Risco:** se conta Vercel/Supabase é perdida, segredos somem.
- **Mitigação:** manter inventário criptografado (1Password/Bitwarden) com:
  - Chaves de API (Anthropic, OpenAI, Google, Resend, Stripe)
  - Senha do banco
  - Service role key
  - Cron secret
  - Stripe webhook secret

### Domínio e DNS
- Documentar registrar atual (Registro.br/Cloudflare/etc).
- TTL baixo para registros principais facilita migração rápida.

---

## Testes de DR (a fazer)

Recomendado antes do primeiro cliente real:

- [ ] **Drill 1**: simular drop de uma tabela em ambiente de staging, restaurar via PITR. Medir RTO real.
- [ ] **Drill 2**: criar projeto Supabase novo do zero a partir das migrations, aplicar seed, validar que app sobe.
- [ ] **Drill 3**: rodar `npm run test:db` apontando para projeto restaurado — todos os 24 testes passam?

Documentar tempos reais para ajustar RTO/RPO comprometidos com clientes.

---

## Monitoramento contínuo

- **Sentry** captura erros do app (`@sentry/nextjs` 10.50). Verificar diariamente para detectar incidentes em curso.
- **Supabase Dashboard → Database → Logs** mostra queries lentas e erros do banco.
- **Sugerido**: criar alerta no Sentry para erros que indiquem corrupção (SQLSTATE 23xxx, 42xxx).

---

## Contatos

- Suporte Supabase: support@supabase.io (resposta < 24h em Pro)
- Suporte Vercel: vercel.com/help
- DPO interno (LGPD): a definir

---

**Última revisão:** 2026-04-27. Revisar trimestralmente ou após qualquer incidente.
