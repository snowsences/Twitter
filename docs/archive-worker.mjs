import {unzipSync,strFromU8} from './vendor/fflate.mjs';
import {validateZip,safePath} from './files.mjs';
self.onmessage=event=>{
  try{const bytes=new Uint8Array(event.data);validateZip(bytes);const raw=unzipSync(bytes),usable=name=>!name.split('/').some(part=>part==='__MACOSX'||part.startsWith('._'));
    for(const name of Object.keys(raw))if(!safePath(name))throw new Error('Unsafe path in ZIP');
    const manifests=Object.keys(raw).filter(name=>usable(name)&&['archive.json','backup.json'].includes(name.split('/').at(-1)));
    if(manifests.length!==1)throw new Error(manifests.length?'ZIP contains multiple archives. Extract the collection and import each profile ZIP separately.':'ZIP must contain archive.json or backup.json.');
    const name=manifests[0],prefix=name.slice(0,name.lastIndexOf('/')+1),entries={};for(const [n,bytes] of Object.entries(raw))if(usable(n)&&n.startsWith(prefix))entries[n.slice(prefix.length)]=bytes;
    const data=JSON.parse(strFromU8(raw[name]));delete entries[name.slice(prefix.length)];self.postMessage({data,entries},[...new Set(Object.values(entries).map(v=>v.buffer))]);
  }catch(err){self.postMessage({error:err.message});}
};
