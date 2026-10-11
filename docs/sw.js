const CACHE='twitter-shell-v34-reader',MEDIA='twitter-media-v1',SETTINGS='twitter-device-settings';
const SHELL=['./','./index.html','./style.css?v=34','./app.mjs?v=34','./motion.mjs?v=18','./nav-icons.mjs','./share.mjs','./core.mjs','./normalize.mjs','./timeline.mjs','./sync-core.mjs','./cloud.mjs','./cloud-config.mjs','./db.mjs','./files.mjs','./feed-window.mjs','./media.mjs','./activity.mjs','./archive-worker.mjs','./vendor/fflate.mjs','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new Request(new URL(path,self.registration.scope),{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('twitter-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
let pruning=Promise.resolve(),limitMB=100,epoch=0;
const settingURL=new URL('./cache-limit',self.registration.scope).href;
const settingsReady=caches.open(SETTINGS).then(cache=>cache.match(settingURL)).then(async r=>{if(r){const value=Number(await r.text());if([0,25,50,100,250,500].includes(value))limitMB=value;}}).catch(()=>{});
async function prune(){const cache=await caches.open(MEDIA),keys=await cache.keys(),entries=[];let total=0;for(const key of keys){const response=await cache.match(key),bytes=Number(response?.headers.get('X-Twitter-Bytes'))||0;entries.push({key,bytes});total+=bytes;}while(entries.length&&(entries.length>1500||total>limitMB*1024*1024)){const oldest=entries.shift();total-=oldest.bytes;await cache.delete(oldest.key);}}
self.addEventListener('message',event=>{const m=event.data;if(m?.type==='clear-media-cache'){epoch++;pruning=pruning.then(()=>caches.delete(MEDIA));event.waitUntil(pruning);}else if(m?.type==='cache-limit'&&[0,25,50,100,250,500].includes(m.limitMB)){limitMB=m.limitMB;if(!limitMB)epoch++;pruning=pruning.then(async()=>{const cache=await caches.open(SETTINGS);await cache.put(settingURL,new Response(String(limitMB)));await prune();});event.waitUntil(pruning);}});
async function image(request){await settingsReady;const generation=epoch;let cache;try{cache=await caches.open(MEDIA);if(limitMB){const cached=await cache.match(request);if(cached)return cached;}}catch{}
  const response=await fetch(new Request(request.url,{mode:'cors',credentials:'omit'}));if(!response.ok||!limitMB||!cache)return response;
  try{const blob=await response.clone().blob();if(blob.size>8*1024*1024)return response;const headers=new Headers(response.headers);headers.set('X-Twitter-Bytes',String(blob.size));pruning=pruning.catch(()=>{}).then(async()=>{if(generation!==epoch||!limitMB)return;await cache.put(request,new Response(blob,{status:200,headers}));await prune();});await pruning;}catch{}return response;
}
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET')return;
  if(url.hostname==='res.cloudinary.com'&&url.pathname.startsWith('/myranker/')&&event.request.destination==='image'){event.respondWith(image(event.request));return;}
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(response=>response.ok&&response.headers.get('content-type')?.includes('text/html')?caches.open(CACHE).then(cache=>{cache.put('./index.html',response.clone());return response;}):response).catch(()=>caches.match('./index.html')));return;}
  const paths=SHELL.map(p=>new URL(p,self.registration.scope).pathname);if(paths.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
