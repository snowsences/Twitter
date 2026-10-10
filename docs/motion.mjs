// Small, optional motion primitives. No animation is required for an action to finish.
export const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
const ease='cubic-bezier(.22,1,.36,1)';
export function animate(el,frames,options={}){
  if(!el?.animate||reducedMotion())return null;
  try{const animation=el.animate(frames,{duration:220,easing:ease,...options});animation.finished.catch(()=>{});return animation;}catch{return null;}
}
export function likeFeedback(button,liked){
  const heart=button.querySelector('svg');heart?.getAnimations?.().forEach(a=>a.cancel());
  animate(heart,liked?[{transform:'scale(1)'},{transform:'scale(.78)',offset:.2},{transform:'scale(1.2)',offset:.6},{transform:'scale(1)'}]:[{transform:'scale(.9)'},{transform:'scale(1)'}],{duration:liked?280:160});
  if(liked&&!reducedMotion()&&button.animate){const ring=document.createElement('span');ring.className='like-ring';ring.setAttribute('aria-hidden','true');button.append(ring);const a=animate(ring,[{opacity:.65,transform:'scale(.5)'},{opacity:0,transform:'scale(1.5)'}],{duration:320});if(a)a.finished.catch(()=>{}).then(()=>ring.remove());else ring.remove();}
}
const rect=el=>el?.getBoundingClientRect?.();
const visible=r=>r&&r.height>0&&r.bottom>0&&r.top<(globalThis.innerHeight||1000);
// Reuse unchanged rows, and move rows only when their order actually changes.
export function reconcileFeed(feed,posts,{create,update,mode='quiet'}={}){
  feed._motionVersion=(feed._motionVersion||0)+1;const version=feed._motionVersion;
  const rows=[...feed.children].filter(el=>el.matches('article.tweet')&&!el.classList.contains('tweet-leaving'));
  const structureChanged=rows.length!==posts.length||rows.some((row,index)=>row.dataset.key!==posts[index]?.key);
  const existing=new Map(rows.map(el=>[el.dataset.key,el])),before=new Map(structureChanged?rows.map(el=>[el,rect(el)]):[]);
  const desired=new Set(posts.map(p=>p.key));
  for(const child of [...feed.children])if(!child.matches('article.tweet'))child.remove();
  for(const row of rows)if(!desired.has(row.dataset.key)){
    const r=before.get(row);if(visible(r)&&row.animate&&!reducedMotion()){
      row.classList.add('tweet-leaving');row.setAttribute('aria-hidden','true');row.inert=true;
      const container=rect(feed);row.style.cssText=`position:absolute;top:${r.top-container.top}px;left:${r.left-container.left}px;width:${r.width}px;pointer-events:none`;
      const a=animate(row,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(-8px)'}],{duration:180});
      if(a)a.finished.catch(()=>{}).then(()=>row.remove());else row.remove();
    }else row.remove();
  }
  const added=[];let cursor=feed.firstElementChild;
  for(const post of posts){let row=existing.get(post.key);const fingerprint=JSON.stringify(post);
    if(row&&row._fingerprint!==fingerprint){const replacement=create(post);if(cursor===row)cursor=replacement;row.replaceWith(replacement);row=replacement;}else if(!row){row=create(post);added.push(row);}
    row._fingerprint=fingerprint;update?.(row,post);
    // Avoid detaching an unchanged video element, even during a refresh.
    while(cursor?.classList.contains('tweet-leaving'))cursor=cursor.nextElementSibling;
    if(row!==cursor)feed.insertBefore(row,cursor);cursor=row.nextElementSibling;
  }
  if(structureChanged)for(const row of existing.values())if(desired.has(row.dataset.key)&&row.isConnected){const old=before.get(row),now=rect(row);if(visible(now)&&old&&Math.abs(old.top-now.top)>.5)animate(row,[{transform:`translateY(${old.top-now.top}px)`},{transform:'translateY(0)'}],{duration:250});}
  if(mode!=='quiet'){
    const onscreen=added.filter(row=>visible(rect(row)));
    onscreen.forEach((row,index)=>{animate(row,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:250,delay:Math.min(index*25,150)});if(mode==='new')animate(row,[{backgroundColor:'#1d9bf024'},{backgroundColor:'transparent'}],{duration:850});});
  }
  return {added,version};
}
export function installDialogMotion(modal){
  const close=modal.close.bind(modal);let generation=0,closing=false,source=null;
  const cancel=()=>{generation++;closing=false;modal.getAnimations?.().forEach(a=>a.cancel());};
  modal.close=(...args)=>{
    if(!modal.open||closing)return;closing=true;const token=++generation;
    const photo=modal.querySelector('.lightbox-photo'),from=rect(photo),to=source?.isConnected?rect(source):null;
    if(photo&&visible(to)&&from?.width>0)animate(photo,[{transform:'none',opacity:1},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:.15}],{duration:160});
    modal.classList.add('dialog-closing');const a=animate(modal,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(8px)'}],{duration:160});
    const finish=()=>{if(token!==generation)return;closing=false;source=null;modal.classList.remove('dialog-closing');close(...args);};if(a)a.finished.catch(()=>{}).then(finish);else finish();
  };
  modal.addEventListener('cancel',ev=>{ev.preventDefault();modal.close();});
  return {
    open(){cancel();source=null;modal.classList.remove('dialog-closing');animate(modal,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:220});},
    photo(img,thumbnail){source=thumbnail;const token=generation;let started=false;const run=()=>{if(started||token!==generation||!modal.open)return;started=true;const from=rect(thumbnail),to=rect(img);if(visible(from)&&to?.width>0)animate(img,[{transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`,opacity:.5},{transform:'none',opacity:1}],{duration:260});};if(img.complete)run();else img.addEventListener('load',run,{once:true});},
  };
}
export function showToast(el,message){
  el._motionToken=(el._motionToken||0)+1;const token=el._motionToken;el.getAnimations?.().forEach(a=>a.cancel());const wasHidden=el.hidden;el.textContent=message;el.hidden=false;
  if(wasHidden)animate(el,[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:200});
  clearTimeout(el._motionTimer);el._motionTimer=setTimeout(()=>{const a=animate(el,[{opacity:1,translate:'0 0'},{opacity:0,translate:'0 8px'}],{duration:160});const finish=()=>{if(token===el._motionToken)el.hidden=true;};if(a)a.finished.catch(()=>{}).then(finish);else finish();},6000);
}
