const fs=require('fs'),http=require('http'),path=require('path'),crypto=require('crypto'),vm=require('vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const ctx={window:{},TextEncoder,Uint8Array,Uint32Array,DataView};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'storage-digest.js'),'utf8'),ctx);
const digest=ctx.window.StorageDigest;
for(const value of ['', 'abc', '한글 🏋️ 무게 70 × 12', '\ud800', ...[55,56,63,64,65,127,128,1000,1000000].map(n=>'a'.repeat(n)), ...Array.from({length:30},()=>crypto.randomBytes(111).toString('base64'))]){
 assert.equal(digest.sha256(value),crypto.createHash('sha256').update(value).digest('hex'));
 assert.equal(digest.digest(digest.digest(value)),digest.digest(value));
}
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.AppFeatures?.ready);
  const initial=await p.evaluate(async()=>{
   clearTimeout(ExLog._syncTimer);ExLog.date='2026-11-09';ExLog.data[ExLog.date]={day:'Push A',exercises:[{name:'test',sets:[{weight:35,reps:12,_id:'retained'}]}]};ExLog.markDirty(ExLog.date);await ExLog.save();
   localStorage.setItem('inbody_log',JSON.stringify([{date:'2026-11-08',wt:85,sm:37,bf:24}]));
   localStorage.setItem('plan_v3',JSON.stringify({'Push A':{add:['test']}}));
   const huge=JSON.stringify(['한글 기록'.repeat(120000)]),ledger={test:{comparisonVersion:2,initialized:true,sourceId:'source-kept',base:{workout:{'2026-11-09':{revision:'r7',hash:huge}}},pending:{workout:{'2026-11-09':{baseRevision:'r7',hash:huge+' '}}}}};
   localStorage.setItem('record_sync_v5',JSON.stringify(ledger));
   localStorage.setItem('restore_backup',JSON.stringify({app:'fit-tracker',version:2,data:await Backup._collect(),padding:'backup'.repeat(120000)}));
   for(let i=0;i<200;i++){try{localStorage.setItem('quota-test-'+i,'x'.repeat(32768));}catch(_){break;}}
   window.__kept=Object.fromEntries(['wl_v2:2026-11','inbody_log','plan_v3','restore_backup'].map(k=>[k,localStorage.getItem(k)]));window.__ledger=ledger;
   let failed=false;try{await window.storage.set('quota-proof','new'.repeat(100000));}catch(e){failed=e.name==='QuotaExceededError';}
   return {failed,error:SafeStore.error,pending:SafeStore.pending.has('quota-proof'),size:localStorage.getItem('record_sync_v5').length};
  });
  assert(initial.failed&&initial.pending);assert(initial.error.includes('앱 저장소'));
  // An unavailable secondary store must not delete the only backup.
  const failure=await p.evaluate(async()=>{const old=RecoveryArchive.put;RecoveryArchive.put=async()=>{throw new Error('disk unavailable');};let rejected=false;try{await RecoveryArchive.moveLegacy();}catch(_){rejected=true;}RecoveryArchive.put=old;return {rejected,kept:localStorage.getItem('restore_backup')===window.__kept.restore_backup};});assert.deepEqual(failure,{rejected:true,kept:true});
  await p.getByRole('button',{name:'공간 복구 후 저장 재시도'}).click();
  await p.waitForFunction(()=>!SafeStore.error);
  const recovered=await p.evaluate(async()=>{
   const ledger=JSON.parse(localStorage.getItem('record_sync_v6')).test;if(localStorage.getItem('record_sync_v5')!==null)throw new Error('old app must not see compact hashes');
   return {size:localStorage.getItem('record_sync_v6').length,pending:SafeStore.pending.size,value:localStorage.getItem('quota-proof').length,legacyRemoved:localStorage.getItem('restore_backup')===null,backup:(await window.storage.get('restore_backup')).value===window.__kept.restore_backup,
    originals:['wl_v2:2026-11','inbody_log','plan_v3'].every(k=>localStorage.getItem(k)===window.__kept[k]),source:ledger.sourceId,revision:ledger.base.workout['2026-11-09'].revision,pendingRevision:ledger.pending.workout['2026-11-09'].baseRevision,
    baseHash:ledger.base.workout['2026-11-09'].hash===StorageDigest.digest(window.__ledger.test.base.workout['2026-11-09'].hash),pendingHash:ledger.pending.workout['2026-11-09'].hash===StorageDigest.digest(window.__ledger.test.pending.workout['2026-11-09'].hash)};
  });
  assert(recovered.size<initial.size/100);assert.deepEqual({...recovered,size:0},{size:0,pending:0,value:300000,legacyRemoved:true,backup:true,originals:true,source:'source-kept',revision:'r7',pendingRevision:'r7',baseHash:true,pendingHash:true});
  await p.evaluate(async()=>{await Backup.restoreSnapshot();if(document.getElementById('bk-ta').value!==window.__kept.restore_backup)throw new Error('archive missing from backup UI');});
  // No-op values must not be journaled OR removed by overlapping import keys.
  const reduced=await p.evaluate(()=>{
   const old=Storage.prototype.setItem;let journal=null;Storage.prototype.setItem=function(k,v){if(k==='fit_transaction_v1')journal=JSON.parse(v);return old.call(this,k,v);};
   try{const large=localStorage.getItem('wl_v2:2026-11');SafeStore.transaction({'wl_v2:2026-11':large,a:'1',b:'2'},['wl_v2:2026-11']);return {kept:localStorage.getItem('wl_v2:2026-11')===large,keys:Object.keys(journal.before)};}finally{Storage.prototype.setItem=old;}
  });assert.deepEqual(reduced,{kept:true,keys:['a','b']});
  // On another launch a prior journal is recovered before ledger compaction.
  await p.evaluate(()=>{localStorage.setItem('crash-test','new');localStorage.setItem('fit_transaction_v1',JSON.stringify({version:1,before:{'crash-test':'old'}}));});
  await p.reload();await p.waitForFunction(()=>window.AppFeatures?.ready);
  const restarted=await p.evaluate(async()=>({crash:localStorage.getItem('crash-test'),journal:localStorage.getItem('fit_transaction_v1'),backup:!!(await window.storage.get('restore_backup'))?.value,sets:ExLog.data['2026-11-09'].exercises[0].sets.length}));assert.deepEqual(restarted,{crash:'old',journal:null,backup:true,sets:1});
  // New snapshots never allocate a second full localStorage copy.
  await p.evaluate(async()=>{await window.storage.set('restore_backup','replacement');if(localStorage.getItem('restore_backup')!==null||(await window.storage.get('restore_backup')).value!=='replacement')throw new Error('snapshot storage regression');});
  assert.deepEqual(errors,[]);
  console.log('PASS: SHA-256 vectors, real browser quota exhaustion and recovery, verified archive/readback/failure preservation, pending/base/source retention, unchanged-key journal trimming, overlapping import keys, crash recovery, reload and archive UI');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
