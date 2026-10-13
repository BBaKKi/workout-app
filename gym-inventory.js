/* All Day Gam-il: source-backed draft, separate from the general exercise library.
 * Record names are stable keys. Never rename them when source/status text changes. */
(function () {
  'use strict';
  const sources = {
    hammer: {date:'2025-03-19', title:'해머스트렝스 하이로우 & DY로우 머신사용법 입고완료', post:'223802202158'},
    september: {date:'2024-09-03', title:'올데이 휘트니스 무료개방 & 바디챌린지 그리고 수퍼세일', post:'223570984595'},
    gymleco: {date:'2025-04-14', title:'추가 기구 입고 2억 2탄 — 짐레코 티바로우', post:'223832484771'},
    labcon: {date:'2024-06-06', title:'6월 기구 추가 입고예정 — 랩콘컴퍼니', post:'223470901271'},
    cybex: {date:'2025-04-11', title:'추가 기구입고 2억 1탄 — 싸이벡스', post:'223829921692'},
    powerplate: {date:'2024-07-02', title:'올데이 파워플레이트 입고', post:'223499012261'}
  };
  Object.values(sources).forEach(s => s.url='https://m.blog.naver.com/alldayfitness_tennis/'+s.post);
  const labels={arrived:'입고 완료 글',introduced:'도입 안내 글',planned:'입고 예정 글'};
  // Templates supply only general movement descriptions; their aliases, models and history are not linked.
  const rows=[
    ['hammer-high-row','Hammer 하이 로우','해머스트렝스 하이로우','Hammer ISO-하이 로우','arrived','hammer','Hammer'],
    ['hammer-dy-row','Hammer DY 로우','해머스트렝스 디와이로우','Hammer ISO-하이 로우','arrived','hammer','Hammer'],
    ['hammer-pullover','Hammer 풀오버','해머스트렝스 풀오버','Nautilus 풀오버','planned','september','Hammer'],
    ['hammer-low-row','Hammer 로우 로우','해머스트렝스 로우로우','Hammer ISO-로우 로우','planned','september','Hammer'],
    ['hammer-chest-press','Hammer 체스트 프레스','해머스트렝스 체스트프레스','머신 체스트 프레스','planned','september','Hammer'],
    ['gymleco-tbar','Gymleco 티바 로우','짐레코 티바로우 T바 로우','T바 로우','introduced','gymleco','Gymleco'],
    ['labcon-linear-row','랩콘 리니어 로우','랩콘컴퍼니 리니어로우','T바 로우','planned','labcon','랩콘'],
    ['labcon-linear-shoulder','랩콘 리니어 숄더','랩콘컴퍼니 리니어숄더','머신 숄더 프레스','planned','labcon','랩콘'],
    ['lexco-seated-leg-curl','렉스코 시티드 레그컬','렉스코 MASTER PRO 시티드레그컬','레그컬','planned','september','렉스코'],
    ['lexco-leg-extension','렉스코 레그 익스텐션','렉스코 MASTER PRO 레그익스텐션','레그 익스텐션','planned','september','렉스코']
  ];
  const entries=rows.map(([id,title,searchTerms,template,status,source,brand])=>{
    const base=(window.EXERCISE_LIBRARY||[]).find(e=>e.name===template);
    if(!base)throw new Error('Missing inventory movement template: '+template);
    const e=JSON.parse(JSON.stringify(base));
    Object.assign(e,{id, name:'올데이 감일 · '+title, displayName:title, gym:'allday-gamil', brand, searchTerms, status, source:sources[source], aka:[], alt:[], archived:false,
      recordingNote:'올데이 감일본점 전용 기록입니다. 기존 짐과 중량·PR·자동 목표·기구 세팅을 따로 기록합니다.',
      equipmentNote:labels[status]+' ('+sources[source].date+'). 현재 설치 여부와 정확한 모델·중량 표기는 현장에서 확인하세요. 아래 설명은 일반 동작 안내입니다.'});
    delete e.reviewNote;
    // Do not carry over unverified brand-specific setup or grip details.
    if(['hammer-high-row','hammer-dy-row','hammer-low-row','labcon-linear-row','gymleco-tbar'].includes(id)){
      e.setup='실제 기구의 좌석·발판·지지대를 몸에 맞춥니다. 손잡이와 움직이는 경로는 현장의 안내판을 확인하세요.';
      e.grip='기구에 있는 손잡이 중 편안한 그립을 사용하고, 손목을 과하게 꺾지 않습니다.';
      e.tip='지지대와 손잡이 형태를 확인하고 좌석 번호·그립을 기구 메모에 남기세요.';
    }
    if(id==='hammer-pullover'){
      e.setup='실제 풀오버 기구의 좌석·등받이·패드를 조절합니다. 손잡이와 시작 위치는 현장의 기구 안내판을 확인하세요.';
    }
    if(id==='hammer-dy-row')e.rom='손잡이를 몸 쪽으로 당겼다가 통제하며 되돌립니다. 팔꿈치 경로는 실제 기구의 궤적과 편안한 어깨 범위에 맞춥니다.';
    return e;
  });
  const notes=[
    {title:'뉴텍 어드져스 폴리',status:'planned',source:sources.september,note:'블로그 표기 그대로 수록했습니다. 정확한 모델과 손잡이 구성을 확인한 뒤 실제 수행할 케이블 운동을 선택하세요.'},
    {title:'싸이벡스 하체 3종',status:'planned',source:sources.cybex,note:'본문에 개별 기구명이 없어 종목을 추정하지 않았습니다. 현장에서 3종의 이름·모델 확인이 필요합니다.'},
    {title:'파워플레이트',status:'arrived',source:sources.powerplate,note:'기구 도입 안내만 수록했습니다. 일반적인 중량·반복 운동 한 종목으로 추가하지 않습니다.'}
  ];
  const G=window.GymInventory={entries,notes,sources,labels,catalog:'general',status:'all',
    library(){return this.catalog==='allday-gamil'?entries:(window.EXERCISE_LIBRARY||[]).filter(e=>!e.archived);},
    find(name){return entries.find(e=>e.name===name);},
    badge(e){return e.gym?'<span class="gym-status '+e.status+'">'+labels[e.status]+'</span>':'';},
    sourceHTML(e){return '<div class="lib-r gym-source"><span class="lib-l">출처</span><span><a href="'+e.source.url+'" target="_blank" rel="noopener noreferrer">공식 블로그 · '+e.source.date+' ↗</a><br>'+e.source.title+'</span></div>';},
    select(value){
      this.catalog=value;this.status='all';
      InterfaceTools.filter='all';InterfaceTools.equipment='all';LibApp.q='';LibApp.cat='all';
      document.querySelector('.lib-search').value='';
      document.querySelectorAll('.lib-chip').forEach(b=>b.classList.toggle('on',b.dataset.c==='all'));
      this.refresh();LibApp.render();
    },
    open(){
      document.querySelector('.lbl-l').click();this.select('allday-gamil');
      document.querySelector('.library-filter-panel').open=true;document.querySelector('#library-catalog').focus();
    },
    refresh(){
      const active=this.catalog==='allday-gamil';
      document.querySelector('#library-catalog').value=this.catalog;
      document.querySelector('#gym-draft-info').hidden=!active;
      document.querySelector('#gym-status-field').hidden=!active;
      document.querySelector('#gym-status-filter').value=this.status;
      document.querySelector('#library-scope').value=InterfaceTools.filter;
      const brands=active?['Hammer','Gymleco','랩콘','렉스코']:['Hammer','Watson','Nautilus','Booty Builder','덤벨','바벨','케이블'];
      const select=document.querySelector('#library-equipment');
      select.replaceChildren(new Option('전체','all'),...brands.map(n=>new Option(n,n)));
      select.value=InterfaceTools.equipment;
    },
    mount(){
      const filters=document.querySelector('.library-filters');
      const field=document.createElement('label');field.className='library-catalog-field';field.textContent='도감 선택';
      const select=document.createElement('select');select.id='library-catalog';select.append(new Option('일반 운동 도감','general'),new Option('올데이 감일본점 · 기구 초안','allday-gamil'));select.onchange=()=>this.select(select.value);field.append(select);filters.prepend(field);
      const status=document.createElement('label');status.id='gym-status-field';status.textContent='블로그 확인 상태';
      const statusSelect=document.createElement('select');statusSelect.id='gym-status-filter';statusSelect.append(new Option('전체 상태','all'),...Object.entries(labels).map(([k,v])=>new Option(v,k)));statusSelect.onchange=()=>{this.status=statusSelect.value;LibApp.render();};status.append(statusSelect);filters.append(status);
      const info=document.createElement('section');info.id='gym-draft-info';info.className='gym-draft-info';info.setAttribute('aria-label','올데이 감일본점 기구 초안 안내');
      info.innerHTML='<h3>올데이 감일본점 · 기구 초안</h3><p>이름이 확인된 기구 10개 · 그중 2개는 입고 완료 글 확인. 2024–2025년 공식 블로그를 바탕으로 정리했으며 <b>현재 설치 여부·정확한 모델은 현장 확인이 필요합니다.</b> 전체 보유 기구 목록은 아닙니다.</p><p>추가하면 <b>올데이 감일 · 기구명</b>으로 기록됩니다. 기존 짐의 중량·세팅과 구분하며, 현재 루틴은 직접 추가할 때만 바뀝니다.</p><details class="gym-notes"><summary>종목으로 추가하지 않은 기구 안내 3건</summary>'+notes.map(n=>'<article><h4>'+n.title+'</h4><span class="gym-status '+n.status+'">'+labels[n.status]+'</span><p>'+n.note+'</p>'+this.sourceHTML(n)+'</article>').join('')+'</details>';
      filters.after(info);this.refresh();
    }
  };
})();
