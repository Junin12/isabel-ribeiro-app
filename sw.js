// Service worker simples: sempre tenta a internet primeiro (pega atualizações do GitHub)
// e usa a cópia salva quando estiver offline.
const CACHE = 'isabel-ribeiro-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('script.google')) return; // dados nunca vêm do cache
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && (req.url.startsWith(self.location.origin) || /cdnjs|fonts\.(googleapis|gstatic)/.test(req.url))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
