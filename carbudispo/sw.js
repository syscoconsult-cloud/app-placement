// Service worker minimal : met en cache l'interface pour un démarrage rapide.
// Les données (stations, statuts) viennent toujours du réseau.
const CACHE = 'carbudispo-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'supabase-config.js', 'manifest.json', 'icon.svg', 'confidentialite.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord, cache en secours (fichiers de l'appli uniquement)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
