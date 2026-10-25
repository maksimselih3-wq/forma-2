// Сервис-воркер Forma: ускоряет повторные открытия.
//  - файлы с версией (app.js?v=…, style.css?v=…) не меняются никогда — берём из кэша сразу;
//  - страница и остальное — сначала сеть (чтобы обновления доходили), но если сеть думает дольше ~3,5 с, показываем сохранённое.
// Запросы к серверу (API) не трогаем.
const CACHE = 'forma-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;
  e.respondWith(handle(req, url));
});

async function put(req, res) {
  try { if (res && res.ok && res.type === 'basic') (await caches.open(CACHE)).put(req, res.clone()); } catch (err) { /* не страшно */ }
}

async function handle(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  // файлы с версией неизменны — из кэша мгновенно
  if (url.searchParams.has('v') && hit) return hit;
  const net = fetch(req).then((res) => { put(req, res); return res; });
  if (!hit) return net;
  // есть сохранённая копия: ждём сеть недолго, потом отдаём копию (сеть при этом докачается и обновит кэш)
  return Promise.race([net, new Promise((ok) => setTimeout(() => ok(hit), 3500))]).catch(() => hit);
}
