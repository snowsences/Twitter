// Fixed 30-day activity buckets. Moving whole days preserves posting clock times.
const BUCKET=30;
function summary(groups,shifts){const bins=new Map();let first=Infinity,last=-Infinity;for(const g of groups){const shift=shifts[g.handle]||0;first=Math.min(first,g.first+shift);last=Math.max(last,g.last+shift);for(const day of g.active){const bucket=Math.floor((day+shift)/BUCKET);bins.set(bucket,(bins.get(bucket)||0)+1);}}let peak=0,total=0;for(const value of bins.values()){peak=Math.max(peak,value);total+=value;}return {first,last,span:last-first,peak,average:total/(Math.floor(last/BUCKET)-Math.floor(first/BUCKET)+1)};}
export function alignActivity(posts,maxYears=3){
  if(![1,2,3,5,10].includes(maxYears))throw new Error('Invalid shift limit');
  const map=new Map();for(const p of posts){let g=map.get(p.profile_handle);if(!g){g={handle:p.profile_handle,first:Infinity,last:-Infinity,counts:new Map()};map.set(g.handle,g);}g.first=Math.min(g.first,p.original_day);g.last=Math.max(g.last,p.original_day);const bucket=Math.floor(p.original_day/BUCKET);g.counts.set(bucket,(g.counts.get(bucket)||0)+1);}
  if(!map.size)throw new Error('Import archives first.');
  const groups=[...map.values()].sort((a,b)=>a.handle.localeCompare(b.handle));
  for(const g of groups){g.active=[...g.counts.keys()].map(b=>b*BUCKET);const weights=[...g.counts].map(([b,count])=>[b,Math.log1p(count)]),norm=Math.sqrt(weights.reduce((sum,[,w])=>sum+w*w,0));g.weights=weights.map(([b,w])=>[b,w/norm]);const mass=g.weights.reduce((sum,[,w])=>sum+w,0);g.center=g.weights.reduce((sum,[b,w])=>sum+b*w,0)/mass;}
  const centers=groups.map(g=>g.center).sort((a,b)=>a-b),median=centers[Math.floor(centers.length/2)];
  const anchor=[...groups].sort((a,b)=>Math.abs(a.center-median)-Math.abs(b.center-median)||a.handle.localeCompare(b.handle))[0];
  const limit=Math.floor(maxYears*365.2425/BUCKET),offsets=Object.fromEntries(groups.map(g=>[g.handle,0])),total=new Map();
  const add=(g,offset,sign)=>{for(const [b,w] of g.weights){const key=b+offset;total.set(key,(total.get(key)||0)+sign*w);}};
  for(const g of groups)add(g,0,1);
  // Coordinate search maximizes overlap of normalized monthly activity, with
  // a small movement penalty and one median account fixed as a reference.
  for(let pass=0;pass<6;pass++){let changed=false;for(const g of groups){if(g===anchor)continue;const previous=offsets[g.handle];add(g,previous,-1);let best=previous,bestScore=-Infinity;
      for(let offset=-limit;offset<=limit;offset++){let score=0;for(const [b,w] of g.weights)score+=w*(total.get(b+offset)||0);score/=Math.max(1,groups.length-1);score-=0.02*Math.abs(offset)/Math.max(1,limit);
        if(score>bestScore+1e-10||(Math.abs(score-bestScore)<1e-10&&Math.abs(offset)<Math.abs(best))){best=offset;bestScore=score;}}
      offsets[g.handle]=best;add(g,best,1);if(best!==previous)changed=true;
    }if(!changed)break;}
  const shifts=Object.fromEntries(groups.map(g=>[g.handle,offsets[g.handle]*BUCKET]));
  return {shifts,maxYears,anchor:anchor.handle,before:summary(groups,{}),after:summary(groups,shifts),profiles:groups.map(g=>({handle:g.handle,first:g.first,last:g.last,shift:shifts[g.handle],adjusted_first:g.first+shifts[g.handle],adjusted_last:g.last+shifts[g.handle]}))};
}
