const MUSCLE_INFO={
  "가슴": {
    "c": "#D85A30",
    "loc": "가슴 앞 · 대흉근",
    "anat": "쇄골부와 흉골·늑골부 등으로 나뉘며 팔을 몸 앞으로 모으고 미는 데 참여합니다.",
    "fn": "프레스·플라이의 각도에 따라 부하 분포가 달라질 수 있으나 가슴 안쪽만 별도로 분리하는 운동은 아닙니다."
  },
  "등": {
    "c": "#185FA5",
    "loc": "등·겨드랑이 뒤 · 광배근과 견갑 주변 근육",
    "anat": "광배근은 팔을 아래·뒤로 가져가는 데, 능형근과 승모근은 견갑골을 움직이고 안정시키는 데 참여합니다.",
    "fn": "수직 당기기·로우 등을 조합할 수 있습니다. 한 동작이 너비만, 다른 동작이 두께만 만드는 것은 아닙니다."
  },
  "전면삼각": {
    "c": "#BA7517",
    "loc": "어깨 앞 · 전면 삼각근",
    "anat": "팔을 앞으로 올리고 미는 동작에 참여합니다.",
    "fn": "가슴 프레스와 어깨 프레스에서 이미 부하를 받으므로 프론트 레이즈 추가량은 전체 훈련을 보고 조절합니다."
  },
  "측면삼각": {
    "c": "#BA7517",
    "loc": "어깨 옆 · 중간 삼각근",
    "anat": "팔을 옆으로 올리는 동작에 참여합니다.",
    "fn": "견갑의 자연스러운 회전을 허용하고, 손가락 방향으로 부하를 완전히 고립하려 하지 않습니다."
  },
  "이두": {
    "c": "#534AB7",
    "loc": "위팔 앞 · 상완이두근",
    "anat": "팔꿈치 굽힘과 전완 회외에 참여합니다. 상완근·완요골근도 팔꿈치를 굽힙니다.",
    "fn": "덤벨·케이블·중립 그립 컬 모두 이두근을 사용할 수 있습니다. 피크 모양을 특정 컬 하나가 결정하지 않습니다."
  },
  "삼두": {
    "c": "#0C447C",
    "loc": "위팔 뒤 · 상완삼두근",
    "anat": "세 갈래가 팔꿈치를 펴는 데 참여합니다. 장두는 어깨 관절도 가로지릅니다.",
    "fn": "머리 위 익스텐션은 장두의 길이가 달라지는 변형입니다. 푸시다운과 비교할 때 편안한 어깨·팔꿈치 경로를 우선합니다."
  },
  "대퇴사두": {
    "c": "#27500A",
    "loc": "허벅지 앞 · 대퇴사두근",
    "anat": "무릎을 펴며, 대퇴직근은 고관절을 굽히는 데도 참여합니다.",
    "fn": "스쿼트·레그프레스·익스텐션의 역할이 다릅니다. 무릎이 발끝을 넘는 것만으로 잘못된 자세는 아닙니다."
  },
  "후면사슬": {
    "c": "#6B4FA0",
    "loc": "둔부·허벅지 뒤 · 둔근과 햄스트링",
    "anat": "둔근은 고관절 폄, 햄스트링은 주로 고관절 폄과 무릎 굽힘에 참여합니다.",
    "fn": "힌지와 레그컬은 동작이 다릅니다. 발목 방향 하나로 레그컬의 종아리 참여가 없어지는 것은 아닙니다."
  },
  "코어": {
    "c": "#888",
    "loc": "몸통 앞·옆 · 복부 근육",
    "anat": "몸통 굽힘·회전과 자세 안정화에 참여합니다.",
    "fn": "복근 운동만으로 복부 지방을 선택적으로 줄일 수는 없습니다. 크런치·회전 저항·버티기 등을 목적에 맞게 선택합니다."
  },
  "후면삼각": {
    "c": "#C46A2A",
    "loc": "어깨 뒤 · 후면 삼각근",
    "anat": "팔을 뒤로 보내거나 수평으로 벌리는 데 참여합니다.",
    "fn": "리어 델트 플라이·로우·페이스풀 등에 쓰입니다. 특정 운동으로 굽은 어깨가 반드시 교정되는 것은 아닙니다."
  },
  "승모": {
    "c": "#7A6F2E",
    "loc": "목 아래·등 위 · 승모근",
    "anat": "견갑골의 올림·모음·위쪽 회전과 안정화 등에 참여합니다.",
    "fn": "머리 위로 팔을 올릴 때 승모근이 쓰이는 것은 정상적인 협응입니다. 모든 운동에서 견갑을 아래로 고정하지 않습니다."
  },
  "전완": {
    "c": "#5B8A2A",
    "loc": "아래팔 · 손목·손가락 근육",
    "anat": "도구를 잡고 손목을 굽히고 펴는 데 참여합니다.",
    "fn": "그립 피로는 당기기 수행을 제한할 수 있습니다. 스트랩 사용 여부와 별도 악력 훈련은 목적에 맞게 정합니다. 데드행의 치료 효과를 보장하지 않습니다."
  },
  "종아리": {
    "c": "#3E2E66",
    "loc": "정강이 뒤 · 비복근·가자미근",
    "anat": "발목을 펴며 걷기·달리기·발볼 지지에 참여합니다.",
    "fn": "무릎을 편 자세와 굽힌 자세에서 비복근의 길이가 달라집니다. 발판 아래로 뒤꿈치를 억지로 깊게 내리지 않습니다."
  },
  "내전근": {
    "c": "#8B5E3C",
    "loc": "허벅지 안쪽 · 내전근군",
    "anat": "다리를 몸 중심으로 모으고 고관절 움직임과 안정화에 참여합니다.",
    "fn": "어덕션은 모음, 어브덕션은 벌림입니다. 시작 폭을 편안하게 정하고 사타구니 통증을 참고 수행하지 않습니다."
  }
};
const MuscleMap={
  _exByMus:null,
  init(){
    if(this._exByMus)return;
    const all=new Set();
    Object.values(EL_DAY_EX).forEach(arr=>arr.forEach(n=>all.add(n)));
    const map={};
    all.forEach(n=>{const mu=PlanApp.muscleOf(n);if(!mu)return;(map[mu.p]=map[mu.p]||[]).push(n);});
    this._exByMus=map;
  },
  // subIdx: 세부근육 인덱스(그림의 세부 조각을 탭했을 때 전달). 있으면 그림에서 해당 조각을 강조하고 팝업의 해당 카드를 펼친다.
  show(m,subIdx){
    this.init();
    var si=(subIdx==null?null:String(subIdx));
    document.querySelectorAll('.mz').forEach(function(z){
      var on=z.dataset.m===m;
      z.classList.toggle('sel',on);
      z.classList.toggle('subsel',on&&si!=null&&z.dataset.sub===si);
    });
    const info=MUSCLE_INFO[m];const box=document.getElementById('mm-info');if(!box||!info)return;
    const exs=this._exByMus[m]||[];
    box.innerHTML='<div class="mm-h"><span class="mm-dot" style="background:'+info.c+'"></span><span class="mm-nm">'+m+'</span></div>'
      +'<div class="mm-loc">'+info.loc+'</div>'
      +(info.anat?'<div class="mm-anat"><span class="mm-anat-t">구성</span>'+info.anat+'</div>':'')
      +'<div class="mm-fn">'+info.fn+'</div>'
      // 세부 근육 카드 — window.MUSCLE_DETAIL(exercise-library.js)에서 주입. 각 세부근육의 위치·섬유 방향·힘 방향·손가락 큐를 접이식으로 표시
      +((window.MUSCLE_DETAIL&&window.MUSCLE_DETAIL[m]&&window.MUSCLE_DETAIL[m].sub)?'<div class="mm-sub-lbl">🔬 세부 근육 ('+window.MUSCLE_DETAIL[m].sub.length+') — 카드를 누르면 그림에서 위치가 표시됩니다</div>'+window.MUSCLE_DETAIL[m].sub.map(function(s,i){
        // summary 탭 → 그림에서 해당 세부근육 조각 강조(hlSub)
        return '<details class="mm-sub"><summary onclick="MuscleMap.hlSub(\''+m+'\','+i+')"><span class="mm-sub-nm">'+s.n+'</span><span class="chev">▾</span></summary><div class="mm-sub-body">'
          +'<div class="mm-sub-r"><span class="mm-sub-l">위치</span><span>'+s.loc+'</span></div>'
          +(s.dir?'<div class="mm-sub-r"><span class="mm-sub-l dir">방향</span><span>'+s.dir+'</span></div>':'')
          +'<div class="mm-sub-r"><span class="mm-sub-l how">키우기</span><span>'+s.how+'</span></div>'
          +(s.ex?'<div class="mm-sub-r"><span class="mm-sub-l ex">대표</span><span>'+s.ex+'</span></div>':'')
          +'</div></details>';
      }).join(''):'')
      +(exs.length?'<div class="mm-exs-lbl">이 부위 자극 운동 ('+exs.length+')</div><div class="mm-exs">'+exs.map(e=>'<span class="mm-ex">'+e+'</span>').join('')+'</div>':'<div class="mm-noex">현재 루틴에선 복합 종목에서 <b>보조로</b> 단련됩니다. 전용 강화가 필요하면 📚 도감에서 종목을 찾아 추가하세요.</div>');
    // 그림의 세부 조각을 탭한 경우 → 해당 카드를 자동으로 펼쳐 설명을 바로 노출
    if(si!=null){var cs=box.querySelectorAll('.mm-sub');if(cs[subIdx]){cs[subIdx].open=true;}}
  },
  // 팝업의 세부근육 카드 탭 → 그림에서 해당 조각만 강조(그룹 선택 상태는 유지)
  hlSub(m,idx){
    var si=String(idx);
    document.querySelectorAll('.mz').forEach(function(z){
      z.classList.toggle('subsel',z.dataset.m===m&&z.dataset.sub===si);
    });
  }
};
function libLookup(){
  if(libLookup._m)return libLookup._m;
  const m={};(window.EXERCISE_LIBRARY||[]).forEach(e=>{m[e.name]=e;});(window.EXERCISE_LIBRARY||[]).forEach(e=>(e.aka||[]).forEach(a=>{if(!m[a])m[a]=e;}));
  libLookup._m=m;return m;
}
function augmentCards(){
  document.querySelectorAll('details.ex-card').forEach(card=>{
    const name=card.querySelector('.ex-nm')?.textContent.trim(),det=card.querySelector('.ex-detail');
    const e=libLookup()[name];if(!e||!det)return;
    const tag=card.querySelector('.tag.t-m');if(tag)tag.textContent=e.mus||'';
    if(det.querySelector('.exercise-coaching'))return;
    const guide=document.createElement('div');guide.className='exercise-coaching';guide.innerHTML=ExerciseCoaching.html(e);
    const log=det.querySelector('.ex-log');if(log)det.insertBefore(guide,log);else det.prepend(guide);
  });
}
const LibApp={
  cat:'all',q:'',
  render(){
    const box=document.getElementById('lib-list');if(!box)return;
    const lib=GymInventory.library();const cats=window.EXERCISE_CATS||{};
    const chipWrap=document.getElementById('lib-chips');
    if(chipWrap&&!chipWrap.dataset.done){
      let h='<button class="lib-chip on" data-c="all" onclick="LibApp.setCat(\'all\')">전체</button>';
      Object.keys(cats).forEach(c=>{h+='<button class="lib-chip" data-c="'+c+'" onclick="LibApp.setCat(\''+c+'\')">'+cats[c].split(' ')[0]+'</button>';});
      chipWrap.innerHTML=h;chipWrap.dataset.done='1';
    }
    const q=this.q.trim().toLowerCase();
    const COL={push:'#D85A30',pull:'#185FA5',legs:'#27500A',core:'#888',small:'#BA7517'};
    const items=InterfaceTools.filterExercises(lib.filter(e=>(this.cat==='all'||e.cat===this.cat)&&(!q||(e.searchTerms||'').toLowerCase().includes(q)||e.name.toLowerCase().indexOf(q)>=0||(e.mus||'').toLowerCase().indexOf(q)>=0||(e.aka||[]).some(a=>a.toLowerCase().indexOf(q)>=0))));
    this._items=items;
    if(!items.length){box.innerHTML='<div class="lib-empty">검색 결과가 없습니다.</div>';return;}
    // Detailed guidance is built only when an exercise is opened.
    box.innerHTML=items.map(function(e,i){
      return '<details class="lib-card" data-i="'+i+'"><summary><span class="lib-dot" style="background:'+(COL[e.cat]||'#888')+'"></span><span class="lib-nm">'+(e.displayName||e.name)+GymInventory.badge(e)+'</span><span class="lib-mus">'+(e.mus||'')+'</span><span class="chev">▾</span></summary>'
        +'<div class="lib-body"></div></details>';
    }).join('');
    // toggle 이벤트는 버블링하지 않으므로 캡처 단계로 위임한다(카드마다 리스너를 달지 않기 위해).
    if(!box.dataset.lazy){
      box.addEventListener('toggle',function(ev){
        const d=ev.target;
        if(d?.matches('details.lib-card')&&d.open)LibApp._build(d);
      },true);
      box.dataset.lazy='1';
    }
  },
  // 카드 본문 1장을 실제로 만든다. 이미 만들었으면 아무것도 하지 않는다.
  _build(d){
    if(!d||d.dataset.built)return;
    const e=(this._items||[])[+d.dataset.i];if(!e)return;
    d.dataset.built='1';
    const body=d.querySelector('.lib-body');if(!body)return;
    body.innerHTML=ExerciseCoaching.html(e)
      +(e.gym?GymInventory.sourceHTML(e):'')
      +(e.recordingNote?'<p class="coach-footnote">'+_esc(e.recordingNote)+'</p>':'')
      +(e.equipmentNote?'<p class="coach-footnote">'+_esc(e.equipmentNote)+'</p>':'')
      // 대체 종목: 기구가 찼을 때의 분기점. 눌러서 바로 그 종목 카드로 이동한다.
      +((e.alt&&e.alt.length)?'<div class="lib-r"><span class="lib-l alt">대체</span><span class="lib-alts">'
          +e.alt.map(a=>'<button class="lib-altb" onclick="LibApp.goto(\''+a.replace(/'/g,"\\'")+'\')">'+a+'</button>').join('')
        +'</span></div>':'')
      +'<button class="library-favorite" onclick="InterfaceTools.favorite(\''+_escJs(e.name)+'\')" aria-pressed="'+!!InterfaceTools.favorites()[e.name]+'">'+(InterfaceTools.favorites()[e.name]?'★ 즐겨찾기 해제':'☆ 즐겨찾기')+'</button>'
      +'<button class="lib-add" onclick="LibApp.add(this,\''+e.name.replace(/'/g,"\\'")+'\')">＋ 운동에 추가</button>';
  },
  setCat(c){this.cat=c;document.querySelectorAll('.lib-chip').forEach(b=>b.classList.toggle('on',b.dataset.c===c));this.render();},
  search(v){this.q=v;clearTimeout(this._t);this._t=setTimeout(()=>this.render(),120);},
  // 대체 종목 칩 → 그 종목으로 검색을 좁히고 카드를 펼친다(전체 카테고리로 되돌려야 검색이 걸린다).
  goto(name){
    GymInventory.select();
    this.cat='all';this.q=name;
    const inp=document.querySelector('.lib-search');if(inp)inp.value=name;
    document.querySelectorAll('.lib-chip').forEach(b=>b.classList.toggle('on',b.dataset.c==='all'));
    this.render();
    const box=document.getElementById('lib-list');
    const first=box&&box.querySelector('details.lib-card');
    if(first){this._build(first);first.open=true;first.scrollIntoView({block:'center',behavior:'smooth'});}
  },
  add(btn,name){
    if(ExLog.addExternal(name)){
      btn.textContent='적용 범위를 선택하세요';
      setTimeout(function(){btn.textContent='＋ 운동에 추가';btn.classList.remove('added');btn.disabled=false;},2500);
    }
  }
};
// 허리 88cm: 체지방 20%(지방 −9.5kg) 도달 시 추정치이자, 도중에 복부비만 컷오프(남성 90cm)를 지나는 값.
// 안드로이드 체형에서 어깨-허리 대비를 만드는 건 어깨(골격 고정)가 아니라 허리 쪽이라 프레임의 1순위 지표다.
