// Service worker: guarda la "carcasa" de la app para que se abra al instante.
// Siempre intenta primero la red (asi las actualizaciones llegan solas)
// y usa la copia guardada solo si no hay conexion.
// Las llamadas a /api/ nunca se guardan ni se interceptan.

const CACHE = 'lector-tickets-v1';
const CARCASA = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CARCASA)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
        return; // el navegador lo gestiona con normalidad
    }

    event.respondWith(
        fetch(req)
            .then((res) => {
                if (res.ok) {
                    const copia = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copia));
                }
                return res;
            })
            .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
});
