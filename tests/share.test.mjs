import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapText,paginate,canShareImages,shareImages,renderTweetImage} from '../docs/share.mjs';

test('export wrapping preserves paragraphs and whole emoji when breaking long words',()=>{
  assert.deepEqual(wrapText('one two\n\nthree',7,s=>s.length),['one two','','three']);
  const family='👨‍👩‍👧‍👦';
  assert.deepEqual(wrapText(family.repeat(3),family.length,s=>s.length),[family,family,family]);
  assert.equal(wrapText('abcdefghijk',4,s=>s.length).join(''),'abcdefghijk');
});
test('long exports preserve every block across pages and reject unsafe sizes',()=>{
  const blocks=Array.from({length:20},(_,i)=>({text:String(i),height:38}));
  const pages=paginate(blocks,100);
  assert.equal(pages.length,10);assert.deepEqual(pages.flat(),blocks);
  assert.throws(()=>paginate([{height:101}],100),/too large/);
  assert.throws(()=>paginate(Array.from({length:17},()=>({height:100})),100),/too long/);
});
test('native file sharing starts synchronously from the tap and preserves cancellation',async()=>{
  const files=[new Blob(['image'],{type:'image/png'})];let called=false;
  const nav={canShare:payload=>payload.files===files,share:payload=>{called=true;assert.deepEqual(payload,{files});return Promise.resolve();}};
  assert.equal(canShareImages(files,nav),true);
  const pending=shareImages(files,nav);assert.equal(called,true);await pending;
  assert.equal(canShareImages(files,{}),false);
  assert.equal(canShareImages(files,{share(){},canShare(){throw Error('unsupported');}}),false);
  await assert.rejects(shareImages(files,{share(){return Promise.reject(new DOMException('Canceled','AbortError'));}}),{name:'AbortError'});
});
test('export includes repost attribution, quote and dates; unavailable photos are reported',async()=>{
  const drawn=[];const ctx={font:'',measureText:s=>({width:s.length*13}),scale(){},fillRect(){},save(){},restore(){},beginPath(){},arc(){},clip(){},fillText:s=>drawn.push(s),moveTo(){},lineTo(){},stroke(){}};
  globalThis.document={createElement:()=>({getContext:()=>ctx,toBlob:callback=>callback(new Blob(['png'],{type:'image/png'}))})};
  const result=await renderTweetImage({id:'123',type:'retweet',profile_handle:'alice',author:{handle:'bob',display_name:'Bob'},text:'Hello world',created_at:'2010-01-01T12:00:00Z',replay_at:Date.UTC(2026,0,1,12),media:[{type:'photo',url:null}],quoted_post:{text:'Quoted words',media:[]}},{profiles:[{handle:'alice',display_name:'Alice'}]});
  assert.equal(result.files[0].name,'Twitter-bob-123.png');assert.equal(result.files[0].type,'image/png');
  assert.equal(result.missing.length,1);
  for(const text of ['Alice reposted','Bob','@bob','Hello world','Quoted words','Image unavailable'])assert.ok(drawn.includes(text),text);
  assert.ok(drawn.some(s=>s.startsWith('Originally posted Jan 1, 2010')));
  assert.ok(drawn.some(s=>s.startsWith('Replayed Jan 1, 2026')));
});
