const CACHE_NAME='rocas-app-shell-v1';
const BASE_URL=new URL('./',self.registration.scope);
const APP_PATH=BASE_URL.pathname;
const SHELL=[
  BASE_URL.href,
  new URL('manifest.webmanifest',BASE_URL).href,
  new URL('rocas-192.png',BASE_URL).href,
  new URL('rocas-512.png',BASE_URL).href,
  new URL('rocas-180.png',BASE_URL).href
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('rocas-app-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.mode!=='navigate')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||(url.pathname!==APP_PATH&&url.pathname!==APP_PATH+'index.html'))return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(BASE_URL.href,copy)).catch(()=>{});}
    return response;
  }).catch(()=>caches.match(BASE_URL.href).then(response=>response||new Response('ROCAS está sin conexión y todavía no tiene una copia local. Conéctate a internet para abrirla.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});
