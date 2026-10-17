/* Session-scoped routines, guarded undo, durable input drafts and equipment settings. */
(function(){
 'use strict';
 const $=s=>document.querySelector(s),copy=x=>JSON.parse(JSON.stringify(x)),json=JSON.stringify;
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch(_){return f;}};
 const write=(k,v)=>window.storage.set(k,json(v)).catch(e=>SafeStore.report(e));
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stable=x=>json(Array.isArray(x)?x.map(v=>JSON.parse(stable(v))):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(stable(x[k]))])):x);
 const fields={seat:'좌석',backrest:'등받이',grip:'그립·손잡이',pulley:'케이블 높이',stance:'발 위치',note:'추가 메모'};
 const T=window.WorkoutTools={ready:false,restoring:false,undo:read('workout_undo_v1',[]),drafts:read('workout_drafts_v1',{}),equipment:read('ex_equipment_v1',{}),
  meta(s){return {snapshots:s.routineSnapshots||{},overrides:s.dayOverrides||{},context:{cond:s.cond||{},note:s.note||''}};},
  touch(date){const q=read('session_dirty_v1',{});q[date]=true;DataSync.noteLocal('session',date);write('session_dirty_v1',q);ExLog.markDirty(date);ExLog.save().catch(e=>SafeStore.report(e));ExLog._syncSoon();},
  capture(day=AppFeatures.activeDay()){
   if(!RecordModel.activeDate(ExLog.date))return null;
   const s=ExLog.session();s.routineSnapshots||={};
   if(!s.routineSnapshots[day]){
    s.routineSnapshots[day]={day,capturedAt:new Date().toISOString(),source:ExLog.date===_todayKey()?'recorded':'reconstructed',rows:copy(AppFeatures.routine(day))};
    ExLog.data[ExLog.date]=s;this.touch(ExLog.date);
   }
   const snap=s.routineSnapshots[day];
   if(snap.rows.length && !snap.rows.some(r=>RecordModel.activeName(r.name))){
    // Keep the old rows intact for reference; append the new gym plan once.
    snap.rows.push(...copy(this.template(day)));this.touch(ExLog.date);
   }
   return snap;
  },
  syncPanels(){
   if(!this.ready)return;
   if(this.renderedDate&&this.renderedDate!==ExLog.date){document.querySelectorAll('.day-panel .ex-log').forEach(log=>{this.saveDraft(log,this.renderedDate);const inp=log.querySelector('.ex-log-input');if(inp&&inp.style.display!=='none')cancel.call(ExLog,inp.querySelector('.wl-cancel-btn'));});}
   this.renderedDate=ExLog.date;
   document.querySelectorAll('.day-panel').forEach(panel=>{
    const day=ExLog.panelDayOf(panel),rows=AppFeatures.routine(day),list=panel.querySelector('.ex-list');if(!list)return;
    const map=new Map([...list.querySelectorAll('.ex-wrap')].map(w=>[w.querySelector('.ex-nm')?.textContent.trim(),w]));
    const wanted=new Set(rows.map(r=>r.name));map.forEach((w,n)=>{if(!wanted.has(n))w.remove();});
    rows.forEach(r=>{let w=map.get(r.name);if(!w){w=ExLog.buildCardEl(r.name);list.appendChild(w);}w.style.display='';w.dataset.original=r.original;w.dataset.cname=r.name;});
    AppFeatures.sort(panel);
   });
   augmentCards();this.decorateEquipment();
  },
  chooseSwap(btn,name){
   const wrap=btn.closest('.ex-wrap'),panel=btn.closest('.day-panel');if(!wrap||!panel)return;
   const day=ExLog.panelDayOf(panel),old=wrap.querySelector('.ex-nm').textContent.trim(),row=AppFeatures.routine(day).find(r=>r.name===old);
   if(!row||old===name)return;
   this.swap={date:ExLog.date,day,old,name,original:row.original};
   $('#swap-title').textContent=old+' → '+name;
   $('#swap-date').textContent=ExLog.date+'에만 교체할지, 앞으로 쓸 루틴도 바꿀지 선택하세요. 기록은 실제 운동명별로 보관합니다.';
   $('#swap-error').textContent='';$('#swap-scope').showModal();
  },
  async applySwap(scope){
   const c=this.swap;if(!c||c.date!==ExLog.date){$('#swap-scope').close();return;}
   if(AppFeatures.routine(c.day).some(r=>r.name===c.name&&r.original!==c.original)){$('#swap-error').textContent='이미 이 날짜의 루틴에 있는 운동입니다.';return;}
   const snap=this.capture(c.day),s=ExLog.session();s.dayOverrides||={};s.dayOverrides[c.day]||={};s.dayOverrides[c.day][c.original]=c.name;
   snap.rows=snap.rows.map(r=>r.original===c.original?{...r,name:c.name,...AppFeatures.priority(c.name)}:r).sort((a,b)=>a.index-b.index);
   this.touch(c.date);
   if(scope==='permanent'){const p=ExLog.planFor(c.day);(p.swap||={})[c.original]=c.name;await ExLog.savePlan();}
   AppFeatures.selected[c.day]=c.name;$('#swap-scope').close();ExLog.refresh();ExLog.injectTargets();this.remember();
   AppFeatures.announce(scope==='permanent'?'이 날짜와 앞으로의 루틴을 변경했어요.':'이 날짜에만 교체했어요.');
  },
  async resetSwap(){
   const c=this.swap;if(!c||c.date!==ExLog.date)return;
   const s=ExLog.session(),snap=s.routineSnapshots?.[c.day];if(!snap)return;
   const template=this.template(c.day,c.date).find(r=>r.original===c.original);if(!template)return;
   if(snap.rows.some(r=>r.original!==c.original&&r.name===template.name)){$('#swap-error').textContent='기본 운동이 이미 목록에 있어 복원할 수 없어요.';return;}
   snap.rows=snap.rows.map(r=>r.original===c.original?copy(template):r).sort((a,b)=>a.index-b.index);
   delete s.dayOverrides?.[c.day]?.[c.original];this.touch(c.date);$('#swap-scope').close();ExLog.refresh();ExLog.injectTargets();
  },
  sets(date,name){return ExLog.data[date]?.exercises?.find(e=>e.name===name)?.sets||[];},
  recordUndo(date,name,before,label){
   const after=copy(this.sets(date,name));if(stable(before)===stable(after))return;
   this.undo.push({date,name,before,after,label});this.undo=this.undo.slice(-20);write('workout_undo_v1',this.undo);this.renderUndo();
  },
  undoLast(){
   const u=this.undo[this.undo.length-1];if(!u||!RecordModel.activeRecord(u.date,u.name))return;
   if(stable(this.sets(u.date,u.name))!==stable(u.after)){AppFeatures.announce('이 운동 기록이 이후에 변경되어 되돌리지 않았어요. 기록을 확인해 주세요.');return;}
   const s=ExLog.data[u.date]||{day:ExLog.dayType(u.date),exercises:[]};let e=s.exercises.find(x=>x.name===u.name);
   if(!e){e={name:u.name,sets:[]};s.exercises.push(e);}e.sets=copy(u.before);ExLog.data[u.date]=s;
   ExLog.markDirty(u.date);ExLog._dirty.add(u.date);DataSync.noteLocal('workout',u.date);ExLog._saveDirty();ExLog.save().catch(e=>SafeStore.report(e));
   this.undo.pop();write('workout_undo_v1',this.undo);ExLog.stopRest();ExLog.refresh();ExLog._syncSoon();this.renderUndo();AppFeatures.announce(u.name+' · '+u.label+'을 되돌렸어요.');
  },
  renderUndo(){const b=$('#undo-set');if(!b)return;const u=this.undo[this.undo.length-1];const usable=u&&RecordModel.activeRecord(u.date,u.name);b.disabled=!usable;b.textContent=usable?'↶ '+u.label+' 되돌리기':'↶ 되돌릴 기록 없음';b.title=u?u.date+' · '+u.name:'';},
  draftKey(log,date=ExLog.date){return json([date,ExLog.panelDayOf(log.closest('.day-panel')),log.dataset.exname]);},
  saveDraft(log,date=ExLog.date){
   if(!this.ready||this.restoring||!log||!RecordModel.activeRecord(date,log.dataset.exname))return;const inp=log.querySelector('.ex-log-input');if(!inp||inp.style.display==='none')return;
   const i=log.dataset.editIdx,st=i!==''&&i!=null?this.sets(date,log.dataset.exname)[+i]:null,previous=this.drafts[this.draftKey(log,date)];
   this.drafts[this.draftKey(log,date)]={kg:inp.querySelector('.wl-kg-input').value,reps:inp.querySelector('.wl-rp-input').value,rpe:inp.querySelector('.wl-rpe-sel')?.value||'',warmup:!!inp.querySelector('.wl-wu-btn.on'),pain:!!inp.querySelector('.wl-pain-btn.on'),editId:previous?.editId||(st?st._id:null),baseline:previous?.baseline||(st?stable(st):null),updatedAt:Date.now()};
   const keys=Object.keys(this.drafts).sort((a,b)=>this.drafts[b].updatedAt-this.drafts[a].updatedAt);keys.slice(40).forEach(k=>delete this.drafts[k]);write('workout_drafts_v1',this.drafts);this.remember();
  },
  clearDraft(log){if(!log)return;delete this.drafts[this.draftKey(log)];write('workout_drafts_v1',this.drafts);},
  restoreDrafts(){
   this.restoring=true;
   document.querySelectorAll('.day-panel .ex-log').forEach(log=>{
    const d=this.drafts[this.draftKey(log)];if(!d||!RecordModel.activeRecord(ExLog.date,log.dataset.exname))return;
    const inp=log.querySelector('.ex-log-input');if(inp.style.display!=='none')return;
    const sets=this.sets(ExLog.date,log.dataset.exname),i=d.editId?sets.findIndex(s=>s._id===d.editId):-1;
    if(d.editId&&(i<0||stable(sets[i])!==d.baseline)){AppFeatures.announce('임시 수정 중 원본 세트가 변경됐어요. 현재 기록을 확인하고 다시 수정하세요.');return;}
    if(i>=0){const chip=log.querySelector('.ex-log-chips [data-i="'+i+'"]');if(chip)ExLog.editSet(chip);else ExLog.startSet(log.querySelector('.ex-log-add-btn'));}
    else ExLog.startSet(log.querySelector('.ex-log-add-btn'));
    log.dataset.editIdx=i>=0?String(i):'';inp.querySelector('.wl-del-btn').style.display=i>=0?'':'none';
    inp.querySelector('.wl-kg-input').value=d.kg;inp.querySelector('.wl-rp-input').value=d.reps;inp.querySelector('.wl-rpe-sel').value=d.rpe;
    inp.querySelector('.wl-wu-btn')?.classList.toggle('on',d.warmup);inp.querySelector('.wl-pain-btn')?.classList.toggle('on',d.pain);ExLog._updateTotalHint(inp.querySelector('.wl-kg-input'));
   });this.restoring=false;
  },
  remember(){if(!this.ready||this.restoring)return;write('workout_resume_v1',{date:ExLog.date,day:AppFeatures.activeDay(),selected:AppFeatures.selected,rest:ExLog.rest.name?{name:ExLog.rest.name,endAt:ExLog.rest.endAt,total:ExLog.rest.total}:null});},
  editStillCurrent(log){const i=log.dataset.editIdx;if(i===''||i==null)return true;const d=this.drafts[this.draftKey(log)],st=this.sets(ExLog.date,log.dataset.exname)[+i];if(d?.editId&&(!st||st._id!==d.editId||stable(st)!==d.baseline)){AppFeatures.announce('수정 중 원본 세트가 변경됐어요. 입력은 보관했으니 현재 기록을 확인하고 취소 후 다시 수정하세요.');return false;}return true;},
  validInput(log){
   const inp=log.querySelector('.ex-log-input'),raw=inp.querySelector('.wl-kg-input').value,rraw=inp.querySelector('.wl-rp-input').value,w=raw===''?0:Number(raw),r=Number(rraw);
   if(!Number.isFinite(w)||w<0||w>100000||!rraw||!Number.isInteger(r)||r<=0||r>100000){AppFeatures.announce('중량은 0 이상, 반복·시간·거리는 1 이상의 정수로 입력하세요.');return false;}
   const name=log.dataset.exname,type=ExLog.loadTypeOf(name),total=w+ExLog.baseOf(name),wu=!!inp.querySelector('.wl-wu-btn.on');
   const prior=Object.entries(ExLog.activeData).filter(([d])=>d<=ExLog.date).sort((a,b)=>b[0].localeCompare(a[0])).flatMap(([,s])=>(s.exercises||[]).filter(e=>e.name===name).flatMap(e=>e.sets.filter(_isWorkSet))).slice(0,9);
   const median=key=>{const a=prior.map(s=>s[key]).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0;};const pw=median('weight'),pr=median('reps'),issues=[];
   if(total>500)issues.push('총 중량 '+total+'kg');
   if(r>(type==='time'||type==='distance'?3600:100))issues.push(r+(type==='time'?'초':type==='distance'?'m':'회'));
   if(!wu&&type==='normal'&&pw&&total>=pw*2&&total-pw>=20)issues.push('최근 중량 중앙값 '+pw+'kg → '+total+'kg');
   if(!wu&&pr&&r>=pr*3&&r-pr>=10)issues.push('최근 반복 중앙값 '+pr+' → '+r);
   return !issues.length||confirm('입력값을 한 번 확인해 주세요.\n'+issues.join('\n')+'\n의도한 값이면 확인을 눌러 그대로 저장하세요.');
  },
  decorateEquipment(){document.querySelectorAll('.day-panel .ex-log').forEach(log=>{let b=log.parentNode.querySelector('.equipment-button');if(!b){b=document.createElement('button');b.type='button';b.className='equipment-button';b.addEventListener('click',()=>this.openEquipment(log.dataset.exname));log.before(b);}const v=this.equipment[log.dataset.exname]||{};b.textContent='⚙ 기구 세팅'+(Object.values(v).some(Boolean)?' · '+Object.entries(v).filter(([,s])=>s).map(([k,s])=>fields[k]+' '+s).join(' / '):' 저장');});},
  openEquipment(name){this.equipmentName=name;$('#equipment-title').textContent=name+' · 기구 세팅';const form=$('#equipment-form'),value=this.equipment[name]||{};Object.keys(fields).forEach(k=>form.elements[k].value=value[k]||'');$('#equipment-old').textContent=ExLog.memo[name]?'기존 메모: '+ExLog.memo[name]:'';$('#equipment-dialog').showModal();},
  async saveEquipment(e){e.preventDefault();const form=e.target,v={};Object.keys(fields).forEach(k=>v[k]=form.elements[k].value.trim());this.equipment[this.equipmentName]=v;await window.storage.set('ex_equipment_v1',json(this.equipment));this.decorateEquipment();$('#equipment-dialog').close();AppFeatures.announce('기구별 세팅을 저장했어요.');},
  mount(){
   const box=document.createElement('div');box.innerHTML='<dialog id="swap-scope" class="af-dialog"><h3 id="swap-title"></h3><p id="swap-date"></p><p id="swap-error" role="alert"></p><div class="af-tool-row"><button data-scope="today">이 날짜만</button><button data-scope="permanent">앞으로도 적용</button><button id="swap-reset">기본 루틴으로 복원</button><button onclick="document.getElementById(\'swap-scope\').close()">취소</button></div></dialog><dialog id="equipment-dialog" class="af-dialog"><form id="equipment-form"><h3 id="equipment-title"></h3><p>기구에 적힌 번호·각도·손잡이 종류를 기록하세요.</p><div class="af-fields">'+Object.entries(fields).map(([k,l])=>'<label>'+l+'<input name="'+k+'" maxlength="'+(k==='note'?240:80)+'"></label>').join('')+'</div><p id="equipment-old"></p><div class="af-tool-row"><button type="submit">저장</button><button type="button" onclick="document.getElementById(\'equipment-dialog\').close()">취소</button></div></form></dialog>';
   document.body.appendChild(box);$('#swap-scope').querySelectorAll('[data-scope]').forEach(b=>b.addEventListener('click',()=>this.applySwap(b.dataset.scope)));$('#swap-reset').addEventListener('click',()=>this.resetSwap());$('#equipment-form').addEventListener('submit',e=>this.saveEquipment(e));
   const b=document.createElement('button');b.id='undo-set';b.type='button';b.addEventListener('click',()=>this.undoLast());$('#af-status').before(b);
   const guide=document.createElement('details');guide.className='af-card';guide.id='exercise-guide';guide.innerHTML='<summary>운동 설명 읽는 법 · 공통 호흡·기록 기준</summary><p>'+esc(EXERCISE_GUIDE.general)+'</p><p>'+esc(EXERCISE_GUIDE.breath)+'</p><p>'+esc(EXERCISE_GUIDE.record)+'</p><p>핵심 요령 3개를 먼저 확인하고, 각 운동의 상세 가이드에서 몸의 위치와 실수 교정법을 읽어 보세요.</p><details><summary>검토 근거</summary>'+Object.entries(EXERCISE_GUIDE.sources).map(([label,url])=>'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a></p>').join('')+'</details>';document.getElementById('lib-list').before(guide);
   this.ready=true;this.restoring=true;const last=read('workout_resume_v1',null);
   if(last&&/^\d{4}-\d{2}-\d{2}$/.test(last.date)&&last.date===_todayKey()&&TRAINING_PLAN.cycle.includes(last.day)){ExLog.date=last.date;ExLog.updateBar();ExLog.syncPanel(last.day);AppFeatures.selected=last.selected||{};AppFeatures.focusDate=last.day+'|'+last.date;}
   this.offeredResume=last&&RecordModel.activeDate(last.date)&&last.date<_todayKey()&&Object.keys(this.drafts).some(k=>{try{return JSON.parse(k)[0]===last.date;}catch(_){return false;}})?last:null;
   ExLog.refresh();ExLog.injectTargets();this.restoring=false;this.restoreDrafts();
   if(last?.rest&&RecordModel.activeRecord(last.date,last.rest.name)&&typeof last.rest.name==='string'&&Number.isFinite(last.rest.total)&&last.rest.total>0&&last.date===_todayKey()&&last.rest.endAt>Date.now()&&last.rest.endAt<Date.now()+86400000){ExLog.rest={...last.rest,int:setInterval(()=>ExLog.tickRest(),500),hint:'',notified:false};ExLog.tickRest();}
   this.renderUndo();
   document.addEventListener('input',e=>this.saveDraft(e.target.closest('.ex-log')));document.addEventListener('change',e=>this.saveDraft(e.target.closest('.ex-log')));
   document.addEventListener('click',e=>{if(e.target.closest('.wl-wu-btn,.wl-pain-btn,.wl-rep-chip'))this.saveDraft(e.target.closest('.ex-log'));if(e.target.closest('.day-sel,#focus-exercise,#focus-prev,#focus-next'))this.remember();});
   document.addEventListener('visibilitychange',()=>{if(document.hidden){document.querySelectorAll('.ex-log').forEach(log=>this.saveDraft(log));this.remember();}});this.remember();
  }
 };
 // Templates remain editable while a started session keeps its own ordered target rows.
 T.template=AppFeatures.templateRoutine.bind(AppFeatures);
 ExLog.swapEx=(btn,name)=>T.chooseSwap(btn,name);ExLog.switchBrand=(btn,name)=>T.chooseSwap(btn,name);
 const cancel=ExLog.cancelSet;ExLog.cancelSet=function(el){T.clearDraft(el.closest('.ex-log'));return cancel.call(this,el);};
 for(const [method,label] of [['confirmSet','세트 입력·수정'],['deleteSet','세트 삭제'],['togglePainSet','통증 표시']]){const original=ExLog[method];ExLog[method]=function(el,...args){const log=el.closest('.ex-log'),date=this.date,name=log?.dataset.exname;if(!log||!RecordModel.activeRecord(date,name)||!T.editStillCurrent(log))return;if(method==='confirmSet'&&!T.validInput(log))return;const before=copy(T.sets(date,name));if(method==='confirmSet')T.capture(ExLog.panelDayOf(log.closest('.day-panel')));const result=original.call(this,el,...args);T.recordUndo(date,name,before,label);if(method==='togglePainSet'&&stable(before)!==stable(T.sets(date,name))){T.clearDraft(log);T.saveDraft(log);}return result;};}
 for(const method of ['startSet','editSet']){const original=ExLog[method];ExLog[method]=function(el,...args){if(!RecordModel.activeRecord(this.date,el.closest('.ex-log')?.dataset.exname))return;if(!T.restoring)T.clearDraft(el.closest('.ex-log'));const r=original.call(this,el,...args);T.saveDraft(el.closest('.ex-log'));if(window.InterfaceTools?.ready)InterfaceTools.refresh();if(!T.restoring)el.closest('.ex-log')?.querySelector(method==='startSet'?'.wl-kg-input':'.wl-rp-input')?.focus();return r;};}
 for(const method of ['startRest','stopRest','addRest']){const original=ExLog[method];ExLog[method]=function(...args){const r=original.apply(this,args);T.remember();return r;};}
 const focus=AppFeatures.renderFocus;AppFeatures.renderFocus=function(){const r=focus.call(this);T.remember();return r;};
 ExLog.addEx=(name,el)=>InterfaceTools.chooseAdd(name,el);
 ExLog.removeEx=btn=>InterfaceTools.chooseRemove(btn);
 Backup.KEYS.push('ex_equipment_v1','session_dirty_v1');
})();
