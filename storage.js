/* Persistent writes and crash-safe replacement of a set of local keys. */
(function(){
 'use strict';
 const JOURNAL='fit_transaction_v1', native=window.localStorage;
 // Recovery snapshots live outside the small localStorage quota. A legacy copy
 // is removed only after an IndexedDB commit AND a byte-for-byte readback.
 const archive=window.RecoveryArchive={
  async open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('fit-recovery-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('다른 탭에서 백업 저장소를 사용 중입니다.'));});},
  async access(mode,key,value){const db=await this.open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots',mode),store=tx.objectStore('snapshots'),request=mode==='readonly'?store.get(key):store.put(value,key);tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error||new Error('복원 백업 저장 실패'));tx.onerror=()=>{};});}finally{db.close();}},
  async put(key,value){await this.access('readwrite',key,value);if(await this.access('readonly',key)!==value)throw new Error('복원 백업 검증 실패');},
  async moveLegacy(){const old=native.getItem('restore_backup');if(old===null)return;await this.put('legacy_restore_backup',old);if(native.getItem('restore_backup')===old)native.removeItem('restore_backup');},
  async get(){const old=native.getItem('restore_backup');if(old!==null)return old;return (await this.access('readonly','restore_backup'))??(await this.access('readonly','legacy_restore_backup'))??null;},
  async set(value){const old=native.getItem('restore_backup');await this.put('restore_backup',value);if(native.getItem('restore_backup')===old)native.removeItem('restore_backup');}
 };
 const S=window.SafeStore={error:'',pending:new Map(),blocked:false,
  report(error){this.quota=error?.name==='QuotaExceededError';this.error='기기에 저장하지 못했어요. '+(this.quota?'앱 저장소의 한도에 도달했습니다. 휴대폰 전체 용량과는 다를 수 있어요.':'저장소 접근을 확인하세요.');this.render();},
  usageText(){
   const groups={'운동 기록':0,'동기화 비교':0,'복원·임시 사본':0,'기타 설정·입력':0};
   for(const key of Object.keys(native)){const group=key==='wl_v2'||key.startsWith('wl_v2:')?'운동 기록':['record_sync_v5','record_sync_v6'].includes(key)?'동기화 비교':['restore_backup',JOURNAL].includes(key)?'복원·임시 사본':'기타 설정·입력';groups[group]+=2*(key.length+native.getItem(key).length);}
   const mb=n=>(n/1048576).toFixed(2)+' MB';return '앱 로컬 저장소 추정 '+mb(Object.values(groups).reduce((a,b)=>a+b,0))+' · '+Object.entries(groups).map(([k,n])=>k+' '+mb(n)).join(' / ')+' (문자열 기준 추정치이며 별도 복원 백업·오프라인 파일은 제외)';
  },
  compactSync(){
   if(this.blocked||native.getItem(JOURNAL))return;
   const old=native.getItem('record_sync_v5'),current=native.getItem('record_sync_v6');if(!old&&!current)return;
   // Use a new key: an older tab must never interpret a digest as a raw baseline.
   // Commit before removing the old key. Full stores keep the original on failure.
   try{const next=StorageDigest.compactLedger(JSON.stringify({...JSON.parse(old||'{}'),...JSON.parse(current||'{}')}));if(next!==current)native.setItem('record_sync_v6',next);if(old!==null&&native.getItem('record_sync_v5')===old)native.removeItem('record_sync_v5');}catch(_){/* Preserve an unrecognized ledger for diagnosis. */}
  },
  render(){
   if(!document.body)return;let box=document.getElementById('storage-error');
   if(!box){box=document.createElement('aside');box.id='storage-error';box.setAttribute('role','alert');box.className='storage-error';document.body.appendChild(box);}
   box.hidden=!this.error;
   if(this.error){box.replaceChildren();const text=document.createElement('span');text.textContent=this.error+' 화면의 미저장 입력은 앱을 닫으면 사라질 수 있어요.';box.appendChild(text);
    const retry=document.createElement('button');retry.textContent=this.externalChange?'새로고침':this.quota?'공간 복구 후 저장 재시도':'저장 재시도';retry.onclick=()=>this.retry().catch(()=>{});box.appendChild(retry);
    const backup=document.createElement('button');backup.textContent='현재 입력 파일 백업';backup.onclick=()=>this.emergencyBackup();box.appendChild(backup);const usage=document.createElement('small');usage.textContent=this.usageText();box.appendChild(usage);}
  },
  recover(){
   const raw=native.getItem(JOURNAL);if(!raw)return;
   const j=JSON.parse(raw);if(!j||j.version!==1||!j.before||typeof j.before!=='object')throw new Error('복원 작업 복구 정보가 잘못되었습니다.');
   Object.keys(j.before).forEach(k=>native.removeItem(k));Object.entries(j.before).forEach(([k,v])=>{if(v!==null)native.setItem(k,v);});native.removeItem(JOURNAL);
  },
  transaction(values,remove=[],retryable=false){
   if(this.blocked)throw new Error('저장소 복구가 필요합니다.');
   const suppliedKeys=new Set(Object.keys(values));
   values=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v)]).filter(([k,v])=>native.getItem(k)!==v));
   remove=remove.filter(k=>!suppliedKeys.has(k)&&native.getItem(k)!==null);
   const keys=[...new Set([...Object.keys(values),...remove])],before=Object.fromEntries(keys.map(k=>[k,native.getItem(k)]));
   if(!keys.length)return;
   try{
    // Durable rollback journal is written BEFORE touching a live key.
    if(keys.length>1)native.setItem(JOURNAL,JSON.stringify({version:1,before}));
    remove.forEach(k=>native.removeItem(k));Object.entries(values).forEach(([k,v])=>native.setItem(k,String(v)));native.removeItem(JOURNAL);
   }catch(e){
    try{if(native.getItem(JOURNAL))this.recover();}catch(recoveryError){this.blocked=true;}
    if(retryable)Object.entries(values).forEach(([k,v])=>this.pending.set(k,String(v)));this.report(e);throw e;
   }
  },
  async retry(){
   if(this.externalChange){if(confirm('미저장 입력이 있으면 현재 입력 파일 백업을 먼저 받으세요. 새로고침할까요?'))location.reload();return;}
   try{if(this.blocked){this.recover();this.blocked=false;}this.compactSync();await archive.moveLegacy();this.compactSync();if(this.externalChange)throw new Error('다른 탭의 기록을 먼저 확인하세요.');for(const [k,v] of [...this.pending]){await window.storage.set(k,v);}if(typeof ExLog!=='undefined')await ExLog.save();this.error='';this.render();if(typeof ExLog!=='undefined'){ExLog.renderSyncStatus();ExLog._syncSoon();}}
   catch(e){this.report(e);throw e;}
  },
  emergencyBackup(){
   // This path does not need a successful localStorage write.
   const data={};if(typeof Backup!=='undefined')Object.keys(native).filter(k=>Backup._allowed(k)).forEach(k=>data[k]=native.getItem(k));
   for(const [k,v] of this.pending)if(typeof Backup!=='undefined'&&Backup._allowed(k))data[k]=v;
   if(typeof ExLog!=='undefined'){Object.keys(data).filter(k=>k.startsWith('wl_v2:')).forEach(k=>delete data[k]);const months={};Object.entries(ExLog.data).forEach(([d,v])=>(months[d.slice(0,7)]||={})[d]=v);for(const [m,v] of Object.entries(months))data['wl_v2:'+m]=JSON.stringify(v);data[TRAINING_PLAN.storageKey]=JSON.stringify(ExLog.plan);data.sync_dirty=JSON.stringify([...ExLog._dirty]);}
   if(typeof InBody!=='undefined'&&InBody._log)data.inbody_log=JSON.stringify(InBody._log);
   if(window.AppFeatures)data.daily_weight_v1=JSON.stringify(AppFeatures.weights);
   const blob=new Blob([JSON.stringify({app:'fit-tracker',version:2,exported:new Date().toISOString(),data},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fit-emergency-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
 };
 try{S.recover();S.compactSync();}catch(e){S.blocked=true;S.report(e);}
 window.storage={
  async get(k){const v=k==='restore_backup'?await archive.get():native.getItem(k);return v===null?null:{key:k,value:v};},
  async list(prefix=''){return {keys:Object.keys(native).filter(k=>k.startsWith(prefix))};},
  async set(k,v){v=String(v);if(S.blocked)throw new Error('복원 복구가 필요합니다.');try{if(k==='record_sync_v6')v=StorageDigest.compactLedger(v);if(k==='restore_backup')await archive.set(v);else native.setItem(k,v);S.pending.delete(k);return {key:k,value:v};}catch(e){S.pending.set(k,v);S.report(e);throw e;}},
  async delete(k){try{native.removeItem(k);return {key:k,deleted:true};}catch(e){S.report(e);throw e;}}
 };
 document.addEventListener('DOMContentLoaded',()=>S.render());
 window.addEventListener('unhandledrejection',e=>{if(e.reason?.name==='QuotaExceededError')S.report(e.reason);});
 window.addEventListener('beforeunload',e=>{if(S.error||S.pending.size){e.preventDefault();e.returnValue='';}});
})();
