/* Keep only confirmed recent records. Cache eviction is NEVER a deletion request. */
(function(){
 'use strict';
 const kinds=['workout','weight','inbody','session'],read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch(_){return f;}};
 const R=window.RecordCache={
  info:read('record_cache_v1',null),history:null,historyError:'',historyBusy:false,
  range(){return {from:RecordModel.shift(_todayKey(),-29),to:_todayKey()};},
  request(extraOnly){
   const range=this.range(),state=DataSync.state(localStorage.getItem('gs_script_url')||''),extra={};
   for(const kind of kinds){const local=DataSync.local(kind),dates=new Set([...Object.keys(local),...Object.keys(state.pending?.[kind]||{})]);extra[kind]=extraOnly?[extraOnly]:[...dates].filter(d=>kind==='inbody'||d<range.from||d>range.to).sort();}
   return {mode:'sync_window',...range,inbodyLimit:8,gymStart:TRAINING_PLAN.equipmentDate,gymNames:GymInventory.entries.map(e=>e.name),extra};
  },
  validate(snapshot,request){
   const s=snapshot.scope;if(!s||s.version!==1||s.from!==request.from||s.to!==request.to||!Array.isArray(s.inbodyDates)||s.inbodyDates.length>8)throw new Error('기간별 조회를 지원하는 Apps Script 7.3.0으로 업데이트하세요. 기존 기록은 유지됩니다.');
   const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d);
   if(!s.inbodyDates.every(date)||new Set(s.inbodyDates).size!==s.inbodyDates.length)throw new Error('인바디 조회 범위 오류');
   for(const k of kinds){if(JSON.stringify(s.extra?.[k])!==JSON.stringify(request.extra[k]))throw new Error('요청한 날짜의 응답 범위가 다릅니다.');if(snapshot[k].some(r=>!this.covers(s,k,r.date)))throw new Error('요청 범위 밖의 응답입니다.');}
   const summary=snapshot.summary;if(!summary||summary.version!==1||summary.before!==s.from||summary.through!==s.to||summary.gymStart!==TRAINING_PLAN.equipmentDate||!summary.exercises||!summary.days)throw new Error('과거 기록 요약 응답을 확인하지 못했습니다.');
  },
  covers(scope,kind,date){return scope.extra[kind].includes(date)||(kind==='inbody'?scope.inbodyDates.includes(date):date>=scope.from&&date<=scope.to);},
  async pull(url,date){
   const request=this.request(date),pages=Math.max(1,...kinds.map(k=>Math.ceil(request.extra[k].length/500)));let result;
   for(let page=0;page<pages;page++){
    const part={...request,extra:Object.fromEntries(kinds.map(k=>[k,request.extra[k].slice(page*500,(page+1)*500)]))};let snapshot;
    try{snapshot=await ExLog.api(url,part);}catch(e){if(/이전 방식|API v7 앱/.test(e.message))throw new Error('Apps Script 7.3.0을 새 버전으로 배포하세요. 기기 기록은 유지됩니다.');throw e;}
    DataSync.validateSnapshot(snapshot);this.validate(snapshot,part);
    if(result&&result.source?.id!==snapshot.source?.id)throw new Error('조회 중 연결된 시트가 변경됐습니다.');
    if(!result)result=snapshot;else{for(const k of kinds)snapshot[k]=[...new Map([...result[k],...snapshot[k]].map(r=>[r.date,r])).values()];result=snapshot;}
   }
   result.scope.extra=request.extra;for(const k of kinds)result[k]=result[k].filter(r=>this.covers(result.scope,k,r.date));this.validate(result,request);return result;
  },
  summary(){const i=this.info;return i&&i.url===localStorage.getItem('gs_script_url')&&i.summary.gymStart===TRAINING_PLAN.equipmentDate?i.summary:null;},
  bestSets(name,before=ExLog.date){const s=this.summary();if(!s||s.before>before||!RecordModel.activeName(name))return [];return Object.values(s.exercises[name]?.best||{}).filter(x=>x.date<before).map(x=>x.set);},
  last(name,before=ExLog.date){const s=this.summary(),v=s?.exercises[name]?.last;return v&&v.date<before&&RecordModel.activeRecord(v.date,name)?{date:v.date,sets:v.sets,day:v.day}:null;},
  lastDay(day,before=ExLog.date){return Object.values(this.summary()?.dayLast||{}).filter(x=>x.date<before&&(!day||x.day===day)).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;},
  seedBest(){const result={};for(const name of Object.keys(this.summary()?.exercises||{})){const sets=this.bestSets(name,_todayKey());if(sets.length)result[name]=Math.max(...sets.map(s=>_ldW(s)>0?_e1Of(_ldW(s),s.reps):s.reps));}return result;},
  week(start){const result={},end=RecordModel.shift(start,6);for(const [date,group] of Object.entries(this.summary()?.days||{})){if(date<start||date>end||ExLog.data[date])continue;for(const [name,v] of Object.entries(group)){if(!RecordModel.activeName(name))continue;const x=result[name]||={sets:0,volume:0};x.sets+=v.sets;x.volume+=v.volume;}}return Object.entries(result);},
  pruneLegacy(snapshot){
   const raw=localStorage.getItem('wl_v2');if(!raw)return;
   let old;try{old=JSON.parse(raw);}catch(_){return;}const next={...old};
   for(const [date,s] of Object.entries(old)){
    if(date>=snapshot.scope.from||!this.covers(snapshot.scope,'workout',date))continue;
    const rows=[];for(const e of s.exercises||[])(e.sets||[]).forEach((v,i)=>rows.push({name:e.name,day:s.day||'',setNo:i+1,weight:v.weight,reps:v.reps,wu:+!!v.warmup,rpe:v.rpe||0,pain:+!!v.pain,meta:RecordModel.meta(e.name,v,e.exerciseId)}));
    (s.cardio||[]).forEach((c,i)=>{if(c.min>0)rows.push({name:'🏃 '+(c.type||'유산소'),day:s.day||'',setNo:i+1,weight:0,reps:c.min,meta:{...(c.km!=null?{km:c.km}:{}),...(c.incline!=null?{incline:c.incline}:{})}});});
    const remote=snapshot.workout.find(r=>r.date===date);if(rows.length&&(!remote||DataSync.fingerprint({rows},'workout')!==DataSync.fingerprint(remote,'workout')))continue;
    const meta={entry:{date,...WorkoutTools.meta(s)}},hash=DataSync.fingerprint(meta,'session'),session=snapshot.session.find(r=>r.date===date);
    if(hash!=='null'&&(!session||hash!==DataSync.fingerprint(session,'session')))continue;
    delete next[date];
   }
   // Atomic shrink; unknown or unconfirmed legacy-only records remain untouched.
   if(Object.keys(next).length!==Object.keys(old).length){if(Object.keys(next).length)localStorage.setItem('wl_v2',JSON.stringify(next));else localStorage.removeItem('wl_v2');}
  },
  hasDraft(date){return Object.entries(WorkoutTools.drafts||{}).some(([key,v])=>{try{return JSON.parse(key)[0]===date&&(v.kg||v.reps||v.editId);}catch(_){return false;}});},
  async prune(url,state,snapshot,evicted=new Set()){
   // Only compare against receipts obtained in THIS successful scoped read/write.
   // Missing tabs, conflicts, dirty queues, and unacknowledged writes always stay.
   const scope=snapshot.scope,local=Object.fromEntries(kinds.map(k=>[k,DataSync.local(k)]));
   const clean=(kind,date)=>{const b=state.base[kind]?.[date],r=local[kind][date],remote=snapshot[kind].find(x=>x.date===date);return remote&&remote.revision===b?.revision&&DataSync.fingerprint(remote,kind)===DataSync.fingerprint(r||DataSync.empty(date,kind),kind)&& this.covers(scope,kind,date)&&snapshot.source?.sheets?.[kind]?.status!=='missing'&&b&&b.revision!=='0'&&r&&!state.pending[kind]?.[date]&&!DataSync.conflicts.some(c=>c.kind===kind&&c.date===date)&&!DataSync.isDirty(kind,date,r,b)&&b.hash===StorageDigest.digest(DataSync.fingerprint(r,kind));};
   const evict=[];
   for(const [date,s] of Object.entries(ExLog.data)){
    if(date>=scope.from||date===ExLog.date||this.hasDraft(date))continue; // future plans and the viewed session remain intact
    const hasWorkout=!!local.workout[date],hasSession=!!local.session[date];
    if((hasWorkout&&!clean('workout',date))||(hasSession&&!clean('session',date))||(!hasWorkout&&!hasSession)||ExLog._dirty.has(date)||Object.hasOwn(read('session_dirty_v1',{}),date))continue;
    evict.push(date);
   }
   const overlapping=snapshot.workout.filter(r=>r.date<scope.from&&ExLog.data[r.date]&&r.rows.some(x=>!x.wu&&RecordModel.activeRecord(r.date,x.name))).map(r=>r.date);
   const info={version:1,overlapping,url,sourceId:state.sourceId,from:scope.from,to:scope.to,inbodyDates:scope.inbodyDates,summary:snapshot.summary,at:new Date().toISOString()};
   // A verified summary must be durable before removing any detailed record.
   await window.storage.set('record_cache_v1',JSON.stringify(info));this.info=info;
   const removed=new Set(evict),months=[...new Set(evict.map(d=>d.slice(0,7)))];
   for(const month of months){const entries=Object.entries(ExLog.data).filter(([d])=>d.startsWith(month)&&!removed.has(d)),key='wl_v2:'+month;
    // One key at a time is atomic; a crash can only leave extra cache, never erase cloud records.
    if(entries.length)await window.storage.set(key,JSON.stringify(Object.fromEntries(entries)));else await window.storage.delete(key);
    for(const date of evict.filter(d=>d.startsWith(month))){delete ExLog.data[date];evicted.add(date);delete state.base.workout[date];delete state.base.session[date];}
    ExLog._dirtyMonths.delete(month);
   }
   const oldIB=InBody._log||[],nextIB=oldIB.filter(e=>scope.inbodyDates.includes(e.date)||!clean('inbody',e.date));
   if(nextIB.length!==oldIB.length){await window.storage.set('inbody_log',JSON.stringify(nextIB));for(const e of oldIB)if(!nextIB.includes(e))delete state.base.inbody[e.date];InBody._log=nextIB;}
   const weights={...AppFeatures.weights};for(const date of Object.keys(weights))if(date<scope.from&&clean('weight',date)){delete weights[date];delete state.base.weight[date];}
   if(Object.keys(weights).length!==Object.keys(AppFeatures.weights).length){await window.storage.set('daily_weight_v1',JSON.stringify(weights));AppFeatures.weights=weights;}
   // Empty baseline-only dates are outside the read scope, never inferred deletions.
   for(const kind of kinds)for(const date of Object.keys(state.base[kind]||{}))if(!DataSync.local(kind)[date]&&!state.pending[kind]?.[date]&&(kind==='inbody'?!scope.inbodyDates.includes(date):date<scope.from))delete state.base[kind][date];
   await window.storage.set('record_sync_v6',JSON.stringify(DataSync.statesWith(url,state)));
   this.pruneLegacy(snapshot);ExLog._invalidateIdx();ExLog._pbCache={};ExLog._miniPrev={};this.renderStatus();
  },
  priorCount(){const s=this.summary();if(!s)return 0;return Math.max(0,s.totalDays-(this.info.overlapping||[]).filter(d=>ExLog.activeData[d]?.exercises?.some(e=>e.sets?.some(_isWorkSet))).length);},
  renderStatus(){const el=document.getElementById('cache-status');if(!el)return;el.textContent=this.info?'기기: 운동 최근 30일 · 인바디 최근 8회 · 미전송·임시 입력·확인 중인 기록은 추가 보관. 이전 상세 기록은 시트에서 조회합니다.':'시트 연결 확인 후 최근 기록만 기기에 보관합니다. 확인 전 기록은 유지합니다.';},
  async browse(){
   if(this.historyBusy)return;const from=document.getElementById('cloud-history-from').value,to=document.getElementById('cloud-history-to').value;
   if(!from||!to||to<from||(Date.parse(to)-Date.parse(from))/86400000>30){this.historyError='시작일과 종료일을 최대 31일 범위로 선택하세요.';this.renderHistory();return;}
   this.historyBusy=true;this.history=null;this.historyError='';this.renderHistory();
   try{const url=await ExLog.getScriptUrl();if(!url)throw new Error('시트 연결이 필요해요.');const r=await DataSync.request(url,{mode:'history_range',from,to});if(r.type!=='history'||r.scope?.from!==from||r.scope?.to!==to)throw new Error('조회 범위가 일치하지 않습니다.');DataSync.validateSnapshot({...r,type:'snapshot'});if(this.info?.url===url&&this.info.sourceId&&r.source?.id!==this.info.sourceId)throw new Error('연결된 시트가 변경됐습니다.');if(kinds.some(k=>r[k].some(x=>x.date<from||x.date>to)))throw new Error('조회 범위 밖의 기록입니다.');this.history=r;}catch(e){this.historyError=e.message;}
   finally{this.historyBusy=false;this.renderHistory();}
  },
  renderHistory(){const box=document.getElementById('cloud-history-results');if(!box)return;box.replaceChildren();const p=document.createElement('p');p.textContent=this.historyBusy?'시트에서 읽는 중…':this.historyError||'조회한 기록은 읽기 전용이며 기기에 추가 저장하지 않습니다.';box.appendChild(p);if(!this.history)return;
   for(const kind of kinds)for(const r of this.history[kind]){const details=document.createElement('details'),title=document.createElement('summary'),pre=document.createElement('pre');title.textContent=r.date+' · '+DataSync.kindLabel(kind);pre.textContent=DataSync.summary(r,kind);details.append(title,pre);box.appendChild(details);}
   if(kinds.every(k=>!this.history[k].length)){const empty=document.createElement('p');empty.textContent='선택한 기간에 시트에서 읽은 기록이 없어요.';box.appendChild(empty);}
  },
  unavailable(date=ExLog.date){return !!this.info&&date<this.info.from&&!ExLog.data[date];},
  openHistory(date){const box=document.getElementById('cloud-history');box.open=true;document.getElementById('cloud-history-from').value=date||RecordModel.shift(this.range().from,-30);document.getElementById('cloud-history-to').value=date||RecordModel.shift(this.range().from,-1);document.querySelector('.lbl-b').click();box.scrollIntoView({block:'start'});},
  mount(){const box=document.createElement('details');box.id='cloud-history';box.className='af-card';box.innerHTML='<summary>이전 기록 · 시트에서 조회</summary><p id="cache-status"></p><div class="af-fields"><label>시작일<input id="cloud-history-from" type="date"></label><label>종료일<input id="cloud-history-to" type="date"></label></div><button id="cloud-history-read" type="button">시트 기록 불러오기</button><div id="cloud-history-results" aria-live="polite"></div>';document.getElementById('reference-history').before(box);document.getElementById('cloud-history-from').value=RecordModel.shift(this.range().from,-30);document.getElementById('cloud-history-to').value=RecordModel.shift(this.range().from,-1);document.getElementById('cloud-history-read').onclick=()=>this.browse();box.addEventListener('toggle',()=>{if(!box.open){this.history=null;this.renderHistory();}});this.renderStatus();},
 };
 const refresh=ExLog.refresh;ExLog.refresh=function(...args){const value=refresh.apply(this,args);if(R.unavailable()){document.body.classList.add('viewing-reference');const box=document.getElementById('archived-date');if(box){box.hidden=false;const content=document.getElementById('archived-date-content');content.replaceChildren();const p=document.createElement('p');p.textContent='기기에 보관하지 않은 날짜예요. 시트 기록을 조회해 주세요.';const b=document.createElement('button');b.textContent='이 날짜 시트에서 조회';b.onclick=()=>R.openHistory(ExLog.date);content.append(p,b);}}return value;};
 for(const method of ['addSet','saveSet','setSession','saveCardio','delCardio','setCond','setSleep','setNote','switchDay']){const fn=ExLog[method];if(fn)ExLog[method]=function(...args){if(R.unavailable()){AppFeatures.announce('이전 날짜는 시트에서 조회해 주세요.');return;}return fn.apply(this,args);};}
 const capture=WorkoutTools.capture;WorkoutTools.capture=function(...args){if(R.unavailable())return null;return capture.apply(this,args);};
 const shift=PlanApp.shiftWeek;PlanApp.shiftWeek=function(d){const off=Math.min(0,this._wkOff+d);if(R.info&&this._weekKeys(off)[0]<R.info.from){R.openHistory(this._weekKeys(off)[0]);document.getElementById('cloud-history-to').value=this._weekKeys(off)[6];return;}return shift.call(this,d);};
 const mount=InterfaceTools.mount;InterfaceTools.mount=function(){const r=mount.call(this);R.mount();return r;};
})();
