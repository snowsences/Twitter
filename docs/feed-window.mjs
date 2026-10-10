// Keep a bounded number of live cards while retaining measured scroll space.
export function windowRange(prefix,top,height,overscan=6,maxRows=60){
  const index=y=>{let lo=0,hi=prefix.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(prefix[mid]<=y)lo=mid;else hi=mid-1;}return Math.min(lo,prefix.length-2);};
  const first=Math.max(0,index(Math.max(0,top))-overscan),last=Math.min(prefix.length-1,Math.max(first+1,index(Math.max(0,top)+height)+overscan+1));
  return {first,last:Math.min(last,first+maxRows)};
}
export function createFeedWindow(feed,{create,update,onRows=()=>{}}){
  let posts=[],heights=new Map(),prefix=[0],destroyed=false,frame=null;
  const spacer=()=>{const el=document.createElement('div');el.className='feed-spacer';el.setAttribute('aria-hidden','true');return el;};
  const top=spacer(),bottom=spacer();
  function rebuild(){prefix=[0];for(const post of posts)prefix.push(prefix.at(-1)+(heights.get(post.key)||estimate(post)));}
  function estimate(post){return 110+Math.ceil((post.text?.length||0)/55)*25+((post.media?.length||0)?280:0)+(post.quoted_post?160:0);}
  const rect=el=>el.getBoundingClientRect?.()||{top:0,bottom:0,height:0};
  function anchor(){return [...feed.querySelectorAll('article.tweet')].find(el=>rect(el).bottom>0);}
  function render(){
    if(destroyed)return;const oldAnchor=anchor(),oldTop=oldAnchor?rect(oldAnchor).top:null;const start=-rect(feed).top,viewport=globalThis.innerHeight||800,{first,last}=windowRange(prefix,start,viewport);
    const focused=document.activeElement?.closest?.('article.tweet');
    let lo=first,hi=last;const focusIndex=focused?posts.findIndex(p=>p.key===focused.dataset.key):-1;
    if(focusIndex>=0&&Math.abs(focusIndex-first)<60){lo=Math.min(lo,focusIndex);hi=Math.max(hi,focusIndex+1);}
    const visible=posts.slice(lo,hi),keep=new Set(visible.map(p=>p.key));
    const old=new Map([...feed.querySelectorAll('article.tweet')].map(el=>[el.dataset.key,el]));
    for(const [key,row] of old)if(!keep.has(key)){row.querySelectorAll('video').forEach(v=>v.pause?.());observer?.unobserve(row);row.remove();}
    if(!top.isConnected)feed.prepend(top);else if(feed.firstElementChild!==top)feed.prepend(top);
    let cursor=top.nextElementSibling;
    for(const post of visible){let row=old.get(post.key),fingerprint=row?row._fingerprint:null;if(!row||row._post!==post)fingerprint=JSON.stringify(post);if(row&&row._fingerprint!==fingerprint){const replacement=create(post);observer?.unobserve(row);row.replaceWith(replacement);if(cursor===row)cursor=replacement;row=replacement;}if(!row)row=create(post);row._post=post;row._fingerprint=fingerprint;update?.(row,post);if(row!==cursor)feed.insertBefore(row,cursor);cursor=row.nextElementSibling;observer?.observe(row);}
    feed.append(bottom);top.style.height=prefix[lo]+'px';bottom.style.height=(prefix.at(-1)-prefix[hi])+'px';
    let measured=false;for(const row of feed.querySelectorAll('article.tweet')){const h=rect(row).height;if(h>0&&Math.abs((heights.get(row.dataset.key)||0)-h)>.5){heights.set(row.dataset.key,h);measured=true;}}
    if(measured){rebuild();top.style.height=prefix[lo]+'px';bottom.style.height=(prefix.at(-1)-prefix[hi])+'px';}
    if(oldAnchor?.isConnected&&oldTop!==null){const delta=rect(oldAnchor).top-oldTop;if(Math.abs(delta)>.5)window.scrollBy?.(0,delta);}
    onRows(feed.querySelectorAll('article.tweet'));
  }
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
    const a=anchor(),index=a?posts.findIndex(p=>p.key===a.dataset.key):-1;let adjustment=0,changed=false;
    for(const entry of entries){const key=entry.target.dataset.key,h=entry.borderBoxSize?.[0]?.blockSize||rect(entry.target).height,old=heights.get(key);if(h>0&&old&&Math.abs(h-old)>.5){const i=posts.findIndex(p=>p.key===key);if(i>=0&&i<index)adjustment+=h-old;heights.set(key,h);changed=true;}}
    if(changed){rebuild();if(adjustment)window.scrollBy?.(0,adjustment);queue();}
  }):null;
  function queue(){if(frame!==null||destroyed)return;frame=true;const handle=requestAnimationFrame(()=>{frame=null;render();});if(frame!==null)frame=handle??true;}
  return {
    set(next){const a=anchor(),before=a?rect(a).top:null;posts=next;rebuild();render();if(a?.isConnected&&before!==null){const difference=rect(a).top-before;if(Math.abs(difference)>.5)window.scrollBy?.(0,difference);}},
    render:queue,
    destroy(){destroyed=true;observer?.disconnect();if(frame!==null)globalThis.cancelAnimationFrame?.(frame);feed.querySelectorAll('video').forEach(v=>v.pause?.());},
    mounted:()=>feed.querySelectorAll('article.tweet').length,
  };
}
