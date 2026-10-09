export const DAY=86400000;
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
export function dueAt(post,profile,clock){
  if(!clock||!profile)return Infinity;
  if(post.id===profile.first_post_id)return clock.started_at;
  const offset=Math.max(0,post.original_day-profile.first_day);
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
    const date=parts(created,zone),type=isRepost?'retweet':'post';
    const media=(Array.isArray(raw.media)?raw.media:[]).filter(m=>['photo','video'].includes(m.type)).map(m=>({type:m.type,url:safeURL(m.url),alt:typeof m.alt==='string'?m.alt:'',poster_url:safeURL(m.poster_url),local_path:typeof m.local_path==='string'?m.local_path:null,poster_local_path:typeof m.poster_local_path==='string'?m.poster_local_path:null}));
    const p={key:owner+':'+raw.id,id:raw.id,profile_handle:owner,type,retweeted_by:type==='retweet'?owner:null,author:{handle:author,display_name:typeof raw.author?.display_name==='string'?raw.author.display_name:author},created_at:new Date(created).toISOString(),original_day:date.day,original_seconds:date.seconds,text:raw.text,url:safeURL(raw.url),possibly_truncated:!!raw.possibly_truncated,media,links:(raw.links||[]).filter(l=>safeURL(l.url)).map(l=>({url:safeURL(l.expanded_url)||safeURL(l.url),display:String(l.display||l.url)})),quoted_post:raw.quoted_post?{text:String(raw.quoted_post.text||''),url:safeURL(raw.quoted_post.url),media:(raw.quoted_post.media||[]).filter(m=>m.type==='photo').map(m=>({type:'photo',url:safeURL(m.url),alt:String(m.alt||''),local_path:typeof m.local_path==='string'?m.local_path:null}))}:null,metrics:raw.metrics_observed||{}};
    if(author===owner&&name===owner)name=p.author.display_name;
    unique.set(p.key,mergePost(unique.get(p.key),p));
  }
  const posts=[...unique.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
  if(!posts.length)throw new Error('This archive contains no posts.');
  return {profile:{handle:owner,display_name:name,image:a.profile.image?{url:safeURL(a.profile.image.url),local_path:typeof a.profile.image.local_path==='string'?a.profile.image.local_path:null}:null,first_day:posts[0].original_day,first_post_id:posts[0].id,first_created_at:posts[0].created_at,imported_at:new Date().toISOString()},posts};
}
export function mergePost(old,fresh){
  if(!old)return fresh;
  const full=old.text.length>fresh.text.length?old:fresh;
  const media=fresh.media.map(m=>{const prior=old.media.find(o=>o.url===m.url&&o.type===m.type);return {...prior,...m,asset_key:m.asset_key||prior?.asset_key,poster_asset_key:m.poster_asset_key||prior?.poster_asset_key};});
  return {...old,...fresh,text:full.text,possibly_truncated:full.possibly_truncated,media:media.length?media:old.media,quoted_post:fresh.quoted_post||old.quoted_post,type:old.type==='retweet'?'retweet':fresh.type,retweeted_by:fresh.retweeted_by||old.retweeted_by};
}
