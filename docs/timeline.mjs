// Metadata-only overview; no future tweet content is exposed.
export function timelineModel(posts,{mode='historical',shifts={},origin}={}){
  const groups=new Map();
  for(const post of posts){if(!Number.isFinite(post.original_day))continue;const handle=post.profile_handle;if(!groups.has(handle))groups.set(handle,{handle,first:Infinity,last:-Infinity,count:0});const g=groups.get(handle);g.first=Math.min(g.first,post.original_day);g.last=Math.max(g.last,post.original_day);g.count++;}
  const rows=[...groups.values()].map(g=>{const shift=mode==='balanced'?Number(shifts[g.handle])||0:0;return {...g,start:mode==='aligned'?0:g.first+shift,end:mode==='aligned'?g.last-g.first:g.last+shift,shift};}).sort((a,b)=>a.start-b.start||a.handle.localeCompare(b.handle));
  if(!rows.length)return {rows:[],ticks:[],span:0};
  const first=Math.min(...rows.map(g=>g.start)),last=Math.max(...rows.map(g=>g.end)),width=Math.max(1,last-first+1),start=mode==='aligned'?0:Number.isFinite(origin)?origin:first;
  const percent=day=>Math.max(0,Math.min(100,100*(day-first)/width));
  return {first,last,span:last-first,origin:start,marker:percent(start),ticks:Array.from({length:5},(_,i)=>({day:Math.round(first+(last-first)*i/4),position:i*25})),rows:rows.map(g=>({...g,left:percent(g.start),width:100*(g.end-g.start+1)/width,activeLeft:percent(Math.max(start,g.start)),activeWidth:g.end<start?0:100*(g.end-Math.max(start,g.start)+1)/width,skipped:g.end<start}))};
}
export function timelineView(document,posts,options={}){
  const model=timelineModel(posts,options),make=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const section=make('section','timeline-overview');section.setAttribute('aria-label','Complete replay timeline');section.append(make('h3','','Timeline overview'));
  if(!model.rows.length){section.append(make('p','quiet','Import dated tweets to see each profile’s timeline.'));return section;}
  const aligned=options.mode==='aligned',date=day=>new Date(day*86400000).toISOString().slice(0,10),label=day=>aligned?(day/365.2425).toFixed(1)+'y':date(day),range=g=>label(g.start)+' – '+label(g.end);
  section.append(make('p','quiet',`${model.rows.length} profiles · ${(model.span/365.2425).toFixed(1)} years · ${aligned?'Time since replay begins':'Archive calendar dates'+(options.mode==='balanced'?' with suggested shifts':'')}`));
  const scroll=make('div','timeline-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','Profile timeline chart; scroll horizontally on small screens');const chart=make('div','timeline-chart');
  const axis=make('div','timeline-row timeline-axis'),axisLabel=make('span','timeline-label','Profile'),ticks=make('div','timeline-track');for(const tick of model.ticks){const el=make('span','timeline-tick',aligned?(tick.day/365.2425).toFixed(1)+'y':date(tick.day).slice(0,7));el.style.left=tick.position+'%';ticks.append(el);}axis.append(axisLabel,ticks);chart.append(axis);
  for(const row of model.rows){const line=make('div','timeline-row'),name=make('div','timeline-label');name.append(make('span','','@'+row.handle),make('small','quiet',range(row)));const track=make('div','timeline-track');track.setAttribute('role','img');track.setAttribute('aria-label',`@${row.handle}: ${range(row)}; ${row.count} tweets${row.skipped?'; entirely before starting date':''}`);
    const full=make('span','timeline-bar timeline-full');full.style.left=row.left+'%';full.style.width=row.width+'%';track.append(full);
    if(row.activeWidth){const active=make('span','timeline-bar timeline-active');active.style.left=row.activeLeft+'%';active.style.width=row.activeWidth+'%';track.append(active);}
    const marker=make('span','timeline-marker');marker.style.left=model.marker+'%';track.append(marker);track.title=track.getAttribute('aria-label');line.append(name,track);chart.append(line);
  }
  scroll.append(chart);section.append(scroll,make('p','quiet timeline-legend','Blue: included in replay · Faded: before the starting date · Line: '+(aligned?'replay begins':'starting date '+date(model.origin))),make('p','quiet','Bars show each archive’s first-to-last tweet range, including reposts and muted tweets. Gaps within a bar can be quiet periods.'));
  return section;
}
