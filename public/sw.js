/*
 * W.FARMACIA · Service Worker (Tanda 19 — PWA offline)
 * ADN JM NEXUS · el internet del barrio se cae; la app no debe caerse con él.
 *
 * Estrategia honesta y conservadora:
 *  - Estáticos inmutables (/_next/static/*, íconos): cache-first (rápidos y offline).
 *  - Navegaciones (páginas): network-first → si no hay red, sirve la última copia
 *    cacheada de esa página; si tampoco existe, la página de "sin conexión".
 *  - NO se cachea nada por POST: las escrituras (cobrar, etc.) exigen red. Nunca se
 *    finge una venta offline (rompería NCF/FEFO/existencia). Consultar sí; cobrar no.
 */
const VERSION = 'wf-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/icon.svg'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg' || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // escrituras: siempre a la red, jamás cache

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // externos: passthrough

  // Estáticos inmutables → cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // Navegaciones → network-first con fallback a la última copia y luego a offline.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL)))
    );
  }
});
