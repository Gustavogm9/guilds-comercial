# PWA — Guilds Comercial

Estado atual: **PWA básica funcional**. Push notifications: **TODO** (depende de decisões de produto).

---

## O que está pronto

### 1. Manifest (`app/manifest.ts`)
- Nome, descrição, theme color, lang `pt-BR`, categories
- `start_url: /hoje` — abre direto no cockpit quando user instala
- `display: standalone` — sem barra de URL
- 2 atalhos de tela inicial (Pipeline, Hoje)

### 2. Ícones gerados (`app/icon.tsx`, `app/apple-icon.tsx`)
- Usam `next/og ImageResponse` — renderizam SVG-like server-side em PNG
- Placeholder com letra "G" sobre gradient `#4c5ee4 → #5a6cf6` (cor primary do tema)
- **Para substituir por logo real:** apague `app/icon.tsx` e coloque `app/icon.png` (256×256). O Next pega automático.

### 3. Service Worker (`public/sw.js`)
- Sem dependência (zero KB de Workbox runtime)
- Estratégias:
  - `/_next/static/*` e fontes/imagens — **cache-first** (Next versiona o nome, cache nunca polui)
  - HTML navegação — **network-first**, fallback para `/offline.html` se sem rede
  - `/api/*` — **pass-through** (nunca cacheado, para não servir dado fora-do-tempo)
  - Login/auth/`/trocar-senha` — pass-through (segurança)
- Atualização: bump `CACHE_VERSION` em `public/sw.js` para invalidar tudo
- Registrado via `<ServiceWorkerRegister />` no layout (só em produção)

### 4. Página offline (`public/offline.html`)
- HTML estático standalone com tema light/dark via CSS `prefers-color-scheme`
- Botão "Tentar de novo" → `location.reload()`

### 5. Install prompt (`components/install-prompt.tsx`)
- Captura `beforeinstallprompt` (Chrome/Edge/Android) e mostra banner
- iOS: detecta Safari mobile não-standalone, mostra hint "Compartilhar → Adicionar à tela inicial"
- Dispensável por 30 dias via localStorage
- Aparece em mobile acima do MobileNav (`bottom-20`) e desktop no canto inferior direito

---

## Como testar local

```bash
npm run build && npm start
# (PWA não roda em dev — service worker só registra quando NODE_ENV=production)

# Chrome DevTools → Application:
# - Manifest: confirma name, icons, shortcuts
# - Service Workers: deve aparecer "activated and is running"
# - Storage → Cache Storage: vê os assets cacheados após primeira navegação

# Lighthouse PWA audit:
# - Open DevTools → Lighthouse → "Progressive Web App" → Generate report
# - Esperado: passa nos checks básicos (manifest, sw, https, viewport, theme-color)
```

Em iOS Safari real:
1. Acesse o app
2. Toque em "Compartilhar" (ícone seta)
3. Role pra baixo, "Adicionar à Tela Inicial"
4. App aparece como ícone independente, abre em standalone

Em Android Chrome:
- Após `beforeinstallprompt` disparar (~30s de uso), o banner aparece. Tap "Instalar" → app no drawer.

---

## Push notifications — implementado

### Arquitetura

```
[Browser]                                    [Servidor Next]
  ┌──────────────────────┐                     ┌──────────────────────────┐
  │ /configuracoes/perfil│ ── PushManager ──>  │ POST /api/push/subscribe │
  │  PushNotificationsToggle                   │  → web_push_subscriptions│
  │  (Bell button)       │ <── VAPID public ── │ GET /api/push/vapid-public-key
  └──────────────────────┘                     └──────────────────────────┘
                                                          │
                                                          │ disparos:
                                                          │ - moverEtapa(Fechado/Perdido)
                                                          │ - daily-digest cron
                                                          │ - push-cadencia cron (1h)
                                                          ▼
                                                ┌──────────────────────┐
                                                │ lib/push.ts          │
                                                │ sendPushToUser(uid)  │
                                                │  - check prefs ativo │
                                                │  - check evento opt-in
                                                │  - check janela horário (fuso)
                                                │  - web-push.send()   │
                                                │  - 410/404 → cleanup │
                                                └──────────────────────┘
```

### Eventos suportados

