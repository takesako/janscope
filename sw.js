// Bump VERSION whenever a shipped asset changes. Scope-specific cache supports subpaths.
const VERSION='v1.0.0';
const PREFIX='jan-scope-'+self.registration.scope;
const CACHE=PREFIX+VERSION;
const FILES=['./','./index.html','./style.css','./app.js','./decoder.js','./vendor/quagga.min.js','./vendor/zxing-reader.js','./vendor/zxing_reader.wasm','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable.png','./assets/sample.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(event.request);
    if(cached)return cached;
    return fetch(event.request);
  }));
});
