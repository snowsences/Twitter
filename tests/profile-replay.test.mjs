import test from 'node:test';
import assert from 'node:assert/strict';
import {newClock,normalizeArchive,dueAt,profileStatus,restartProfile,setSpeed,DAY,available} from '../docs/core.mjs';
import {stateDelta,applyDelta} from '../docs/sync-core.mjs';
const start=Date.UTC(2026,0,1,9);
function archive(handle,days){return normalizeArchive({schema:'x-profile-archive',schema_version:1,profile:{handle},posts:[0,days].map((day,i)=>({id:String(i+1),text:'Post',created_at:new Date(Date.UTC(2010,0,1,12)+day*DAY).toISOString(),author:{handle},media:[]}))},'UTC');}
test('a short profile can replay five runs while a long profile keeps its original schedule',()=>{
  const short=archive('short',730),long=archive('long',3650);let clock=newClock(start,'UTC');const originalLongEnd=dueAt(long.posts[1],long.profile,clock);
  assert.equal(profileStatus(short.posts,short.profile,null,start).posted,0);
  assert.equal(profileStatus(short.posts,short.profile,clock,start).posted,1);
  for(let cycle=1;cycle<=5;cycle++){
    const end=dueAt(short.posts[1],short.profile,clock),status=profileStatus(short.posts,short.profile,clock,end);
    assert.equal(status.finished,true);assert.equal(status.cycle,cycle);assert.equal(status.percent,100);
    assert.equal(dueAt(long.posts[1],long.profile,clock),originalLongEnd);
    if(cycle<5){clock=restartProfile(clock,short.profile,end);assert.equal(dueAt(short.posts[0],short.profile,clock),end);assert.equal(profileStatus(short.posts,short.profile,clock,end).posted,1);assert.equal(available(short.posts,[short.profile],clock,end).length,1);}
    else assert.equal(end,originalLongEnd);
  }
});
test('restarts preserve posting time and follow global speed changes including pending changes',()=>{
  const a=archive('alice',10);let clock=newClock(start,'UTC');clock=setSpeed(clock,2,start);const now=start+20*DAY;
  clock=restartProfile(clock,a.profile,now);
  assert.equal(dueAt(a.posts[1],a.profile,clock),Date.UTC(2026,0,26,12));
  clock=setSpeed(clock,5,now);
  assert.equal(dueAt(a.posts[1],a.profile,clock),Date.UTC(2026,0,23,12));
  assert.equal(dueAt(a.posts[0],a.profile,clock),now);
});
test('profile restarts persist in the synced clock with conflict detection and global reset clears them',()=>{
  const a=archive('alice',1),before=newClock(start,'UTC'),after=restartProfile(before,a.profile,start+2*DAY);
  assert.equal(before.restarts,undefined);
  assert.deepEqual(applyDelta({clock:before},stateDelta({clock:before},{clock:after})).clock,after);
  assert.throws(()=>applyDelta({clock:newClock(start+DAY,'UTC')},stateDelta({clock:before},{clock:after})),/Local and cloud playback differ/);
  assert.equal(newClock(start+3*DAY,'UTC').restarts,undefined);
});
