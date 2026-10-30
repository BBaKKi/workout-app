/* Read-only presentation of retired sessions. Raw storage is never migrated or deleted. */
(function(){
 'use strict';
 const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const H=window.ReferenceHistory={ready:false,limit:12,
  rows(){
   return Object.entries(ExLog.data).map(([date,s])=>{
    const retired=!RecordModel.activeDate(date),exercises=(s.exercises||[]).filter(e=>retired||!RecordModel.activeName(e.name));
    const plans=Object.values(s.routineSnapshots||{}).flatMap(p=>(p.rows||[]).filter(r=>retired||!RecordModel.activeName(r.name)).map(r=>({...r,day:p.day})));
    return {date,session:s,exercises,plans,retired};
   }).filter(r=>r.retired||r.exercises.length||r.plans.length).sort((a,b)=>b.date.localeCompare(a.date));
  },
  sessionHTML(r){
   const s=r.session;
   return '<details class="reference-day"><summary><time>'+esc(r.date)+'</time><span>'+esc(s.day||'계획 미기록')+' · '+r.exercises.reduce((n,e)=>n+(e.sets||[]).length,0)+'세트</span><small>읽기 전용</small></summary><div class="reference-body">'+r.exercises.map(e=>'<section><h4>'+esc(e.name)+'</h4><ol>'+((e.sets||[]).map(st=>'<li>'+esc(RecordModel.formatSet(e.name,st))+(st.warmup?' · 준비 세트':'')+(st.rpe?' · RPE '+esc(st.rpe):'')+(st.pain?' · 통증 표시':'')+'</li>').join('')||'<li>저장된 세트 없음</li>')+'</ol></section>').join('')+
    (r.plans.length?'<details><summary>당시 저장된 계획</summary><ul>'+r.plans.map(p=>'<li>'+esc(p.day)+' · '+esc(p.name)+' · '+p.sets+'×'+p.min+'–'+p.max+(p.skipped?' · 건너뜀':'')+'</li>').join('')+'</ul></details>':'')+
    (r.retired?(s.cardio||[]).map(c=>'<p>유산소 · '+esc(c.type||'기록')+' '+esc(c.min)+'분</p>').join(''):'')+
    (s.note?'<p>메모 · '+esc(s.note)+'</p>':'')+(s.cond?.sleep?'<p>수면 · '+esc(s.cond.sleep)+'시간</p>':'')+'</div></details>';
  },
  render(){
   if(!this.ready)return;
   const q=$('#reference-search').value.trim().toLowerCase(),from=$('#reference-from').value,to=$('#reference-to').value;
   const rows=this.rows().filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)&&(!q||[r.date,r.session.day,r.session.note,...r.exercises.map(e=>e.name),...r.plans.map(p=>p.name)].join(' ').toLowerCase().includes(q)));
   $('#reference-count').textContent=rows.length+'일 · '+Math.min(this.limit,rows.length)+'일 표시';
   $('#reference-list').innerHTML=rows.slice(0,this.limit).map(r=>this.sessionHTML(r)).join('')||'<p class="reference-empty">조건에 맞는 이전 기록이 없어요.</p>';
   $('#reference-more').hidden=rows.length<=this.limit;
  },
  open(date){
   $('#reference-history').open=true;$('#reference-from').value=date||'';$('#reference-to').value=date||'';$('#reference-search').value='';this.limit=12;this.render();$('.lbl-b').click();$('#reference-history').scrollIntoView({block:'start',behavior:'smooth'});
  },
  refresh(){
   if(!this.ready)return;
   const archived=!RecordModel.activeDate(ExLog.date);document.body.classList.toggle('viewing-reference',archived);
   const box=$('#archived-date');box.hidden=!archived;
   if(archived){const r=this.rows().find(r=>r.date===ExLog.date);$('#archived-date-content').innerHTML=r?this.sessionHTML(r):'<p>이 날짜에 보관된 기록이 없어요.</p>';}
   if($('#reference-history').open)this.render();
   const rows=TRAINING_PLAN.cycle.map((day,i)=>{const plan=AppFeatures.templateRoutine(day,RecordModel.activeDate(ExLog.date)?ExLog.date:TRAINING_PLAN.equipmentDate);return '<button type="button" data-routine-day="'+i+'"><b>'+(i+1)+'/6 · '+day+'</b><span>'+esc(TRAINING_PLAN.focus[day])+'</span><small>'+plan.length+'종목 · '+plan.reduce((n,r)=>n+r.sets,0)+'세트</small></button>';});
   $('#routine-week-grid').innerHTML=rows.join('');
   const total=TRAINING_PLAN.cycle.reduce((n,d)=>n+AppFeatures.templateRoutine(d,TRAINING_PLAN.equipmentDate).reduce((m,r)=>m+r.sets,0),0);
   $('#routine-cycle-total').textContent='현재 기본 편성: 6세션 합계 '+total+'본세트 · 준비운동 미기록. 한 주에 모두 마칠 의무량은 아닙니다.';
  },
  mount(){
   const section=document.createElement('details');section.id='reference-history';section.className='af-card';section.innerHTML='<summary>이전 운동 기록 <small>읽기 전용</small></summary><p>이전 짐 운동과 '+TRAINING_PLAN.equipmentDate+' 이전 기록을 원래 이름과 수치로 보관해요. 올데이 중량 추천·신기록·주간 통계에는 포함하지 않아요.</p><div class="reference-filters"><label>운동·메모 검색<input id="reference-search" type="search" placeholder="운동명 또는 날짜"></label><label>시작일<input id="reference-from" type="date"></label><label>종료일<input id="reference-to" type="date"></label></div><p id="reference-count" aria-live="polite"></p><div id="reference-list"></div><button id="reference-more" type="button">12일 더 보기</button>';
   $('.tab-b .page-heading').after(section);section.addEventListener('toggle',()=>{if(section.open)this.render();});section.querySelectorAll('input').forEach(i=>i.addEventListener('input',()=>{this.limit=12;this.render();}));$('#reference-more').onclick=()=>{this.limit+=12;this.render();};
   const box=document.createElement('section');box.id='archived-date';box.className='af-card';box.hidden=true;box.innerHTML='<h2>이전 운동 기록 · 읽기 전용</h2><p>이 날짜는 참고용으로 보관되어 있어요.</p><div id="archived-date-content"></div><div class="af-tool-row"><button id="reference-today" type="button">오늘 운동으로</button><button id="reference-all" type="button">이전 기록 전체 보기</button></div>';$('#ex-log-bar').after(box);$('#reference-today').onclick=()=>{ExLog.date=_todayKey();ExLog.syncPanel(ExLog.dayType(ExLog.date));ExLog.updateBar();ExLog.refresh();ExLog.injectTargets();};$('#reference-all').onclick=()=>this.open();
   const overview=document.createElement('details');overview.id='routine-overview';overview.className='af-card';overview.innerHTML='<summary>운동 순서와 구성 <small>PPL A/B · 6세션</small></summary><p>Push A → Pull A → Legs A → Push B → Pull B → Legs B 순서입니다. 휴식일을 끼워 이어가세요. 다음 추천은 최근 본세트를 기록한 운동 기준이며, 필요한 탭을 직접 선택할 수 있어요.</p><div id="routine-week-grid"></div><p id="routine-cycle-total"></p><p><b>어깨 움직임·하체 볼륨</b><br>상체 날의 준비 안내에서 월슬라이드와 Y 레이즈를 확인하세요. 하체는 시티드 컬과 머신 위주로 편성해 종아리·그립이 먼저 지치는 부담을 분산합니다.</p><details><summary>유산소를 늘리는 기준</summary><p>상체 운동 후 20–25분씩 주 3회부터 시작합니다. 1–2주 동안 하체 반복 수와 피로가 유지되면 회당 5분씩 늘려 30분×3회로 조절하세요. 한 번에 시간·횟수·강도를 모두 올리지 않습니다.</p><p>빠르게 걷는 일상 활동을 포함해 중강도 주 150분에 점차 접근할 수 있습니다. 이 앱의 시간 기록만으로는 강도를 알 수 없으므로 150분 달성 판정을 하지 않습니다. 종아리가 먼저 지치면 낮은 경사 걷기나 가벼운 자전거를 선택하세요.</p><p>복부 중심 지방 분포만으로 내장지방량이나 필요한 운동을 확정하지 않습니다. 복부 운동으로 배의 지방만 선택해 줄일 수는 없으며, 허리둘레·체성분 추세와 하체 수행을 함께 봅니다.</p></details><p>날짜별로 저장한 계획과 직접 편집한 종목·세트 수는 유지합니다. 기록이 없는 날짜는 운동하지 않은 날로 단정하지 않습니다. 새 기구는 준비 세트로 중량을 정하고, 같은 기구·세팅의 본세트 기록으로 증량을 판단하세요.</p>';
   $('.routine-home').after(overview);overview.addEventListener('click',e=>{const b=e.target.closest('[data-routine-day]');if(!b)return;ExLog.switchDay(TRAINING_PLAN.cycle[+b.dataset.routineDay]);});
   this.ready=true;this.refresh();
  }
 };
 const mount=InterfaceTools.mount;InterfaceTools.mount=function(){const r=mount.call(this);H.mount();return r;};
 const refresh=ExLog.refresh;ExLog.refresh=function(...args){const r=refresh.apply(this,args);H.refresh();return r;};
 // Navigation may show old dates, but editors and history-dependent calculations stay current-gym only.
 for(const method of ['switchDay','saveCardio','delCardio','setCond','setSleep','setNote']){
  const original=ExLog[method];ExLog[method]=function(...args){if(!RecordModel.activeDate(this.date)){AppFeatures.announce('이전 기록은 읽기 전용이에요.');return;}return original.apply(this,args);};
 }
 for(const method of ['chooseSwap','applySwap','resetSwap']){
  const original=WorkoutTools[method];WorkoutTools[method]=function(...args){if(!RecordModel.activeDate(ExLog.date))return;if(method==='chooseSwap'&&!RecordModel.activeName(args[1]))return;return original.apply(this,args);};
 }
})();