| Código | Quando dispara | Destinatário |
|---|---|---|
| `cadencia_vencendo` | Cron horário detecta D7/D11 com data_prevista=hoje em status pendente | Responsável do lead |
| `resumo_diario` | Daily-digest cron 8h UTC após gerar resumo | Todos os membros ativos da org |
| `lead_fechado_proposta` | `moverEtapa(Fechado)` ou `moverEtapa(Perdido)` | Responsável do lead |
| `lead_reabriu` | **Pendente** — depende do WhatsApp webhook que ainda não existe | Responsável do lead |

### Setup de produção

1. **Gerar VAPID keys** (uma vez, primeira vez):
   ```bash
   node -e "const w=require('web-push'); const k=w.generateVAPIDKeys(); console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY='+k.publicKey); console.log('VAPID_PRIVATE_KEY='+k.privateKey);"
   ```
2. **Adicionar ao `.env.local`** (dev) e ao **Vercel** (prod):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (público, exposto ao client)
   - `VAPID_PRIVATE_KEY` (privado, server-only)
   - `VAPID_SUBJECT` (mailto: usado pelo Push Service para contatar o app)
3. **Schedule do cron** de cadência (`/api/cron/push-cadencia`) — automatizado via migration `20260427100009_pg_cron_push_cadencia.sql` se Vault tiver `CRON_SECRET` e `APP_URL` configurados.

### UX no `/configuracoes/perfil`

- Card "Notificações Push" com:
  - Botão **Ativar aqui / Desativar aqui** (chama `Notification.requestPermission()` + cria subscription)
  - Toggle global **Receber notificações**
  - Checkbox por tipo de evento (4 tipos)
  - Inputs de **janela de horário** (`time` start/end) + **fuso**
- LGPD: opt-in explícito (user clica "Ativar" — sem auto-subscribe)
- iOS: detecta Safari mobile não-standalone, mostra hint "Compartilhar → Adicionar à tela inicial" antes (push iOS só funciona com PWA instalada, iOS 16.4+)

### Tabelas

- `web_push_subscriptions` — uma row por device (`UNIQUE(profile_id, endpoint)`). RLS: user só vê as suas. `last_seen_at` atualizado a cada push enviado com sucesso. Cron semanal remove >180d.
- `notification_preferences` — uma row por user (`PRIMARY KEY(profile_id)`). Default: opt-in nos 4 eventos, janela 08:00–20:00, fuso `America/Sao_Paulo`. CHECK constraint valida lista de eventos contra os 4 conhecidos.

### Limitações conhecidas

- **iOS Safari**: push só em iOS 16.4+ E somente quando o PWA está instalado (não em browser).
- **Cadência cron** assume `data_prevista` é DATE (sem hora). Heurística atual: alerta uma vez no dia (08:00–10:00 dependendo do horário do cron). Se quisermos "1h antes" exato, mudar `cadencia.data_prevista` pra `timestamptz`.
- **`lead_reabriu`** preparado mas inativo — `sendPushToUser(..., { evento: 'lead_reabriu', ... })` funciona, mas falta o gatilho (WhatsApp webhook).
- **Background sync** desabilitado — vendedor offline marcando cadência ainda falha imediato.

### Como testar local

```bash
npm run build && npm start
# (PWA + push só rodam em production build)

# 1. Logue no app
# 2. Abra /configuracoes/perfil → role até "Notificações Push" → "Ativar aqui"
# 3. Aceite a permissão do browser
# 4. No banco, confirme que apareceu uma row em web_push_subscriptions
# 5. Faça moverEtapa para "Fechado" em algum lead seu → push chega
```

### Como testar push manualmente no banco

```sql
-- Listar subscriptions do user gestor
select id, endpoint, last_seen_at from web_push_subscriptions
where profile_id = (select id from profiles where email = 'gustavog.macedo16@gmail.com');
```

E via app, qualquer mudança de etapa que dispare `lead_fechado_proposta` chega.

---

## Limitações conhecidas

- **Push em iOS** funciona apenas iOS 16.4+ e só quando o app está instalado (não em Safari).
- **Service worker em dev** está desabilitado de propósito — registra só em build de produção.
- **Background sync** não está habilitado. Se o vendedor ficar offline e marcar uma cadência, hoje não enfileira pra sincronizar quando voltar — falha imediatamente. Implementar quando push ficar pronto.
- **Cache de UI dinâmica**: nada de RSC streaming é cacheado por design (todo `/(app)/*` é `force-dynamic`). Resultado: app *funciona offline só na página offline* — não dá pra navegar offline. Para offline real, mudar arquitetura (não recomendado pra V1.1).

---

**Última revisão:** 2026-04-27.
