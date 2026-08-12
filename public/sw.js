/* Service worker de Suite U3.
 *
 * Estrategias:
 *   - /api/*            -> solo red. Nunca se cachea (datos sensibles y token en cabecera).
 *   - /_next/static/*   -> cache-first. Los nombres llevan hash, son inmutables.
 *   - iconos y logos    -> cache-first.
 *   - navegaciones      -> network-first con respaldo en cache y, si no hay nada, /offline.html.
 *   - resto de GET      -> stale-while-revalidate.
 *
 * Al cambiar VERSION se invalidan todas las caches anteriores.
 */
const VERSION = 'u3-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const PAGE_CACHE = `${VERSION}-pages`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, PAGE_CACHE];

const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/logo_b.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

const NAVIGATION_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff2?|ttf|otf|css|js)$/.test(url.pathname)
  );
}

/** Cache-first: sirve de cache y solo va a la red la primera vez. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

/** Stale-while-revalidate: responde de cache y refresca en segundo plano. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  const response = cached || (await network);
  if (response) return response;
  throw new Error('Sin red y sin copia en cache');
}

/** Devuelve la respuesta de red o rechaza pasados NAVIGATION_TIMEOUT_MS. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Network-first para paginas: red -> copia en cache -> pagina offline. */
async function navigationHandler(event) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await withTimeout(fetch(event.request), NAVIGATION_TIMEOUT_MS));
    if (response && response.ok) cache.put(event.request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return (
      offline ||
      new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca interceptamos la API ni las descargas de archivos subidos.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(event));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE).catch(() => fetch(request)));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE).catch(() => fetch(request)));
});
