// LifeOS Progressive Web App Service Worker
// Cache-only static shell resources with strict security boundaries.
// NEVER cache /api/*, authentication endpoints, or financial responses.

const CACHE_NAME = 'lifeos-shell-v1';

const STATIC_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// Offline navigation HTML fallback
const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LifeOS - Offline</title>
  <style>
    body {
      background-color: #09090b;
      color: #f4f4f5;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1.5rem;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      padding: 2rem;
      max-width: 28rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    h1 { margin-top: 0; font-size: 1.5rem; color: #fafafa; }
    p { color: #a1a1aa; line-height: 1.5; margin: 0.75rem 0; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #27272a;
      color: #38bdf8;
      border-radius: 9999px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    button {
      margin-top: 1rem;
      padding: 0.625rem 1.25rem;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Offline Mode</div>
    <h1>LifeOS Offline</h1>
    <p>You are currently offline. Any quick-captured tasks or notes are safely persisted in your local offline queue and will automatically synchronize when you reconnect.</p>
    <button onclick="window.location.reload()">Retry Connection</button>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache static shell assets
      return cache.addAll(STATIC_SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching partial assets failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Strict Rule 11 & Security Invariant: Only GET requests may ever be evaluated for cache.
  if (request.method !== 'GET') {
    return; // Pass through directly to network
  }

  const url = new URL(request.url);

  // Cross-origin requests: ignore service worker caching
  if (url.origin !== self.location.origin) {
    return;
  }

  // HARD SECURITY RULE 11:
  // NEVER cache /api/*, authentication endpoints, finance endpoints, or user-specific API responses.
  // Network-only behavior is mandatory.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/api/finance') ||
    url.pathname.includes('/auth') ||
    url.pathname.includes('/finance')
  ) {
    // Return early to allow default network fetch
    return;
  }

  // 1. Navigation requests (HTML documents)
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request).catch(async () => {
        // Fallback to cached root shell or offline page
        const cachedShell = await caches.match('/');
        if (cachedShell) {
          return cachedShell;
        }
        return new Response(OFFLINE_FALLBACK_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      })
    );
    return;
  }

  // 2. Static application shell assets:
  // - _next/static JS/CSS chunks
  // - Icons, images, manifest, fonts
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // All other requests pass through to network
});
