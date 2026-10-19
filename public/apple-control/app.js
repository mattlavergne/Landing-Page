// Apple Control Center front end. All mutations go through verified Worker routes.
// No tokens, GitHub credentials, anonymous device identifiers or secrets here.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => Number(v || 0).toLocaleString('en-US');
const dateKey = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const shift = (date,days) => { const x = new Date(date+'T12:00:00'); x.setDate(x.getDate()+days); return dateKey(x); };
const nowKey = dateKey(new Date());
const nextDay = shift(nowKey,1);
const nextMonday = () => {const d=new Date(nowKey+'T12:00:00'); const n=(8-d.getDay())%7||7;return shift(nowKey,n);};
const tourIndex = () => Math.floor((Date.parse(nowKey+'T12:00:00Z') - Date.UTC(2026,9,1)) / (21*864e5))+1;
const monthDay = k => {try {return new Date(k+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});}catch{return k;}};
const EMPTY = { schema:1,skins:[],daily:[],weekly:[],tours:[],notice:null,
 flags:{pauseInterstitials:false,pauseRewarded:false,pauseBanners:false} };
const FIXED_TOUR_SKINS = ['moonlight','blossom','ocean','honey','mint','berry','comet','clover'];
const EFFECTS = {
 stars:{name:'Star Week',icon:'🌠',desc:'Stars are worth 50% more all week.'},
 boxes:{name:'Mystery Week',icon:'🎁',desc:'Mystery boxes appear twice as often.'},
 golden:{name:'Golden Week',icon:'👑',desc:'Golden snakes appear more often in Endless and Daily Runs.'},
 xp:{name:'XP Week',icon:'⚡',desc:'Every run earns 50% more XP.'}
};
const CHALLENGES = [
 [['close','Close calls'],['stars','Stars earned'],['level','Reach Endless / Daily level'],['walls','Wall crashes'],['scratch','Thorn scratches']],
 [['nerve','Maximum Nerve'],['poison','Withered snakes'],['self','Self-collisions'],['unbitten','No-bite clears'],['frenzy','Frenzy clears']],
 [['lunge','Lunging snakes trapped'],['grade','S grades'],['tangle','Snakes tangled'],['double','Double knockout'],['deep','Deep Endless / Daily level']]
];
const DEFAULT_TARGETS = {close:15,stars:30,level:5,walls:3,scratch:3,nerve:8,poison:2,self:2,unbitten:3,frenzy:1,lunge:1,grade:1,tangle:1,double:1,deep:9};
const NAV = {
 overview:['Overview','Your operational view of the game, content and player experience.'],
 skins:['Skin studio','Design and manage in-game apple appearances.'],
 daily:['Daily challenges','Plan complete daily sets using supported gameplay triggers.'],
 weekly:['Weekly events','Create future weekly rotations and event descriptions.'],
 tours:['Orchard Tours','Schedule names and rewards for three-week seasons.'],
 messages:['Announcements & safety','Communicate with players and temporarily pause faulty ad formats.'],
 analytics:['Player analytics','Use aggregated, voluntary game events to guide decisions.'],
 test:['Testing & releases','Preview drafts, use game test tools and manage releases.'],
 history:['History & settings','Inspect published versions and restore earlier content.']
};
const clone = x => JSON.parse(JSON.stringify(x));
const state = { live:null, saved:null, draft:null, draftVersion:0, dirty:false, history:[], stats:null, health:null,
 actor:'', section:'overview', selectedSkin:null, drawApple:null, loaded:false };
