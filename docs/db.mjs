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
export async function write({profiles=[],posts=[],assets=[],state}){const db=await openDB(),tx=db.transaction(['profiles','posts','assets','meta'],'readwrite'),complete=done(tx);
  for(const p of profiles)tx.objectStore('profiles').put(p);for(const p of posts)tx.objectStore('posts').put(p);for(const a of assets)tx.objectStore('assets').put(a);if(state)tx.objectStore('meta').put(state,'state');await complete;}
export async function getAsset(key){const db=await openDB(),tx=db.transaction('assets','readonly');return request(tx.objectStore('assets').get(key));}
export async function allAssets(){const db=await openDB(),tx=db.transaction('assets','readonly');return request(tx.objectStore('assets').getAll());}
export async function replaceAll(data){const db=await openDB(),tx=db.transaction(['profiles','posts','assets','meta'],'readwrite'),complete=done(tx);
  for(const name of ['profiles','posts','assets','meta'])tx.objectStore(name).clear();
  for(const p of data.profiles)tx.objectStore('profiles').put(p);for(const p of data.posts)tx.objectStore('posts').put(p);for(const a of data.assets)tx.objectStore('assets').put(a);tx.objectStore('meta').put(data.state,'state');await complete;}
