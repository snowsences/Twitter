export const MEDIA_CACHE='twitter-media-v1',CACHE_OPTIONS=[0,25,50,100,250,500];
export function imageVariant(value,width=720){
  try{const url=new URL(value);if(url.protocol!=='https:')return value;
    if(url.hostname==='res.cloudinary.com'&&url.pathname.startsWith('/myranker/image/upload/')&&!url.pathname.includes('/s--')){url.pathname=url.pathname.replace('/image/upload/',`/image/upload/c_limit,w_${width},q_auto,f_auto/`);return url.href;}
    if(url.hostname==='pbs.twimg.com'){url.searchParams.set('name',width<=160?'small':width<=400?'small':'medium');return url.href;}
  }catch{}return value;
}
export async function cacheStats(cacheStorage=globalThis.caches){
  if(!cacheStorage)return {supported:false,count:0,bytes:0};const cache=await cacheStorage.open(MEDIA_CACHE),keys=await cache.keys();let bytes=0;
  for(const key of keys){const response=await cache.match(key);bytes+=Number(response?.headers.get('X-Twitter-Bytes'))||Number(response?.headers.get('content-length'))||0;}
  return {supported:true,count:keys.length,bytes};
}
export async function pruneMedia(limitMB,cacheStorage=globalThis.caches){
  if(!cacheStorage)return;const cache=await cacheStorage.open(MEDIA_CACHE),keys=await cache.keys(),entries=[];let total=0;
  for(const key of keys){const r=await cache.match(key),bytes=Number(r?.headers.get('X-Twitter-Bytes'))||0;entries.push({key,bytes});total+=bytes;}
  while(entries.length&&(total>limitMB*1024*1024||entries.length>1500)){const item=entries.shift();await cache.delete(item.key);total-=item.bytes;}
}
export async function setCacheLimit(limitMB){
  if(!CACHE_OPTIONS.includes(limitMB))throw new Error('Invalid cache limit');
  if(globalThis.caches){const cache=await caches.open('twitter-device-settings');await cache.put(new Request(new URL('./cache-limit',location.href)),new Response(String(limitMB)));await pruneMedia(limitMB);}
  globalThis.navigator?.serviceWorker?.controller?.postMessage({type:'cache-limit',limitMB});
}
export async function getCacheLimit(){try{const cache=await caches.open('twitter-device-settings'),r=await cache.match(new URL('./cache-limit',location.href));const value=r?Number(await r.text()):100;return CACHE_OPTIONS.includes(value)?value:100;}catch{return 100;}}
export async function clearMediaCache(){if(globalThis.caches)await caches.delete(MEDIA_CACHE);navigator.serviceWorker?.controller?.postMessage({type:'clear-media-cache'});}
// A single observer delays asset reads as well as network requests until nearby.
export function createMediaLoader(){
  const callbacks=new WeakMap();
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);callbacks.get(entry.target)?.();callbacks.delete(entry.target);}},{rootMargin:'600px'}):null;
  return {near(el,load){if(observer){callbacks.set(el,load);observer.observe(el);}else load();},disconnect(){observer?.disconnect();}};
}
