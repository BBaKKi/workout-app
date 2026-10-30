/* Action-first coaching. Short cues stay visible; detailed explanation is optional. */
(function(){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.ExerciseCoaching={
  get(e){return e?.coaching?{...e.coaching,variant:e.coaching.variant||[]}:null;},
  html(e){
   const g=this.get(e);if(!g)return '';
   const row=(label,value)=>value?'<section class="coach-section"><h4>'+esc(label)+'</h4><p>'+esc(value)+'</p></section>':'';
   const group=(number,title,subtitle,body,open=false)=>'<details class="coach-group"'+(open?' open':'')+'><summary><span class="coach-index">'+number+'</span><span><b>'+title+'</b><small>'+subtitle+'</small></span></summary><div class="coach-group-body">'+body+'</div></details>';
   const breath=e.breath||'힘을 보내며 내쉬고 되돌아오며 들이쉽니다. 다음 반복 전에 몸통 지지와 그립을 다시 잡습니다.';
   const fields=[['setup','높이·몸 위치'],['grip','그립'],['brace','유지할 자세'],['drive','이동 경로'],['feel','힘·자극 방향'],['watch','자세 교정']];
   const notice=e.executionNotice?'<aside class="coach-notice" aria-label="기구 확인 주의"><b>'+esc(e.executionNotice.title)+'</b><p>'+esc(e.executionNotice.text)+'</p></aside>':'';
   const action=e.execution?'<section class="coach-action" aria-label="수행 핵심"><h4>이렇게 수행하세요</h4><dl>'+fields.map(([key,label])=>'<div class="coach-action-row coach-action-'+key+'" data-cue="'+key+'"><dt>'+label+'</dt><dd>'+esc(e.execution[key])+'</dd></div>').join('')+'</dl></section>':'';
   const corrections=g.corrections?.length?'<section class="coach-section"><h4>자세가 흐트러지면</h4><dl class="coach-corrections">'+g.corrections.map(c=>'<div><dt>'+esc(c.sign)+'</dt><dd>'+esc(c.fix)+'</dd></div>').join('')+'</dl></section>':row('자세가 흐트러지면',g.errors);
   return notice+action+'<details class="exercise-guide"><summary><span class="guide-title">반복 순서·자세 교정</span><span class="guide-subtitle">복귀 동작 · 범위 · 조정법</span></summary><div class="coach-body">'+
    group('01','한 번의 반복','움직임 순서 · 범위 · 호흡','<section class="coach-section coach-steps"><h4>수행 순서</h4><ol>'+g.steps.map((s,i)=>'<li><b class="coach-step-label">'+['시작 자세','힘을 쓰는 구간','돌아오는 구간'][i]+'</b>'+esc(s)+'</li>').join('')+'</ol></section>'+row('가동범위',e.rom)+row('호흡·속도',breath),true)+
    group('02','자세가 흐트러지면','눈으로 확인 · 세팅과 중량 조정',corrections+g.variant.map(v=>row('기구 형태에 따른 조정',v)).join(''))+'</div></details>';
  }
 };
})();
