// Satır İzi Service Worker
// Her yayında CACHE_VERSION değerini artırın; tarayıcı yeni dosyaları indirir ve kullanıcıya
// "Yeni sürüm hazır" bildirimi gösterilir. Yalnızca uygulamanın kendi statik dosyaları önbelleğe alınır.
// Gemini istekleri (farklı alan adı) ve API anahtarı hiçbir zaman önbelleğe girmez.
const CACHE_VERSION = '2.4.0';
const CACHE = `satir-izi-${CACHE_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/account.js',
  './js/config.js',
  './js/sync.js',
  './js/vendor/supabase.js',
  './js/vendor/591.supabase.js',
  './js/backup.js',
  './js/batch.js',
  './js/batch-runner.js',
  './js/bookinfo.js',
  './js/books.js',
  './js/bridge.js',
  './js/database.js',
  './js/export.js',
  './js/gemini.js',
  './js/highlights.js',
  './js/home.js',
  './js/icons.js',
  './js/review.js',
  './js/router.js',
  './js/scan.js',
  './js/scanner.js',
  './js/settings.js',
  './js/store.js',
  './js/ui.js',
  './js/utils.js',
  './fonts/plus-jakarta-sans-latin.woff2',
  './fonts/plus-jakarta-sans-latin-ext.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-icon.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // HTTP önbelleğini atla ki GitHub Pages'in eski kopyaları gelmesin
    await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    // İlk kurulumda hemen etkinleş; güncellemelerde kullanıcının onayını bekle
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('satir-izi-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Gemini ve diğer dış istekler: dokunma

  if (req.mode === 'navigate') {
    // Sayfa açılışı: önbellekteki index.html (çevrimdışı da çalışır)
    event.respondWith((async () => {
      const cached = await caches.match('./index.html', { cacheName: CACHE });
      if (cached) return cached;
      try { return await fetch(req); } catch { return new Response('Çevrimdışı', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(req);
    } catch {
      return Response.error();
    }
  })());
});
