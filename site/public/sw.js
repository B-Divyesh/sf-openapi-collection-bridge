const CACHE = 'ocb-shell-v2';
const SHELL = ['/', '/demo/', '/privacy/', '/terms/', '/404.html', '/bridge-notebook.webp', '/bridge-notebook-640.webp', '/bridge-social.jpg', '/ocb-demo.svg', '/favicon.svg', '/apple-touch-icon.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match('/')))); });
