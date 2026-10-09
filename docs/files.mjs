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
export async function readFile(file){
  if(file.size>600*1024*1024)throw new Error('File exceeds 600 MB.');
  if(file.name.toLowerCase().endsWith('.zip')){const bytes=new Uint8Array(await file.arrayBuffer());validateZip(bytes);const entries=unzipSync(bytes);
    for(const name of Object.keys(entries))if(!safePath(name))throw new Error('Unsafe path in ZIP');
    const json=entries['backup.json']||entries['archive.json'];if(!json)throw new Error('ZIP must contain archive.json or backup.json.');return {data:JSON.parse(strFromU8(json)),entries};}
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
  for(const p of normalized.posts){for(const m of p.media){attach(m,'local_path','asset_key');attach(m,'poster_local_path','poster_asset_key');}for(const m of p.quoted_post?.media||[])attach(m,'local_path','asset_key');}
  const previous=existing.profiles.find(p=>p.handle===normalized.profile.handle);let profile=normalized.profile;
  if(previous){const earlier=existing.state?.clock||previous.first_created_at<=profile.first_created_at?previous:profile;
    profile={...previous,...profile,display_name:profile.display_name===profile.handle?previous.display_name:profile.display_name,image:profile.image?.asset_key?profile.image:previous.image?.asset_key?previous.image:profile.image||previous.image,first_created_at:earlier.first_created_at,first_post_id:earlier.first_post_id,first_day:earlier.first_day};}
  const oldPosts=new Map(existing.posts.map(p=>[p.key,p]));
  const posts=normalized.posts.map(p=>mergePost(oldPosts.get(p.key),p));
  return {profiles:[profile],posts,assets,missing,duplicates:posts.filter(p=>oldPosts.has(p.key)).length};
}
export async function makeBackup(data,assets){
  const entries={},manifest={schema:'twitter-replay-backup',version:1,exported_at:new Date().toISOString(),profiles:data.profiles,posts:data.posts,state:data.state,assets:[]};
  for(let i=0;i<assets.length;i++){const a=assets[i],path=`assets/${i}.bin`;entries[path]=new Uint8Array(await a.blob.arrayBuffer());manifest.assets.push({key:a.key,path,type:a.blob.type});}
  entries['backup.json']=strToU8(JSON.stringify(manifest));return new Blob([zipSync(entries,{level:0})],{type:'application/zip'});
}
export function restoreBackup(input){const a=input.data;
  if(a?.schema!=='twitter-replay-backup'||a.version!==1||!Array.isArray(a.profiles)||!Array.isArray(a.posts)||!Array.isArray(a.assets)||!a.state)throw new Error('Invalid Twitter backup');
  const profileMap=new Map();
  for(const p of a.profiles){if(!/^[a-z0-9_]{1,15}$/.test(p.handle)||!Number.isInteger(p.first_day)||typeof p.first_post_id!=='string'||!Number.isFinite(Date.parse(p.first_created_at)))throw new Error('Invalid backup profile');profileMap.set(p.handle,p);}
  for(const p of a.posts){if(!profileMap.has(p.profile_handle)||p.key!==p.profile_handle+':'+p.id||typeof p.text!=='string'||!Array.isArray(p.media)||!Number.isFinite(Date.parse(p.created_at))||!Number.isInteger(p.original_day)||!Number.isInteger(p.original_seconds)||p.original_seconds<0||p.original_seconds>=86400||typeof p.author?.handle!=='string')throw new Error('Invalid backup post');}
  const clock=a.state.clock;
  if(clock){if(!Number.isFinite(clock.started_at)||!Number.isInteger(clock.start_day)||typeof clock.zone!=='string'||!Array.isArray(clock.segments)||!clock.segments.length)throw new Error('Invalid backup clock');new Intl.DateTimeFormat('en',{timeZone:clock.zone});let last=-1;for(const s of clock.segments){if(!Number.isInteger(s.replay_day)||s.replay_day<=last||!Number.isFinite(s.source_day)||![0.5,1,2,5,10].includes(s.speed))throw new Error('Invalid backup speed history');last=s.replay_day;}}
  if(!Array.isArray(a.state.bookmarks))throw new Error('Invalid bookmarks');
  if(a.state.muted_terms!==undefined){if(!Array.isArray(a.state.muted_terms)||a.state.muted_terms.length>500)throw new Error('Invalid muted terms');a.state.muted_terms=a.state.muted_terms.map(validateMuteRule);}
  const assets=a.assets.map(item=>{if(!safePath(item.path)||!input.entries[item.path]||typeof item.key!=='string'||!/^image\/(jpeg|png|webp|gif|avif)$/.test(item.type))throw new Error('Backup is missing an image');return {key:item.key,blob:new Blob([input.entries[item.path]],{type:item.type})};});
  return {profiles:a.profiles,posts:a.posts,state:a.state,assets};
}
