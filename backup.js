/* Validate first, persist a recovery snapshot, then replace local keys atomically. */
(function(){
 'use strict';
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const fail=message=>{throw new Error(message);};
 const date=d=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)fail('날짜 형식 오류: '+d);};
 const number=(v,min=0,max=1e6)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('숫자 범위 오류');};
 const safeName=s=>{if(typeof s!=='string'||!s.trim()||s.length>200||/[<>]/.test(s))fail('종목명 또는 설정 이름 오류');};
 function safeTree(x){if(!x||typeof x!=='object')return;for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k))fail('허용하지 않는 설정 키');safeTree(x[k]);}}
 function workout(data,month){
  if(!object(data))fail('운동 기록 객체가 필요합니다.');
  for(const [d,s] of Object.entries(data)){date(d);if(month&&d.slice(0,7)!==month)fail('기록 날짜와 월 파일이 일치하지 않습니다.');if(!object(s)||!Array.isArray(s.exercises))fail('운동 세션 형식 오류');
   for(const e of s.exercises){safeName(e.name);if(!Array.isArray(e.sets))fail('세트 배열 오류');for(const v of e.sets){if(!object(v))fail('세트 형식 오류');number(v.weight,0,100000);number(v.reps,0,100000);if(v.rpe!=null)number(v.rpe,0,10);validateRecordMeta(Object.fromEntries(['unit','bw','ew','exerciseId'].filter(k=>v[k]!=null).map(k=>[k,v[k]])));}}
   if(s.routineSnapshots||s.dayOverrides||s.cond||s.note!==undefined)validateSession({date:d,snapshots:s.routineSnapshots||{},overrides:s.dayOverrides||{},context:{cond:s.cond||{},note:s.note||''}},d);
   if(s.cardio!==undefined){if(!Array.isArray(s.cardio))fail('유산소 배열 오류');s.cardio.forEach(c=>{safeName(c.type);number(c.min,0,100000);validateRecordMeta(Object.fromEntries(['km','incline'].filter(k=>c[k]!=null).map(k=>[k,c[k]])));});}
  }
 }
 function inbody(entries){if(!Array.isArray(entries))fail('인바디 배열 오류');const seen=new Set();entries.forEach(e=>{date(e.date);if(seen.has(e.date))fail('인바디 날짜 중복');seen.add(e.date);['wt','sm','bf'].forEach(k=>number(e[k],.01,k==='bf'?100:500));['ab','waist','vf','pa','bmr'].forEach(k=>{if(e[k]!=null)number(e[k],0,10000);});});}
 const B=window.SafeBackup={
  validate(text){
   const obj=JSON.parse(text);if(!obj||obj.app!=='fit-tracker'||!object(obj.data)||(obj.version&&obj.version>2))fail('지원하는 앱 백업 형식이 아닙니다.');safeTree(obj);
   const values={};
   for(const [key,raw] of Object.entries(obj.data)){
    if(!Backup._allowed(key))continue;if(typeof raw!=='string')fail(key+': 문자열 저장값이 필요합니다.');
    if(['routine_profile','gs_script_url','last_backup','sync_last_ok','dl_grip_start'].includes(key)){
     if(key==='routine_profile'&&!['current','legacy'].includes(raw))fail('루틴 선택값 오류');
     if(key==='gs_script_url'&&raw&&!DataSync.validUrl(raw))fail('배포 URL 형식 오류');values[key]=raw;continue;
    }
    let v;try{v=JSON.parse(raw);}catch(_){fail(key+': 내부 JSON이 손상되었습니다.');}
    if(key==='wl_v2'||key.startsWith('wl_v2:'))workout(v,key==='wl_v2'?null:key.slice(6));
    else if(key==='inbody_log')inbody(v);
    else if(key==='inbody_dirty'){if(!object(v))fail('인바디 대기열 오류');inbody(Object.values(v));}
    else if(key==='daily_weight_v1'||key==='daily_weight_dirty'){if(!object(v))fail('체중 객체 오류');Object.entries(v).forEach(([d,e])=>{date(d);if(!object(e)||e.date!==d)fail('체중 날짜 오류');if(!e.deleted)number(e.wt,20,300);});}
    else if(key==='plan_v2'||key==='plan_v3'){
     if(!object(v))fail('루틴 객체 오류');for(const [day,p] of Object.entries(v)){if(!TRAINING_PLAN.cycle.includes(day)||!object(p))fail('루틴 운동일 오류');for(const k of ['add','rm'])if(p[k]){if(!Array.isArray(p[k]))fail('루틴 배열 오류');p[k].forEach(safeName);}if(p.swap){if(!object(p.swap))fail('교체 설정 오류');Object.entries(p.swap).forEach(([a,b])=>{safeName(a);safeName(b);});}if(p.config){if(!object(p.config))fail('루틴 설정 오류');for(const c of Object.values(p.config)){if(!object(c))fail('운동 설정 오류');if(c.sets!=null){number(c.sets,1,20);if(!Number.isInteger(c.sets))fail('세트 수 오류');}for(const k of ['min','max'])if(c[k]!=null){number(c[k],1,1000);if(!Number.isInteger(c[k]))fail('반복 수 오류');}if(c.min>c.max)fail('반복 범위 오류');}}}
    }else if(key==='sync_dirty'){if(!Array.isArray(v))fail('전송 대기 날짜 배열 오류');v.forEach(date);}
    else if(key==='sync_del'){if(!Array.isArray(v))fail('삭제 대기 배열 오류');v.forEach(x=>{date(x.date);safeName(x.name);number(x.setNo,1,100000);});}
    else if(key==='training_config_v1'){if(!object(v))fail('계획 설정 오류');date(v.start);date(v.end);if(v.end<=v.start||new Date(v.start+'T12:00:00').getDay()!==1)fail('계획 기간 오류');number(v.weightMin,20,300);number(v.weightMax,20,300);if(v.weightMin>=v.weightMax)fail('목표 체중 범위 오류');}
    else if(key==='ex_equipment_v1'){if(!object(v))fail('기구 세팅 오류');Object.entries(v).forEach(([n,x])=>{safeName(n);if(!object(x))fail('기구 세팅 오류');for(const [k,s] of Object.entries(x))if(!['seat','backrest','grip','pulley','stance','note'].includes(k)||typeof s!=='string'||s.length>(k==='note'?240:80))fail('기구 세팅 값 오류');});}
    else if(key==='session_dirty_v1'){if(!object(v))fail('계획 대기열 오류');Object.keys(v).forEach(date);}
    else if(key==='exercise_favorites_v1'){if(!object(v))fail('즐겨찾기 형식 오류');Object.entries(v).forEach(([n,on])=>{safeName(n);if(typeof on!=='boolean')fail('즐겨찾기 값 오류');});}
    else if(key==='focus_mode'){if(typeof v!=='boolean')fail('집중 모드 오류');}
    else if(v!==null&&!object(v))fail(key+': 설정 객체 오류');
    values[key]=raw;
   }
   if(!Object.keys(values).length)fail('복원할 데이터가 없습니다.');return values;
  },
  async importData(){
   const ta=document.getElementById('bk-ta');let values;
   try{values=this.validate(ta?.value||'');}catch(e){Backup._msg('복원 중단: '+e.message+' 기존 기록은 유지됩니다.',true);return false;}
   if(!confirm('검증한 백업을 복원합니다. 현재 기록을 먼저 백업하고 같은 항목을 교체합니다. 계속할까요?'))return false;
   try{
    clearTimeout(ExLog._syncTimer);if(ExLog._syncP)await ExLog._syncP;
    if(DataSync.busy)throw new Error('동기화가 끝난 뒤 다시 시도하세요.');
    await ExLog.save();const old=await Backup._collect();await window.storage.set('restore_backup',JSON.stringify({app:'fit-tracker',version:2,exported:new Date().toISOString(),data:old}));
    const keys=Object.keys(values),hasWorkout=keys.some(k=>k==='wl_v2'||k.startsWith('wl_v2:')),remove=['record_sync_v5','settings_sync_v1','workout_resume_v1','workout_drafts_v1','workout_undo_v1'];
    if(hasWorkout){remove.push(...Object.keys(localStorage).filter(k=>k.startsWith('wl_v2:')),'wl_v2');const months={};for(const k of keys.filter(k=>k==='wl_v2'||k.startsWith('wl_v2:'))){Object.entries(JSON.parse(values[k])).forEach(([d,s])=>(months[d.slice(0,7)]||={})[d]=s);delete values[k];}for(const [m,v] of Object.entries(months))values['wl_v2:'+m]=JSON.stringify(v);values.sync_dirty=JSON.stringify(Object.values(months).flatMap(x=>Object.keys(x)));values.sync_del='[]';values.session_dirty_v1=JSON.stringify(Object.fromEntries(Object.values(months).flatMap(x=>Object.entries(x)).filter(([,s])=>s.routineSnapshots||s.dayOverrides||s.cond||s.note!==undefined).map(([d])=>[d,true])));}
    for(const key of Backup.MERGE_KEYS)if(values[key])values[key]=JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'),...JSON.parse(values[key])});
    if(values.inbody_log)values.inbody_dirty=JSON.stringify(Object.fromEntries(JSON.parse(values.inbody_log).map(x=>[x.date,x])));
    if(values.daily_weight_v1)values.daily_weight_dirty=values.daily_weight_v1;
    // Validate the final merged payload again before any live key is removed.
    this.validate(JSON.stringify({app:'fit-tracker',version:2,data:values}));
    SafeStore.transaction(values,remove);Backup._msg('복원 완료. 새로고침 후 시트 기록과 비교합니다.');setTimeout(()=>location.reload(),500);return true;
   }catch(e){Backup._msg('복원 중단: '+e.message+' 이전 저장값과 복원 전 백업을 유지합니다.',true);return false;}
  }
 };
 Backup.KEYS.push('training_config_v1');
})();

