// StockPilot service worker: lets the POS open and sell without internet.
// Only the POS page and static build assets are cached; all data requests stay network-only.
const VERSION = "sp-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_PAGES = ["/pos"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || /^\/(icon|apple-icon)/.test(url.pathname) || url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.ico";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate" && OFFLINE_PAGES.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await fetch(req);
          // Only cache real pages (not redirects to sign-in).
          if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          const cached = await cache.match(url.pathname);
          return cached ?? new Response("You are offline and this page has not been opened on this device yet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
  }
});

// The page sends the asset URLs it already loaded so they are available offline immediately.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "precache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(STATIC).then((cache) =>
      Promise.all(
        data.urls
          .filter((u) => typeof u === "string" && isStatic(new URL(u, self.location.origin)))
          .map((u) => cache.match(u).then((hit) => hit || fetch(u).then((res) => res.ok && cache.put(u, res)).catch(() => undefined))),
      ),
    ),
  );
});

// Clear cached pages on sign-out so the next person can't see the previous session's POS.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-pages") event.waitUntil(caches.delete(PAGES));
});
