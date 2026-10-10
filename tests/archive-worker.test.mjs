import test from 'node:test';import assert from 'node:assert/strict';import {zipSync,strToU8} from '../docs/vendor/fflate.mjs';
test('archive worker extracts wrapped exports and transfers original image bytes, rejecting ambiguous collections',async()=>{
  let result,transfers;globalThis.self={postMessage:(r,t)=>{result=r;transfers=t;}};
  await import('../docs/archive-worker.mjs');
  const data={schema:'x-profile-archive',profile:{handle:'alice'},posts:[]},image=new Uint8Array([1,2,3,4]);
  const bytes=zipSync({'folder/archive.json':strToU8(JSON.stringify(data)),'folder/images/a.png':image,'__MACOSX/._archive.json':strToU8('ignored')});
  self.onmessage({data:bytes.buffer});assert.deepEqual(result.data,data);assert.deepEqual([...result.entries['images/a.png']],[1,2,3,4]);assert.ok(transfers.includes(result.entries['images/a.png'].buffer));assert.equal(result.entries['archive.json'],undefined);
  self.onmessage({data:zipSync({'a/archive.json':strToU8('{}'),'b/archive.json':strToU8('{}')}).buffer});assert.match(result.error,/multiple archives/);
  self.onmessage({data:zipSync({'../archive.json':strToU8('{}')}).buffer});assert.match(result.error,/Unsafe path/);
});
