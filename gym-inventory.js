/* One catalog: equipment confirmed at All Day, with immutable record names. */
(function(){
 'use strict';
 const available=window.EXERCISE_LIBRARY;
 const accessories=available.filter(e=>e.source.type==='reported'||['barbell-rdl','barbell-squat'].includes(e.id));
 const confirmed=available.filter(e=>!accessories.includes(e));
 const labels={confirmed:'사진 확인',reported:'보유 확인 · 사용자'};
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.GymInventory={entries:available,available,confirmed,accessories,stations:window.ALLDAY_STATIONS,labels,catalog:'allday-gamil',
  library(){return available;},
  find(name){return available.find(e=>e.name===name);},
  badge(e){return '<span class="gym-status '+e.status+'">'+labels[e.status]+'</span>';},
  sourceHTML(e){return '<div class="lib-r gym-source"><span class="lib-l">확인 근거</span><span>'+esc(e.source.title)+' · '+esc(e.source.date)+(e.source.file?'<br>'+esc(e.source.file):'')+'</span></div>';},
  select(){InterfaceTools.filter='all';InterfaceTools.equipment='all';LibApp.q='';LibApp.cat='all';document.querySelector('.lib-search').value='';document.querySelectorAll('.lib-chip').forEach(b=>b.classList.toggle('on',b.dataset.c==='all'));this.refresh();LibApp.render();},
  open(){document.querySelector('.lbl-l').click();this.select();document.querySelector('.lib-search').focus();},
  refresh(){const scope=document.querySelector('#library-scope');if(!scope)return;scope.value=InterfaceTools.filter;const select=document.querySelector('#library-equipment');select.replaceChildren(new Option('전체','all'),...[...new Set(available.map(e=>e.brand))].map(n=>new Option(n,n)));select.value=InterfaceTools.equipment;},
  mount(){
   const info=document.createElement('details');info.id='gym-photo-info';info.className='gym-draft-info';info.innerHTML='<summary>올데이 · 운동 '+available.length+'개 <span>기구 안내</span></summary><p>현장 사진 45장과 보유 확인한 덤벨·T바 로우·케이블을 반영했어요. 기구 44종과 랙을 바탕으로 내전·외전 및 보조 운동을 나누었어요.</p><p>사진에서 확인되지 않은 브랜드·손잡이·조절 장치는 현장 안내를 확인하세요. 새 기구의 중량은 가벼운 준비 세트부터 정하고 좌석·그립·원판 입력 기준을 저장하세요.</p>';
   document.querySelector('.library-filter-panel').after(info);this.refresh();
  }
 };
})();
