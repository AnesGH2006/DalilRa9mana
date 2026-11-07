const CACHE_VERSION = "v5";
const SHELL_CACHE = `dalil-ra9mana-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `dalil-ra9mana-assets-${CACHE_VERSION}`;
const API_CACHE = `dalil-ra9mana-api-${CACHE_VERSION}`;

const PRECACHE_URLS = ["/", "/offline.html", "/manifest.json", "/logo.png", "/logo-192.png"];

// ── Install: precache shell ──────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const valid = [SHELL_CACHE, ASSET_CACHE, API_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !valid.includes(k)).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // ── API calls: network-first, short offline fallback ──────────────────────
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const cacheControl = res.headers.get("Cache-Control") || "";
          const isPublicResponse = /(?:^|,)\s*public(?:\s|,|$)/i.test(cacheControl);
          const isPrivateResponse = /\b(private|no-store)\b/i.test(cacheControl);
          if (res.ok && request.method === "GET" && isPublicResponse && !isPrivateResponse) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: "offline", data: [] }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }),
    );
    return;
  }

  // ── Vite dev files: always network ────────────────────────────────────────
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/")
  ) {
    return;
  }

  // ── Hashed static assets (JS/CSS bundles): cache-first ───────────────────
  const isHashedAsset = /\.[a-f0-9]{8,}\.(js|css)$/.test(url.pathname);
  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      }),
    );
    return;
  }

  // ── Images / fonts: stale-while-revalidate ────────────────────────────────
  const isMedia = /\.(png|jpg|jpeg|gif|webp|svg|woff2?|ttf|ico)$/.test(
    url.pathname,
  );
  if (isMedia) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // ── Navigation (HTML pages): network-first, offline fallback ─────────────
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) || (await caches.match("/"));
          return cached || caches.match("/offline.html");
        }),
    );
    return;
  }

  // ── Default: network with cache fallback ──────────────────────────────────
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "دليل الرقمنة",
      body: event.data ? event.data.text() : "إشعار جديد",
    };
  }

  const title = data.title || "دليل الرقمنة";
  const options = {
    body: data.body || "لديك إشعار جديد",
    icon: "/logo.png",
    badge: "/logo.png",
    tag: data.type || "general",
    data: { url: data.url || "/" },
    dir: "rtl",
    lang: "ar",
    vibrate: [200, 100, 200],
    actions:
      data.type === "appointment"
        ? [
            { action: "view", title: "فتح" },
            { action: "dismiss", title: "رفض" },
          ]
        : [{ action: "view", title: "فتح" }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  if (event.action === "dismiss") return;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});

// ── Skip waiting on message ───────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
