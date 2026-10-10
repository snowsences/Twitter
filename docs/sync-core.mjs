export const fields=['clock','timezone','bookmarks','muted_terms'];
// Firestore can reorder map fields. Compare values rather than insertion order,
// including nested speed segments, profile restarts, and activity shifts.
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));return value;}
export const sameState=(a,b)=>JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null));
const same=sameState;
export function stateDelta(before={},after={}){return Object.fromEntries(fields.filter(k=>!same(before[k],after[k])).map(k=>[k,{before:before[k]??null,after:after[k]??null}]));}
export function mergeDelta(old={},fresh={}){const result={...old};for(const [key,value] of Object.entries(fresh))result[key]={before:old[key]?old[key].before:value.before,after:value.after};return result;}
export function applyDelta(remote={},delta={}){
  const result={...remote};
  for(const [field,{before,after}] of Object.entries(delta)){
    if(field==='bookmarks'){const previous=new Set(before||[]),next=new Set(after||[]),current=new Set(remote.bookmarks||[]);for(const x of previous)if(!next.has(x))current.delete(x);for(const x of next)if(!previous.has(x))current.add(x);result.bookmarks=[...current];}
    else if(field==='muted_terms'){const prev=new Map((before||[]).map(r=>[r.id,r])),next=new Map((after||[]).map(r=>[r.id,r])),current=new Map((remote.muted_terms||[]).map(r=>[r.id,r]));for(const id of prev.keys())if(!next.has(id))current.delete(id);for(const [id,rule] of next)if(!same(rule,prev.get(id)))current.set(id,rule);result.muted_terms=[...current.values()];}
    else if(field==='clock'){if(!same(remote.clock,before)&&!same(remote.clock,after))throw new Error('Local and cloud playback differ. In Settings, choose “Use cloud playback” to resolve this and sync your other changes.');result.clock=after;}
    else result[field]=after;
  }
  return result;
}
export function packPosts(posts,maxBytes=650000){const enc=new TextEncoder(),chunks=[];let items=[],bytes=2;for(const post of posts){const json=JSON.stringify(post),size=enc.encode(json).length+1;if(size>maxBytes)throw new Error('A post is too large to sync.');if(bytes+size>maxBytes){chunks.push(JSON.stringify(items));items=[];bytes=2;}items.push(post);bytes+=size;}if(items.length)chunks.push(JSON.stringify(items));return chunks;}
export async function digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function cloudImages(record,urls){const r=structuredClone(record);if(r.image?.asset_key&&urls[r.image.asset_key]){r.image.source_url ||= r.image.url;r.image.url=urls[r.image.asset_key];};for(const m of [...(r.media||[]),...(r.quoted_post?.media||[])]){if(m.asset_key&&urls[m.asset_key]){m.source_url ||= m.url;m.url=urls[m.asset_key];};if(m.poster_asset_key&&urls[m.poster_asset_key]){m.poster_source_url ||= m.poster_url;m.poster_url=urls[m.poster_asset_key];};}return r;}
export function assetKeys(profile,posts){return [...new Set([profile.image?.asset_key,...posts.flatMap(p=>[...(p.media||[]),...(p.quoted_post?.media||[])].flatMap(m=>[m.asset_key,m.poster_asset_key]))].filter(Boolean))];}
