/* Render explicit, equipment-specific coaching from the All Day catalog. */
(function(){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.ExerciseCoaching={
  get(e){return e?.coaching?{...e.coaching,variant:e.coaching.variant||[]}:null;},
  html(e){
   const g=this.get(e);if(!g)return '';
   const row=(label,value)=>value?'<section class="coach-section"><h4>'+esc(label)+'</h4><p>'+esc(value)+'</p></section>':'';
   const group=(number,title,subtitle,body,open=false)=>'<details class="coach-group"'+(open?' open':'')+'><summary><span class="coach-index">'+number+'</span><span><b>'+title+'</b><small>'+subtitle+'</small></span></summary><div class="coach-group-body">'+body+'</div></details>';
   const breath=e.breath||'일반적인 반복에서는 힘을 쓰며 내쉬고 되돌아오며 들이쉽니다. 반동을 줄일 수 있는 속도로 움직이고, 무거운 복합운동은 반복 전 몸통을 다시 안정시키세요. 호흡을 오래 참거나 어지러운 상태로 계속하지 않습니다.';
   return '<div class="coach-quick"><span class="coach-eyebrow">지금 기억할 3가지</span><ul>'+g.cues.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul></div><details class="exercise-guide"><summary><span class="guide-title">자세·자극 가이드</span><span class="guide-subtitle">세팅부터 주의점까지</span></summary><div class="coach-body">'+
    group('01','시작 자세','기구 세팅 · 팔꿈치 · 손잡이',row('시작 전 기구 세팅',e.setup)+row('몸·팔꿈치·관절 위치',g.position)+row('손잡이·그립',e.grip),true)+
    group('02','한 번의 반복','움직임 순서 · 범위 · 호흡','<section class="coach-section coach-steps"><h4>수행 순서</h4><ol>'+g.steps.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol></section>'+row('가동범위',e.rom)+row('호흡·속도',breath),true)+
    group('03','자극과 근육의 역할','힘이 들어갈 곳 · 운동 요령',row('어디에, 어떻게 힘을 쓰나요?',g.feel)+row('운동 요령',e.tip)+g.variant.map(v=>row('이 변형에서 확인할 점',v)).join(''))+
    group('04','실수와 주의사항','자세 수정 · 중단 신호',row('흔한 실수와 수정',g.errors)+row('멈추고 확인할 신호',e.warn))+
    '<p class="coach-footnote coach-safety">날카로운 통증·저림·관절의 끼임이 생기면 중단하세요. 자극감만으로 효과를 판단하지 않고, 체형과 기구에 맞는 편안한 범위부터 확인합니다.</p></div></details>';
  }
 };
})();
