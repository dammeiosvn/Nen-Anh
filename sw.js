const CACHE = 'anh-gon-2.0.0';
const OCR_CACHE = 'anh-gon-ocr-6-vie-1';
const SHELL = [
  './','./index.html','./css/app.css','./manifest.webmanifest',
  './js/app.js','./js/utils.js','./js/engine.js','./js/icons.js','./js/bridge.js','./js/webp-worker.js',
  './js/profiles.js','./js/ocr.js','./js/resize-worker.js','./js/worker-client.js',
  './icons/icon.svg','./icons/apple-touch-icon.png','./icons/icon-192.png','./icons/icon-512.png',
  './docs/SHORTCUTS.html','./vendor/webp/encode.js','./vendor/webp/utils.js','./vendor/webp/meta.js','./vendor/webp/features.js',
  './vendor/webp/codec/enc/webp_enc.js','./vendor/webp/codec/enc/webp_enc.wasm',
  './vendor/webp/codec/enc/webp_enc_simd.js','./vendor/webp/codec/enc/webp_enc_simd.wasm',
];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('anh-gon-') && key !== CACHE && key !== OCR_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), base = new URL('./', self.location.href);
  if (event.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(url.pathname.startsWith(new URL('./vendor/ocr/',base).pathname) ? OCR_CACHE : CACHE);
    const cached = await cache.match(event.request,{ignoreSearch:true});
    if (cached) return cached;
    try { const response = await fetch(event.request); if(response.ok && url.pathname.startsWith(new URL('./vendor/ocr/',base).pathname)) await cache.put(event.request,response.clone()); return response; }
    catch (error) {
      if (event.request.mode === 'navigate') return await caches.match(new URL('./index.html',base)) || Response.error();
      throw error;
    }
  })());
});
