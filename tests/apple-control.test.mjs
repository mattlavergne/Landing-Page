// Security and publication regression tests for the Apple Control Center.
// Run: node --test tests/apple-control.test.mjs (Node 22+).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { validateContent, verifyAppleAdmin, handleAppleControl, publicAppleContent, legacyContent, upgradeContent, tourStart } from '../src/apple-control.js';
import worker from '../src/index.js';

const blank = () => ({ schema:2, skins:[], daily:[], weekly:[], tours:[], notices:[],
  flags:{pauseInterstitials:false,pauseRewarded:false,pauseBanners:false} });
const skin = () => ({
 id:'custom-safe-apple',name:'Safety Apple',base:'#e8392f',dark:'#a3171a',
 light:'#ff9a86',leaf:'#4caf50',cost:150,gloss:false,sparkle:false,
 stick:false,rainbow:false,active:true,tour:false,
});
const dbFile = new DatabaseSync(':memory:');
const prepare = (sql,args=[]) => ({
 bind:(...values)=>prepare(sql,values),
 run:async()=>{const r=dbFile.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},
 first:async()=>dbFile.prepare(sql).get(...args)??null,
 all:async()=>({results:dbFile.prepare(sql).all(...args)}),
 exec:()=>{const r=dbFile.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},
});
const db={
 prepare:(sql)=>prepare(sql),
 batch:async jobs=>{
  dbFile.exec('BEGIN');
  try {const results=jobs.map(x=>x.exec());dbFile.exec('COMMIT');return results;}
  catch(e){dbFile.exec('ROLLBACK');throw e;}
 }
};
const env = {
 APPLE_DB:db,
 APPLE_ACCESS_TEAM_DOMAIN:'apple-unit.cloudflareaccess.com',
 APPLE_ACCESS_AUD:'apple-unit-aud',
 APPLE_ADMIN_EMAILS:'admin@example.test',
 ASSETS:{fetch:async()=>new Response('<html>Admin portal</html>',{headers:{'Content-Type':'text/html'}})}
};
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const publicJwk=publicKey.export({format:'jwk'});
const jwk={...publicJwk,kid:'unit-key',alg:'RS256',use:'sig'};
const realFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 assert.equal(String(url),'https://apple-unit.cloudflareaccess.com/cdn-cgi/access/certs');
 return Response.json({keys:[jwk]});
};
const seconds=()=>Math.floor(Date.now()/1000);
const token=(claims={})=>{
 const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'unit-key',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({
   iss:'https://apple-unit.cloudflareaccess.com',
   aud:['apple-unit-aud'],email:'admin@example.test',iat:seconds()-2,nbf:seconds()-2,
   exp:seconds()+3600,...claims
 })).toString('base64url');
 const input=header+'.'+payload;
 const signature=createSign('RSA-SHA256').update(input).sign(privateKey,'base64url');
 return input+'.'+signature;
};
const adminToken=token();
const req=(path,method='GET',body=null,opts={})=>{
 const headers={
  ...(opts.token===false?{}:{'Cf-Access-Jwt-Assertion':opts.token||adminToken}),
  ...(opts.origin===false?{}:{Origin:opts.origin||'https://mattlavergne.com'}),
  ...(body!==null?{'Content-Type':'application/json','X-Apple-Control':'1'}:{})
 };
 if(opts.noCustom)delete headers['X-Apple-Control'];
 return new Request('https://mattlavergne.com'+path,{method,headers,
   ...(body===null?{}:{body:JSON.stringify(body)})});
};
const json=async r=>({status:r.status,body:await r.json()});
const valid=blank();

