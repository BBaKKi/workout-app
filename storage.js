/* Persistent writes and crash-safe replacement of a set of local keys. */
(function(){
 'use strict';
 const JOURNAL='fit_transaction_v1', native=window.localStorage;
 const S=window.SafeStore={error:'',pending:new Map(),blocked:false,
  report(error){this.error='기기에 저장하지 못했어요. '+(error?.name==='QuotaExceededError'?'저장 공간이 부족합니다.':'저장소 접근을 확인하세요.');this.render();},
  render(){
   if(!document.body)return;let box=document.getElementById('storage-error');
   if(!box){box=document.createElement('aside');box.id='storage-error';box.setAttribute('role','alert');box.className='storage-error';document.body.appendChild(box);}
   box.hidden=!this.error;
   if(this.error){box.replaceChildren();const text=document.createElement('span');text.textContent=this.error+' 화면의 미저장 입력은 앱을 닫으면 사라질 수 있어요.';box.appendChild(text);
    const retry=document.createElement('button');retry.textContent=this.externalChange?'새로고침':'저장 재시도';retry.onclick=()=>this.retry().catch(()=>{});box.appendChild(retry);
    const backup=document.createElement('button');backup.textContent='현재 입력 파일 백업';backup.onclick=()=>this.emergencyBackup();box.appendChild(backup);}
  },
  recover(){
   const raw=native.getItem(JOURNAL);if(!raw)return;
   const j=JSON.parse(raw);if(!j||j.version!==1||!j.before||typeof j.before!=='object')throw new Error('복원 작업 복구 정보가 잘못되었습니다.');
   Object.keys(j.before).forEach(k=>native.removeItem(k));Object.entries(j.before).forEach(([k,v])=>{if(v!==null)native.setItem(k,v);});native.removeItem(JOURNAL);
  },
  transaction(values,remove=[],retryable=false){
   if(this.blocked)throw new Error('저장소 복구가 필요합니다.');
   const keys=[...new Set([...Object.keys(values),...remove])],before=Object.fromEntries(keys.map(k=>[k,native.getItem(k)]));
   try{
    // Durable rollback journal is written BEFORE touching a live key.
    native.setItem(JOURNAL,JSON.stringify({version:1,before}));
    remove.forEach(k=>native.removeItem(k));Object.entries(values).forEach(([k,v])=>native.setItem(k,String(v)));native.removeItem(JOURNAL);
   }catch(e){
    try{if(native.getItem(JOURNAL))this.recover();}catch(recoveryError){this.blocked=true;}
    if(retryable)Object.entries(values).forEach(([k,v])=>this.pending.set(k,String(v)));this.report(e);throw e;
   }
  },
  async retry(){
   if(this.externalChange){if(confirm('미저장 입력이 있으면 현재 입력 파일 백업을 먼저 받으세요. 새로고침할까요?'))location.reload();return;}
   try{if(this.blocked){this.recover();this.blocked=false;}for(const [k,v] of [...this.pending]){native.setItem(k,v);this.pending.delete(k);}if(typeof ExLog!=='undefined')await ExLog.save();this.error='';this.render();if(typeof ExLog!=='undefined'){ExLog.renderSyncStatus();ExLog._syncSoon();}}
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
 try{S.recover();}catch(e){S.blocked=true;S.report(e);}
 window.storage={
  async get(k){const v=native.getItem(k);return v===null?null:{key:k,value:v};},
  async list(prefix=''){return {keys:Object.keys(native).filter(k=>k.startsWith(prefix))};},
  async set(k,v){v=String(v);if(S.blocked)throw new Error('복원 복구가 필요합니다.');try{native.setItem(k,v);S.pending.delete(k);return {key:k,value:v};}catch(e){S.pending.set(k,v);S.report(e);throw e;}},
  async delete(k){try{native.removeItem(k);return {key:k,deleted:true};}catch(e){S.report(e);throw e;}}
 };
 document.addEventListener('DOMContentLoaded',()=>S.render());
 window.addEventListener('unhandledrejection',e=>{if(e.reason?.name==='QuotaExceededError')S.report(e.reason);});
 window.addEventListener('beforeunload',e=>{if(S.error||S.pending.size){e.preventDefault();e.returnValue='';}});
})();
