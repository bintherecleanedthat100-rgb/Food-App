// Offline support: serve the app shell from cache, then refresh the cache in the background.
// Bump CACHE when shipping changes so old files are cleared out.
const CACHE = 'making-food-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './photos/beef-bulgogi-bowl.jpg',
  './photos/burger-bowl-sweet-potato-fries.jpg',
  './photos/chicken-burrito-bowl.jpg',
  './photos/chicken-shawarma-bowl.jpg',
  './photos/chipotle-beef-fajita-bowl.jpg',
  './photos/chipotle-chicken-fajita-bowl.jpg',
  './photos/cinnamon-baked-apples-walnuts.jpg',
  './photos/dark-chocolate-avocado-mousse.jpg',
  './photos/ginger-garlic-chicken-stir-fry.jpg',
  './photos/golden-milk-chia-pudding.jpg',
  './photos/greek-beef-bowl.jpg',
  './photos/greek-yogurt-berry-bark.jpg',
  './photos/herb-steak-brussels-sprouts.jpg',
  './photos/honey-garlic-teriyaki-chicken.jpg',
  './photos/lemon-herb-chicken-sweet-potatoes.jpg',
  './photos/meatballs-mashed-potatoes-gravy.jpg',
  './photos/mixed-berry-almond-crumble.jpg',
  './photos/steak-bites-potato-hash.jpg',
  './photos/steak-sweet-potato-chimichurri.jpg',
  './photos/thai-basil-beef.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Every page load is the same single-page app, so navigations share one cache entry.
  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(request)
      .then(response => {
        if (response.ok) cache.put(key, response.clone());
        return response;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
