import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {animate,reconcileFeed,installDialogMotion,likeFeedback} from '../docs/motion.mjs';
const setup=()=>{const {document,window}=parseHTML('<html><body><div id="feed"></div><dialog></dialog></body></html>');globalThis.document=document;globalThis.matchMedia=()=>({matches:false});return {document,window,feed:document.getElementById('feed')};};
const create=p=>{const row=document.createElement('article');row.className='tweet';row.dataset.key=p.key;row.append(document.createElement('video'));return row;};
test('feed refresh retains identical tweet and video nodes; updates changed content and removes old posts',()=>{
 const {feed}=setup(),posts=[{key:'a',text:'one'},{key:'b',text:'two'}];reconcileFeed(feed,posts,{create});const a=feed.children[0],video=a.firstChild;reconcileFeed(feed,[...posts,{key:'c',text:'three'}],{create,mode:'older'});assert.equal(feed.children[0],a);assert.equal(a.firstChild,video);reconcileFeed(feed,[posts[1],{key:'c',text:'changed'}],{create});assert.deepEqual([...feed.children].map(r=>r.dataset.key),['b','c']);assert.equal(feed.children[1]._fingerprint,JSON.stringify({key:'c',text:'changed'}));
});
test('only added visible rows enter; stagger is capped and refresh does not replay entrances',()=>{
 const {feed}=setup(),calls=[];feed.getBoundingClientRect=()=>({top:0,left:0});const make=p=>{const row=create(p);row.getBoundingClientRect=()=>({top:10,bottom:80,height:70,width:400,left:0});row.animate=(frames,options)=>{calls.push({key:p.key,frames,options});return {finished:Promise.resolve()};};return row;};
 const posts=Array.from({length:12},(_,i)=>({key:String(i)}));reconcileFeed(feed,posts,{create:make,mode:'older'});assert.equal(calls.length,12);assert.equal(Math.max(...calls.map(c=>c.options.delay)),150);calls.length=0;reconcileFeed(feed,posts,{create:make});assert.equal(calls.length,0);
});
test('reduced motion disables JS motion and removes filtered tweets immediately',()=>{
 const {feed}=setup();globalThis.matchMedia=()=>({matches:true});let calls=0;const make=p=>{const row=create(p);row.getBoundingClientRect=()=>({top:0,bottom:100,height:100,width:400,left:0});row.animate=()=>{calls++;return {finished:Promise.resolve()};};return row;};reconcileFeed(feed,[{key:'a'}],{create:make,mode:'new'});assert.equal(animate(feed.children[0],[{opacity:0},{opacity:1}]),null);reconcileFeed(feed,[],{create:make});assert.equal(feed.children.length,0);assert.equal(calls,0);
});
test('dialog dismissal waits for exit, Escape follows the same path, and reopening cancels stale dismissal',async()=>{
 const {document,window}=setup(),modal=document.querySelector('dialog');let closed=0,finish;modal.open=true;modal.close=()=>{closed++;modal.open=false;};modal.animate=()=>({finished:new Promise(resolve=>finish=resolve)});const motion=installDialogMotion(modal);modal.close();assert.equal(closed,0);const staleFinish=finish;motion.open();staleFinish();await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,0);
 const cancel=new window.Event('cancel',{cancelable:true});modal.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,1);
});
test('heart feedback animates the SVG and cleans up its decorative ring',async()=>{
 const {document}=setup(),button=document.createElement('button');button.innerHTML='<svg></svg>';let options;button.animate=()=>{};button.firstChild.animate=(frames,o)=>{options=o;return {finished:Promise.resolve()};};likeFeedback(button,true);assert.equal(options.duration,280);await new Promise(resolve=>setImmediate(resolve));assert.equal(button.querySelector('.like-ring'),null);
});
test('photo opens from and returns to the thumbnail before dialog dismissal',async()=>{
 const {document}=setup(),modal=document.querySelector('dialog'),source=document.createElement('img'),photo=document.createElement('img');source.getBoundingClientRect=()=>({left:20,top:30,width:100,height:80,bottom:110});photo.className='lightbox-photo';photo.getBoundingClientRect=()=>({left:10,top:10,width:400,height:320,bottom:330});document.body.append(source);modal.append(photo);modal.open=true;let closed=false,frames=[];modal.close=()=>{closed=true;};modal.animate=()=>({finished:Promise.resolve()});photo.animate=f=>{frames.push(f);return {finished:Promise.resolve()};};const motion=installDialogMotion(modal);motion.open();Object.defineProperty(photo,'complete',{value:true});motion.photo(photo,source);assert.match(frames[0][0].transform,/scale\(0.25,0.25\)/);modal.close();await new Promise(resolve=>setImmediate(resolve));assert.match(frames[1][1].transform,/scale\(0.25,0.25\)/);assert.equal(closed,true);
});
test('removed rows fade as inert overlays while retained rows animate into the gap',async()=>{
 const {feed}=setup(),calls=[];feed.getBoundingClientRect=()=>({top:0,left:0});const make=p=>{const row=create(p);row.getBoundingClientRect=()=>{const index=[...feed.children].filter(r=>!r.classList.contains('tweet-leaving')).indexOf(row);return {top:Math.max(0,index)*100,left:0,width:400,height:100,bottom:Math.max(0,index)*100+100};};row.animate=(f,o)=>{calls.push({key:p.key,f,o});return {finished:Promise.resolve()};};return row;};reconcileFeed(feed,[{key:'a'},{key:'b'}],{create:make});const b=feed.children[1];reconcileFeed(feed,[{key:'b'}],{create:make});assert.equal(feed.querySelector('.tweet-leaving').inert,true);assert.equal(feed.querySelector('.tweet-leaving').getAttribute('aria-hidden'),'true');assert.equal(calls.find(c=>c.key==='b').f[0].transform,'translateY(100px)');await new Promise(resolve=>setImmediate(resolve));assert.equal(feed.children.length,1);assert.equal(feed.children[0],b);
});
