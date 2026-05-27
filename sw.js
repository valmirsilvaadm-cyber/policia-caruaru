const CACHE_NAME = 'pmc-caruaru-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // 🔐 Bloqueia requisições para origens não autorizadas
  const url = new URL(req.url);
  const allowedOrigins = [
    self.location.origin,
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://www.gstatic.com',
    'https://cdnjs.cloudflare.com',
    'https://firestore.googleapis.com',
    'https://identitytoolkit.googleapis.com'
  ];
  const isAllowed = allowedOrigins.some(o => req.url.startsWith(o));

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        // 🔐 Só cacheia respostas válidas (status 200, mesma origem ou permitida)
        if (
          !response ||
          response.status !== 200 ||
          (response.type !== 'basic' && !isAllowed)
        ) {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
