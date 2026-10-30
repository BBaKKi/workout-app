const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{backend,TOKEN}=require('./backend-harness.cjs');
const root=path.resolve(__dirname,'..'),url='https://script.google.com/macros/s/recovery_test/exec',date='2026-10-27';
const cloud=backend();let drop='',writes=0;
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({serviceWorkers:'block',timezoneId:'Asia/Seoul'});
  await p.route('https://script.google.com/**',async route=>{
   const body=route.request().postDataJSON();if(body.mode==='sync_write')writes++;
   if(drop==='before'&&body.mode==='sync_write'){drop='';return route.abort('failed');}
   const result=cloud.post(body,false);
   if(drop===body.kind&&body.mode==='sync_write'){drop='';return route.abort('failed');}
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await p.clock.install({time:new Date('2026-10-30T03:00:00Z')});
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.AppFeatures?.ready);
  await p.evaluate(({url,TOKEN})=>{localStorage.setItem('gs_script_url',url);localStorage.setItem('gs_tokens_v5',JSON.stringify({[url]:TOKEN}));},{url,TOKEN});
  const sync=()=>p.evaluate(async url=>{clearTimeout(ExLog._syncTimer);await ExLog.syncToSheets(url);return {error:ExLog.syncMessage,conflicts:DataSync.conflicts.length};},url);
  const append=()=>p.evaluate(date=>{ExLog.date=date;const s=ExLog.data[date]||{day:'Pull A',exercises:[{name:'test-row',sets:[]}]};s.exercises[0].sets.push({weight:40,reps:12});ExLog.setSession(s);clearTimeout(ExLog._syncTimer);},date);
  const remote=()=>cloud.post({mode:'sync_pull'}).workout.find(r=>r.date===date);
  await sync();await append();await sync();assert.equal(remote().rows.length,1);
  // The server saves set 2, but the phone never receives the acknowledgement.
  drop='workout';await append();assert((await sync()).error);assert.equal(remote().rows.length,2);
  // More sets are entered before retry; the old implementation stalls in conflict.
  await append();await p.reload();await p.waitForFunction(()=>window.AppFeatures?.ready);
  assert.deepEqual(await sync(),{error:'',conflicts:0},'lost acknowledgement must not strand the rest of the workout');
  assert.equal(remote().rows.length,3);assert.equal(new Set(remote().rows.map(r=>r.setId)).size,3);
  assert.equal(await p.evaluate(date=>ExLog._dirty.has(date),date),false);
  // A request that never reached the server is retried from the old baseline.
  drop='before';await append();assert((await sync()).error);assert.equal(remote().rows.length,3);
  await append();assert.deepEqual(await sync(),{error:'',conflicts:0});assert.equal(remote().rows.length,5);
  // Do not infer an acknowledgement from only a subset or different set IDs.
  for(const change of ['value','identity','deletion','timestamp','volume']){
   drop='workout';await append();assert((await sync()).error);await append();
   const r=remote(),rows=structuredClone(r.rows);
   if(change==='value')rows[0].reps=9;
   if(change==='identity')rows[0].setId='other-device-set-'+change;
   if(change==='deletion')rows.pop();
   if(change==='timestamp')rows[0].ts='2026-10-27T10:00:00Z';
   if(change==='volume')rows[0].vol+=100;
   assert.equal(cloud.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:r.revision,rows}]}).results[0].status,'ok');
   const before=JSON.stringify(remote()),count=writes;
   assert.equal((await sync()).conflicts,1);assert.equal(writes,count);assert.equal(JSON.stringify(remote()),before);
   // Explicit local resolution can also lose its receipt. Later input is retained.
   if(change==='value'){
    drop='workout';await p.evaluate(()=>DataSync.resolve(0,'local'));await append();
    assert.deepEqual(await sync(),{error:'',conflicts:0});
   }else{await p.evaluate(()=>DataSync.resolve(0,'cloud'));assert.deepEqual(await sync(),{error:'',conflicts:0});}
  }
  // Plans, bodyweight and InBody use the same recovery path, including edits made
  // after a lost receipt and an optional measurement being cleared.
  for(const kind of ['session','weight','inbody']){
   const edit=n=>p.evaluate(({kind,n,date})=>{
    if(kind==='session'){
     const s=ExLog.data[date];s.note='note-'+n;WorkoutTools.touch(date);
    }else if(kind==='weight')AppFeatures.putWeight({date,wt:84+n,updatedAt:new Date().toISOString()});
    else{
     const entry={date,wt:84+n,sm:36,bf:25,...(n===1?{waist:90}:{})};InBody._log=[entry];DataSync.noteLocal(kind,date);
     SafeStore.transaction({inbody_log:JSON.stringify([entry]),inbody_dirty:JSON.stringify({[date]:entry})});
    }
    clearTimeout(ExLog._syncTimer);
   },{kind,n,date});
   drop=kind;await edit(1);assert((await sync()).error);await edit(2);
   assert.deepEqual(await sync(),{error:'',conflicts:0},kind+' recovers a lost receipt');
   const entry=cloud.post({mode:'sync_pull'})[kind].find(r=>r.date===date).entry;
   if(kind==='session')assert.equal(entry.context.note,'note-2');else assert.equal(entry.wt,86);
   if(kind==='inbody')assert.equal(entry.waist,undefined);
  }
  // An unjournaled partial record remains a conflict: upgrading is not blanket
  // permission to overwrite the old sheet or infer missing sets.
  drop='workout';await append();assert((await sync()).error);await append();
  await p.evaluate(url=>{const states=JSON.parse(localStorage.getItem('record_sync_v5'));delete states[url].pending;localStorage.setItem('record_sync_v5',JSON.stringify(states));},url);
  const count=writes;assert.equal((await sync()).conflicts,1);assert.equal(writes,count);
  await p.evaluate(()=>DataSync.resolve(0,'cloud'));await sync();
  // The checkpoint itself must be durable before sending anything.
  await append();const beforeWrites=writes;
  const failed=await p.evaluate(async url=>{const old=DataSync.rememberWrite;DataSync.rememberWrite=()=>{throw new Error('checkpoint unavailable');};await ExLog.syncToSheets(url);DataSync.rememberWrite=old;return ExLog.syncMessage;},url);
  assert.equal(failed,'checkpoint unavailable');assert.equal(writes,beforeWrites);await sync();
  // No ledger or connection secret enters a portable backup. Returning to the
  // app schedules a retry even when the calendar date and network do not change.
  const check=await p.evaluate(async()=>{clearTimeout(ExLog._syncTimer);const backup=await Backup._collect();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));return {hasLedger:Object.hasOwn(backup,'record_sync_v5'),hasToken:Object.hasOwn(backup,'gs_tokens_v5'),scheduled:!!ExLog._syncTimer};});
  assert.deepEqual(check,{hasLedger:false,hasToken:false,scheduled:true});
  console.log('PASS: lost receipts + later sets + restart, pre-send failure, exact-ID recovery, real edits/deletions stay conflicts, explicit resolution, all four record kinds, unjournaled history, durable checkpoint, foreground retry and private backup exclusion');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
