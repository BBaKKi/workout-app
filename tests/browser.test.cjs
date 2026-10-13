const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{backend,TOKEN}=require('./backend-harness.cjs');
const root=path.resolve(__dirname,'..'),url='https://script.google.com/macros/s/test_v5/exec';
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');r.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});const errors=[];let cloud=backend(),held=null;
async function page(){const ctx=await browser.newContext({serviceWorkers:'block',timezoneId:'Asia/Seoul',viewport:{width:390,height:844}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('https://script.google.com/**',async r=>{const body=r.request().postDataJSON();if(held&&body.mode==='sync_write'&&body.kind===held.kind){const h=held;held=null;h.enter();await h.wait;}await r.fulfill({contentType:'application/json',body:JSON.stringify(cloud.post(body,false))});});await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.AppFeatures?.ready,{timeout:5000});return p;}
async function connect(p){await p.evaluate(({url,token})=>{localStorage.setItem('gs_script_url',url);localStorage.setItem('gs_tokens_v5',JSON.stringify({[url]:token}));clearTimeout(ExLog._syncTimer);},{url,token:TOKEN});await sync(p);}
async function sync(p){return p.evaluate(async url=>{clearTimeout(ExLog._syncTimer);await ExLog.syncToSheets(url);if(ExLog.syncMessage)throw new Error(ExLog.syncMessage);},url);}
try{
const a=await page();assert.deepEqual(errors,[]);await connect(a);
await a.evaluate(()=>{ExLog.date='2026-10-12';ExLog.setSession({day:'Push A',exercises:[{name:'test',sets:[{weight:40,reps:10}]}]});clearTimeout(ExLog._syncTimer);});await sync(a);
assert.equal(cloud.post({mode:'sync_pull'}).workout[0].rows[0].weight,40);
const b=await page();await connect(b);assert.equal(await b.evaluate(()=>ExLog.data['2026-10-12'].exercises[0].sets[0].weight),40);
await a.evaluate(()=>{const s=ExLog.data['2026-10-12'];s.exercises[0].sets[0].weight=60;ExLog.setSession(s);});await sync(a);
// Clean stale device pulls remote changes; manual and Sunday full flags can never upload clean history.
await b.evaluate(async url=>ExLog.syncToSheets(url,true),url);assert.equal(cloud.post({mode:'sync_pull'}).workout[0].rows[0].weight,60);assert.equal(await b.evaluate(()=>ExLog.data['2026-10-12'].exercises[0].sets[0].weight),60);
await a.evaluate(()=>{const s=ExLog.data['2026-10-12'];s.exercises[0].sets[0].weight=65;ExLog.setSession(s);});await sync(a);
await b.evaluate(()=>{const s=ExLog.data['2026-10-12'];s.exercises[0].sets[0].weight=50;ExLog.setSession(s);});await sync(b);
assert.equal(await b.evaluate(()=>DataSync.conflicts.length),1);assert.equal(cloud.post({mode:'sync_pull'}).workout[0].rows[0].weight,65);
await b.evaluate(()=>DataSync.resolve(0,'cloud'));assert.equal(await b.evaluate(()=>ExLog.data['2026-10-12'].exercises[0].sets[0].weight),65);assert.equal(await b.evaluate(()=>!!localStorage.getItem('restore_backup')),true);
// Delete the final set; another device must see deletion, not resurrect it.
await a.evaluate(()=>{ExLog.setSession({day:'Push A',exercises:[]});});await sync(a);await sync(b);assert.equal(await b.evaluate(()=>ExLog.data['2026-10-12'].exercises.length),0);await b.evaluate(async url=>ExLog.syncToSheets(url,true),url);assert.equal(cloud.post({mode:'sync_pull'}).workout[0].rows.length,0);
// Two devices editing daily weight must conflict too.
await a.evaluate(()=>AppFeatures.putWeight({date:'2026-10-12',wt:84,updatedAt:new Date().toISOString()}));await sync(a);await sync(b);
await a.evaluate(()=>AppFeatures.putWeight({date:'2026-10-12',wt:83,updatedAt:new Date().toISOString()}));await sync(a);
await b.evaluate(()=>AppFeatures.putWeight({date:'2026-10-12',wt:85,updatedAt:new Date().toISOString()}));await sync(b);assert.equal(await b.evaluate(()=>DataSync.conflicts[0].kind),'weight');assert.equal(cloud.post({mode:'sync_pull'}).weight[0].entry.wt,83);
await b.evaluate(()=>DataSync.resolve(0,'local'));assert.equal(cloud.post({mode:'sync_pull'}).weight[0].entry.wt,85);
// In-flight edits remain dirty after the older write is acknowledged.
let release,entered;const wait=new Promise(r=>release=r),inside=new Promise(r=>entered=r);held={kind:'workout',wait,enter:entered};
await a.evaluate(()=>{ExLog.setSession({day:'Push A',exercises:[{name:'test',sets:[{weight:70,reps:10}]}]});});const inFlight=sync(a);await inside;
await a.evaluate(()=>{const s=ExLog.data['2026-10-12'];s.exercises[0].sets[0].weight=75;ExLog.setSession(s);clearTimeout(ExLog._syncTimer);});release();await inFlight;assert.equal(await a.evaluate(()=>ExLog._dirty.has('2026-10-12')),true);await sync(a);assert.equal(cloud.post({mode:'sync_pull'}).workout[0].rows[0].weight,75);
// Schema-invalid backup is rejected without touching live keys.
await b.evaluate(()=>{localStorage.setItem('wl_v2:2026-09','{"2026-09-01":{"exercises":[]}}');document.getElementById('bk-ta').value=JSON.stringify({app:'fit-tracker',data:{'wl_v2:2026-10':'{invalid json'}});});assert.equal(await b.evaluate(()=>Backup.importData()),false);assert.notEqual(await b.evaluate(()=>localStorage.getItem('wl_v2:2026-09')),null);
// Quota failure must surface, keep dirty data, and roll back a multi-key replacement.
const q=await a.evaluate(async()=>{const orig=Storage.prototype.setItem;let count=0;localStorage.setItem('test-a','old');Storage.prototype.setItem=function(k,v){if(k==='test-b'&&++count===1)throw new DOMException('full','QuotaExceededError');return orig.call(this,k,v)};let failed=false;try{SafeStore.transaction({'test-a':'new','test-b':'new'})}catch(_){failed=true}Storage.prototype.setItem=orig;return {failed,a:localStorage.getItem('test-a'),b:localStorage.getItem('test-b'),error:SafeStore.error}});assert.equal(q.failed,true);assert.equal(q.a,'old');assert.equal(q.b,null);assert(q.error.includes('저장'));
await a.evaluate(()=>{SafeStore.error='';SafeStore.render();});
const quota=await a.evaluate(async()=>{const orig=window.storage.set;window.storage.set=async()=>{throw new DOMException('full','QuotaExceededError')};ExLog.markDirty('2026-10-12');let thrown=false;try{await ExLog.save()}catch(e){thrown=true}window.storage.set=orig;return {thrown,dirty:ExLog._dirtyMonths.has('2026-10')}});assert.equal(quota.thrown,true);assert.equal(quota.dirty,true);
// The actual library add path still sorts exercise priorities and keeps lifting kg independent.
await a.evaluate(()=>{ExLog.syncPanel('Push A');ExLog.addExternal('데드행');ExLog.addExternal('바벨 벤치프레스');});const order=await a.evaluate(()=>AppFeatures.routine('Push A').map(x=>x.weight));assert(order.every((v,i)=>!i||v>=order[i-1]));
assert.equal(await a.evaluate(()=>Backup.KEYS.includes('gs_tokens_v5')),false);
await a.setViewportSize({width:320,height:750});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.deepEqual(errors,[]);console.log('PASS: two-device roundtrip, stale full-sync protection, workout/weight conflicts, tombstones, concurrent edits, backup validation, quota rollback, sorting, secret exclusion, 320px layout');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
