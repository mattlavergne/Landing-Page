// Security and publication regression tests for the Apple Control Center.
// Run: node --test tests/apple-control.test.mjs (Node 22+).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { validateContent, verifyAppleAdmin, handleAppleControl, publicAppleContent } from '../src/apple-control.js';
import worker from '../src/index.js';

const blank = () => ({ schema:1, skins:[], daily:[], weekly:[], tours:[], notice:null,
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
 const notice=blank();notice.notice={
   title:'<svg onload=alert(1)>',body:'Hello',start:'2026-10-20',end:'2026-10-22',enabled:true};
 assert.ok(validateContent(notice).length);
 const duplicate=blank();duplicate.weekly=[
  {monday:'2026-10-19',type:'xp',name:'XP',icon:'🍎',desc:'XP'},
  {monday:'2026-10-19',type:'stars',name:'Stars',icon:'⭐',desc:'Stars'}
 ];
 assert.ok(validateContent(duplicate).length);
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
 const draft2=await json(await handleAppleControl(req('/apple/admin/api/draft','PUT',{baseVersion:1,content:blank()}),env));
 assert.equal(draft2.status,200);
 const published2=await json(await handleAppleControl(req('/apple/admin/api/publish','POST',{liveVersion:1,draftVersion:2}),env));
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
process.on('exit',()=>{globalThis.fetch=realFetch;});