test('schema accepts safe content and rejects executable strings, extra fields, conflicting schedules',()=>{
 assert.deepEqual(validateContent(valid),[]);
 const incomplete=blank(); incomplete.flags={};
 assert.ok(validateContent(incomplete).length,'all three ad flags are required');
 const withSkin=blank();withSkin.skins=[skin()];
 assert.deepEqual(validateContent(withSkin),[]);
 withSkin.skins[0].name='<img src=x onerror=alert(1)>';
 assert.ok(validateContent(withSkin).length);
 const extras=blank();extras.payload='alert(1)';
 assert.ok(validateContent(extras).length);
 const weekly=blank();
 weekly.weekly=[{monday:'2026-10-20',type:'xp',name:'Week',icon:'🍎',desc:'XP'}];
 assert.ok(validateContent(weekly).length,'weekly must begin Monday');
 const daily=blank();
 daily.daily=[{date:'2026-10-24',items:[
  {id:'grade',target:1,label:'',icon:''},
  {id:'nerve',target:10,label:'',icon:''},
  {id:'deep',target:9,label:'',icon:''},
 ]}];
 assert.ok(validateContent(daily).length,'wrong-tier challenge must fail');
 const notice=blank();notice.notices=[{id:'a',
   title:'<svg onload=alert(1)>',body:'Hello',start:'2026-10-20',end:'2026-10-22',enabled:true}];
 assert.ok(validateContent(notice).length);
 const backwards=blank();backwards.notices=[{id:'a',title:'Hi',body:'',start:'2026-10-22',end:'2026-10-20',enabled:true}];
 assert.ok(validateContent(backwards).length,'an announcement can\'t end before it starts');
 const twice=blank();twice.notices=[{id:'a',title:'Hi',body:'',start:'2026-10-20',end:'2026-10-22',enabled:true},{id:'a',title:'Hi',body:'',start:'2026-10-20',end:'2026-10-22',enabled:true}];
 assert.ok(validateContent(twice).length,'announcement ids are unique');
 const newTour=blank();newTour.tours=[{number:30,name:'Dragon Tour',icon:'🐉',skin:'dragon'}];
 assert.deepEqual(validateContent(newTour),[],'all 16 of the game\'s tour skins are known');
 const duplicate=blank();duplicate.weekly=[
  {monday:'2026-10-19',type:'xp',name:'XP',icon:'🍎',desc:'XP'},
  {monday:'2026-10-19',type:'stars',name:'Stars',icon:'⭐',desc:'Stars'}
 ];
 assert.ok(validateContent(duplicate).length);
});

test('multiline announcements are normalized for already-installed clients',async()=>{
 const {deviceCompatibleContent}=await import('../src/apple-control.js');
 const c=blank();
 c.notices=[{id:'a',title:'Update',body:'First line\nSecond line\tand more',start:'2026-10-19',end:'2026-10-25',enabled:true}];
 assert.deepEqual(validateContent(c),[],'portal used to allow line breaks');
 const safe=deviceCompatibleContent(c);
 assert.equal(safe.notices[0].body,'First line Second line and more');
 assert.equal(c.notices[0].body,'First line\nSecond line\tand more','input is not mutated');
 assert.deepEqual(validateContent(safe),[]);
 const saved=await json(await handleAppleControl(req('/apple/admin/api/content'),env));
 assert.equal(saved.status,200);
});

test('admin is closed by default and rejects unsigned, expired, wrong-audience or unknown-identity tokens',async()=>{
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content','GET',null,{token:false}),env),null);
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content','GET',null,{token:'a.b.c'}),env),null);
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content','GET',null,{token:token({exp:seconds()-1})}),env),null);
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content','GET',null,{token:token({aud:['different']})}),env),null);
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content','GET',null,{token:token({email:'stranger@example.test'})}),env),null);
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content'),{...env,APPLE_ADMIN_EMAILS:''}),null);
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content'),env),'admin@example.test');
 const forged=adminToken.slice(0,-7)+'forged!';
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content','GET',null,{token:forged}),env),null);
});

test('private portal, analytics, and assets refuse unauthenticated visitors',async()=>{
 for(const path of ['/apple/portal','/apple/admin/api/content','/apple/admin/api/stats','/apple/stats']) {
  const r=await worker.fetch(req(path,'GET',null,{token:false}),env);
  assert.equal(r.status,403,path);
 }
 const raw=await worker.fetch(req('/apple-control/app.js','GET',null,{token:false}),env);
 assert.equal(raw.status,404,'raw static admin JS must not be publicly routable');
 const page=await worker.fetch(req('/apple/portal'),env);
 assert.equal(page.status,200);
 assert.ok(page.headers.get('Content-Security-Policy')?.includes("object-src 'none'"));
 assert.ok(!page.headers.get('Content-Security-Policy')?.includes('unsafe-inline'));
});

