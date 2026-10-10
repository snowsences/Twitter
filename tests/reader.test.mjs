import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {normalizeArchive,dueAt,newReplayClock,mergePost,parts} from '../docs/core.mjs';
import {stageArchive,stageOriginalDates} from '../docs/files.mjs';
import {windowRange,createFeedWindow} from '../docs/feed-window.mjs';
import {imageVariant,cacheStats,pruneMedia,createMediaLoader} from '../docs/media.mjs';
import {activityForecast,unreadBoundary} from '../docs/activity.mjs';
import * as DB from '../docs/db.mjs';

test('normalization preserves genuine original dates without changing replay dates',()=>{
  const raw={schema:'x-profile-archive',schema_version:1,profile:{handle:'alice'},posts:[{id:'1',text:'original',author:{handle:'alice'},created_at:'2013-01-01T18:00:00Z',original_created_at:'2007-02-20T18:00:00Z',media:[]}]};
  const a=normalizeArchive(raw,'America/Los_Angeles'),p=a.posts[0],clock=newReplayClock(Date.parse('2026-01-01T18:00:00Z'),'America/Los_Angeles',a.posts);
  assert.equal(p.original_created_at,'2007-02-20T18:00:00.000Z');assert.equal(p.created_at,'2013-01-01T18:00:00.000Z');assert.equal(parts(dueAt(p,a.profile,clock),'America/Los_Angeles').seconds,36000);
  const patched=stageOriginalDates({data:{schema:'twitter-original-dates',version:1,posts:[{key:'alice:1',original_created_at:'2007-02-19T18:00:00Z'}]}},a);
  assert.equal(patched.matched,1);assert.equal(patched.posts[0].original_day,p.original_day);assert.equal(patched.posts[0].original_seconds,p.original_seconds);assert.equal(patched.posts[0].created_at,p.created_at);assert.equal(patched.posts[0].original_created_at,'2007-02-19T18:00:00.000Z');
  const old={...p,original_created_at:'2007-02-19T18:00:00.000Z'};const fresh={...p};delete fresh.original_created_at;assert.equal(mergePost(old,fresh).original_created_at,old.original_created_at);
  assert.throws(()=>stageOriginalDates({data:{schema:'twitter-original-dates',version:1,posts:[{key:'alice:1',original_created_at:'bad'}]}},a),/Invalid original date/);
});
test('import reports distinguish new records, merged records, altered scheduling, and missing media',()=>{
  const archive={schema:'x-profile-archive',schema_version:1,profile:{handle:'alice'},posts:[{id:'1',text:'one',author:{handle:'alice'},created_at:'2010-01-01T10:00:00Z',media:[]}]};
  const existing=normalizeArchive(archive,'UTC');archive.posts[0].created_at='2013-01-01T10:00:00Z';archive.posts.push({id:'2',text:'two',author:{handle:'alice'},created_at:'2013-01-02T10:00:00Z',media:[{type:'photo',url:'https://example.test/a.jpg',local_path:'missing.jpg'}]});
  const r=stageArchive({data:archive,entries:{}},{profiles:[existing.profile],posts:existing.posts},'UTC','new');assert.equal(r.report.newPosts,1);assert.equal(r.report.merged,1);assert.equal(r.report.datesChanged,1);assert.equal(r.report.missingImages,1);assert.equal(r.posts[0].original_created_at,'2010-01-01T10:00:00.000Z');
});
test('long feed keeps bounded cards and preserves existing nodes on like updates',()=>{
  const {document}=parseHTML('<div id="feed"></div>');const priorDocument=globalThis.document;globalThis.document=document;const feed=document.getElementById('feed');let y=0;feed.getBoundingClientRect=()=>({top:-y,height:100000,bottom:100000-y});
  const posts=Array.from({length:2000},(_,i)=>({key:'alice:'+i,text:'hello',media:[]})),window=createFeedWindow(feed,{create:p=>{const a=document.createElement('article');a.className='tweet';a.dataset.key=p.key;return a;},update:(row,p)=>row.setAttribute('aria-label',p.key)});
  try{window.set(posts);assert.ok(window.mounted()<=60);assert.ok(window.mounted()>0);const row=feed.querySelector('article');window.set(posts);assert.equal(feed.querySelector('article'),row);y=8000;window.set(posts);assert.ok(window.mounted()<=60);assert.ok(parseFloat(feed.firstElementChild.style.height)>0);assert.notEqual(feed.querySelector('article').dataset.key,'alice:0');y=0;window.set(posts);assert.equal(feed.querySelector('article').dataset.key,'alice:0');window.destroy();}finally{globalThis.document=priorDocument;}
  const prefix=Array.from({length:2001},(_,i)=>i*200),range=windowRange(prefix,10000,800);assert.ok(range.last-range.first<=60);assert.ok(range.first<=50&&range.last>50);
});
test('forecast uses actual scheduled speed, excludes muted posts, and never exposes future text',()=>{
  const now=100000,day=86400000,posts=[{profile_handle:'a',replay_at:now-1,text:'old',media:[]},{profile_handle:'a',replay_at:now+day,text:'next',media:[]},{profile_handle:'b',replay_at:now+2*day,text:'hidden',media:[]},{profile_handle:'c',replay_at:Infinity,text:'future',media:[]}];
  const forecast=activityForecast(posts,now,30,[{term:'hidden',handles:[]}]);assert.deepEqual(forecast.active,['a']);assert.equal(forecast.total,1);assert.equal(forecast.daily.reduce((a,b)=>a+b,0),1);assert.equal(forecast.perDay,1/30);assert.equal(JSON.stringify(forecast).includes('hidden'),false);
  assert.deepEqual(unreadBoundary([{replay_at:30},{replay_at:20},{replay_at:10}],15),{index:2,newCount:2});assert.equal(unreadBoundary([{replay_at:10}],15),null);
});
test('media URLs use small feed derivatives and leave originals, signed URLs and videos intact',()=>{
  const original='https://res.cloudinary.com/myranker/image/upload/v123/abc.jpg';assert.match(imageVariant(original,400),/c_limit,w_400,q_auto,f_auto\/v123\/abc.jpg/);assert.equal(original,'https://res.cloudinary.com/myranker/image/upload/v123/abc.jpg');assert.equal(imageVariant('https://video.twimg.com/abc.mp4'),'https://video.twimg.com/abc.mp4');assert.equal(imageVariant('https://res.cloudinary.com/myranker/image/upload/s--signed--/abc.jpg'), 'https://res.cloudinary.com/myranker/image/upload/s--signed--/abc.jpg');
});
test('cache pruning respects byte limits and never touches other storage',async()=>{
  const values=new Map(Array.from({length:3},(_,i)=>['image'+i,new Response('x',{headers:{'X-Twitter-Bytes':String(20*1048576)}})]));const cache={keys:async()=>[...values.keys()],match:async key=>values.get(key),delete:async key=>values.delete(key)},storage={open:async name=>{assert.equal(name,'twitter-media-v1');return cache;}};
  assert.equal((await cacheStats(storage)).bytes,60*1048576);await pruneMedia(25,storage);assert.deepEqual([...values.keys()],['image2']);await pruneMedia(0,storage);assert.equal(values.size,0);
  await DB.write({assets:[{key:'reader-original',blob:new Blob(['pending'])},{key:'reader-remote',url:'https://example.test/cloud.jpg'}]});const stats=await DB.assetStats();assert.equal(stats.bytes,7);assert.equal(stats.pending,1);assert.equal(stats.linked,1);
});
test('lazy loader does not read media until it approaches the viewport',()=>{
  let callback,observed,unobserved;const prior=globalThis.IntersectionObserver;globalThis.IntersectionObserver=class{constructor(cb){callback=cb;}observe(el){observed=el;}unobserve(el){unobserved=el;}disconnect(){}};let loads=0;const loader=createMediaLoader(),el={};try{loader.near(el,()=>loads++);assert.equal(observed,el);assert.equal(loads,0);callback([{target:el,isIntersecting:false}]);assert.equal(loads,0);callback([{target:el,isIntersecting:true}]);assert.equal(loads,1);assert.equal(unobserved,el);callback([{target:el,isIntersecting:true}]);assert.equal(loads,1);}finally{globalThis.IntersectionObserver=prior;}
});
