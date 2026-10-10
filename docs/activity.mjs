import {filterMuted} from './core.mjs';
export function activityForecast(scheduled,now=Date.now(),days=30,muted=[]){
  const end=now+days*86400000,visible=filterMuted(scheduled,muted),future=visible.filter(p=>p.replay_at>now&&p.replay_at<=end),ranges=new Map();
  for(const post of visible){if(!Number.isFinite(post.replay_at))continue;const range=ranges.get(post.profile_handle)||{first:Infinity,last:-Infinity};range.first=Math.min(range.first,post.replay_at);range.last=Math.max(range.last,post.replay_at);ranges.set(post.profile_handle,range);}
  const active=[...ranges].filter(([,r])=>r.first<=now&&r.last>=now).map(([handle])=>handle),arriving=[...ranges].filter(([,r])=>r.first>now&&r.first<=end).map(([handle])=>handle),finishing=[...ranges].filter(([,r])=>r.last>now&&r.last<=end).map(([handle])=>handle);
  const daily=Array.from({length:days},(_,i)=>future.filter(p=>p.replay_at>now+i*86400000&&p.replay_at<=now+(i+1)*86400000).length);
  return {active,arriving,finishing,total:future.length,perDay:future.length/days,daily};
}
export function unreadBoundary(posts,seenAt){if(!Number.isFinite(seenAt))return null;const index=posts.findIndex(p=>p.replay_at<=seenAt);return index>0?{index,newCount:index}:index===-1&&posts.length?{index:posts.length,newCount:posts.length}:null;}