test('publishing is verified, same-origin, versioned, read-only to public, and preserves released skins',async()=>{
 const first=await json(await handleAppleControl(req('/apple/admin/api/content'),env));
 assert.equal(first.status,200);assert.equal(first.body.live.version,0);
 assert.equal(first.body.draft,null);
 const outside=await handleAppleControl(req('/apple/admin/api/draft','PUT',{baseVersion:0,content:blank()},{origin:'https://attacker.example'}),env);
 assert.equal(outside.status,403,'wrong origin');
 const headerless=await handleAppleControl(req('/apple/admin/api/draft','PUT',{baseVersion:0,content:blank()},{noCustom:true}),env);
 assert.equal(headerless.status,400,'require custom CSRF header');
 const settings=blank();settings.skins=[skin()];settings.flags.pauseInterstitials=true;
 const draft=await json(await handleAppleControl(req('/apple/admin/api/draft','PUT',{baseVersion:0,content:settings}),env));
 assert.equal(draft.status,200);
 assert.equal(draft.body.version,1);
 const failed=await handleAppleControl(req('/apple/admin/api/publish','POST',{liveVersion:0,draftVersion:2}),env);
 assert.equal(failed.status,409,'wrong draft revision');
 const published=await json(await handleAppleControl(req('/apple/admin/api/publish','POST',{liveVersion:0,draftVersion:1,note:'First release'}),env));
 assert.equal(published.status,200);
 assert.equal(published.body.version,1);
 const current=await json(await publicAppleContent(req('/api/apple/content','GET',null,{token:false}),env));
 assert.equal(current.status,200);
 assert.equal(current.body.version,1);
 assert.equal(current.body.content.skins[0].name,'Safety Apple');
 assert.equal(current.body.content.flags.pauseInterstitials,true);
 assert.equal(current.body.actor,undefined);
 assert.equal(current.body.draft,undefined);
 const refused=await publicAppleContent(req('/api/apple/content','POST',blank(),{token:false}),env);
 assert.equal(refused.status,405,'public endpoint must never publish');
 const cors=await publicAppleContent(req('/api/apple/content','GET',null,{token:false,origin:'https://attacker.example'}),env);
 assert.notEqual(cors.headers.get('Access-Control-Allow-Origin'),'https://attacker.example');
 const stale=await handleAppleControl(req('/apple/admin/api/publish','POST',{liveVersion:0,draftVersion:1}),env);
 assert.equal(stale.status,409,'stale publication denied');
 const cleared=await json(await handleAppleControl(req('/apple/admin/api/content'),env));
 assert.equal(cleared.body.draft,null,'publishing clears the draft');
 const draft2=await json(await handleAppleControl(req('/apple/admin/api/draft','PUT',{baseVersion:0,content:blank()}),env));
 assert.equal(draft2.status,200);
 const published2=await json(await handleAppleControl(req('/apple/admin/api/publish','POST',{liveVersion:1,draftVersion:1}),env));
 assert.equal(published2.status,200);
 assert.equal(published2.body.version,2);
 const after=await json(await publicAppleContent(req('/api/apple/content','GET',null,{token:false}),env));
 assert.equal(after.body.content.skins[0].id,'custom-safe-apple','published cosmetics are retained');
 assert.equal(after.body.content.skins[0].active,false,'removed cosmetics are archived for owners');
 const history=await json(await handleAppleControl(req('/apple/admin/api/history'),env));
 assert.deepEqual(history.body.items.map(x=>x.version),[2,1]);
 const rollback=await json(await handleAppleControl(req('/apple/admin/api/rollback','POST',{version:1,liveVersion:2}),env));
 assert.equal(rollback.status,200);
 assert.equal(rollback.body.version,3,'rollback makes new version, not rewrites history');
});
test('analytics platform filtering excludes other OS and old levels',async()=>{
 const day=new Date().toISOString().slice(0,10);
 const old=new Date(Date.now()-50*864e5).toISOString().slice(0,10);
 for(const [d,os,event,n] of [[day,'ios','level_clear',2],[day,'android','level_fail',3],[old,'ios','level_fail',7]]) {
  await db.prepare('INSERT INTO apple_stats (day,os,app,event,detail,n) VALUES (?,?,?,?,?,?) ON CONFLICT (day,os,app,event,detail) DO UPDATE SET n=n+excluded.n').bind(d,os,'1.0',event,'3',n).run();
 }
 const ios=await json(await handleAppleControl(req('/apple/admin/api/stats?days=7&platform=ios'),env));
 assert.equal(ios.status,200);
 assert.ok(ios.body.levels.some(x=>x.event==='level_clear'&&x.n>=2));
 assert.ok(!ios.body.levels.some(x=>x.event==='level_fail'));
 assert.deepEqual(ios.body.ranks,[]);
 const all=await json(await handleAppleControl(req('/apple/admin/api/stats?days=7&platform=all'),env));
 assert.ok(all.body.levels.some(x=>x.event==='level_fail'&&x.n>=3));
 assert.equal((await handleAppleControl(req('/apple/admin/api/stats?platform=bad'),env)).status,400);
});
// The edge cache (caches.default), in memory, for the tests below.
const cacheStore=new Map();
globalThis.caches={default:{
 match:async r=>{const h=cacheStore.get(r.url);return h&&h.until>Date.now()?new Response(h.body,{headers:h.headers}):undefined;},
 put:async(r,res)=>{const age=Number((res.headers.get('Cache-Control')||'').match(/max-age=(\d+)/)?.[1]||0);cacheStore.set(r.url,{body:await res.text(),headers:[...res.headers],until:Date.now()+age*1000});},
 delete:async r=>cacheStore.delete(r.url),
}};
const liveNow=async()=>(await json(await handleAppleControl(req('/apple/admin/api/content'),env))).body;
const publishDoc=async(content,note='test')=>{
 const now=await liveNow();
 const d=await json(await handleAppleControl(req('/apple/admin/api/draft','PUT',{baseVersion:now.draft?.version||0,content}),env));
 if(d.status!==200)return d;
 return json(await handleAppleControl(req('/apple/admin/api/publish','POST',{liveVersion:now.live.version,draftVersion:d.body.version,note}),env));
};