// Plan dates and the maintenance range are editable; a Monday start keeps the
// weekday labels and the return-week schedule consistent.
document.addEventListener('DOMContentLoaded',()=>{
 const box=document.createElement('section');box.className='af-card';box.innerHTML='<div class="af-card-title">계획 기간·체중 목표</div><form id="training-config-form" class="af-fields"><label>시작일 (월요일)<input name="start" type="date" required></label><label>종료일<input name="end" type="date" required></label><label>체중 하한 (kg)<input name="weightMin" type="number" min="20" max="300" step="0.1" required></label><label>체중 상한 (kg)<input name="weightMax" type="number" min="20" max="300" step="0.1" required></label><button type="submit">계획 저장</button><p id="training-config-error" role="alert"></p></form>';
 document.querySelector('.tab-b .plan-wrap').appendChild(box);const form=box.querySelector('form');Object.entries(TRAINING_PLAN.config).forEach(([k,v])=>{if(form.elements[k])form.elements[k].value=v;});
 form.addEventListener('submit',async e=>{e.preventDefault();const c={start:form.start.value,end:form.end.value,weightMin:+form.weightMin.value,weightMax:+form.weightMax.value};const msg=box.querySelector('p');if(new Date(c.start+'T12:00:00').getDay()!==1||c.end<=c.start||!(c.weightMin>=20&&c.weightMax<=300&&c.weightMin<c.weightMax)){msg.textContent='월요일 시작일, 시작 이후 종료일과 올바른 체중 범위를 입력하세요.';return;}try{await ExLog.save();await window.storage.set('training_config_v1',JSON.stringify(c));location.reload();}catch(error){msg.textContent='저장하지 못했어요. 입력을 유지합니다.';}});
});
