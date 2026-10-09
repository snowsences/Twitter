import test from 'node:test';import assert from 'node:assert/strict';
import {alignActivity} from '../docs/normalize.mjs';
import {DAY,normalizeArchive,newReplayClock,dueAt,parts,profileStatus,restartProfile} from '../docs/core.mjs';
import {makeBackup,readFile,restoreBackup} from '../docs/files.mjs';
import {stateDelta,applyDelta} from '../docs/sync-core.mjs';
const archives=[['early',2010],['middle',2015],['late',2018]].map(([handle,year])=>normalizeArchive({schema:'x-profile-archive',schema_version:1,profile:{handle},posts:Array.from({length:24},(_,i)=>({id:String(i+1),text:'Monthly post',author:{handle},created_at:new Date(Date.UTC(year,0,1,16,45)+i*30*DAY).toISOString(),media:[]}))},'UTC'));
const posts=archives.flatMap(a=>a.posts),profiles=archives.map(a=>a.profile),start=Date.UTC(2026,0,1,12);
test('bounded monthly alignment brings early and late outliers inward with improved overlap',()=>{
  const snapshot=structuredClone(posts),plan=alignActivity(posts,5);
  assert.ok(plan.shifts.early>0);assert.ok(plan.shifts.late<0);assert.equal(plan.shifts.middle,0);
  assert.ok(plan.after.average>plan.before.average);assert.equal(plan.after.peak,3);assert.ok(plan.after.span<plan.before.span);
  for(const shift of Object.values(plan.shifts)){assert.equal(Math.abs(shift%30),0);assert.ok(Math.abs(shift)<=5*365.2425);}
  assert.deepEqual(posts,snapshot);assert.deepEqual(alignActivity([...posts].reverse(),5),plan);
});
test('overlapping or single accounts need no shift; a tight limit is respected',()=>{
  assert.deepEqual(alignActivity(archives[0].posts).shifts,{early:0});
  const identical=archives[0].posts.map(p=>({...p,profile_handle:'copy'}));assert.deepEqual(alignActivity([...archives[0].posts,...identical]).shifts,{copy:0,early:0});
  for(const shift of Object.values(alignActivity(posts,1).shifts))assert.ok(Math.abs(shift)<=365);
  assert.throws(()=>alignActivity(posts,100),/shift limit/);
});
test('balanced clocks use saved shifts without changing duration, spacing, or posting times',()=>{
  const plan=alignActivity(posts,5),clock=newReplayClock(start,'UTC',posts,{mode:'balanced',shift_days:plan.shifts});
  for(const a of archives){const times=a.posts.map(p=>dueAt(p,a.profile,clock));for(let i=1;i<times.length;i++){assert.equal(parts(times[i],'UTC').seconds,a.posts[i].original_seconds);if(i>1)assert.equal(times[i]-times[i-1],30*DAY);}
    const status=profileStatus(posts,a.profile,clock,start);assert.equal(status.shift,plan.shifts[a.profile.handle]);assert.equal(status.span,23*30*DAY);
  }
  const a=archives[1],now=dueAt(a.posts.at(-1),a.profile,clock)+DAY,restarted=restartProfile(clock,a.profile,now);assert.equal(dueAt(a.posts[0],a.profile,restarted),now);assert.equal(profileStatus(posts,a.profile,restarted,now).shift,0);
  const newAccount={...a.posts[1],profile_handle:'new',key:'new:2'};assert.equal(dueAt(newAccount,{...a.profile,handle:'new'},clock),dueAt(a.posts[1],a.profile,clock));
});
test('later starting dates skip adjusted records; alignment syncs and survives backup',async()=>{
  const plan=alignActivity(posts,5),clock=newReplayClock(start,'UTC',posts,{mode:'balanced',shift_days:plan.shifts,origin_day:plan.after.first+60});
  const status=profileStatus(posts,profiles[0],clock,start);assert.ok(status.skipped>0);
  assert.deepEqual(applyDelta({},stateDelta({},{clock})).clock,clock);
  const blob=await makeBackup({posts,profiles,state:{clock,bookmarks:[]}},[]),input=await readFile({name:'backup.zip',size:blob.size,arrayBuffer:()=>blob.arrayBuffer()});assert.deepEqual(restoreBackup(input).state.clock,clock);
  input.data.state.clock.shift_days.early=40000;assert.throws(()=>restoreBackup(input),/activity shifts/);
});
