/**
 * Service Worker básico do Guilds Comercial — sem Workbox.
 *
 * Estratégias:
 *  - Assets estáticos (`/_next/static/*`, fontes, imagens): cache-first com
 *    fallback de rede. Cache nunca expira (Next versiona o nome dos arquivos).
 *  - Navegação HTML: network-first com fallback de cache. Se ambos falham,
 *    serve `/offline.html`.
 *  - APIs (`/api/*`): pass-through (sempre rede). Cachear API quebra dado real.
 *
 * Atualização: o nome do CACHE muda a cada deploy via `?v=<hash>` injetado
 * no register. Em activate, todos os caches antigos são apagados.
 */

const CACHE_VERSION = "v2";
const CACHE_NAME = `guilds-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só GET é cacheável
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only — não cacheamos cross-origin (Supabase, Anthropic, etc.)
  if (url.origin !== self.location.origin) return;

  // APIs: pass-through (sempre rede). Cachear APIs daria dado fora-do-tempo.
  if (url.pathname.startsWith("/api/")) return;

  // Auth-related: nunca cachear
  if (url.pathname.startsWith("/login") || url.pathname.startsWith("/auth/") || url.pathname === "/trocar-senha") {
    return;
  }

  // Assets estáticos do Next: cache-first
  if (url.pathname.startsWith("/_next/static/") || /\.(woff2?|ttf|otf|svg|png|jpg|jpeg|webp|gif|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Navegação HTML: network-first com fallback offline
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(networkFirstWithOffline(req));
    return;
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return new Response("offline", { status: 503 });
  }
}

async function networkFirstWithOffline(req) {
  try {
    const fresh = await fetch(req);
    return fresh;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match(OFFLINE_URL);
    return offline ?? new Response("offline", { status: 503 });
  }
}

/* ============================================================
 * Web Push: receber e mostrar notificação
 *
 * Payload esperado (JSON):
 *   { evento, title, body, url?, tag? }
 *
 * Servidor envia via lib/push.ts (web-push lib), VAPID já configurado.
 * ============================================================ */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Guilds", body: event.data.text() };
  }

  const title = payload.title || "Guilds Comercial";
  const options = {
    body: payload.body || "",
    icon: "/icon",
    badge: "/icon",
    tag: payload.tag, // notificações com mesma tag substituem-se
    data: { url: payload.url || "/hoje", evento: payload.evento },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Clique na notificação: foca janela existente ou abre nova */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/hoje";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Se já tem uma janela aberta no mesmo origin, foca nela
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          // Navega pra URL alvo se diferente
          if ("navigate" in client && client.url !== new URL(targetUrl, self.location.origin).href) {
            try { await client.navigate(targetUrl); } catch {}
          }
          return;
        }
      }
      // Sem janela aberta: abre nova
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
