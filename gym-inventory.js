/* One catalog: equipment confirmed at All Day, with immutable record names. */
(function(){
 'use strict';
 const available=window.EXERCISE_LIBRARY;
 const accessories=available.filter(e=>e.equipmentRole==='accessory');
 const machines=available.filter(e=>!accessories.includes(e));
 const confirmed=machines.filter(e=>e.status==='confirmed');
 const reported=machines.filter(e=>e.status==='reported');
 const labels={confirmed:'사진 확인',reported:'보유 확인 · 사용자'};
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const evidenceFiles=e=>e.source.files||(e.source.file?[e.source.file]:[]);
 const types={cable:'케이블',barbell:'바벨',smith:'스미스 머신',dumbbell:'덤벨',tbar:'T바',machine:'전용 머신'};
 window.GymInventory={entries:available,available,confirmed,reported,accessories,stations:window.ALLDAY_STATIONS,labels,types,catalog:'allday-gamil',
  evidenceFiles,
  library(){return available;},
  find(name){return available.find(e=>e.name===name);},
  badge(e){return '<span class="gym-status '+e.status+'">'+labels[e.status]+'</span>';},
  sourceHTML(e){return '<div class="lib-r gym-source"><span class="lib-l">확인 근거</span><span>'+esc(e.source.title)+' · '+esc(e.source.date)+evidenceFiles(e).map(f=>'<br>'+esc(f)).join('')+'</span></div>';},
  select(){InterfaceTools.filter='all';InterfaceTools.equipment='all';InterfaceTools.equipmentType='all';LibApp.q='';LibApp.cat='all';document.querySelector('.lib-search').value='';this.refresh();LibApp.render();},
  open(){document.querySelector('.lbl-l').click();this.select();document.querySelector('.lib-search').focus();},
  refresh(){const scope=document.querySelector('#library-scope');if(!scope)return;scope.value=InterfaceTools.filter;const select=document.querySelector('#library-equipment');select.replaceChildren(new Option('전체','all'),...[...new Set(available.map(e=>e.brand))].map(n=>new Option(n,n)));select.value=InterfaceTools.equipment;const type=document.querySelector('#library-type');if(type)type.value=InterfaceTools.equipmentType;},
  mount(){
   const typeField=document.createElement('div');typeField.className='library-type-field';
   typeField.innerHTML='<label for="library-type">기구 종류</label><select id="library-type"><option value="all">전체 기구 · '+available.length+'개</option>'+Object.entries(types).map(([id,label])=>'<option value="'+id+'">'+label+' · '+available.filter(e=>e.equipmentType===id).length+'개</option>').join('')+'</select><button type="button" onclick="GymInventory.select()">필터 초기화</button>';
   document.querySelector('.library-filter-panel').before(typeField);
   typeField.querySelector('select').onchange=e=>{InterfaceTools.equipmentType=e.target.value;LibApp.render();};
   const info=document.createElement('details');info.id='gym-photo-info';info.className='gym-draft-info';info.innerHTML='<summary>올데이 · 운동 '+available.length+'개 <span>기구 안내</span></summary><p>사진 확인 전용 기구 운동 '+confirmed.length+'개, 사용자 보유 확인 전용 기구 운동 '+reported.length+'개, 덤벨·케이블·T바·바벨·스미스 활용 운동 '+accessories.length+'개예요. 같은 기구의 추가 사진은 기존 항목에 보완하고, 수행 방식이 다르면 운동을 나누어 기록해요.</p>'+this.stations.map(s=>'<p><strong>'+esc(s.title)+'</strong><br>'+esc(s.note)+'</p>').join('')+'<p>사진에서 확인되지 않은 브랜드·손잡이·조절 장치는 현장 안내를 확인하세요. 새 기구의 중량은 가벼운 준비 세트부터 정하고 좌석·그립·원판 입력 기준을 저장하세요.</p>';
   document.querySelector('.library-filter-panel').after(info);this.refresh();
  }
 };
})();
