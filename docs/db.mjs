import {stateDelta,mergeDelta} from './sync-core.mjs';
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Storage transaction aborted'));});
let opening;
export function openDB(){return opening ||= new Promise((resolve,reject)=>{
  const r=indexedDB.open('twitter-replay',1);
  r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('profiles',{keyPath:'handle'});db.createObjectStore('posts',{keyPath:'key'});db.createObjectStore('assets',{keyPath:'key'});db.createObjectStore('meta');};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
export async function load(){const db=await openDB(),tx=db.transaction(['profiles','posts','meta'],'readonly');const complete=done(tx);
  const [profiles,posts,state]=await Promise.all([request(tx.objectStore('profiles').getAll()),request(tx.objectStore('posts').getAll()),request(tx.objectStore('meta').get('state'))]);await complete;return {profiles,posts,state:state||{clock:null,bookmarks:[],reading_key:null}};}
export async function write({profiles=[],posts=[],assets=[],state,remote=false}){
  const db=await openDB(),tx=db.transaction(['profiles','posts','assets','meta'],'readwrite'),complete=done(tx),meta=tx.objectStore('meta');
  for(const p of profiles)tx.objectStore('profiles').put(p);for(const p of posts)tx.objectStore('posts').put(p);for(const a of assets)tx.objectStore('assets').put(a);
  if(remote){if(state)meta.put(state,'state');}
  else {let prior={};const previous=meta.get('state');previous.onsuccess=()=>{prior=previous.result||{};};const req=meta.get('cloud-outbox');req.onsuccess=()=>{const pending=req.result||{profiles:[],delta:{},generation:0},delta=state?stateDelta(prior,state):{};if(profiles.length||posts.length||Object.keys(delta).length){pending.profiles=[...new Set([...pending.profiles,...profiles.map(p=>p.handle),...posts.map(p=>p.profile_handle)].filter(Boolean))];pending.delta=mergeDelta(pending.delta,delta);pending.generation++;meta.put(pending,'cloud-outbox');}if(state)meta.put(state,'state');};}
  await complete;
}
export async function getAsset(key){const db=await openDB(),tx=db.transaction('assets','readonly');return request(tx.objectStore('assets').get(key));}
export async function allAssets(){const db=await openDB(),tx=db.transaction('assets','readonly');return request(tx.objectStore('assets').getAll());}
export async function replaceAll(data){const prior=(await load()).state;const db=await openDB(),tx=db.transaction(['profiles','posts','assets','meta'],'readwrite'),complete=done(tx);
  for(const name of ['profiles','posts','assets'])tx.objectStore(name).clear();
  for(const p of data.profiles)tx.objectStore('profiles').put(p);for(const p of data.posts)tx.objectStore('posts').put(p);for(const a of data.assets)tx.objectStore('assets').put(a);tx.objectStore('meta').put(data.state,'state');tx.objectStore('meta').put({profiles:data.profiles.map(p=>p.handle),delta:stateDelta(prior,data.state),generation:Date.now()},'cloud-outbox');await complete;}

export async function getMeta(key){const db=await openDB(),tx=db.transaction('meta','readonly');return request(tx.objectStore('meta').get(key));}
export async function putMeta(key,value){const db=await openDB(),tx=db.transaction('meta','readwrite'),complete=done(tx);tx.objectStore('meta').put(value,key);await complete;}
export async function queueProfiles(handles){await mutateMeta('cloud-outbox',old=>{const box=old||{profiles:[],delta:{},generation:0};box.profiles=[...new Set([...box.profiles,...handles])];box.generation++;return box;});}
export async function replaceProfile(profile,posts){const db=await openDB(),tx=db.transaction(['profiles','posts'],'readwrite'),complete=done(tx);const store=tx.objectStore('posts');const req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(c){if(c.value.profile_handle===profile.handle)c.delete();c.continue();}else{for(const p of posts)store.put(p);tx.objectStore('profiles').put(profile);}};await complete;}

export async function mutateMeta(key,change){const db=await openDB(),tx=db.transaction('meta','readwrite'),complete=done(tx);const store=tx.objectStore('meta');const req=store.get(key);req.onsuccess=()=>store.put(change(req.result),key);await complete;}

export async function releaseAssets(urls){const db=await openDB(),tx=db.transaction('assets','readwrite'),complete=done(tx);for(const [key,url] of Object.entries(urls))tx.objectStore('assets').put({key,url});await complete;}
