/* 旅行手帳 Service Worker：App 本體離線可用；Google 同步連線一律不快取 */
const VERSION = 'v3';
const CACHE = 'travel-itinerary-' + VERSION;
const FONT_CACHE = 'travel-fonts-v1';
const CORE = [
  './', 'index.html', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon-180.png', 'icons/apple-touch-icon-167.png', 'icons/apple-touch-icon-152.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('travel-itinerary-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Drive 同步：不要經過快取
  if (url.hostname === 'script.google.com' || url.hostname.endsWith('googleusercontent.com')) return;

  // 字型：先用快取，背景更新
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async cache => {
      const cached = await cache.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (cached) { e.waitUntil(net); return cached; }
      return (await net) || Response.error();
    }));
    return;
  }

  // App 本體：先用快取（秒開、可離線），背景檢查更新，下次開啟即是新版
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const cached = (await cache.match(req, { ignoreSearch: true })) ||
                     (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
      const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (cached) { e.waitUntil(net); return cached; }
      return (await net) || new Response('離線中，而且這個檔案還沒有被快取。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
  }
});
