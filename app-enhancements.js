/* Exercise-library weight is the authoritative ordering priority, independent of set.weight (kg).
 * Keep the original logging/backup paths; add routine editing and sync without rewriting history. */
(function(){
 'use strict';
 const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clone=x=>JSON.parse(JSON.stringify(x)), same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch(_){return f;}};
 const shift=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return _localKey(x);};
 const nameOf=w=>(w.querySelector('.ex-nm')?.textContent||'').trim();
 const PREF_KEYS=['plan_v3','plan_v2','routine_profile','ex_base','ex_rest','ex_memo','ex_load','block_v1','deload_v1','training_config_v1','ex_equipment_v1','exercise_favorites_v1'];
 const PREF_LABELS={plan_v3:'새 루틴 · 종목/세트/반복',plan_v2:'기존 루틴 · 종목/세트/반복',routine_profile:'선택한 루틴',ex_base:'기구 기본 중량',ex_rest:'휴식 시간',ex_memo:'기구 메모',ex_load:'부하 유형',block_v1:'훈련 블록',deload_v1:'디로드 설정',training_config_v1:'계획 기간·목표',ex_equipment_v1:'기구별 구조화 세팅',exercise_favorites_v1:'운동 즐겨찾기'};
 const A=window.AppFeatures={ready:false,focus:read('focus_mode',true),selected:{},weights:read('daily_weight_v1',{}),conflict:null,settingsMessage:'',syncing:false,
  canonical(n){return n;},
  priority(name){
   const e=ExLog.libByName(name),weight=Number.isFinite(e?.weight)?e.weight:400;
   const phase=weight<200?'early':weight<300?'middle':weight<400?'late':'unclassified';
   return {weight,phase,label:{early:'초반',middle:'중반',late:'후반',unclassified:'미분류'}[phase],reason:e?.orderReason||'도감에 없는 직접 입력 종목입니다. 자동 분류를 추정하지 않고 목록 끝에 둡니다.'};
  },
  defaults(day,original,date=ExLog.date){
   const fixed=TRAINING_PLAN.mode==='current'&&TRAINING_PLAN.defaultsFor(day,date)?.[original];
   if(fixed)return {...fixed};
   const e=ExLog.libByName(original), m=String(e?.sets||'').match(/(\d+)\s*[×x]\s*(\d+)(?:\s*[–~\-]\s*(\d+))?/);
   return {sets:m?+m[1]:3,min:m?+m[2]:8,max:m?+(m[3]||m[2]):12};
  },
  routine(day,date=ExLog.date){const snap=ExLog.activeData[date]?.routineSnapshots?.[day];return snap?clone(snap.rows).filter(r=>!r.skipped):this.templateRoutine(day,date);},
  templateRoutine(day,date=ExLog.date){
   if(!RecordModel.activeDate(date))return [];
   const p=ExLog.plan[day]||{}, base=TRAINING_PLAN.exercisesFor(day,date)||[], names=base.concat((p.add||[]).filter(n=>RecordModel.activeName(n)&&!base.includes(n))), seen=new Set();
   return names.map((original,index)=>{
    const candidate=(p.swap||{})[original],name=RecordModel.activeName(candidate)?candidate:original;if((p.rm||[]).includes(original)||seen.has(name))return null;seen.add(name);
    const cfg=p.config?.[original]||p.config?.[name]||{},d=this.defaults(day,original,date);
    // Old per-day config.weight values were manual slot numbers; ignore them without deleting data.
    ['sets','min','max'].forEach(k=>{if(Number.isFinite(cfg[k]))d[k]=cfg[k];});
    return {original,name,index,...d,...this.priority(name),baseSets:d.sets,sets:TRAINING_PLAN.mode==='current'&&TRAINING_PLAN.phase(date).limited?Math.min(2,d.sets):d.sets};
   }).filter(Boolean);
  },
  prescription(name,day,date=ExLog.date){
   const row=this.routine(day,date).find(x=>x.name===name)||this.routine(day,date).find(x=>this.canonical(x.name)===this.canonical(name));
   return row?{sets:row.sets,baseSets:row.baseSets,min:row.min,max:row.max,rir:TRAINING_PLAN.phase(date).repsLeft}:TRAINING_PLAN.prescription(name,day,date);
  },
  sort(panel){
   const day=ExLog.panelDayOf(panel),list=panel.querySelector('.ex-list');if(!list)return;
   const order=new Map(this.routine(day).map((x,i)=>[x.name,{...x,rank:i}]));
   const wraps=[...list.children].filter(w=>w.classList.contains('ex-wrap'));
   wraps.sort((a,b)=>(order.get(nameOf(a))?.rank??1e6)-(order.get(nameOf(b))?.rank??1e6));
   wraps.forEach(w=>{list.appendChild(w);const row=order.get(nameOf(w));if(row){w.dataset.orderWeight=String(row.weight);w.dataset.orderPhase=row.phase;w.querySelector('.ex-order')?.remove();const tag=document.createElement('span');tag.className='ex-order '+row.phase;tag.textContent=row.label;tag.title=row.reason;w.querySelector('.ex-meta')?.prepend(tag);}});
   const info=panel.querySelector('.hinfo');if(info&&TRAINING_PLAN.mode==='current')info.textContent=this.routine(day).slice(0,2).map(x=>x.name).join(' → ')+' · 복합 2–3분 / 고립 1–2분 휴식';this.markPhases(panel);const rec=list.querySelector('.day-reco');if(rec)list.appendChild(rec);
  },
  markPhases(panel){
   const list=panel.querySelector('.ex-list');if(!list)return;list.querySelectorAll('.ex-tier,.ex-stage').forEach(el=>el.remove());
   let prev=null;[...list.querySelectorAll('.ex-wrap')].filter(w=>w.style.display!=='none').forEach(w=>{const p=this.priority(nameOf(w));if(p.phase===prev)return;prev=p.phase;const h=document.createElement('div');h.className='ex-stage '+p.phase;h.textContent=p.label+' · '+({early:'주요 근력운동',middle:'보조·고립운동',late:'마무리',unclassified:'직접 입력 종목'}[p.phase]);list.insertBefore(h,w);});
  },
  decorateLibrary(){
   const list=$('#lib-list');if(!list)return;
   list.querySelectorAll('.lib-card').forEach(d=>{const e=LibApp._items?.[+d.dataset.i];if(!e)return;const p=this.priority(e.name),name=d.querySelector('.lib-nm');name?.querySelector('.ex-order')?.remove();const tag=document.createElement('span');tag.className='ex-order '+p.phase;tag.textContent=p.label;tag.title=p.reason;name?.appendChild(tag);});
  },
  decorateLibraryDetail(d){
   const e=LibApp._items?.[+d?.dataset.i],body=d?.querySelector('.lib-body');if(!e||!body||body.querySelector('.lib-order-detail'))return;
   const p=this.priority(e.name),box=document.createElement('details');box.className='lib-order-detail';box.innerHTML='<summary>루틴에 배치할 순서 · '+p.label+'</summary><p>'+esc(p.reason)+'</p>';body.append(box);
  },
  activeDay(){const i=ExLog.PANEL_DAY.findIndex((_,i)=>$('#d'+(i+1))?.checked);return ExLog.PANEL_DAY[Math.max(0,i)];},
  openEditor(day=this.activeDay()){
   this.editorDay=day;this.editorRows=window.WorkoutTools?WorkoutTools.template(day):this.routine(day);const dialog=$('#routine-editor');
   $('#edit-day').value=day;$('#edit-hint').textContent=TRAINING_PLAN.phase(ExLog.date).limited&&TRAINING_PLAN.mode==='current'?'기본 세트 수를 편집합니다. 복귀·적응 기간에는 최대 2세트로 표시합니다.':'앞으로 쓸 세트·반복을 편집해요. 이미 시작한 날짜의 계획은 유지됩니다.';
   $('#edit-rows').innerHTML=this.editorRows.map((r,i)=>'<div class="af-edit-row" data-row="'+i+'"><b>'+esc(r.name)+'</b><span class="ex-order '+r.phase+'">'+r.label+'</span><p class="af-order-reason">'+esc(r.reason)+'</p><div class="af-fields">'+[['sets','세트',r.baseSets,'1','1','20'],['min','최소 반복',r.min,'1','1','1000'],['max','최대 반복',r.max,'1','1','1000']].map(([k,label,v,step,min,max])=>'<label>'+label+'<input aria-label="'+esc(r.name+' '+label)+'" name="'+k+'" type="number" inputmode="numeric" step="'+step+'" min="'+min+'" max="'+max+'" value="'+v+'" required></label>').join('')+'</div></div>').join('');
   $('#edit-error').textContent='';if(!dialog.open)dialog.showModal();
  },
  async saveEditor(e){
   e.preventDefault();const config={...(ExLog.plan[this.editorDay]?.config||{})};
   for(const el of document.querySelectorAll('#edit-rows .af-edit-row')){
    const row=this.editorRows[+el.dataset.row], v=Object.fromEntries([...el.querySelectorAll('input')].map(inp=>[inp.name,inp.value===''?NaN:Number(inp.value)]));
    if(!Object.values(v).every(Number.isFinite)||!Number.isInteger(v.sets)||v.sets<1||v.sets>20||!Number.isInteger(v.min)||!Number.isInteger(v.max)||v.min<1||v.max<v.min||v.max>1000){$('#edit-error').textContent='세트는 1–20, 반복은 1–1000 범위로 입력하세요. 최대 반복은 최소 이상이어야 합니다.';return false;}
    config[row.original]={...(config[row.original]||{}),...v};
   }
   ExLog.planFor(this.editorDay).config=config;await ExLog.savePlan();
   document.querySelectorAll('.day-panel').forEach(p=>this.sort(p));ExLog.injectTargets();ExLog.refresh();$('#routine-editor').close();this.announce('루틴 목표를 저장했어요.');return true;
  },
  announce(t){$('#af-status').textContent=t;},
  toggleFocus(){this.focus=!this.focus;localStorage.setItem('focus_mode',JSON.stringify(this.focus));this.renderFocus();},
  moveFocus(n){const day=this.activeDay(),rows=this.routine(day),at=Math.max(0,rows.findIndex(r=>r.name===this.selected[day]));this.selected[day]=rows[Math.max(0,Math.min(rows.length-1,at+n))]?.name;this.renderFocus();},
  renderFocus(){
   if(!this.ready)return;document.body.classList.toggle('af-focus',this.focus);$('#focus-toggle').textContent=this.focus?'전체 목록':'한 종목씩';$('#focus-toggle').setAttribute('aria-pressed',String(this.focus));
   const day=this.activeDay(),rows=this.routine(day),key=day+'|'+ExLog.date;
   if(this.focusDate!==key){this.focusDate=key;this.selected[day]=null;}
   if(!rows.some(r=>r.name===this.selected[day]))this.selected[day]=rows.find(r=>{const e=(ExLog.activeData[ExLog.date]?.exercises||[]).find(e=>e.name===r.name);return (e?.sets||[]).filter(_isWorkSet).length<r.sets;})?.name||rows[0]?.name;
   const at=rows.findIndex(r=>r.name===this.selected[day]), select=$('#focus-exercise');
   select.innerHTML=rows.map((r,i)=>'<option value="'+i+'">'+(i+1)+' / '+rows.length+' · '+esc(ExLog.libByName(r.name)?.displayName||r.name)+'</option>').join('');select.value=String(at);select.disabled=!rows.length;
   $('#focus-prev').disabled=at<=0;$('#focus-next').disabled=at<0||at>=rows.length-1;
   document.querySelectorAll('.day-panel').forEach(panel=>{
    const pDay=ExLog.panelDayOf(panel);panel.querySelectorAll('.ex-wrap').forEach(w=>{const on=pDay===day&&nameOf(w)===this.selected[day];w.classList.toggle('af-current',on);if(on&&this.focus){const det=w.querySelector('details');if(det)det.open=true;}
     if(on){const prev=ExLog.prevSession(nameOf(w));let info=w.querySelector('.af-prev');if(!info){info=document.createElement('div');info.className='af-prev';w.querySelector('.ex-detail')?.prepend(info);}const sets=(prev?.sets||[]).filter(_isWorkSet);info.hidden=!sets.length;info.textContent=sets.length?'지난 기록 · '+prev.date+' · '+sets.map(s=>RecordModel.formatSet(nameOf(w),s)).join(' / '):'첫 기록 · 준비 세트부터 시작하세요.';}
    });
   });
  },
  weightStats(end=_todayKey()){
   const rows=Object.values(this.weights).filter(x=>!x.deleted&&Number.isFinite(x.wt)&&x.wt>0), avg=(from,to)=>{const a=rows.filter(x=>x.date>=from&&x.date<=to);return {mean:a.length?a.reduce((n,x)=>n+x.wt,0)/a.length:null,count:a.length};};
   const now=avg(shift(end,-6),end),prev=avg(shift(end,-13),shift(end,-7));return {...now,previous:prev.mean,previousCount:prev.count,delta:now.mean!==null&&prev.mean!==null?now.mean-prev.mean:null,start:shift(end,-6),end};
  },
  async saveWeight(e){
   e.preventDefault();const date=$('#weight-date').value,wt=Number($('#weight-value').value);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>_todayKey()||!Number.isFinite(wt)||wt<20||wt>300){$('#weight-message').textContent='오늘 이전 날짜와 20–300kg 범위의 체중을 입력하세요.';return;}
   await this.putWeight({date,wt,updatedAt:new Date().toISOString()});$('#weight-message').textContent=date+' · '+wt+'kg 저장됨';$('#weight-value').value='';
  },
  async putWeight(entry){
   this.weights[entry.date]=entry;const q=read('daily_weight_dirty',{});q[entry.date]=entry;DataSync.noteLocal('weight',entry.date);
   // Save the pending record first. A failed second write can be recovered from the queue on boot.
   SafeStore.transaction({daily_weight_dirty:JSON.stringify(q),daily_weight_v1:JSON.stringify(this.weights)},[],true);this.renderWeights();ExLog._syncSoon();ExLog.renderSyncStatus();
  },
  async removeWeight(date){await this.putWeight({date,deleted:true,updatedAt:new Date().toISOString()});$('#weight-message').textContent=date+' 기록 삭제됨';},
  renderWeights(){
   if(!this.ready)return;const s=this.weightStats(), mean=s.mean===null?'—':s.mean.toFixed(1), state=s.mean===null?'측정값을 입력해 주세요':s.mean<TRAINING_PLAN.config.weightMin?'목표 범위 아래':s.mean>TRAINING_PLAN.config.weightMax?'목표 범위 위':'목표 범위 안';
   $('#weight-summary').innerHTML='<div class="af-number">'+mean+'<small> kg</small></div><b>최근 7일 평균 · '+s.count+'/7일 기록</b><p>'+s.start.slice(5)+'–'+s.end.slice(5)+' · '+state+'<br>유지 범위 '+TRAINING_PLAN.config.weightMin+'–'+TRAINING_PLAN.config.weightMax+'kg'+(s.delta!==null?'<br>직전 7일 평균 대비 '+(s.delta>0?'+':'')+s.delta.toFixed(1)+'kg ('+s.previousCount+'/7일 기록)':'')+'</p>';
   const rows=Object.values(this.weights).filter(x=>!x.deleted).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,14);
   $('#weight-history').innerHTML=rows.length?rows.map(r=>'<div class="af-history-row"><span>'+esc(r.date)+'</span><b>'+r.wt+'kg</b><button type="button" data-edit-weight="'+r.date+'">수정</button><button type="button" data-delete-weight="'+r.date+'" aria-label="'+r.date+' 체중 삭제">삭제</button></div>').join(''):'아직 일일 체중 기록이 없어요.';
  },
  weekly(date=ExLog.date){
   const dates=RecordModel.weekDates(date),start=dates[0],end=dates[6],planned=new Map(),actual=new Map(),validDates=new Set();
   let sessions=0,unknown=0,reconstructed=0,unplannedSets=0,matched=0;
   for(const d of dates){
    if(!RecordModel.activeDate(d))continue;
    const snaps=Object.values(ExLog.activeData[d]?.routineSnapshots||{});
    const day=ExLog.activeData[d]?.day||TRAINING_PLAN.schedule(d);
    if(!snaps.length&&(d<TRAINING_PLAN.start||d>TRAINING_PLAN.end||!TRAINING_PLAN.cycle.includes(day)))continue;
    if(d<_todayKey()&&!snaps.length){unknown++;continue;}
    validDates.add(d);sessions++;reconstructed+=snaps.filter(x=>x.source==='reconstructed').length;
    const dayRows=snaps.length?snaps.flatMap(x=>x.rows).filter(r=>!r.skipped):this.routine(day,d);
    const dayPlan=new Map();dayRows.forEach(row=>dayPlan.set(row.name,(dayPlan.get(row.name)||0)+row.sets));
    for(const [name,count] of dayPlan){const row=planned.get(name)||{name,planned:0};row.planned+=count;planned.set(name,row);}
    if(d<=_todayKey())for(const e of ExLog.activeData[d]?.exercises||[]){
     const n=e.sets.filter(_isWorkSet).length;actual.set(e.name,(actual.get(e.name)||0)+n);
     const target=dayPlan.get(e.name)||0;matched+=Math.min(n,target);dayPlan.set(e.name,Math.max(0,target-n));
    }
   }
   for(const d of dates)if(d<=_todayKey()&&!validDates.has(d))for(const e of ExLog.activeData[d]?.exercises||[])unplannedSets+=e.sets.filter(_isWorkSet).length;
   const rows=[...planned].map(([name,v])=>({...v,actual:actual.get(name)||0}));
   const extra=[...actual].filter(([name])=>!planned.has(name)).reduce((n,[,v])=>n+v,0);
   return {start,end,sessions,unknown,reconstructed,unplannedSets,rows,extra,total:rows.reduce((n,x)=>n+x.planned,0),done:rows.reduce((n,x)=>n+x.actual,0),matched};
  },
  renderWeekly(){
   if(!this.ready)return;const w=this.weekly();$('#weekly-plan').innerHTML='<div class="af-card-title">이번 주 계획과 수행</div><p>'+w.start.slice(5)+'–'+w.end.slice(5)+' · '+w.sessions+'회 확인된 계획 · 시작한 날은 저장된 목표 기준'+(w.unknown?' · 과거 목표 미보관 '+w.unknown+'일 제외':'')+(w.reconstructed?' · 사후 입력 계획 '+w.reconstructed+'개':'')+'</p><div class="af-number">'+w.matched+' <small>/ '+w.total+'세트</small></div><progress value="'+w.matched+'" max="'+(w.total||1)+'" aria-label="주간 계획 세트 달성"></progress><p>워밍업 제외 · 종목별 목표까지만 달성으로 계산<br>기록된 본세트 '+(w.done+w.extra)+'개'+(w.extra?' · 계획 외 종목 '+w.extra+'개':'')+' · 빠진 날의 운동을 몰아서 할 필요는 없어요.</p><details><summary>종목별 확인</summary><div class="af-week-rows">'+w.rows.map(r=>'<div><span>'+esc(r.name)+'</span><b>'+r.actual+' / '+r.planned+'</b></div>').join('')+'</div></details>';
  },
  snapshot(){return Object.fromEntries(PREF_KEYS.map(k=>[k,localStorage.getItem(k)]));},
  prefState(url){const all=read('settings_sync_v1',{});return all[url]||{revision:0,base:null};},
  savePrefState(url,state){const all=read('settings_sync_v1',{});all[url]=state;localStorage.setItem('settings_sync_v1',JSON.stringify(all));},
  normalizedPrefs(data){return Object.fromEntries(PREF_KEYS.map(k=>[k,typeof data?.[k]==='string'?data[k]:null]));},
  async api4(url,body){try{const j=await ExLog.api(url,body);if(j.apiVersion<7)throw new Error('Apps Script API v7 배포가 필요합니다. 로컬 저장은 유지됩니다.');return j;}catch(e){if(/지원하지 않는 mode/.test(e.message))throw new Error('새 기능 동기화에는 Apps Script API v7 배포가 필요합니다. 로컬 저장은 유지됩니다.');throw e;}},
  async syncPreferences(url,choice){
   const server=await this.api4(url,{mode:'settings_get'});if(server.type!=='settings'||!Number.isInteger(server.revision))throw new Error('설정 응답이 올바르지 않습니다.');
   const remote=this.normalizedPrefs(server.data),local=this.snapshot(),state=this.prefState(url);
   if(same(local,remote)){this.savePrefState(url,{revision:server.revision,base:local});this.conflict=null;this.settingsMessage='설정이 두 기기에서 동일해요.';return;}
   const changedRemote=server.revision>0&&(state.base===null||!same(remote,state.base));
   if(changedRemote&&!choice){this.conflict={url,revision:server.revision,data:remote,updatedAt:server.updatedAt};this.settingsMessage=state.base&&same(local,state.base)?'다른 기기의 설정 업데이트가 있어요.':'기기별 설정이 달라요. 적용할 설정을 선택해 주세요.';return;}
   if(choice==='cloud'){
    // Guard against another device changing again while the comparison was open.
    if(this.conflict&&this.conflict.revision!==server.revision){this.conflict={url,revision:server.revision,data:remote,updatedAt:server.updatedAt};this.settingsMessage='확인 중 서버 설정이 바뀌었어요. 다시 비교해 주세요.';return;}
    await ExLog.save();const old=await Backup._collect();await window.storage.set('restore_backup',JSON.stringify({app:'fit-tracker',version:1,exported:_todayKey(),data:old}));
    const values=Object.fromEntries(PREF_KEYS.filter(k=>remote[k]!==null).map(k=>[k,remote[k]]));if(Object.keys(values).length)SafeBackup.validate(JSON.stringify({app:'fit-tracker',version:2,data:values}));this.applying=true;try{SafeStore.transaction(values,PREF_KEYS.filter(k=>remote[k]===null));this.savePrefState(url,{revision:server.revision,base:remote});}finally{this.applying=false;}
    DataSync.log('settings','settings',[],'시트 설정 불러오기 완료');location.reload();return;
   }
   if(choice==='local'&&this.conflict&&server.revision!==this.conflict.revision){this.conflict={url,revision:server.revision,data:remote,updatedAt:server.updatedAt};this.settingsMessage='다른 기기가 다시 수정했어요. 최신 내용을 확인해 주세요.';return;}
   const sent=clone(local),result=await this.api4(url,{mode:'settings_put',expectedRevision:server.revision,data:sent});
   if(result.conflict){this.conflict={url,revision:result.revision,data:this.normalizedPrefs(result.data),updatedAt:result.updatedAt};this.settingsMessage='전송 중 다른 기기가 수정했어요. 덮어쓰지 않고 보관했습니다.';return;}
   if(result.type!=='settings'||!Number.isInteger(result.revision)||!same(this.normalizedPrefs(result.data),sent))throw new Error('설정 저장 확인이 일치하지 않습니다.');
   this.savePrefState(url,{revision:result.revision,base:sent});DataSync.log('settings','settings',[],'시트에 설정 저장 완료');this.conflict=null;this.settingsMessage=same(sent,this.snapshot())?'루틴·기구 설정 동기화 완료':'추가 변경 사항 전송 대기';
  },

  async syncSettings(choice){
   if(this.syncing)return;const url=await ExLog.getScriptUrl();if(!url){ExLog.openSync();return;}
   this.syncing=true;this.settingsMessage='설정을 확인하고 있어요…';this.renderSettings();
   try{if(ExLog._syncP)await ExLog._syncP;await this.syncPreferences(url,choice);}catch(e){this.settingsMessage=e.message;}finally{this.syncing=false;this.renderSettings();ExLog.renderSyncStatus();}
  },
  renderSettings(){
   if(!this.ready)return;$('#settings-message').textContent=this.settingsMessage||'루틴 구성·세트·반복과 기구 설정을 같은 시트에 연결된 기기에서 공유합니다.';
   $('#settings-sync-btn').disabled=this.syncing;const box=$('#settings-conflict');box.hidden=!this.conflict;
   if(this.conflict){const local=this.snapshot(),remote=this.conflict.data;const summary=(k,v)=>{if(v===null)return '설정 없음';if(k==='routine_profile')return v==='legacy'?'기존 루틴':'새 루틴';try{const o=JSON.parse(v);if(k.startsWith('plan_v')){return Object.keys(o).filter(d=>Object.keys(o[d]?.config||{}).length||(o[d]?.add||[]).length||(o[d]?.rm||[]).length||Object.keys(o[d]?.swap||{}).length).length+'개 요일 편집';}return typeof o==='object'&&o?Object.keys(o).length+'개 항목':'설정 있음';}catch(_){return '설정 있음';}};
    $('#settings-diff').innerHTML=PREF_KEYS.filter(k=>local[k]!==remote[k]).map(k=>'<div class="af-pref-diff"><b>'+PREF_LABELS[k]+'</b><span>이 기기: '+esc(summary(k,local[k]))+' · 시트: '+esc(summary(k,remote[k]))+'</span><details><summary>값 비교</summary><div class="af-pref-values"><b>이 기기</b><pre>'+esc(local[k]===null?'없음':this.pretty(local[k]))+'</pre><b>시트</b><pre>'+esc(remote[k]===null?'없음':this.pretty(remote[k]))+'</pre></div></details></div>').join('');
   }
   $('#settings-local').disabled=$('#settings-cloud').disabled=this.syncing;
  },
  pretty(s){try{return JSON.stringify(JSON.parse(s),null,2);}catch(_){return s;}},
  async renderSyncStatus(){
   const el=$('#sync-status');if(!el)return;const url=await ExLog.getScriptUrl(),ib=read('inbody_dirty',{}),w=read('daily_weight_dirty',{}),state=this.prefState(url),prefs=url&&(!state.base||!same(this.snapshot(),state.base));
   const pending=new Set([...ExLog._dirty,...ExLog._delQ.map(x=>x.date)]);const n=pending.size+Object.keys(ib).length+Object.keys(w).length+Object.keys(read('session_dirty_v1',{})).length+(prefs?1:0);
   el.dataset.state=SafeStore.error||ExLog.syncMessage?'error':n||this.conflict||DataSync.conflicts.length?'pending':'ok';el.textContent=SafeStore.error||ExLog.syncMessage||(DataSync.conflicts.length?'기록 차이 '+DataSync.conflicts.length+'건 · 관리 탭에서 확인':'')||(ExLog._syncP?'전송 중 · 로컬 저장됨':this.conflict?'기록 전송됨 · 설정 선택 필요 (관리 탭)':url?n?'로컬 저장됨 · 전송 대기 '+n+'건':'Google Sheets 연결 · 전송 대기 없음':'이 기기에 저장 중 · Google Sheets 연결 설정');
  },
  mount(){
   const bar=document.createElement('section');bar.className='af-tools';bar.innerHTML='<div class="af-tool-row"><button id="focus-toggle" type="button" onclick="AppFeatures.toggleFocus()"></button><button type="button" onclick="AppFeatures.openEditor()">루틴 편집</button></div><div id="af-focus-nav"><button id="focus-prev" type="button" aria-label="이전 운동" onclick="AppFeatures.moveFocus(-1)">‹</button><select id="focus-exercise" aria-label="집중할 운동"></select><button id="focus-next" type="button" aria-label="다음 운동" onclick="AppFeatures.moveFocus(1)">›</button></div><div id="af-status" class="af-muted" role="status"></div>';
   $('#log-progress').insertAdjacentElement('afterend',bar);
   const weight=document.createElement('section');weight.className='af-card';weight.id='daily-weight';weight.innerHTML='<div class="af-card-title">일일 체중</div><div id="weight-summary"></div><form id="weight-form" class="af-weight-form"><label>측정일<input id="weight-date" type="date" required value="'+_todayKey()+'" max="'+_todayKey()+'"></label><label>체중 (kg)<input id="weight-value" type="number" inputmode="decimal" step="0.1" min="20" max="300" placeholder="84.0" required></label><button type="submit">저장</button></form><p id="weight-message" role="status"></p><p>가능하면 기상 후 같은 조건에서 측정하세요. 입력한 날만 평균에 포함하며, 인바디 기록은 별도로 보관해요.</p><details><summary>최근 14개 기록 · 수정/삭제</summary><div id="weight-history"></div></details>';
   $('.tab-b .plan-wrap').prepend(weight);
   const weekly=document.createElement('section');weekly.id='weekly-plan';weekly.className='af-card';$('.tab-p .plan-wrap').prepend(weekly);
   const settings=document.createElement('section');settings.className='af-card';settings.innerHTML='<details><summary>기기 간 설정 동기화</summary><p id="settings-message" role="status"></p><button id="settings-sync-btn" type="button" onclick="AppFeatures.syncSettings()">설정 동기화</button><div id="settings-conflict" hidden><div id="settings-diff"></div><p>선택한 설정 전체를 적용해요. 시트 설정을 불러오기 전 현재 앱의 백업을 보관합니다.</p><div class="af-tool-row"><button id="settings-local" type="button" onclick="AppFeatures.syncSettings(\'local\')">이 기기 설정 사용</button><button id="settings-cloud" type="button" onclick="AppFeatures.syncSettings(\'cloud\')">시트 설정 불러오기</button></div></div></details>';
   weight.insertAdjacentElement('afterend',settings);
   const dialog=document.createElement('dialog');dialog.id='routine-editor';dialog.className='af-dialog';dialog.setAttribute('aria-labelledby','edit-title');dialog.innerHTML='<form id="routine-edit-form"><div class="af-dialog-head"><b id="edit-title">루틴 편집</b><button type="button" aria-label="닫기" onclick="document.getElementById(\'routine-editor\').close()">✕</button></div><label>운동일 <select id="edit-day">'+TRAINING_PLAN.cycle.map(d=>'<option>'+d+'</option>').join('')+'</select></label><p>요일별 운동 순서를 유지해요. 운동별 세트와 반복 목표를 조절하세요.</p><p id="edit-hint"></p><div id="edit-rows"></div><p id="edit-error" role="alert"></p><div class="af-dialog-actions"><button type="button" onclick="document.getElementById(\'routine-editor\').close()">취소</button><button type="submit" class="af-primary">저장하고 적용</button></div></form>';
   document.body.appendChild(dialog);
   $('#routine-edit-form').addEventListener('submit',e=>this.saveEditor(e));$('#edit-day').addEventListener('change',e=>this.openEditor(e.target.value));$('#weight-form').addEventListener('submit',e=>this.saveWeight(e));
   $('#weight-history').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-weight]'),del=e.target.closest('[data-delete-weight]');if(edit){const r=this.weights[edit.dataset.editWeight];$('#weight-date').value=r.date;$('#weight-value').value=r.wt;$('#weight-value').focus();}if(del)this.removeWeight(del.dataset.deleteWeight);});
   $('#focus-exercise').addEventListener('change',e=>{const day=this.activeDay();this.selected[day]=this.routine(day)[+e.target.value]?.name;this.renderFocus();});
   document.querySelectorAll('input[name="day"]').forEach(r=>r.addEventListener('change',()=>ExLog.switchDay(this.activeDay())));
   document.querySelectorAll('.day-sel label').forEach(r=>r.addEventListener('click',()=>setTimeout(()=>this.renderFocus(),0)));
   this.ready=true;this.weights={...this.weights,...read('daily_weight_dirty',{})};document.querySelectorAll('.day-panel').forEach(p=>this.sort(p));this.renderFocus();this.renderWeights();this.renderWeekly();this.renderSettings();
  }
 };
 // Integration points: do not replace the existing set editor, load calculation or log storage.
 const savePlan=ExLog.savePlan;ExLog.savePlan=function(){if(A.ready)document.querySelectorAll('.day-panel').forEach(p=>A.sort(p));return savePlan.call(this);};



 const renderLibrary=LibApp.render;LibApp.render=function(...args){renderLibrary.apply(this,args);A.decorateLibrary();};
 const buildLibrary=LibApp._build;LibApp._build=function(d){buildLibrary.call(this,d);A.decorateLibraryDetail(d);};

 // Local preference edits trigger a retry. Snapshot comparison protects changes made during a request.
 const set=window.storage.set.bind(window.storage);window.storage.set=async(k,v)=>{const out=await set(k,v);if(PREF_KEYS.includes(k)&&A.ready&&!A.applying){A.settingsMessage='설정 변경됨 · 전송 대기';A.renderSettings();ExLog._syncSoon();ExLog.renderSyncStatus();}return out;};
 Backup.KEYS.push('daily_weight_v1','daily_weight_dirty','focus_mode');
 // Sync revision metadata is deliberately device-local and excluded from portable backups.
})();