function note(message,error=false) {
 const el=$('#alert');el.hidden=!message;el.textContent=message||'';el.style.background=error?'#fff1ee':'#edf8ef';
 el.style.color=error?'#913d34':'#2c6541';
 if(message)window.scrollTo({top:0,behavior:'smooth'});
}
function setStatus(message) {$('#save-state').textContent=message;$('#save-state').classList.toggle('dirty',state.dirty);}
function updateToolbar() {
 $('#save-draft').disabled=!state.loaded||!state.dirty;
 $('#publish').disabled=!state.loaded||state.dirty||!state.saved||state.draftVersion===0;
 $('#live-version').textContent='Live v'+(state.live?.version??0);
 setStatus(!state.loaded?'Connecting…':state.dirty?'Unsaved edits':state.saved?'Draft saved · v'+state.draftVersion:'No draft');
}
function markDirty() {state.dirty=true;updateToolbar();renderOverview();}
async function api(path,{method='GET',body}={}) {
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),14000);
 try {
  const response=await fetch('/apple/admin/api/'+path,{
   method,credentials:'same-origin',signal:ctl.signal,
   headers:body?{'Content-Type':'application/json','X-Apple-Control':'1'}:{},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw Error(data?.error||'Request failed ('+response.status+').');
  return data;
 }finally{clearTimeout(timeout);}
}
function section(id) {
 if(!NAV[id])return;
 state.section=id;
 $$('.panel').forEach(p=>p.hidden=p.id!=='panel-'+id);
 $$('#navigation [data-section],#mobile-nav [data-section]').forEach(b=>{
  const on=b.dataset.section===id;b.classList.toggle('current',on);
  b.setAttribute('aria-current',on?'page':'false');
 });
 $('#page-title').textContent=NAV[id][0];$('#crumb').textContent=NAV[id][0];
 $('#page-subtitle').textContent=NAV[id][1];$('#eyebrow').textContent='THE APPLE / '+NAV[id][0].toUpperCase();
 if(id==='analytics')renderAnalytics();if(id==='skins')renderSkins();
 if(id==='overview')renderOverview();if(id==='history')renderHistory();
 if(id==='daily')renderDaily();if(id==='weekly')renderWeekly();if(id==='tours')renderTours();
 if(id==='messages')renderMessages();
}
function metric(title,value,description) {
 return '<div class="metric"><strong>'+esc(title)+'</strong><div class="value">'+esc(value)+'</div><span>'+esc(description)+'</span></div>';
}
function countsFor(events,platform='all') {
 const m=new Map();
 for(const r of events||[])if(platform==='all'||platform===r.os)m.set(r.event,(m.get(r.event)||0)+r.n);
 return m;
}
function activeByDay(events,filter) {
 const map=new Map();
 for(const r of events||[]) {
  if(filter!=='all'&&r.os!==filter)continue;
  const record=map.get(r.day)||{active:0,install:0};
  if(r.event==='active_day')record.active+=r.n;
  if(r.event==='first_launch')record.install+=r.n;
  map.set(r.day,record);
 }
 return map;
}
function renderOverview() {
 const m=countsFor(state.stats?.daily||[]);
 $('#overview-kpis').innerHTML=[
  metric('Active-day reports',num(m.get('active_day')),'Opt-in device-day events · reporting window'),
  metric('First-launch reports',num(m.get('first_launch')),'New-device first launch events'),
  metric('Daily runs finished',num(m.get('daily_finish')),'Reported Daily Run completions'),
  metric('Purchase reports',num((state.stats?.daily||[]).filter(r=>r.event==='purchase'&&r.detail==='bought').reduce((a,r)=>a+r.n,0)),'Voluntary event count, not revenue')
 ].join('');
 const d=state.draft||clone(EMPTY),up=[];
 for(const x of d.daily||[])if(x.date>=nowKey)up.push({date:x.date,title:'Daily challenges · '+x.date,desc:'Three scheduled tasks'});
 for(const x of d.weekly||[])if(x.monday>=nowKey)up.push({date:x.monday,title:x.name,desc:'Weekly effect · '+x.type});
 for(const x of d.tours||[]) {
  const day=shift('2026-10-01',(x.number-1)*21);
  if(day>=nowKey)up.push({date:day,title:x.name,desc:'Orchard Tour · #'+x.number});
 }
 up.sort((a,b)=>a.date.localeCompare(b.date));
 $('#overview-schedule').innerHTML=up.length?up.slice(0,7).map(x=>'<div class="schedule-row"><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.desc)+'</small></div><small>'+esc(monthDay(x.date))+'</small></div>').join(''):'<div class="empty">No upcoming overrides. The built-in daily and seasonal rotation continues automatically.</div>';
 const h=state.health;
 $('#health-chip').textContent=h?.ok?'Connected':'Unverified';
 $('#health-box').innerHTML=h?
  '<div class="schedule-row"><span>Database</span><strong>Connected</strong></div>'+
  '<div class="schedule-row"><span>Live content</span><strong>Version '+num(h.liveVersion)+'</strong></div>'+
  '<div class="schedule-row"><span>Last stats day</span><strong>'+esc(h.lastStatsDay||'No data yet')+'</strong></div>'+
  '<div class="schedule-row"><span>Aggregate stat rows</span><strong>'+num(h.rows)+'</strong></div>'+
  '<p class="definition">Worker time: '+esc(new Date(h.time).toLocaleString())+'</p>':
  '<p class="definition">Health data is not available.</p>';
}
function selectedSkin() {return (state.draft?.skins||[]).find(x=>x.id===state.selectedSkin);}
function createSkin() {
 const name='New Apple',id='custom-'+Date.now().toString(36).toLowerCase();
 return {id,name,base:'#e85542',dark:'#a72324',light:'#ffb6a1',leaf:'#4eaa5b',
 cost:250,gloss:false,sparkle:false,stick:false,rainbow:false,active:true,tour:false};
}
function fillSkin(s) {
 state.selectedSkin=s.id;
 ['id','name','base','dark','light','leaf','cost'].forEach(k=>{$('#skin-'+k).value=s[k];});
 ['gloss','sparkle','stick','rainbow','active','tour'].forEach(k=>{$('#skin-'+k).checked=!!s[k];});
 $('#skin-preview-name').textContent=s.name;
 drawSkin();
}
function readSkin() {
 const s={};['id','name','base','dark','light','leaf'].forEach(k=>s[k]=$('#skin-'+k).value.trim());
 s.cost=Number($('#skin-cost').value);
 ['gloss','sparkle','stick','rainbow','active','tour'].forEach(k=>s[k]=$('#skin-'+k).checked);
 if(s.tour)s.cost=0;
 return s;
}
function drawSkin() {
 const canvas=$('#skin-preview'),ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,260,260);
 const s=readSkin();
 $('#skin-preview-name').textContent=s.name||'Custom Apple';
 if(state.drawApple){state.drawApple(ctx,130,141,78,{skin:s,time:0.5});return;}
 // Fallback is deliberately approximate; the game renderer is loaded when available.
 const g=ctx.createRadialGradient(95,100,4,130,130,110);
 g.addColorStop(0,s.light);g.addColorStop(.55,s.base);g.addColorStop(1,s.dark);
 ctx.beginPath();ctx.moveTo(130,67);ctx.bezierCurveTo(188,35,229,87,207,169);
 ctx.bezierCurveTo(195,216,157,226,130,214);ctx.bezierCurveTo(102,226,65,215,53,169);
 ctx.bezierCurveTo(31,86,76,35,130,67);ctx.fillStyle=g;ctx.fill();
 ctx.beginPath();ctx.ellipse(158,65,34,14,-.55,0,Math.PI*2);ctx.fillStyle=s.leaf;ctx.fill();
 ctx.fillStyle='#281d1e';ctx.beginPath();ctx.arc(104,135,7,0,7);ctx.arc(156,135,7,0,7);ctx.fill();
 ctx.beginPath();ctx.arc(130,152,18,0,Math.PI);ctx.strokeStyle='#281d1e';ctx.lineWidth=5;ctx.stroke();
}
function renderSkins() {
 const skins=state.draft?.skins||[];
 $('#skin-count').textContent=skins.length+' custom';
 $('#skin-list').innerHTML=skins.length?skins.map(s=>
 '<button type="button" class="skin-entry'+(s.id===state.selectedSkin?' selected':'')+'" data-skin="'+esc(s.id)+'"><span class="swatch" style="background:'+esc(s.base)+'"></span><span><b>'+esc(s.name)+'</b><small>'+esc(s.tour?'Tour reward':num(s.cost)+' stars')+(s.active?'':' · archived')+'</small></span></button>').join(''):
 '<div class="empty">No custom skins yet. Select “New skin” to start.</div>';
 if(!selectedSkin()&&skins.length)state.selectedSkin=skins[0].id;
 // Keep a newly created unsaved skin visible while editing. Do not replace
 // it with the first catalog item merely because it has not been saved.
 if(selectedSkin())fillSkin(selectedSkin());
 else if(!$('#skin-id').value)fillSkin(createSkin());
}
function replaceItem(name,key,value) {
 const list=state.draft[name],index=list.findIndex(x=>x[key]===value[key]);
 if(index>=0)list[index]=value;else list.push(value);
 markDirty();
}
function removeItem(name,key,value) {
 state.draft[name]=state.draft[name].filter(x=>x[key]!==value);
 markDirty();
}
function formDailyItems(items) {
 const data=items||CHALLENGES.map((arr,i)=>({id:arr[0][0],target:DEFAULT_TARGETS[arr[0][0]],label:'',icon:''}));
 $('#daily-editors').innerHTML=data.map((it,i)=>
  '<div class="challenge-row" data-tier="'+i+'"><h3>Tier '+(i+1)+' · '+['Easy','Medium','Hard'][i]+'</h3>'+
  '<label>Gameplay trigger<select class="challenge-id">'+CHALLENGES[i].map(([id,txt])=>
    '<option value="'+id+'"'+(id===it.id?' selected':'')+'>'+esc(txt)+'</option>').join('')+'</select></label>'+
  '<div class="form-two"><label>Required count<input class="challenge-target" type="number" min="1" max="100" value="'+esc(it.target)+'" required></label>'+
  '<label>Icon (optional)<input class="challenge-icon" maxlength="12" value="'+esc(it.icon||'')+'" placeholder="⭐"></label></div>'+
  '<label>Custom description (optional)<input class="challenge-label" maxlength="80" value="'+esc(it.label||'')+'" placeholder="Leave empty for the built-in description"></label></div>').join('');
}
function renderDaily() {
 const list=(state.draft?.daily||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
 $('#daily-list').innerHTML=list.length?list.map(d=>
 '<div class="schedule-row"><div><strong>'+esc(d.date)+'</strong><small>'+d.items.map(x=>esc(x.id)+' ×'+esc(x.target)).join(' · ')+'</small></div><button data-date="'+esc(d.date)+'">Edit</button></div>').join(''):
 '<div class="empty">No scheduled overrides. Automatic daily challenges still run.</div>';
 if(!$('#daily-date').value)$('#daily-date').value=nextDay;
 const selected=state.draft?.daily.find(x=>x.date===$('#daily-date').value);
 formDailyItems(selected?.items);
}
function readDaily() {return {date:$('#daily-date').value,items:$$('#daily-editors .challenge-row').map(r=>({
 id:r.querySelector('.challenge-id').value,target:Number(r.querySelector('.challenge-target').value),
 label:r.querySelector('.challenge-label').value.trim(),icon:r.querySelector('.challenge-icon').value.trim()
}))};}
function fillWeekly(w) {
 $('#weekly-date').value=w.monday;$('#weekly-type').value=w.type;$('#weekly-name').value=w.name;
 $('#weekly-icon').value=w.icon;$('#weekly-desc').value=w.desc;
}
function renderWeekly() {
 $('#weekly-type').innerHTML=Object.entries(EFFECTS).map(([id,e])=>'<option value="'+id+'">'+esc(e.name)+' · '+esc(e.desc)+'</option>').join('');
 const arr=(state.draft?.weekly||[]).slice().sort((a,b)=>a.monday.localeCompare(b.monday));
 $('#weekly-list').innerHTML=arr.length?arr.map(x=>
 '<div class="schedule-row"><div><strong>'+esc(x.icon)+' '+esc(x.name)+'</strong><small>'+esc(x.monday)+' · '+esc(x.type)+'</small></div><button data-week="'+esc(x.monday)+'">Edit</button></div>').join(''):
 '<div class="empty">No custom weeks scheduled. The four built-in weeks keep rotating.</div>';
 const day=$('#weekly-date').value||nextMonday();
 fillWeekly(arr.find(x=>x.monday===day)||{monday:day,type:'stars',...EFFECTS.stars});
}
function readWeekly() {return {monday:$('#weekly-date').value,type:$('#weekly-type').value,name:$('#weekly-name').value.trim(),icon:$('#weekly-icon').value.trim(),desc:$('#weekly-desc').value.trim()};}
function fillTour(t) {
 $('#tour-number').value=t.number;$('#tour-name').value=t.name;$('#tour-icon').value=t.icon;$('#tour-skin').value=t.skin;
 const start=shift('2026-10-01',(t.number-1)*21);
 $('#tour-dates').textContent='Tour #'+t.number+' runs '+start+' through '+shift(start,20)+'. The 15 built-in reward tiers remain unchanged.';
}
function renderTours() {
 $('#tour-skin').innerHTML=FIXED_TOUR_SKINS.map(id=>'<option value="'+id+'">'+esc(id)+' (built-in)</option>').join('')+
 (state.draft?.skins||[]).filter(s=>s.tour&&s.active).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' (custom reward)</option>').join('');
 const arr=(state.draft?.tours||[]).slice().sort((a,b)=>a.number-b.number);
 $('#tour-list').innerHTML=arr.length?arr.map(t=>
 '<div class="schedule-row"><div><strong>'+esc(t.icon)+' '+esc(t.name)+'</strong><small>Tour #'+esc(t.number)+' · reward: '+esc(t.skin)+'</small></div><button data-tour="'+esc(t.number)+'">Edit</button></div>').join(''):
 '<div class="empty">No custom tours yet. Built-in tours continue every 21 days.</div>';
 const n=Number($('#tour-number').value)||tourIndex();
 fillTour(arr.find(t=>t.number===n)||{number:n,name:'New Orchard Tour',icon:'🍎',skin:FIXED_TOUR_SKINS[(n-1)%FIXED_TOUR_SKINS.length]});
}
function readTour() {return {number:Number($('#tour-number').value),name:$('#tour-name').value.trim(),icon:$('#tour-icon').value.trim(),skin:$('#tour-skin').value};}
function renderMessages() {
 const n=state.draft?.notice;
 $('#notice-title').value=n?.title||'';$('#notice-body').value=n?.body||'';
 $('#notice-start').value=n?.start||nowKey;$('#notice-end').value=n?.end||shift(nowKey,7);
 $('#notice-enabled').checked=!!n?.enabled;
 for(const key of ['pauseInterstitials','pauseRewarded','pauseBanners'])
  $('#flag-'+key).checked=!!state.draft?.flags[key];
}
function dataTable(headers,rows) {
 if(!rows?.length)return '<div class="empty">No reports for this selection yet.</div>';
 return '<table class="data-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
 rows.map(r=>'<tr>'+r.map((v,i)=>'<td'+(i===r.length-1?' class="num"':'')+'>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
function renderChart(daymap) {
 const entries=[...daymap].sort((a,b)=>a[0].localeCompare(b[0]));const w=640,h=230,p=28;
 if(!entries.length)return '<div class="empty">No activity reported yet.</div>';
 const max=Math.max(1,...entries.map(([,r])=>Math.max(r.active,r.install)));
 const step=entries.length>1?(w-p*2)/(entries.length-1):0;
 const plot=key=>entries.map(([,r],i)=>(p+i*step).toFixed(1)+','+(h-p-(r[key]/max)*(h-p*2)).toFixed(1)).join(' ');
 const last=entries.at(-1)[0],first=entries[0][0];
 return '<svg viewBox="0 0 640 230" class="bar-chart" role="img" aria-label="Daily active-device reports and first-launch reports from '+esc(first)+' to '+esc(last)+'">'+
 '<path d="M28 202 H612" fill="none" stroke="#d6e4d6" stroke-width="1.5"/>'+
 '<polyline points="'+plot('active')+'" fill="none" stroke="#367d51" stroke-width="3.2" stroke-linejoin="round"/>'+
 '<polyline points="'+plot('install')+'" fill="none" stroke="#eab26b" stroke-width="2.8" stroke-linejoin="round"/>'+
 '<text x="28" y="20" font-size="12" fill="#6f8170">'+esc(num(max))+' reports</text>'+
 '<text x="28" y="222" font-size="12" fill="#708473">'+esc(first)+'</text>'+
 '<text x="570" y="222" font-size="12" fill="#708473">'+esc(last.slice(5))+'</text></svg>'+
 '<div class="legend"><span><i></i> Active-day reports</span><span><i class="second"></i> First launches</span></div>';
}
function renderAnalytics() {
 const raw=state.stats?.daily||[],platform=$('#stats-platform').value;
 const filtered=raw.filter(r=>platform==='all'||r.os===platform);
 const m=countsFor(filtered);
 const purchase=filtered.filter(r=>r.event==='purchase'&&r.detail==='bought').reduce((a,r)=>a+r.n,0);
 $('#analytics-kpis').innerHTML=[
  metric('Active-day reports',num(m.get('active_day')),'Device-day events, not verified unique people'),
  metric('First launches',num(m.get('first_launch')),'Opt-in first-launch events'),
  metric('Daily finishes',num(m.get('daily_finish')),'Reported Daily Run results'),
  metric('Purchases reported',num(purchase),'Events only; verify payments in store consoles')
 ].join('');
 $('#activity-chart').innerHTML=renderChart(activeByDay(filtered,'all'));
 const conversion=[
  ['Paywall opened',m.get('paywall')||0],['Purchase successful (reported)',purchase],
  ['Purchase restored',filtered.filter(r=>r.event==='purchase'&&r.detail==='restored').reduce((a,r)=>a+r.n,0)],
  ['Shares',m.get('share')||0],['Second tries',m.get('retry')||0]
 ];
 $('#conversion-box').innerHTML=dataTable(['Event','Count'],conversion.map(([x,n])=>[x,num(n)]))+
 '<p class="definition">No real conversion rate or revenue is inferred from aggregated optional reports.</p>';
 const levelMap=new Map();
 for(const r of state.stats?.levels||[]) {
  const x=levelMap.get(r.detail)||{clear:0,fail:0,reached:0};x[r.event.replace('level_','')]=(x[r.event.replace('level_','')]||0)+r.n;levelMap.set(r.detail,x);
 }
 const levelArr=[...levelMap].map(([level,r])=>({
 level:Number(level),...r,percent:(r.clear+r.fail)>0?r.clear/(r.clear+r.fail):null
 })).filter(r=>r.clear+r.fail>=2).sort((a,b)=>(a.percent??1)-(b.percent??1)).slice(0,20);
 $('#level-report').innerHTML=dataTable(['Level','Clears','Fails','Success rate'],
  levelArr.map(x=>[x.level,num(x.clear),num(x.fail),Math.round(x.percent*100)+'%']));
 const rankMap=new Map();for(const r of state.stats?.ranks||[]) {
  const x=rankMap.get(r.num)||{players:0,top:0};
  x.players+=r.n;x.top=Math.max(x.top,r.score);rankMap.set(r.num,x);
 }
 $('#rank-report').innerHTML=platform==='all'
  ? dataTable(['Daily #','Score reports','Top score'],[...rankMap].sort((a,b)=>b[0]-a[0]).slice(0,20).map(([id,x])=>[id,num(x.players),num(x.top)]))
  : '<div class="empty">Daily rankings have no platform data. Select Both platforms to view them.</div>';
 const byEvent=[...m].sort((a,b)=>b[1]-a[1]);
 $('#event-report').innerHTML=dataTable(['Event','Reports'],byEvent.map(([k,v])=>[k,num(v)]));
}
function renderHistory() {
 $('#version-list').innerHTML=dataTable(['Version','Date','Action','Restore'],
 state.history.map(h=>['v'+h.version,new Date(h.created_at).toLocaleString(),h.action+' · '+(h.note||''),
 ''])); // add action buttons with separate delegated click handlers below
 const tbody=$('#version-list tbody');
 if(tbody)state.history.forEach((x,i)=>{
  const td=tbody.rows[i]?.lastElementChild;
  if(td){td.textContent='';const b=document.createElement('button');b.className='btn secondary';b.textContent='Restore';b.dataset.restore=x.version;td.appendChild(b);}
 });
 const live=state.live;
 $('#settings-details').innerHTML=
 '<div class="schedule-row"><span>Current live version</span><strong>v'+esc(live?.version??0)+'</strong></div>'+
 '<div class="schedule-row"><span>Last editor</span><strong>'+esc(live?.editedBy||'System')+'</strong></div>'+
 '<div class="schedule-row"><span>Last publish</span><strong>'+esc(live?.editedAt||'Never')+'</strong></div>'+
 '<div class="schedule-row"><span>Signed in as</span><strong>'+esc(state.actor||'Verified admin')+'</strong></div>'+
 '<div class="schedule-row"><span>Content schema</span><strong>v1 · data only</strong></div>';
}
async function load({resetEditor=false}={}) {
 const [data,health,stats,history]=await Promise.all([
  api('content'),api('health'),api('stats?days='+$('#stats-window').value+'&platform='+$('#stats-platform').value),api('history')
 ]);
 if(state.dirty&&!resetEditor)throw Error('There are unsaved changes. Save or discard them before reloading.');
 state.live=data.live;state.draftVersion=data.draft?.version??0;
 state.draft=clone(data.draft?.content||data.live?.content||EMPTY);
 state.saved=data.draft?clone(state.draft):null;state.dirty=false;state.loaded=true;
 state.health=health;state.stats=stats;state.history=history.items||[];state.actor=data.actor||'';
 state.selectedSkin=null;
 updateToolbar();renderOverview();renderSkins();renderDaily();renderWeekly();renderTours();renderMessages();renderAnalytics();renderHistory();note('');
}
async function saveDraft() {
 if(!state.dirty)return;
 const r=await api('draft',{method:'PUT',body:{baseVersion:state.draftVersion,content:state.draft}});
 state.draftVersion=r.version;state.saved=clone(state.draft);state.dirty=false;
 updateToolbar();note('Draft saved as version '+r.version+'. Players still see live version '+state.live.version+'.');
}
async function publish() {
 if(state.dirty)throw Error('Save the draft first.');
 const message=prompt('Publishing makes this version available to players at their next app launch.\n\nOptional release note:','');
 if(message===null)return;
 if(!confirm('Publish saved draft v'+state.draftVersion+' to production?'))return;
 const r=await api('publish',{method:'POST',body:{draftVersion:state.draftVersion,liveVersion:state.live.version,note:message}});
 await load({resetEditor:true});note('Published live content version '+r.version+'.');
}
async function rollback(version) {
 if(!confirm('Restore the content of v'+version+' as a NEW live version? Existing progress will not be touched.'))return;
 if(state.dirty)throw Error('Save or discard unsaved edits first.');
 const r=await api('rollback',{method:'POST',body:{version,liveVersion:state.live.version}});
 await load({resetEditor:true});note('Restored version '+version+' into new live version '+r.version+'.');
}
function download(filename,content,type) {
 const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function setup() {
 $$('#navigation [data-section]').forEach(b=>{
  const copy=b.cloneNode(true);copy.textContent=b.textContent.trim();$('#mobile-nav').append(copy);
 });
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');
  if(!b)return;
  try {
   if(b.dataset.section){section(b.dataset.section);return;}
   if(b.dataset.skin){fillSkin(state.draft.skins.find(s=>s.id===b.dataset.skin));renderSkins();return;}
   if(b.dataset.date){$('#daily-date').value=b.dataset.date;renderDaily();return;}
   if(b.dataset.week){fillWeekly(state.draft.weekly.find(x=>x.monday===b.dataset.week));return;}
   if(b.dataset.tour){fillTour(state.draft.tours.find(x=>x.number===Number(b.dataset.tour)));return;}
   if(b.dataset.restore){await rollback(Number(b.dataset.restore));return;}
  }catch(err){note(err.message,true);}
 });
 $('#save-draft').addEventListener('click',()=>saveDraft().catch(e=>note(e.message,true)));
 $('#publish').addEventListener('click',()=>publish().catch(e=>note(e.message,true)));
 $('#refresh-all').addEventListener('click',()=>load().catch(e=>note(e.message,true)));
 $('#reload-content').addEventListener('click',async()=>{
  if(state.dirty&&!confirm('Discard unsaved edits and reload saved draft?'))return;
  await load({resetEditor:true}).catch(e=>note(e.message,true));
 });
 $('#new-skin').addEventListener('click',()=>{fillSkin(createSkin());});
 $('#duplicate-skin').addEventListener('click',()=>{
  const s=readSkin();s.id=createSkin().id;s.name=(s.name||'Apple')+' Copy';fillSkin(s);
 });
 $('#skin-form').addEventListener('input',drawSkin);
 $('#skin-form').addEventListener('submit',e=>{
  e.preventDefault();const s=readSkin();
  if(s.name.length<2){note('A skin needs a display name.',true);return;}
  if(s.tour&&s.cost!==0)s.cost=0;
  replaceItem('skins','id',s);state.selectedSkin=s.id;renderSkins();renderTours();note('Skin applied to draft. Save and publish when ready.');
 });
 $('#daily-date').addEventListener('change',renderDaily);
 $('#daily-form').addEventListener('submit',e=>{
  e.preventDefault();const d=readDaily();
  if(!d.date||d.items.length!==3){note('Select a date and exactly three challenges.',true);return;}
  if(d.date<nextDay&&!confirm('Changing an active or past Daily can create inconsistent schedules. Continue?'))return;
  replaceItem('daily','date',d);renderDaily();note('Daily set staged.');
 });
 $('#remove-daily').addEventListener('click',()=>{removeItem('daily','date',$('#daily-date').value);renderDaily();});
 $('#weekly-date').addEventListener('change',()=>{const w=state.draft.weekly.find(x=>x.monday===$('#weekly-date').value);if(w)fillWeekly(w);});
 $('#weekly-type').addEventListener('change',()=>{const x=EFFECTS[$('#weekly-type').value];$('#weekly-name').value=x.name;$('#weekly-icon').value=x.icon;$('#weekly-desc').value=x.desc;});
 $('#weekly-form').addEventListener('submit',e=>{
  e.preventDefault();const w=readWeekly();
  if(new Date(w.monday+'T12:00:00Z').getUTCDay()!==1){note('A weekly event must start on Monday.',true);return;}
  if(w.monday<nextMonday()&&!confirm('Editing a current or past event may change fairness across active players. Continue?'))return;
  replaceItem('weekly','monday',w);renderWeekly();note('Weekly event staged.');
 });
 $('#remove-weekly').addEventListener('click',()=>{removeItem('weekly','monday',$('#weekly-date').value);renderWeekly();});
 $('#tour-number').addEventListener('change',renderTours);
 $('#tour-form').addEventListener('submit',e=>{e.preventDefault();const t=readTour();replaceItem('tours','number',t);renderTours();note('Tour staged.');});
 $('#remove-tour').addEventListener('click',()=>{removeItem('tours','number',Number($('#tour-number').value));renderTours();});
 $('#notice-form').addEventListener('submit',e=>{
  e.preventDefault();state.draft.notice={title:$('#notice-title').value.trim(),body:$('#notice-body').value.trim(),
   start:$('#notice-start').value,end:$('#notice-end').value,enabled:$('#notice-enabled').checked};
  markDirty();note('Announcement staged.');
 });
 $('#clear-notice').addEventListener('click',()=>{state.draft.notice=null;markDirty();renderMessages();});
 for(const key of ['pauseInterstitials','pauseRewarded','pauseBanners'])$('#flag-'+key).addEventListener('change',e=>{
  state.draft.flags[key]=e.target.checked;markDirty();
 });
 const refreshStats=async()=>{try{state.stats=await api('stats?days='+$('#stats-window').value+'&platform='+$('#stats-platform').value);renderAnalytics();renderOverview();}catch(e){note(e.message,true);}};
 $('#stats-window').addEventListener('change',refreshStats);
 $('#stats-platform').addEventListener('change',refreshStats);
 $('#export-stats').addEventListener('click',()=>{
  const rows=[['date','platform','app_version','event','detail','count'],
   ...(state.stats?.daily||[]).map(r=>[r.day,r.os,r.app,r.event,r.detail,r.n])];
  download('the-apple-stats-'+nowKey+'.csv',rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n'),'text/csv');
 });
 $('#download-content').addEventListener('click',()=>download('the-apple-draft.json',JSON.stringify(state.draft,null,2),'application/json'));
 $('#play-preview').addEventListener('click',()=>{
  // Same-origin private test game. Preview data is only used when ?contentPreview=1.
  localStorage.setItem('the-apple.content.preview.v1',JSON.stringify({version:0,content:state.draft,expires:Date.now()+3600000}));
  // An anchor with rel=noopener prevents the test page from controlling the
  // administration window and avoids a false "popup blocked" error in browsers
  // that intentionally return null from window.open(..., 'noopener').
  const a=document.createElement('a');
  a.href='/apple/test/?contentPreview=1';a.target='_blank';a.rel='noopener noreferrer';
  document.body.append(a);a.click();a.remove();
 });
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();if(state.dirty)saveDraft().catch(err=>note(err.message,true));}
 });
 window.addEventListener('beforeunload',e=>{
  if(state.dirty){e.preventDefault();e.returnValue='';}
 });
}
setup();
load().then(async()=>{
 section('overview');
 try{const mod=await import('/apple/test/js/render.js');state.drawApple=mod.drawApple;drawSkin();}
 catch{ /* Fallback preview remains available if private game assets are offline. */ }
}).catch(err=>{setStatus('Connection failed');note(err.message,true);});
