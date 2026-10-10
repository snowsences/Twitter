import {unzipSync,zipSync,strFromU8,strToU8} from './vendor/fflate.mjs';
import {normalizeArchive,mergePost,safeURL,validateMuteRule} from './core.mjs';
export function validateZip(bytes){
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(new DataView(bytes.buffer,bytes.byteOffset+i,4).getUint32(0,true)===0x06054b50){end=i;break;}}
  if(end<0)throw new Error('Invalid ZIP file');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),total=0;
  if(count>50000)throw new Error('Too many files in ZIP');
  for(let i=0;i<count;i++){if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw new Error('Invalid ZIP directory');
    const size=view.getUint32(pos+24,true);total+=size;if(size>120*1024*1024||total>600*1024*1024)throw new Error('ZIP is too large after extraction. Use a smaller archive.');
    pos+=46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
  }
}
const mime=name=>({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','gif':'image/gif','webp':'image/webp','avif':'image/avif'})[name.split('.').at(-1).toLowerCase()]||null;
export function safePath(name){return typeof name==='string'&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..')&&name.length<400;}
export async function readFile(file,onProgress=()=>{}){
  onProgress('reading');
  if(file.size>600*1024*1024)throw new Error('File exceeds 600 MB.');
  if(file.name.toLowerCase().endsWith('.zip')&&typeof Worker==='function'){
    const bytes=await file.arrayBuffer();onProgress('extracting');return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./archive-worker.mjs',import.meta.url),{type:'module'});worker.onmessage=event=>{worker.terminate();event.data.error?reject(new Error(event.data.error)):resolve(event.data);};worker.onerror=event=>{worker.terminate();reject(new Error(event.message||'Could not extract this archive. Reload and retry.'));};worker.postMessage(bytes,[bytes]);});
  }
  if(file.name.toLowerCase().endsWith('.zip')){const bytes=new Uint8Array(await file.arrayBuffer());validateZip(bytes);onProgress('extracting');const raw=unzipSync(bytes);
    for(const name of Object.keys(raw))if(!safePath(name))throw new Error('Unsafe path in ZIP');
    const usable=name=>!name.split('/').some(part=>part==='__MACOSX'||part.startsWith('._'));
    const manifests=Object.keys(raw).filter(name=>usable(name)&&['archive.json','backup.json'].includes(name.split('/').at(-1)));
    if(!manifests.length)throw new Error('ZIP must contain archive.json or backup.json, at the top level or inside a folder.');
    if(manifests.length>1)throw new Error('ZIP contains multiple archives. Import each profile ZIP separately.');
    const manifest=manifests[0],prefix=manifest.slice(0,manifest.lastIndexOf('/')+1),entries=Object.create(null);
    for(const [name,value] of Object.entries(raw))if(usable(name)&&name.startsWith(prefix))entries[name.slice(prefix.length)]=value;
    return {data:JSON.parse(strFromU8(raw[manifest])),entries};}
  return {data:JSON.parse(await file.text()),entries:{}};
}
export function stageArchive(input,existing,zone,namespace){
  const normalized=normalizeArchive(input.data,zone),assets=[],missing=[];
  function attach(item,pathField,assetField){const path=item?.[pathField];if(!path)return;
    if(!safePath(path)){missing.push(path);return;}const bytes=input.entries[path],type=mime(path);
    if(!bytes||!type){missing.push(path);return;}
    const key=namespace+':'+path;item[assetField]=key;assets.push({key,blob:new Blob([bytes],{type})});delete item[pathField];
  }
  attach(normalized.profile.image,'local_path','asset_key');
  for(const p of normalized.posts){for(const m of p.media){attach(m,'local_path','asset_key');attach(m,'poster_local_path','poster_asset_key');}for(const m of p.quoted_post?.media||[]){attach(m,'local_path','asset_key');attach(m,'poster_local_path','poster_asset_key');}}
  const previous=existing.profiles.find(p=>p.handle===normalized.profile.handle);let profile=normalized.profile;
  if(previous){const earlier=existing.state?.clock||previous.first_created_at<=profile.first_created_at?previous:profile;
    profile={...previous,...profile,display_name:profile.display_name===profile.handle?previous.display_name:profile.display_name,image:profile.image?.asset_key?profile.image:previous.image?.asset_key?previous.image:profile.image||previous.image,first_created_at:earlier.first_created_at,first_post_id:earlier.first_post_id,first_day:earlier.first_day};}
  const oldPosts=new Map(existing.posts.map(p=>[p.key,p]));
  let datesChanged=0,updated=0,newPosts=0;
  const posts=normalized.posts.map(p=>{const old=oldPosts.get(p.key),merged=mergePost(old,p);if(!old)newPosts++;else{if(old.created_at!==merged.created_at||old.reposted_at!==merged.reposted_at)datesChanged++;if(JSON.stringify(old)!==JSON.stringify(merged))updated++;}return merged;});
  return {profiles:[profile],posts,assets,missing,duplicates:posts.filter(p=>oldPosts.has(p.key)).length,report:{handle:profile.handle,processed:posts.length,newPosts,merged:posts.length-newPosts,updated,datesChanged,imagesIncluded:assets.length,missingImages:missing.length}};
}
export function stageOriginalDates(input,existing){
  const a=input.data;if(a?.schema!=='twitter-original-dates'||a.version!==1||!Array.isArray(a.posts)||a.posts.length>100000)throw new Error('Invalid original dates file.');
  const originals=new Map();for(const p of a.posts){if(typeof p.key!=='string'||! /^[a-z0-9_]{1,15}:\d{1,25}$/.test(p.key)||!Number.isFinite(Date.parse(p.original_created_at))||(p.original_reposted_at&&!Number.isFinite(Date.parse(p.original_reposted_at))))throw new Error('Invalid original date record. No dates were changed.');if(originals.has(p.key))throw new Error('Duplicate original date record.');originals.set(p.key,p);}
  const posts=existing.posts.filter(p=>originals.has(p.key)).map(p=>{const date=originals.get(p.key);return {...p,original_created_at:new Date(date.original_created_at).toISOString(),...(date.original_reposted_at?{original_reposted_at:new Date(date.original_reposted_at).toISOString()}:{})};});
  return {posts,matched:posts.length,unmatched:originals.size-posts.length};
}
export function applyOriginalDateIndex(input,index=[]){const dates=new Map(index.map(p=>[p.key,p]));return {...input,data:{...input.data,posts:input.data.posts.map(p=>{const date=dates.get(String(input.data.profile.handle).replace(/^@/,'').toLowerCase()+':'+p.id);return date?{...p,original_created_at:date.original_created_at,...(date.original_reposted_at?{original_reposted_at:date.original_reposted_at}:{})}:p;})}};}
export async function makeBackup(data,assets){
  const entries={},manifest={schema:'twitter-replay-backup',version:1,exported_at:new Date().toISOString(),profiles:data.profiles,posts:data.posts,state:data.state,assets:[]};
  for(let i=0;i<assets.length;i++){const a=assets[i];if(!a.blob)continue;const path=`assets/${i}.bin`;entries[path]=new Uint8Array(await a.blob.arrayBuffer());manifest.assets.push({key:a.key,path,type:a.blob.type});}
  entries['backup.json']=strToU8(JSON.stringify(manifest));return new Blob([zipSync(entries,{level:0})],{type:'application/zip'});
}
export function restoreBackup(input){const a=input.data;
  if(a?.schema!=='twitter-replay-backup'||a.version!==1||!Array.isArray(a.profiles)||!Array.isArray(a.posts)||!Array.isArray(a.assets)||!a.state)throw new Error('Invalid Twitter backup');
  const profileMap=new Map();
  for(const p of a.profiles){if(!/^[a-z0-9_]{1,15}$/.test(p.handle)||!Number.isInteger(p.first_day)||typeof p.first_post_id!=='string'||!Number.isFinite(Date.parse(p.first_created_at)))throw new Error('Invalid backup profile');profileMap.set(p.handle,p);}
  for(const p of a.posts){if(!profileMap.has(p.profile_handle)||p.key!==p.profile_handle+':'+p.id||typeof p.text!=='string'||!Array.isArray(p.media)||!Number.isFinite(Date.parse(p.created_at))||!Number.isInteger(p.original_day)||!Number.isInteger(p.original_seconds)||p.original_seconds<0||p.original_seconds>=86400||typeof p.author?.handle!=='string')throw new Error('Invalid backup tweet');}
  const clock=a.state.clock;
  if(clock){if(!Number.isFinite(clock.started_at)||!Number.isInteger(clock.start_day)||typeof clock.zone!=='string'||!Array.isArray(clock.segments)||!clock.segments.length)throw new Error('Invalid backup clock');new Intl.DateTimeFormat('en',{timeZone:clock.zone});let last=-1;for(const s of clock.segments){if(!Number.isInteger(s.replay_day)||s.replay_day<=last||!Number.isFinite(s.source_day)||![0.5,1,2,5,10].includes(s.speed))throw new Error('Invalid backup speed history');last=s.replay_day;}}
  if(clock?.mode!==undefined&&!['historical','aligned','balanced'].includes(clock.mode))throw new Error('Invalid replay mode');
  if(['historical','balanced'].includes(clock?.mode)&&(!Number.isInteger(clock.origin_day)||(clock.first_post_key!==null&&typeof clock.first_post_key!=='string')))throw new Error('Invalid historical starting date');
  if(clock?.mode==='balanced'&&(!clock.shift_days||typeof clock.shift_days!=='object'||Array.isArray(clock.shift_days)||Object.entries(clock.shift_days).some(([h,d])=>! /^[a-z0-9_]{1,15}$/.test(h)||!Number.isInteger(d)||Math.abs(d)>3653)||(clock.first_source_seconds!==null&&(!Number.isInteger(clock.first_source_seconds)||clock.first_source_seconds<0||clock.first_source_seconds>=86400))))throw new Error('Invalid activity shifts');
  if(clock?.restarts!==undefined){if(!clock.restarts||typeof clock.restarts!=='object'||Array.isArray(clock.restarts))throw new Error('Invalid profile restarts');for(const [handle,r] of Object.entries(clock.restarts)){if(!/^[a-z0-9_]{1,15}$/.test(handle)||!Number.isFinite(r?.started_at)||r.started_at<clock.started_at||!Number.isInteger(r.cycle)||r.cycle<2)throw new Error('Invalid profile restart');}}
  if(!Array.isArray(a.state.bookmarks))throw new Error('Invalid bookmarks');
  if(a.state.muted_terms!==undefined){if(!Array.isArray(a.state.muted_terms)||a.state.muted_terms.length>500)throw new Error('Invalid muted terms');a.state.muted_terms=a.state.muted_terms.map(validateMuteRule);}
  const assets=a.assets.map(item=>{if(!safePath(item.path)||!input.entries[item.path]||typeof item.key!=='string'||!/^image\/(jpeg|png|webp|gif|avif)$/.test(item.type))throw new Error('Backup is missing an image');return {key:item.key,blob:new Blob([input.entries[item.path]],{type:item.type})};});
  return {profiles:a.profiles,posts:a.posts,state:a.state,assets};
}

