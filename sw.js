// Сервис-воркер Forma. Ничего не кэширует: приложение всегда берётся свежим с сайта
// (у приложения своя проверка версии). Нужен только затем, чтобы телефон разрешил установку.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
