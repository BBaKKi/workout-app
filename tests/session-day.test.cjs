const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{backend,TOKEN}=require('./backend-harness.cjs');
const root=path.resolve(__dirname,'..'),url='https://script.google.com/macros/s/session_day_test/exec';
const cloud=backend(),errors=[];
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 async function page(){const c=await browser.newContext({serviceWorkers:'block',timezoneId:'Asia/Seoul'}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('https://script.google.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(cloud.post(r.request().postDataJSON(),false))}));await p.clock.install({time:new Date('2026-11-05T10:00:00Z')});await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.WorkoutTools?.ready&&window.InterfaceTools?.ready);return p;}
 async function sync(p){await p.evaluate(async url=>{clearTimeout(ExLog._syncTimer);await ExLog.syncToSheets(url);if(ExLog.syncMessage)throw new Error(ExLog.syncMessage);},url);}
 async function connect(p){await p.evaluate(({url,TOKEN})=>{localStorage.setItem('gs_script_url',url);localStorage.setItem('gs_tokens_v5',JSON.stringify({[url]:TOKEN}));},{url,TOKEN});await sync(p);}
 async function enter(p,day){return p.evaluate(day=>{ExLog.syncPanel(day);ExLog.refresh();const panel=document.querySelector('.dp'+(ExLog.PANEL_DAY.indexOf(day)+1)),log=panel.querySelector('.af-current .ex-log');ExLog.startSet(log.querySelector('.ex-log-add-btn'));log.querySelector('.wl-kg-input').value='42.5';log.querySelector('.wl-rp-input').value='11';log.querySelector('.wl-rpe-sel').value='8';WorkoutTools.saveDraft(log);ExLog.confirmSet(log.querySelector('.wl-confirm-btn'));return {name:log.dataset.exname,day:ExLog.session().day,snapshots:Object.keys(ExLog.session().routineSnapshots||{}),rows:ExLog._syncRows()};},day);}
 try{
  const a=await page();await connect(a);
  // Restored UI can point at Pull B while an empty session still says Push B.
  await a.evaluate(async()=>{ExLog.setSession({day:'Push B',exercises:[]});ExLog.syncPanel('Pull B');await ExLog.save();localStorage.setItem('workout_resume_v1',JSON.stringify({date:ExLog.date,day:'Pull B'}));});
  await a.reload();await a.waitForFunction(()=>WorkoutTools.ready&&InterfaceTools.ready);
  assert.equal(await a.evaluate(()=>AppFeatures.activeDay()),'Pull B');
  const first=await enter(a,'Pull B');
  assert.equal(first.day,'Pull B','first set must use its input panel, not a stale session default');
  assert.deepEqual(first.snapshots,['Pull B']);assert(first.rows.every(r=>r.day==='Pull B'));
  const original=first.rows[0];assert(original.setId);assert(original.ts);assert.equal(original.weight,42.5);assert.equal(original.reps,11);assert.equal(original.rpe,8);
  // A mismatched panel must not append or capture another plan for a started day.
  const rejected=await enter(a,'Push B');assert.deepEqual(rejected.rows,first.rows);assert.deepEqual(rejected.snapshots,['Pull B']);
  assert(await a.evaluate(()=>document.getElementById('af-status').textContent.includes('Pull B')));
  assert(await a.evaluate(()=>Object.keys(WorkoutTools.drafts).length>0));
  // Merely browsing another tab must not relabel all existing sets.
  await a.evaluate(()=>{document.getElementById('d4').dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await a.evaluate(()=>ExLog.session().day),'Pull B');
  // Explicit day reclassification is separate and can be cancelled without data loss.
  a.once('dialog',d=>d.dismiss());await a.evaluate(()=>ExLog.switchDay('Push B'));
  assert.deepEqual(await a.evaluate(()=>ExLog._syncRows()),first.rows);
  a.once('dialog',d=>d.accept());await a.evaluate(()=>ExLog.switchDay('Push B'));
  assert.deepEqual(await a.evaluate(()=>ExLog._syncRows().map(r=>({...r,day:'Pull B'}))),first.rows);
  a.once('dialog',d=>d.accept());await a.evaluate(()=>ExLog.switchDay('Pull B'));
  // A stale resume preference must yield to a started session, without changing records.
  await a.evaluate(async()=>{await ExLog.save();localStorage.setItem('workout_resume_v1',JSON.stringify({date:ExLog.date,day:'Push B'}));});
  await a.reload();await a.waitForFunction(()=>WorkoutTools.ready&&InterfaceTools.ready);
  assert.equal(await a.evaluate(()=>AppFeatures.activeDay()),'Pull B');assert.deepEqual(await a.evaluate(()=>ExLog._syncRows()),first.rows);
  // Direct Sheets corrections change the digest, so clean devices pull and dirty ones conflict.
  await sync(a);const b=await page();await connect(b);
  const date=original.date,old=cloud.post({mode:'sync_pull'}).workout.find(r=>r.date===date);
  await b.evaluate(()=>{const s=ExLog.session();s.exercises[0].sets[0].reps=12;ExLog.setSession(s);});
  const table=cloud.db['운동기록'],dayCol=table.rows[0].indexOf('요일');for(const row of table.rows.slice(1))row[dayCol]='Push A';
  const corrected=cloud.post({mode:'sync_pull'}).workout.find(r=>r.date===date);assert.notEqual(corrected.revision,old.revision);
  assert.equal(cloud.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:old.revision,rows:old.rows}]}).results[0].status,'conflict');
  await sync(a);assert.equal(await a.evaluate(()=>ExLog.session().day),'Push A');assert.equal(await a.evaluate(()=>AppFeatures.activeDay()),'Push A');
  assert.deepEqual(await a.evaluate(()=>ExLog._syncRows().map(r=>({...r,day:'Pull B'}))),first.rows);
  await sync(b);assert(await b.evaluate(()=>DataSync.conflicts.some(c=>c.kind==='workout')));assert.equal(cloud.post({mode:'sync_pull'}).workout.find(r=>r.date===date).rows[0].day,'Push A');
  assert.equal(await b.evaluate(()=>ExLog.session().exercises[0].sets[0].reps),12);
  assert.deepEqual(errors,[]);
  console.log('PASS: panel/record agreement, mismatched-input guard, explicit relabel confirmation, resume, sheet edits, clean pull and dirty-device CAS conflict');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