test('several announcements; copies of the game from before get the one showing today, in the old format',async()=>{
 const today=new Date().toISOString().slice(0,10),later=new Date(Date.now()+5*864e5).toISOString().slice(0,10),past=new Date(Date.now()-5*864e5).toISOString().slice(0,10);
 const c=blank();
 c.notices=[{id:'old',title:'Old news',body:'',start:past,end:past,enabled:true},{id:'now',title:'Today',body:'Hi',start:past,end:later,enabled:true},{id:'soon',title:'Soon',body:'',start:later,end:later,enabled:true},{id:'off',title:'Off',body:'',start:past,end:later,enabled:false}];
 const v1=legacyContent(c,today);
 assert.equal(v1.schema,1);assert.equal(v1.notices,undefined);
 assert.equal(v1.notice.title,'Today');
 assert.equal(legacyContent({...c,notices:c.notices.filter(n=>n.id!=='now')},today).notice.title,'Soon','none today: the next one');
 assert.equal(legacyContent(blank(),today).notice,null);
 const up=upgradeContent({schema:1,skins:[],daily:[],weekly:[],tours:[],flags:c.flags,notice:{title:'A',body:'B',start:today,end:today,enabled:true}});
 assert.equal(up.schema,2);assert.equal(up.notices[0].title,'A');assert.equal(up.notice,undefined);
 assert.deepEqual(validateContent(up),[]);
 const r=await publishDoc(c);
 assert.equal(r.status,200,JSON.stringify(r.body));
 cacheStore.clear();
 const v2=await json(await publicAppleContent(req('/api/apple/content?schema=2','GET',null,{token:false}),env,{}));
 assert.equal(v2.body.content.schema,2);assert.equal(v2.body.content.notices.length,4);
 const old=await json(await publicAppleContent(req('/api/apple/content','GET',null,{token:false}),env,{}));
 assert.equal(old.body.content.schema,1);assert.equal(old.body.content.notice.title,'Today');
 assert.ok(!('notices' in old.body.content),'an older copy only gets fields it knows');
});

