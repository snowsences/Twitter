import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
test('media worker applies cache-off and clearing, including an in-flight image response',async()=>{
  const handlers={},maps=new Map(),key=v=>typeof v==='string'?v:v.url,cacheStorage={keys:async()=>[...maps.keys()],open:async name=>{if(!maps.has(name))maps.set(name,new Map());const map=maps.get(name);return {keys:async()=>[...map.keys()],match:async k=>map.get(key(k))?.clone(),put:async(k,r)=>map.set(key(k),r),delete:async k=>map.delete(key(k))};},delete:async name=>maps.delete(name),match:async()=>undefined};let fetches=0,resolveFetch;
  const self={registration:{scope:'https://example.test/docs/'},location:{origin:'https://example.test'},addEventListener:(name,handler)=>handlers[name]=handler};
  runInNewContext(await readFile(new URL('../docs/sw.js',import.meta.url),'utf8'),{self,caches:cacheStorage,URL,Request,Response,Headers,fetch:async()=>{fetches++;return resolveFetch?await new Promise(resolve=>resolveFetch=resolve):new Response('image');}});
  await new Promise(r=>setImmediate(r));const request=url=>{const r=new Request(url);Object.defineProperty(r,'destination',{value:'image'});return r;};
  const fetchImage=async url=>{let result;handlers.fetch({request:request(url),respondWith:p=>result=p});return await result;};
  const message=async data=>{let result;handlers.message({data,waitUntil:p=>result=p});await result;};const url='https://res.cloudinary.com/myranker/image/upload/a.jpg';
  assert.equal(await (await fetchImage(url)).text(),'image');assert.equal(maps.get('twitter-media-v1').size,1);await fetchImage(url);assert.equal(fetches,1);
  await message({type:'cache-limit',limitMB:0});assert.equal(maps.get('twitter-media-v1').size,0);await fetchImage(url);assert.equal(fetches,2);assert.equal(maps.get('twitter-media-v1').size,0);
  await message({type:'cache-limit',limitMB:25});resolveFetch=true;const pending=fetchImage(url+'?new');await new Promise(r=>setImmediate(r));await message({type:'clear-media-cache'});const complete=resolveFetch;resolveFetch=null;complete(new Response('late image'));assert.equal(await (await pending).text(),'late image');assert.equal(maps.get('twitter-media-v1')?.size||0,0,'clearing must not be undone by an in-flight response');
});
