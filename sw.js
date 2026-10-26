/* Eigener Cache-Name: darf nicht mit "lernoase-" beginnen, sonst räumt die Lern-Oase ihn weg (gleiche Webadresse). */
const C="lernmatch-v1";const CORE=["./","index.html","inhalte.js","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("lernmatch-")&&k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;
 e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(C).then(c=>c.put(r,copy)).catch(()=>{});return res;}).catch(()=>caches.match(r).then(m=>m||caches.match("index.html"))));});
