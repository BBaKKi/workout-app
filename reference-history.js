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
   const rows=TRAINING_PLAN.cycle.map((day,i)=>{const plan=AppFeatures.templateRoutine(day,RecordModel.activeDate(ExLog.date)?ExLog.date:TRAINING_PLAN.equipmentDate);return '<button type="button" data-routine-day="'+i+'"><b>'+['월','화','수','목','금','토'][i]+' · '+day+'</b><span>'+esc(TRAINING_PLAN.focus[day])+'</span><small>'+plan.length+'종목 · '+plan.reduce((n,r)=>n+r.sets,0)+'세트</small></button>';});
   $('#routine-week-grid').innerHTML=rows.join('');
  },
  mount(){
   const section=document.createElement('details');section.id='reference-history';section.className='af-card';section.innerHTML='<summary>이전 운동 기록 <small>읽기 전용</small></summary><p>이전 짐 운동과 '+TRAINING_PLAN.equipmentDate+' 이전 기록을 원래 이름과 수치로 보관해요. 올데이 중량 추천·신기록·주간 통계에는 포함하지 않아요.</p><div class="reference-filters"><label>운동·메모 검색<input id="reference-search" type="search" placeholder="운동명 또는 날짜"></label><label>시작일<input id="reference-from" type="date"></label><label>종료일<input id="reference-to" type="date"></label></div><p id="reference-count" aria-live="polite"></p><div id="reference-list"></div><button id="reference-more" type="button">12일 더 보기</button>';
   $('.tab-b .page-heading').after(section);section.addEventListener('toggle',()=>{if(section.open)this.render();});section.querySelectorAll('input').forEach(i=>i.addEventListener('input',()=>{this.limit=12;this.render();}));$('#reference-more').onclick=()=>{this.limit+=12;this.render();};
   const box=document.createElement('section');box.id='archived-date';box.className='af-card';box.hidden=true;box.innerHTML='<h2>이전 운동 기록 · 읽기 전용</h2><p>이 날짜는 참고용으로 보관되어 있어요.</p><div id="archived-date-content"></div><div class="af-tool-row"><button id="reference-today" type="button">오늘 운동으로</button><button id="reference-all" type="button">이전 기록 전체 보기</button></div>';$('#ex-log-bar').after(box);$('#reference-today').onclick=()=>{ExLog.date=_todayKey();ExLog.syncPanel(ExLog.dayType(ExLog.date));ExLog.updateBar();ExLog.refresh();ExLog.injectTargets();};$('#reference-all').onclick=()=>this.open();
   const overview=document.createElement('details');overview.id='routine-overview';overview.className='af-card';overview.innerHTML='<summary>한 주 운동 구성 <small>부위별 주 2회</small></summary><p>기본 주간 구성입니다. 첫 적응 주는 월·화·목·토 4회, 다음 주는 회복에 따라 늘립니다. 일요일은 휴식하고 쉬어 간 날의 세트를 몰아서 채우지 않아요.</p><div id="routine-week-grid"></div><p>본세트 기준 가슴 10 · 등 11 · 허벅지 앞 10 · 햄스트링 8 · 측면 어깨 6 · 후면 어깨 4 · 종아리 4 · 코어 4세트. 적응기에는 종목당 최대 2세트입니다. 복합운동의 보조근 자극은 별도이며 수치는 고정 의무량이 아닙니다.</p><p>같은 기구·세팅으로 모든 본세트가 반복 상한에 도달하고 1–3회 더 할 여유가 남으면 다음 운동에 가장 작은 중량 단계를 올리세요. 새 기구에서는 이전 짐 중량을 목표로 삼지 않습니다.</p>';
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
