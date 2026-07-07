/* Minimal service worker: cache the app shell so it installs and opens offline.
   API calls to api.anthropic.com are never cached — always go to the network. */
const CACHE = 'logbook-v3';
const SHELL = [
  '.', 'index.html', 'app.js', 'manifest.webmanifest',
  'vendor/xlsx.full.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                          // never intercept the POST to Anthropic
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // don't touch the api.anthropic.com call
  // Network-first: online users always get the latest app; offline falls back to cache.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