test('public content: cached for 30 seconds, 304 for a phone that has it, fresh at once after publishing',async()=>{
 cacheStore.clear();
 let reads=0;
 const counting={...env,APPLE_DB:{...db,prepare:sql=>{if(/FROM apple_control_live/.test(sql))reads++;return db.prepare(sql);}}};
 const a=await publicAppleContent(req('/api/apple/content?schema=2','GET',null,{token:false}),counting,{});
 const b=await publicAppleContent(req('/api/apple/content?schema=2','GET',null,{token:false}),counting,{});
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(reads,1,'the second request came from the cache, not the database');
 const etag=a.headers.get('ETag');
 assert.match(etag,/^"v\d+-s2"$/);
 const same=await publicAppleContent(new Request('https://mattlavergne.com/api/apple/content?schema=2',{headers:{'If-None-Match':etag}}),counting,{});
 assert.equal(same.status,304);
 const before=(await b.json()).version;
 const c=blank();c.flags.pauseBanners=true;
 assert.equal((await publishDoc(c)).status,200);
 const after=await json(await publicAppleContent(req('/api/apple/content?schema=2','GET',null,{token:false}),env,{}));
 assert.equal(after.body.version,before+1,'publishing empties the cache');
 assert.equal(after.body.content.flags.pauseBanners,true);
 const head=await publicAppleContent(new Request('https://mattlavergne.com/api/apple/content',{method:'HEAD'}),env,{});
 assert.equal(head.status,200);
 for(const m of ['POST','PUT','DELETE']) assert.equal((await publicAppleContent(new Request('https://mattlavergne.com/api/apple/content',{method:m}),env,{})).status,405,m);
});

test('a tour that has started keeps its name, icon and reward until it ends',async()=>{
 const current=Math.floor((Date.now()-Date.UTC(2026,9,1))/(21*864e5))+1;
 assert.ok(tourStart(current)<=new Date().toISOString().slice(0,10));
 const c=blank();
 c.tours=[{number:current+3,name:'Future Tour',icon:'🍎',skin:'dragon'}];
 assert.equal((await publishDoc(c)).status,200,'a tour that hasn\'t started can be set');
 const running=blank();running.tours=[...c.tours,{number:current,name:'Changed',icon:'🍎',skin:'pearl'}];
 const refused=await publishDoc(running);
 assert.equal(refused.status,422);assert.match(refused.body.error,new RegExp(`Orchard Tour ${current}`));
 const moved=blank();moved.tours=[{number:current+3,name:'Renamed',icon:'🍏',skin:'pearl'}];
 assert.equal((await publishDoc(moved)).status,200,'future tours can still change');
 const removed=blank();
 assert.equal((await publishDoc(removed)).status,200);
});

test('a draft can be thrown away; publishing needs the draft that was reviewed',async()=>{
 const now=await liveNow();
 const d=await json(await handleAppleControl(req('/apple/admin/api/draft','PUT',{baseVersion:now.draft?.version||0,content:blank()}),env));
 assert.equal(d.status,200);
 const wrong=await handleAppleControl(req('/apple/admin/api/discard','POST',{draftVersion:d.body.version+5}),env);
 assert.equal(wrong.status,409);
 const ok=await handleAppleControl(req('/apple/admin/api/discard','POST',{draftVersion:d.body.version}),env);
 assert.equal(ok.status,200);
 assert.equal((await liveNow()).draft,null);
 const outside=await handleAppleControl(req('/apple/admin/api/discard','POST',{draftVersion:1},{origin:'https://attacker.example'}),env);
 assert.equal(outside.status,403);
});

test('forged tokens with made-up key ids can\'t make the Worker fetch keys over and over',async()=>{
 let fetches=0;
 const prev=globalThis.fetch;
 globalThis.fetch=async url=>{fetches++;return Response.json({keys:[jwk]});};
 const forge=kid=>{const h=Buffer.from(JSON.stringify({alg:'RS256',kid,typ:'JWT'})).toString('base64url');return h+'.'+adminToken.split('.')[1]+'.'+adminToken.split('.')[2];};
 for(let i=0;i<20;i++) assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content','GET',null,{token:forge('made-up-'+i)}),env),null);
 assert.ok(fetches<=1,`fetched keys ${fetches} times for 20 forged tokens`);
 assert.equal(await verifyAppleAdmin(req('/apple/admin/api/content'),env),'admin@example.test','the real key still works');
 globalThis.fetch=prev;
});

process.on('exit',()=>{globalThis.fetch=realFetch;});
