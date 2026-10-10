import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
test('versioned entry bypasses old exact-match shell caches and is precached by the new worker',async()=>{
 const html=await readFile(new URL('../docs/index.html',import.meta.url),'utf8'),worker=await readFile(new URL('../docs/sw.js',import.meta.url),'utf8');const {document}=parseHTML(html);const entry=document.querySelector('script[type="module"]').getAttribute('src'),style=document.querySelector('link[rel="stylesheet"]').getAttribute('href');assert.match(entry,/app\.mjs\?v=\d+/);assert.match(style,/style\.css\?v=\d+/);assert.ok(worker.includes(`'./${entry}'`));assert.ok(worker.includes(`'./${style}'`));
 const oldCache=new Map([['https://example.test/docs/app.mjs','old app that expects speed-chip']]);assert.equal(oldCache.get(new URL(entry,'https://example.test/docs/').href),undefined);
});
test('HTML starts worker registration before the app, independent of application errors',async()=>{
 const {document}=parseHTML(await readFile(new URL('../docs/index.html',import.meta.url),'utf8'));const scripts=[...document.querySelectorAll('script')];assert.equal(scripts[0].hasAttribute('src'),false);let registered;runInNewContext(scripts[0].textContent,{navigator:{serviceWorker:{register(url,options){registered={url,options};return Promise.resolve();}}}});assert.equal(registered.url,'./sw.js');assert.equal(registered.options.updateViaCache,'none');assert.equal(scripts[1].getAttribute('type'),'module');
});
