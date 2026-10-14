const CACHE = 'anh-gon-1.1.0';
const SHELL = [
  './','./index.html','./css/app.css','./manifest.webmanifest',
  './js/app.js','./js/utils.js','./js/engine.js','./js/icons.js','./js/bridge.js','./js/webp-worker.js',
  './icons/icon.svg','./icons/apple-touch-icon.png','./icons/icon-192.png','./icons/icon-512.png',
  './docs/SHORTCUTS.html','./vendor/webp/encode.js','./vendor/webp/utils.js','./vendor/webp/meta.js','./vendor/webp/features.js',
  './vendor/webp/codec/enc/webp_enc.js','./vendor/webp/codec/enc/webp_enc.wasm',
  './vendor/webp/codec/enc/webp_enc_simd.js','./vendor/webp/codec/enc/webp_enc_simd.wasm',
];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('anh-gon-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), base = new URL('./', self.location.href);
  if (event.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request,{ignoreSearch:true});
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return await caches.match(new URL('./index.html',base)) || Response.error();
      throw error;
    }
  })());
});
