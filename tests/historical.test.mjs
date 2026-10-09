import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeArchive,newReplayClock,newClock,dueAt,profileStatus,available,restartProfile,setSpeed,parts,DAY} from '../docs/core.mjs';
import {makeBackup,readFile,restoreBackup} from '../docs/files.mjs';
const start=Date.UTC(2026,0,1,12);
const archive=(handle,dates)=>normalizeArchive({schema:'x-profile-archive',schema_version:1,profile:{handle},posts:dates.map((date,i)=>({id:String(i+1),text:'Post',created_at:date,author:{handle},media:[]}))},'UTC');
const a=archive('alice',['2000-01-01T09:00:00Z','2018-01-01T17:00:00Z']);
const b=archive('bob',['2006-01-01T15:45:00Z','2009-01-01T18:20:00Z']);
const posts=[...a.posts,...b.posts],profiles=[a.profile,b.profile];
test('historical default introduces and finishes accounts at their natural positions',()=>{
  const clock=newReplayClock(start,'UTC',posts);assert.equal(clock.mode,'historical');
  assert.equal(dueAt(a.posts[0],a.profile,clock),start);
  const appears=dueAt(b.posts[0],b.profile,clock),ends=dueAt(b.posts[1],b.profile,clock);
  assert.equal(parts(appears,'UTC').day-clock.start_day,b.posts[0].original_day-a.posts[0].original_day);
  assert.equal(parts(appears,'UTC').seconds,15*3600+45*60);
  assert.equal(profileStatus(posts,b.profile,clock,start).posted,0);
  assert.equal(profileStatus(posts,b.profile,clock,start).appears,appears);
  assert.equal(profileStatus(posts,b.profile,clock,ends).finished,true);
  assert.equal(profileStatus(posts,a.profile,clock,ends).finished,false);
  assert.equal(available(posts,profiles,clock,start).length,1);
});
test('starting later skips old records and allows profiles already finished to restart',()=>{
  const origin=parts(Date.UTC(2010,0,1),'UTC').day,clock=newReplayClock(start,'UTC',posts,{origin_day:origin});
  assert.equal(dueAt(a.posts[0],a.profile,clock),Infinity);
  const status=profileStatus(posts,b.profile,clock,start);assert.equal(status.finished,true);assert.equal(status.skipped,2);assert.equal(status.playable,0);
  const restarted=restartProfile(clock,b.profile,start+DAY);
  assert.equal(dueAt(b.posts[0],b.profile,restarted),start+DAY);
  assert.equal(profileStatus(posts,b.profile,restarted,start+DAY).skipped,0);
  assert.equal(dueAt(a.posts[1],a.profile,restarted),dueAt(a.posts[1],a.profile,clock));
  assert.throws(()=>newReplayClock(start,'UTC',posts,{origin_day:origin+10000}),/starting date/);
});
test('historical day speed compresses shared offsets but preserves first posting clock times',()=>{
  const clock=newReplayClock(start,'UTC',posts);clock.segments[0].speed=2;
  const due=dueAt(b.posts[0],b.profile,clock);
  assert.equal(parts(due,'UTC').day-clock.start_day,Math.floor((b.posts[0].original_day-clock.origin_day)/2));assert.equal(parts(due,'UTC').seconds,b.posts[0].original_seconds);
  const changed=setSpeed(clock,5,start+DAY);assert.equal(dueAt(a.posts[0],a.profile,changed),start);
});
test('legacy clocks and optional aligned mode retain their previous schedule',()=>{
  for(const clock of [newClock(start,'UTC'),newReplayClock(start,'UTC',posts,{mode:'aligned'})])assert.equal(dueAt(b.posts[0],b.profile,clock),start);
});
test('later imports do not move the origin or reschedule existing posts',()=>{
  const clock=newReplayClock(start,'UTC',posts),before=dueAt(b.posts[0],b.profile,clock);
  const old=archive('old',['1995-01-01T12:00:00Z']);assert.equal(dueAt(old.posts[0],old.profile,clock),Infinity);
  assert.equal(dueAt(b.posts[0],b.profile,clock),before);
});
test('historical playback and restarts survive backup and reject malformed origins',async()=>{
  const clock=restartProfile(newReplayClock(start,'UTC',posts),b.profile,start+DAY),blob=await makeBackup({profiles,posts,state:{clock,bookmarks:[]}},[]);
  const input=await readFile({name:'backup.zip',size:blob.size,arrayBuffer:()=>blob.arrayBuffer()});assert.deepEqual(restoreBackup(input).state.clock,clock);
  input.data.state.clock.origin_day='bad';assert.throws(()=>restoreBackup(input),/historical starting date/);
});
