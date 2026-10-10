import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {timelineModel,timelineView} from '../docs/timeline.mjs';
const posts=[{profile_handle:'early',original_day:100},{profile_handle:'early',original_day:200},{profile_handle:'late',original_day:150},{profile_handle:'late',original_day:300}];
test('timeline preserves common historical offsets and clips only included portion',()=>{
  const model=timelineModel(posts,{origin:180});assert.equal(model.first,100);assert.equal(model.last,300);assert.equal(model.rows[1].start,150);assert(model.rows[1].left>0);assert(model.rows[0].activeLeft>model.rows[0].left);assert.equal(model.origin,180);
  const skipped=timelineModel(posts,{origin:250});assert.equal(skipped.rows[0].skipped,true);assert.equal(skipped.rows[0].activeWidth,0);assert(skipped.rows[1].activeWidth>0);
});
test('balanced shifts and everyone-starts-together preview their actual ranges without changing posts',()=>{
  const before=structuredClone(posts);const balanced=timelineModel(posts,{mode:'balanced',shifts:{early:100}});assert.equal(balanced.rows.find(g=>g.handle==='early').start,200);assert.equal(balanced.rows.find(g=>g.handle==='early').end,300);
  const aligned=timelineModel(posts,{mode:'aligned',origin:999});assert(aligned.rows.every(g=>g.start===0));assert.equal(aligned.last,150);assert.equal(aligned.origin,0);assert.deepEqual(posts,before);
});
test('empty and single-day archives have finite geometry and safe accessible labels',()=>{
  assert.equal(timelineModel([]).rows.length,0);const one=timelineModel([{profile_handle:'<script>x</script>',original_day:0}]);assert.equal(one.rows[0].width,100);assert.equal(one.marker,0);
  const {document}=parseHTML('<html></html>');const view=timelineView(document,[{profile_handle:'<script>x</script>',original_day:0}]);assert.equal(view.querySelector('script'),null);assert(view.querySelector('[role=img]').getAttribute('aria-label').includes('1 posts'));assert.equal(view.querySelectorAll('.timeline-marker').length,1);
});
