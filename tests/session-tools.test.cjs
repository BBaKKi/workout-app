const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{backend,TOKEN}=require('./backend-harness.cjs');
const root=path.resolve(__dirname,'..'),url='https://script.google.com/macros/s/session_v6/exec';
const cloud=backend(),errors=[];
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');r.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
async function page(){const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'UTC'}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('https://script.google.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(cloud.post(r.request().postDataJSON(),false))}));await p.clock.install({time:new Date('2026-11-05T10:00:00Z')});await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.WorkoutTools?.ready);return p;}
async function sync(p){await p.evaluate(async url=>{clearTimeout(ExLog._syncTimer);await ExLog.syncToSheets(url);if(ExLog.syncMessage)throw new Error(ExLog.syncMessage);},url);}
async function connect(p){await p.evaluate(({url,token})=>{localStorage.setItem('gs_script_url',url);localStorage.setItem('gs_tokens_v5',JSON.stringify({[url]:token}));},{url,token:TOKEN});await sync(p);}
async function current(p){return p.evaluate(()=>document.querySelector('.dp1 .af-current .ex-nm')?.textContent.trim());}
try{
const a=await page();await connect(a);const today=await a.evaluate(()=>_todayKey());
await a.evaluate(()=>{ExLog.date=_todayKey();ExLog.syncPanel('Push A');AppFeatures.focusDate=null;ExLog.refresh();});
const original=await current(a);assert(original);
await a.locator('.dp1 .af-current .ex-log-add-btn').click();await a.locator('.dp1 .af-current .wl-kg-input').fill('25');await a.locator('.dp1 .af-current .wl-rp-input').fill('11');
await a.reload();await a.waitForFunction(()=>WorkoutTools.ready);assert.equal(await current(a),original);assert.equal(await a.locator('.dp1 .af-current .wl-rp-input').inputValue(),'11');
await a.locator('.dp1 .af-current .wl-confirm-btn').click();await a.evaluate(()=>ExLog.save());
const first=await a.evaluate(n=>ExLog.session().exercises.find(e=>e.name===n).sets[0],original);assert.equal(first.weight,25);assert.equal(first.reps,11);
assert.equal(await a.evaluate(()=>!!ExLog.session().routineSnapshots['Push A']),true);
await a.reload();await a.waitForFunction(()=>WorkoutTools.ready);assert.equal(await a.evaluate(()=>ExLog.rest.name),original);assert(await a.evaluate(()=>ExLog.rest.endAt>Date.now()));
// Undo after a cloud acknowledgement, then redo an edit and deletion; stable IDs survive.
await sync(a);await a.locator('#undo-set').click();assert.equal(await a.evaluate(n=>WorkoutTools.sets(ExLog.date,n).length,original),0);
await a.locator('.dp1 .af-current .ex-log-add-btn').click();await a.locator('.dp1 .af-current .wl-kg-input').fill('30');await a.locator('.dp1 .af-current .wl-rp-input').fill('10');await a.locator('.dp1 .af-current .wl-confirm-btn').click();
await a.locator('.dp1 .af-current .wl-set-chip').click();await a.locator('.dp1 .af-current .wl-rp-input').fill('12');await a.locator('.dp1 .af-current .wl-confirm-btn').click();
await a.locator('#undo-set').click();assert.equal(await a.evaluate(n=>WorkoutTools.sets(ExLog.date,n)[0].reps,original),10);
await a.locator('.dp1 .af-current .wl-set-chip').click();await a.locator('.dp1 .af-current .wl-del-btn').click();await a.locator('#undo-set').click();assert.equal(await a.evaluate(n=>WorkoutTools.sets(ExLog.date,n).length,original),1);
// Anomaly confirm cancel leaves the draft; confirmation saves the exact value.
await a.locator('.dp1 .af-current .ex-log-add-btn').click();await a.locator('.dp1 .af-current .wl-kg-input').fill('300');await a.locator('.dp1 .af-current .wl-rp-input').fill('100');
a.once('dialog',d=>d.dismiss());await a.locator('.dp1 .af-current .wl-confirm-btn').click();assert.equal(await a.evaluate(n=>WorkoutTools.sets(ExLog.date,n).length,original),1);
a.once('dialog',d=>d.accept());await a.locator('.dp1 .af-current .wl-confirm-btn').click();assert.equal(await a.evaluate(n=>WorkoutTools.sets(ExLog.date,n)[1].weight,original),300);await a.locator('#undo-set').click();
// Today-only replacement is persisted and sorted while the template and raw record remain intact.
await a.evaluate(()=>ExLog.swapEx(document.querySelector('.dp1 .af-current .ex-swap-btn'),'올데이 감일 · 케이블 플라이'));
await a.locator('#swap-scope [data-scope="today"]').click();assert.equal(await current(a),'올데이 감일 · 케이블 플라이');
assert.equal(await a.evaluate(n=>WorkoutTools.template('Push A').some(r=>r.name===n),original),true);
assert.equal(await a.evaluate(n=>ExLog.session().exercises.some(e=>e.name===n),original),true);
await a.reload();await a.waitForFunction(()=>WorkoutTools.ready);assert.equal(await current(a),'올데이 감일 · 케이블 플라이');
await sync(a);assert.equal(cloud.post({mode:'sync_pull'}).session[0].entry.snapshots['Push A'].rows.some(r=>r.name==='올데이 감일 · 케이블 플라이'),true);
const b=await page();await connect(b);assert.equal(await b.evaluate(()=>AppFeatures.routine('Push A').some(r=>r.name==='올데이 감일 · 케이블 플라이')),true);
// Equipment settings are exact-name keyed and included in settings backup and cloud sync.
await a.locator('.dp1 .af-current .exercise-settings>summary').click();await a.locator('.dp1 .af-current .equipment-button').click();await a.locator('#equipment-form [name="seat"]').fill('4');await a.locator('#equipment-form [name="grip"]').fill('중립 손잡이');await a.locator('#equipment-form button[type="submit"]').click();await sync(a);
assert.equal(JSON.parse(cloud.post({mode:'settings_get'}).data.ex_equipment_v1)['올데이 감일 · 케이블 플라이'].seat,'4');
const backup=await a.evaluate(async()=>{const data=await Backup._collect();return SafeBackup.validate(JSON.stringify({app:'fit-tracker',version:2,data}));});assert(backup.ex_equipment_v1);assert(backup['wl_v2:'+today.slice(0,7)].includes('routineSnapshots'));
// Date navigation must not carry one day's open input into another date.
await a.locator('.dp1 .af-current .ex-log-add-btn').click();await a.locator('.dp1 .af-current .wl-kg-input').fill('17.5');await a.locator('.dp1 .af-current .wl-rp-input').fill('13');
await a.evaluate(()=>ExLog.prev());assert.equal(await a.evaluate(()=>[...document.querySelectorAll('.dp1 .ex-log-input')].some(i=>i.style.display!=='none')),false);
await a.evaluate(()=>{ExLog.next();ExLog.syncPanel('Push A');ExLog.refresh();});assert.equal(await a.locator('.dp1 .ex-log[data-exname="올데이 감일 · 케이블 플라이"] .wl-rp-input').inputValue(),'13');
await a.evaluate(()=>{const log=[...document.querySelectorAll('.dp1 .ex-log')].find(x=>x.dataset.exname==='올데이 감일 · 케이블 플라이');ExLog.cancelSet(log.querySelector('.wl-cancel-btn'));});
// A frozen plan survives editing the global period as well as its routine template.
const periodGuard=await a.evaluate(()=>{const end=TRAINING_PLAN.end;TRAINING_PLAN.end='2000-01-01';const w=AppFeatures.weekly();TRAINING_PLAN.end=end;return w.total;});assert(periodGuard>0);
// Permanent template edits cannot retroactively alter a started day's targets.
const before=await a.evaluate(()=>JSON.stringify(AppFeatures.routine('Push A')));
await a.evaluate(async()=>{const r=WorkoutTools.template('Push A')[0],p=ExLog.planFor('Push A');(p.config||={})[r.original]={sets:9,min:3,max:5};await ExLog.savePlan();ExLog.refresh();});
assert.equal(await a.evaluate(()=>JSON.stringify(AppFeatures.routine('Push A'))),before);
// Old unknown dates are excluded rather than fabricated from the new template.
const weekly=await a.evaluate(()=>{const d=new Date(_todayKey()+'T12:00:00');d.setDate(d.getDate()-14);ExLog.date=_localKey(d);return AppFeatures.weekly();});assert(weekly.unknown>0||weekly.sessions===0);
// Independent metadata edits on two devices conflict instead of losing a date-only choice.
await a.evaluate(()=>{ExLog.date=_todayKey();WorkoutTools.capture('Push A').rows[0].sets=5;WorkoutTools.touch(ExLog.date);});await sync(a);
await b.evaluate(()=>{WorkoutTools.capture('Push A').rows[0].sets=4;WorkoutTools.touch(ExLog.date);});await sync(b);assert(await b.evaluate(()=>DataSync.conflicts.some(c=>c.kind==='session')));
assert.equal(await a.evaluate(()=>DataSync.activity.some(e=>e.action==='sent'&&e.kind==='session')),true);
// Only the current gym is selectable; old names remain in raw reference records.
assert.equal(await a.evaluate(()=>EXERCISE_LIBRARY.length),67);assert.equal(await a.evaluate(()=>ExLog.libByName('케이블 풀오버')),undefined);
const card=await a.evaluate(()=>{const name=document.querySelector('.dp1 .ex-nm').textContent.trim();return {actual:[...document.querySelectorAll('.dp1 .af-current .coach-corrections>div')].map(x=>({sign:x.querySelector('dt').textContent,fix:x.querySelector('dd').textContent})),expected:ExLog.libByName(name).coaching.corrections};});assert.deepEqual(card.actual,card.expected);
assert.deepEqual(errors,[]);console.log('PASS: draft/focus/timer resume, stable-ID undo after sync, edit/delete undo, anomaly override, date-only swaps, frozen plans, metadata CAS conflicts, equipment sync/backup and library cleanup');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
