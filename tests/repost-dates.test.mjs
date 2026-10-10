import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeArchive,newReplayClock,dueAt,mergePost,profileStatus} from '../docs/core.mjs';
const archive={schema:'x-profile-archive',schema_version:1,profile:{handle:'toomanytoes'},posts:[{id:'1',text:'reposted',type:'retweet',retweeted_by:{handle:'toomanytoes'},author:{handle:'alice'},created_at:'2010-01-01T12:00:00Z',reposted_at:'2020-01-01T10:00:00Z',media:[]},{id:'2',text:'own',author:{handle:'toomanytoes'},created_at:'2019-01-01T09:00:00Z',media:[]}]};
test('repost event dates place old source tweets on actual event timeline and preserve original date',()=>{
 const {profile,posts}=normalizeArchive(archive,'UTC');assert.equal(posts[0].id,'2');const repost=posts.find(p=>p.id==='1');assert.equal(repost.created_at,'2010-01-01T12:00:00.000Z');assert.equal(repost.original_seconds,36000);assert.equal(profile.first_created_at,'2019-01-01T09:00:00.000Z');
 const now=Date.parse('2026-01-01T09:00:00Z'),clock=newReplayClock(now,'UTC',posts);assert.equal(dueAt(repost,profile,clock),Date.parse('2027-01-01T10:00:00Z'));assert.equal(profileStatus(posts,profile,clock,now).first,Date.parse('2019-01-01T09:00:00Z'));
 const fallback=structuredClone(archive);delete fallback.posts[0].reposted_at;const older=normalizeArchive(fallback,'UTC').posts.find(p=>p.id==='1');const merged=mergePost(repost,older);assert.equal(merged.reposted_at,repost.reposted_at);assert.equal(merged.original_day,repost.original_day);
});
test('missing repost events retain legacy timing, invalid event dates reject import',()=>{
 const missing=structuredClone(archive);delete missing.posts[0].reposted_at;assert.equal(normalizeArchive(missing,'UTC').posts[0].created_at,'2010-01-01T12:00:00.000Z');
 for(const date of ['bad','2009-01-01T00:00:00Z']){const bad=structuredClone(archive);bad.posts[0].reposted_at=date;assert.throws(()=>normalizeArchive(bad,'UTC'),/Invalid repost event/);}
});
