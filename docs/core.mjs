export const DAY=86400000;
const eventDate=post=>post.reposted_at||post.created_at;
const formatters=new Map();
export function parts(ms,zone){
  if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  const p=Object.fromEntries(formatters.get(zone).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
  return {day:Math.floor(Date.UTC(+p.year,+p.month-1,+p.day)/DAY),seconds:+p.hour*3600 + +p.minute*60 + +p.second};
}
export function wallTime(day,seconds,zone){
  const target=day*DAY+seconds*1000;let t=target;
  for(let i=0;i<5;i++){const p=parts(t,zone),diff=target-(p.day*DAY+p.seconds*1000);if(!diff)return t;t+=diff;}
  // DST gaps: use the first valid later wall time rather than lose a post.
  const options=[t,t+3600000,t-3600000].filter(n=>{const p=parts(n,zone);return p.day*DAY+p.seconds*1000>=target;});
  return Math.min(...options);
}
export function newClock(now,zone){return {started_at:now,zone,start_day:parts(now,zone).day,segments:[{replay_day:0,source_day:0,speed:1}]};}
export function newReplayClock(now,zone,posts,{mode='historical',origin_day,shift_days}={}){
  if(!posts.length)throw new Error('Import at least one archive first.');
  if(!['historical','aligned','balanced'].includes(mode))throw new Error('Invalid replay mode');
  const clock={...newClock(now,zone),mode};if(mode==='aligned')return clock;
  if(mode==='balanced'){if(!shift_days||typeof shift_days!=='object'||Array.isArray(shift_days)||Object.entries(shift_days).some(([h,d])=>! /^[a-z0-9_]{1,15}$/.test(h)||!Number.isInteger(d)||Math.abs(d)>3653))throw new Error('Invalid activity shifts');clock.shift_days={...shift_days};}
  const day=p=>p.original_day+(mode==='balanced'?(clock.shift_days[p.profile_handle]||0):0);
  const earliest=posts.reduce((a,b)=>day(a)<day(b)||(day(a)===day(b)&&a.original_seconds<=b.original_seconds)?a:b);
  const first=posts.reduce((a,b)=>Math.min(a,day(b)),Infinity),last=posts.reduce((a,b)=>Math.max(a,day(b)),-Infinity);
  const origin=origin_day??first;if(!Number.isInteger(origin)||origin<first||origin>last)throw new Error('Choose a starting date within your archives.');
  return {...clock,origin_day:origin,first_post_key:origin===day(earliest)?earliest.key:null,first_created_at:mode==='historical'&&origin===day(earliest)?eventDate(earliest):null,...(mode==='balanced'?{first_source_seconds:origin===day(earliest)?earliest.original_seconds:null}:{})};
}
export function sourceDayAt(clock,replayDay){const s=[...clock.segments].reverse().find(s=>s.replay_day<=replayDay)||clock.segments[0];return s.source_day+(replayDay-s.replay_day)*s.speed;}
export function setSpeed(clock,speed,now){
  if(![0.5,1,2,5,10].includes(speed))throw new Error('Unsupported speed');
  const effective=Math.max(1,parts(now,clock.zone).day-clock.start_day+1);
  const previous={...clock,segments:clock.segments.filter(s=>s.replay_day<effective)};
  return {...clock,segments:[...previous.segments,{replay_day:effective,source_day:sourceDayAt(previous,effective),speed}]};
}
export function replayDayFor(clock,sourceDay){
  const segment=[...clock.segments].reverse().find(s=>s.source_day<=sourceDay)||clock.segments[0];
  return Math.floor(segment.replay_day+(sourceDay-segment.source_day)/segment.speed+1e-9);
}
export function profileClock(clock,profile){
  const restart=clock?.restarts?.[profile?.handle];if(!restart)return clock;
  const day=parts(restart.started_at,clock.zone).day-clock.start_day,source=sourceDayAt(clock,day);
  const speed=[...clock.segments].reverse().find(s=>s.replay_day<=day)?.speed||1;
  return {...clock,mode:'aligned',restarts:undefined,started_at:restart.started_at,start_day:clock.start_day+day,segments:[{replay_day:0,source_day:0,speed},...clock.segments.filter(s=>s.replay_day>day).map(s=>({...s,replay_day:s.replay_day-day,source_day:s.source_day-source}))]};
}
export function profileStatus(posts,profile,clock,now){
  const own=posts.filter(p=>p.profile_handle===profile.handle),times=own.map(p=>dueAt(p,profile,clock));
  const local=profileClock(clock,profile),shift=local?.mode==='balanced'?(local.shift_days?.[profile.handle]||0):0,skipped=['historical','balanced'].includes(local?.mode)?own.filter(p=>p.original_day+shift<local.origin_day).length:0;
  const posted=times.filter(t=>t<=now).length,total=own.length,playable=total-skipped,finite=times.filter(Number.isFinite);
  const dates=own.map(p=>Date.parse(eventDate(p))),first=dates.length?dates.reduce((a,b)=>Math.min(a,b),Infinity):0,last=dates.length?dates.reduce((a,b)=>Math.max(a,b),-Infinity):0;
  return {total,playable,skipped,shift,posted,percent:playable?Math.floor(posted/playable*100):clock?100:0,first,last,span:last-first,finished:!!clock&&total>0&&posted===playable,appears:finite.length?finite.reduce((a,b)=>Math.min(a,b),Infinity):Infinity,ends:finite.length?finite.reduce((a,b)=>Math.max(a,b),-Infinity):Infinity,cycle:(clock?.restarts?.[profile.handle]?.cycle||1),started_at:local?.started_at};
}
export function restartProfile(clock,profile,now){
  if(!clock)throw new Error('Start replay first.');
  return {...clock,restarts:{...clock.restarts,[profile.handle]:{started_at:now,cycle:(clock.restarts?.[profile.handle]?.cycle||1)+1}}};
}
export function dueAt(post,profile,clock){
  if(!clock||!profile)return Infinity;
  clock=profileClock(clock,profile);
  const historical=['historical','balanced'].includes(clock.mode),sourceDay=post.original_day+(clock.mode==='balanced'?(clock.shift_days?.[post.profile_handle]||0):0);
  if(historical&&sourceDay<clock.origin_day)return Infinity;
  if(historical?(post.key===clock.first_post_key||(clock.first_created_at&&eventDate(post)===clock.first_created_at)||(clock.mode==='balanced'&&sourceDay===clock.origin_day&&post.original_seconds===clock.first_source_seconds)):post.id===profile.first_post_id)return clock.started_at;
  const offset=Math.max(0,sourceDay-(historical?clock.origin_day:profile.first_day));
  const day=clock.start_day+replayDayFor(clock,offset);
  const time=wallTime(day,post.original_seconds,clock.zone);
  // Only the first post overrides its time of day. Other day-zero posts wait
  // until their next clock-time occurrence if that time has already passed.
  return time<clock.started_at?wallTime(day+1,post.original_seconds,clock.zone):time;
}
export function available(posts,profiles,clock,now){
  const map=new Map(profiles.map(p=>[p.handle,p]));
  return posts.map(p=>({...p,replay_at:dueAt(p,map.get(p.profile_handle),clock)})).filter(p=>p.replay_at<=now).sort((a,b)=>b.replay_at-a.replay_at||b.created_at.localeCompare(a.created_at)||b.key.localeCompare(a.key));
}
const mutePatterns=new Map();
export function muteMatches(post,rule){
  if(rule.handles.length&&!rule.handles.includes(post.profile_handle))return false;
  let pattern=mutePatterns.get(rule.term);
  if(!pattern){const words=rule.term.trim().split(/\s+/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');if(!words)return false;pattern=new RegExp('(^|[^\\p{L}\\p{N}_])'+words+'(?=$|[^\\p{L}\\p{N}_])','iu');if(mutePatterns.size>1000)mutePatterns.clear();mutePatterns.set(rule.term,pattern);}
  return pattern.test(post.text+'\n'+(post.quoted_post?.text||''));
}
export function filterMuted(posts,rules=[]){return posts.filter(post=>!rules.some(rule=>muteMatches(post,rule)));}
export function validateMuteRule(rule){
  if(typeof rule?.id!=='string'||typeof rule.term!=='string'||!rule.term.trim()||rule.term.length>150||!Array.isArray(rule.handles)||rule.handles.some(h=>typeof h!=='string'||!/^[a-z0-9_]{1,15}$/.test(h)))throw new Error('Invalid muted term');
  return {id:rule.id,term:rule.term.trim(),handles:[...new Set(rule.handles)]};
}
export function safeURL(raw){try{const u=new URL(raw);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function handle(raw){if(typeof raw!=='string'||!/^[a-zA-Z0-9_]{1,15}$/.test(raw))throw new Error('Invalid profile handle');return raw.toLowerCase();}
export function normalizeArchive(a,zone){
  if(a?.schema!=='x-profile-archive'||a.schema_version!==1||!Array.isArray(a.posts))throw new Error('Choose a JSON export from X Profile Archive (version 1).');
  const owner=handle(a.profile?.handle);if(a.posts.length>150000)throw new Error('Import fewer than 150,000 posts per file.');
  const unique=new Map();let name=owner;
  for(const raw of a.posts){
    if(typeof raw?.id!=='string'||!/^\d{1,25}$/.test(raw.id)||typeof raw.text!=='string'||raw.text.length>200000)throw new Error('Invalid post record in archive. No changes were made.');
    const created=Date.parse(raw.created_at);if(!Number.isFinite(created))throw new Error('An archived post has an invalid date.');
    const author=handle(raw.author?.handle||owner),isRepost=raw.type==='retweet'||!!raw.retweeted_by;
    if(author!==owner&&!isRepost)throw new Error('A post from another account is missing repost attribution.');
    if(raw.retweeted_by&&handle(raw.retweeted_by.handle)!==owner)throw new Error('Repost attribution does not match the archive profile.');
    const reposted=isRepost&&raw.reposted_at?Date.parse(raw.reposted_at):null;if(reposted!==null&&(!Number.isFinite(reposted)||reposted<created))throw new Error('Invalid repost event date.');
    const date=parts(reposted??created,zone),type=isRepost?'retweet':'post';
    const media=(Array.isArray(raw.media)?raw.media:[]).filter(m=>['photo','video'].includes(m.type)).map(m=>({type:m.type,url:safeURL(m.url),alt:typeof m.alt==='string'?m.alt:'',poster_url:safeURL(m.poster_url),local_path:typeof m.local_path==='string'?m.local_path:null,poster_local_path:typeof m.poster_local_path==='string'?m.poster_local_path:null}));
    const p={key:owner+':'+raw.id,id:raw.id,profile_handle:owner,type,retweeted_by:type==='retweet'?owner:null,author:{handle:author,display_name:typeof raw.author?.display_name==='string'?raw.author.display_name:author},created_at:new Date(created).toISOString(),reposted_at:reposted===null?null:new Date(reposted).toISOString(),original_day:date.day,original_seconds:date.seconds,text:raw.text,url:safeURL(raw.url),possibly_truncated:!!raw.possibly_truncated,media,links:(raw.links||[]).filter(l=>safeURL(l.url)).map(l=>({url:safeURL(l.expanded_url)||safeURL(l.url),display:String(l.display||l.url)})),quoted_post:raw.quoted_post?{text:String(raw.quoted_post.text||''),url:safeURL(raw.quoted_post.url),media:(raw.quoted_post.media||[]).filter(m=>m.type==='photo').map(m=>({type:'photo',url:safeURL(m.url),alt:String(m.alt||''),local_path:typeof m.local_path==='string'?m.local_path:null}))}:null,metrics:raw.metrics_observed||{}};
    if(author===owner&&name===owner)name=p.author.display_name;
    unique.set(p.key,mergePost(unique.get(p.key),p));
  }
  const posts=[...unique.values()].sort((a,b)=>eventDate(a).localeCompare(eventDate(b))||a.id.localeCompare(b.id));
  if(!posts.length)throw new Error('This archive contains no posts.');
  return {profile:{handle:owner,display_name:name,image:a.profile.image?{url:safeURL(a.profile.image.url),local_path:typeof a.profile.image.local_path==='string'?a.profile.image.local_path:null}:null,first_day:posts[0].original_day,first_post_id:posts[0].id,first_created_at:eventDate(posts[0]),imported_at:new Date().toISOString()},posts};
}
export function mergePost(old,fresh){
  if(!old)return fresh;
  const full=old.text.length>fresh.text.length?old:fresh;
  const mergeMedia=(older,newer)=>newer.map(m=>{const prior=older.find(o=>(o.url===m.url||o.source_url===m.url||o.url===m.source_url)&&o.type===m.type);return {...prior,...m,url:prior?.asset_key&&!m.asset_key?prior.url:m.url,poster_url:prior?.poster_asset_key&&!m.poster_asset_key?prior.poster_url:m.poster_url,asset_key:m.asset_key||prior?.asset_key,poster_asset_key:m.poster_asset_key||prior?.poster_asset_key};});
  const media=mergeMedia(old.media,fresh.media);const quote=fresh.quoted_post?{...fresh.quoted_post,media:mergeMedia(old.quoted_post?.media||[],fresh.quoted_post.media||[])}:old.quoted_post;
  const timing=old.reposted_at&&!fresh.reposted_at?{reposted_at:old.reposted_at,original_day:old.original_day,original_seconds:old.original_seconds}:{};
  return {...old,...fresh,...timing,text:full.text,possibly_truncated:full.possibly_truncated,media:media.length?media:old.media,quoted_post:quote,type:old.type==='retweet'?'retweet':fresh.type,retweeted_by:fresh.retweeted_by||old.retweeted_by};
}
