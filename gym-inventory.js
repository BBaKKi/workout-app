/* All Day Gam-il: photo-confirmed equipment and a separate historical blog draft.
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
  const labels={confirmed:'사진 확인',reported:'보유 확인 · 사용자',arrived:'입고 완료 글',introduced:'도입 안내 글',planned:'입고 예정 글'};
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
  const drafts=rows.map(([id,title,searchTerms,template,status,source,brand])=>{
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
  // These names are new record keys. Do not merge them with generic or old-gym history.
  // Photo evidence confirms the movement; it does not establish an unreadable brand.
  const photoRows=[
    {
      id:'nautilus-nitro-overhead-press',title:'Nautilus Nitro 오버헤드 프레스',brand:'Nautilus',template:'머신 숄더 프레스',photo:'IMG_5800.JPEG',
      searchTerms:'노틸러스 나틸러스 니트로 숄더 프레스 어깨 shoulder overhead press 5800',mus:'전면·측면 삼각근 · 삼두근',
      equipmentNote:'사진에서 NAUTILUS NITRO OVERHEAD PRESS 표기와 핀 중량 방식을 확인했습니다. 좌석 번호와 사용한 손잡이를 함께 기록하세요.',
      setup:'중량판이 내려간 상태에서 핀을 끝까지 꽂습니다. 손잡이가 어깨 높이 부근에서 시작하고 손을 잡으려고 어깨를 뒤로 꺾지 않도록 좌석을 조절하세요. 양발을 안정적으로 지지하고 엉덩이·등을 패드에 댄 뒤 가벼운 준비 반복으로 범위를 확인합니다.',
      grip:'사진의 가로·사선 손잡이 중 손목과 어깨가 편한 쪽을 고릅니다. 엄지로 손잡이를 감싸고 손목을 전완과 나란히 유지하세요. 양손은 같은 위치를 잡습니다.',
      rom:'내릴 때 팔꿈치가 몸 뒤로 밀리거나 어깨 앞이 끼기 전까지만 내려옵니다. 위에서는 허리를 젖혀 높이를 더하지 말고 팔꿈치를 충격 없이 폅니다. 좌석을 낮춰 억지로 깊이를 늘리지 마세요.',
      tip:'손으로 손잡이를 들어 올리기보다 팔꿈치가 손잡이를 받치며 위로 이동한다고 생각하세요. 팔 뒤에도 힘이 드는 것은 정상입니다. 앞어깨 관절만 압박되면 무게보다 좌석·그립·하강 깊이를 먼저 조절합니다.',
      breath:'밀며 내쉬고 내려오며 들이쉽니다. 복부 긴장을 유지한 채 내려오는 구간을 약 2–3초로 통제해 보고, 중량판이 부딪치지 않도록 합니다.',
      warn:'어깨 앞의 날카로운 통증, 팔로 내려가는 저림, 허리가 꺾여야만 밀리는 상태에서는 반복을 멈춥니다. 핀이나 좌석은 중량을 움직이는 도중에 조절하지 마세요.',
      coaching:{
        cues:['팔꿈치로 손잡이 받치기','갈비뼈·골반 정렬','어깨뼈는 자연스럽게 움직이기'],
        position:'엉덩이와 등을 패드에 지지하고 갈비뼈가 앞으로 들리지 않게 복부를 받칩니다. 팔꿈치는 몸통 바로 옆보다 약간 앞쪽의 편안한 경로로 움직이되 기구 궤적을 억지로 비틀지 않습니다. 팔을 올릴 때 어깨뼈의 자연스러운 위쪽 회전을 허용하고 끝까지 아래로 고정하려 하지 마세요.',
        feel:'삼각근이 위팔을 들어 올리고 삼두근이 팔꿈치를 폅니다. 어깨 앞·옆의 근육과 위팔 뒤에 힘이 들어가는 운동이며, 견갑 주변 근육도 어깨뼈 움직임을 돕습니다. 목을 움츠려 올리는 느낌보다 위팔이 올라가는 동작에 집중하세요.',
        steps:['가벼운 부하에서 손잡이를 잡고 발·골반·등의 지지를 확인합니다. 손목 아래에서 팔꿈치가 힘을 받도록 맞춥니다.','숨을 내쉬며 손잡이를 위로 밉니다. 등받이에서 몸을 떼거나 허리를 젖히지 않고 좌우를 함께 움직입니다.','위에서 팔꿈치를 세게 잠그지 않고 통제한 뒤, 들이쉬며 처음 정한 깊이까지 천천히 내려옵니다.'],
        errors:'허리가 젖혀지면 무게를 낮추고 발 지지와 좌석을 다시 맞춥니다. 손목이 뒤로 꺾이면 손바닥 깊숙이 손잡이를 받치세요. 어깨뼈를 과하게 아래로 누르거나 팔꿈치를 몸 뒤로 보내 범위를 확보하지 않습니다.'
      }
    },
    {
      id:'seated-dip-press',title:'딥 프레스 · 시티드 딥스',brand:'브랜드 미확인',template:'어시스트 딥스 머신',photo:'IMG_5801.JPEG',
      searchTerms:'딥스 딥 프레스 시티드 seated dip press 삼두 가슴 5801',mus:'삼두근 · 대흉근',
      equipmentNote:'DIP PRESS 안내판과 원판 부하 구조를 확인했습니다. 제조사는 사진에서 확정하지 않았습니다. 몸을 들어 올리는 어시스트 딥스와 다른, 앉아서 손잡이를 누르는 기구입니다.',
      setup:'기구 그림의 앉는 방향을 확인하고 골반을 좌석에 안정적으로 둡니다. 손잡이가 몸 옆에 오고 시작할 때 어깨가 위로 밀리지 않도록 좌석과 조절 가능한 패드를 맞추세요. 움직이는 부하 봉과 원판 보관 봉을 구분하고 좌우 부하를 맞춥니다.',
      grip:'양쪽 손잡이를 같은 위치에서 엄지까지 감싸 잡습니다. 손목을 아래로 꺾어 누르지 말고 손바닥과 전완을 통해 힘을 전달하세요.',
      rom:'돌아올 때 팔꿈치가 굽혀지더라도 어깨 앞이 깊게 당기거나 위팔이 몸 뒤로 과하게 넘어가기 전까지만 올립니다. 아래에서는 팔꿈치를 충격 없이 펴고 어깨를 억지로 더 내려 누르지 않습니다.',
      tip:'위팔 뒤가 단단해지는 느낌과 손잡이를 아래로 누르는 동작을 함께 확인하세요. 중량 때문에 엉덩이가 들리면 부하를 줄입니다. 원판을 더하면 저항이 커지는 방식이며 보조 중량으로 체중을 덜어주는 머신이 아닙니다.',
      breath:'손잡이를 아래로 누르며 내쉬고 올라오는 손잡이를 버티며 들이쉽니다. 복귀를 약 2–3초로 통제하고 위에서 튕겨 다음 반복을 시작하지 않습니다.',
      warn:'앞어깨가 찌르거나 팔꿈치·손목 관절이 아프면 멈춥니다. 동작이 끝나면 손잡이를 시작 위치에 통제해 돌려놓은 뒤 놓으세요. 확인되지 않은 패드나 레버를 중량이 걸린 채 조작하지 않습니다.',
      coaching:{
        cues:['골반은 좌석에','팔꿈치는 몸 옆 경로','손잡이를 아래로 누르기'],
        position:'발과 좌석으로 몸을 지지하고 상체 기울기를 반복 내내 일정하게 유지합니다. 팔꿈치는 기구 궤적을 따라 몸 옆에서 굽혔다 펴며, 억지로 옆구리에 압착하거나 크게 벌리지 않습니다. 머리를 앞으로 빼고 몸무게로 손잡이를 덮치지 마세요.',
        feel:'삼두근이 팔꿈치를 펴면서 위팔 뒤에 힘을 냅니다. 대흉근과 앞어깨도 위팔 움직임에 참여하며 분담은 자세·손잡이 궤적에 따라 달라집니다. 가슴 하부만 고립시키는 운동은 아닙니다.',
        steps:['좌석에 앉아 양손을 잡고 시작 높이를 확인합니다. 어깨를 귀에 붙이거나 몸을 매달리지 않고 골반을 안정시킵니다.','상체를 흔들지 않은 채 팔꿈치를 펴 손잡이를 아래로 누릅니다. 좌우가 함께 움직이게 하고 끝에서 팔꿈치를 튕기지 않습니다.','올라오는 손잡이를 천천히 버티며 팔꿈치를 굽힙니다. 어깨가 앞으로 말리기 전의 시작 범위에서 다음 반복을 준비합니다.'],
        errors:'몸을 좌석에서 들어 올리는 맨몸 딥스로 수행하지 않습니다. 엉덩이가 뜨거나 상체를 반복마다 숙이면 무게를 낮추세요. 손목만 꺾어 끝 범위를 늘리거나 어깨 앞의 당김을 참고 손잡이를 높이 올리지 않습니다.'
      }
    },
    {
      id:'decline-chest-fly',title:'디클라인 플라이',brand:'브랜드 미확인',template:'펙덱 플라이',photo:'IMG_5802.JPEG',movementPattern:'플라이',
      searchTerms:'디클라인 하부 가슴 플라이 lower chest flight fly 5802',mus:'대흉근 · 하부 방향 강조',
      equipmentNote:'디클라인 플라이 / LOWER CHEST FLIGHT 표기와 원판·풀리 구조를 확인했습니다. 제조사와 세부 모델은 미확인입니다. 조절 레버의 기능은 현장 안내를 확인하세요.',
      setup:'등과 골반을 등받이·좌석에 지지하고 양발을 안정적으로 둡니다. 팔을 벌려 잡을 때 어깨가 뒤로 꺾이지 않는 좌석 높이와 시작 범위를 선택하세요. 시작 보조 장치가 있다면 사용법을 먼저 확인하고 가벼운 원판부터 준비합니다.',
      grip:'손잡이를 엄지까지 감싸 잡고 손목은 곧게 둡니다. 팔꿈치를 편안하게 살짝 굽힌 상태로 유지하며 손잡이를 모으려고 팔꿈치를 펴는 프레스 동작으로 바꾸지 않습니다.',
      rom:'바깥쪽에서는 가슴 근육이 늘어나되 어깨 앞에 통증이나 끼임이 없는 범위까지만 벌립니다. 안쪽에서는 손잡이를 억지로 부딪치거나 손을 교차하지 말고 기구가 허용하는 앞·아래 경로에서 마칩니다.',
      tip:'큰 물체를 가슴 아래쪽으로 감싸 안듯 위팔을 모으세요. 손을 세게 맞붙이는 것보다 가슴으로 위팔을 이동시키는 감각이 중요합니다. 가슴이 늘어난 상태에서 반동을 쓰지 않습니다.',
      breath:'팔을 모으며 내쉬고 벌리며 들이쉽니다. 벌리는 구간을 약 2–3초로 통제하고 모인 위치에서 잠깐 멈춰도 몸통 자세가 유지되는 가벼운 부하부터 시작하세요.',
      warn:'가슴 근육의 늘어남과 앞어깨의 찌르는 통증은 구분합니다. 통증·저림이 생기면 멈춥니다. 원판·풀리와 움직이는 암의 경로에 손이나 물건을 두지 마세요.',
      coaching:{
        cues:['팔꿈치 굽힘을 일정하게','위팔을 앞·아래로 모으기','등·골반 지지 유지'],
        position:'가슴을 편안하게 세우되 갈비뼈를 들고 허리를 과하게 젖히지 않습니다. 팔꿈치 각도는 반복 내내 거의 일정하게 유지하고 양쪽 위팔이 기구의 원호를 따라 모이게 합니다. 어깨를 앞으로 내밀어 손잡이 사이 거리를 억지로 줄이지 마세요.',
        feel:'대흉근이 벌어진 위팔을 몸 앞쪽으로 모읍니다. 아래쪽으로 모으는 궤적은 대흉근 하부 방향을 강조하지만 가슴의 다른 부위도 함께 참여합니다. 벌릴 때 가슴이 길어지고 모을 때 가슴에 힘이 드는지 확인하며, 가슴 안쪽만 따로 고립된다고 보지 않습니다.',
        steps:['가벼운 부하에서 등을 지지하고 손잡이를 잡습니다. 팔꿈치를 살짝 굽혀 편안한 시작 범위를 정합니다.','팔꿈치 각도를 유지하며 양 위팔을 앞쪽 아래로 모읍니다. 몸통을 숙이거나 팔을 펴서 손잡이를 밀지 않습니다.','가슴의 긴장을 유지하며 천천히 벌립니다. 어깨가 뒤로 끌려가거나 등받이에서 등이 뜨기 전에 멈추고 반복합니다.'],
        errors:'팔꿈치를 펴서 밀게 되면 부하를 낮추고 플라이 동작으로 돌아오세요. 가슴 자극을 늘리려고 팔을 최대한 뒤로 보내지 않습니다. 마지막에 어깨를 말거나 상체를 앞으로 접어 손잡이를 더 모으지 마세요.'
      }
    },
    {
      id:'technogym-pure-chest-press',title:'Technogym Pure Strength 체스트 프레스',brand:'Technogym',template:'머신 체스트 프레스',photo:'IMG_5803.JPEG',
      searchTerms:'테크노짐 퓨어 퓨어스트렝스 체스트 프레스 pure strength chest press 5803',mus:'대흉근 · 삼두근 · 전면 삼각근',
      equipmentNote:'PURESTRENGTH 등받이와 CHEST PRESS 표기를 확인했습니다. 좌석·손잡이 위치와 원판 합산 기준을 기록하세요. 모델별 빈 기구 저항은 확인 전 임의로 더하지 않습니다.',
      setup:'양쪽 운동 암에 같은 부하를 준비합니다. 손잡이가 가슴 중앙 부근에 오고 손잡이를 잡으려고 어깨를 뒤로 꺾지 않도록 좌석 높이를 조절하세요. 발·골반·등을 안정적으로 지지한 뒤 가벼운 준비 반복으로 시작 위치를 확인합니다.',
      grip:'양손을 손잡이의 대칭 위치에 두고 엄지로 감싸 쥡니다. 손목을 뒤로 젖히지 말고 전완과 나란히 두어 손바닥을 통해 밀어냅니다.',
      rom:'돌아올 때 가슴이 편안하게 늘어나는 범위까지만 허용합니다. 팔꿈치를 등 뒤로 억지로 보내지 마세요. 끝에서는 팔꿈치를 세게 잠그거나 어깨를 앞으로 내밀어 이동 거리를 늘리지 않습니다.',
      tip:'팔꿈치를 펴는 동시에 위팔이 가슴 앞으로 모인다고 생각하세요. 삼두와 앞어깨도 함께 쓰입니다. 팔만 먼저 지치면 좌석 높이·손잡이 위치를 확인하고 무게를 낮춰 궤적을 익힙니다.',
      breath:'밀며 내쉬고 돌아오며 들이쉽니다. 복귀를 약 2–3초로 통제하고 시작점에서 튕기지 않습니다. 숨을 오래 참으면서 반복 수를 억지로 늘리지 마세요.',
      warn:'가슴이나 어깨의 날카로운 통증, 저림, 한쪽만 갑자기 밀리지 않는 느낌이 생기면 멈춥니다. 동작 중 원판을 바꾸거나 움직이는 암 아래에 손을 넣지 마세요.',
      coaching:{
        cues:['손잡이는 가슴 높이','손목·전완 정렬','등을 떼지 않고 밀기'],
        position:'발과 골반을 고정하고 등 위쪽을 패드에 지지합니다. 견갑을 편안하게 안정시키되 과하게 아래로 조이지 않습니다. 팔꿈치는 어깨선까지 크게 벌리거나 옆구리에 압착하지 말고, 전완이 미는 힘을 받칠 수 있는 기구 경로를 따릅니다.',
        feel:'대흉근이 위팔을 몸 앞쪽으로 모으고 삼두근이 팔꿈치를 펴며 전면 삼각근이 돕습니다. 되돌아올 때 가슴이 늘어나고 밀 때 가슴 전체에 힘이 드는지 확인하세요. 손잡이를 꽉 쥐는 느낌만으로 자극을 판단하지 않습니다.',
        steps:['좌석과 좌우 부하를 맞춘 뒤 손잡이를 잡고 등을 지지합니다. 손목이 꺾이지 않는 시작 위치를 확인합니다.','숨을 내쉬며 양쪽 손잡이를 앞으로 밉니다. 기구의 모이는 경로를 따르되 가슴을 내밀거나 몸통을 회전하지 않습니다.','팔꿈치가 펴진 위치에서 통제한 뒤 천천히 돌아옵니다. 처음 정한 깊이에서 멈추고 반동 없이 다음 반복을 시작합니다.'],
        errors:'좌석이 낮아 팔꿈치가 어깨보다 높아지면 높이를 다시 맞춥니다. 허리 아치를 크게 만들거나 엉덩이를 들어 중량을 밀지 마세요. 한쪽이 먼저 나가면 무게를 낮추고 좌우 이동 속도를 맞춥니다.'
      }
    },
    {
      id:'hammer-iso-decline-press',title:'Hammer ISO 디클라인 프레스',brand:'Hammer',template:'Hammer ISO-디클라인 프레스',photo:'IMG_5804.JPEG',
      searchTerms:'해머 해머스트렝스 아이소 레터럴 디클라인 프레스 decline chest press 5804',mus:'대흉근 하부 방향 · 삼두근 · 전면 삼각근',
      equipmentNote:'HAMMER STRENGTH와 디클라인 프레스 표기, 좌우 독립 암을 확인했습니다. 앞선 블로그의 모델 미확인 체스트 프레스 항목과 자동으로 같은 기구로 취급하지 않습니다.',
      setup:'양쪽 운동 암의 부하를 맞춥니다. 등을 패드에 댄 상태에서 손잡이가 가슴 아래쪽 부근에 오도록 좌석을 조절하되, 팔꿈치를 몸 뒤로 억지로 보내지 않는 높이를 택하세요. 양발과 골반을 지지하고 가벼운 부하로 궤적을 확인합니다.',
      grip:'손잡이를 좌우 같은 위치에서 엄지까지 감싸 잡고 손목을 전완과 나란히 둡니다. 손잡이를 아래로 꺾기보다 손바닥을 통해 기구의 프레스 방향으로 힘을 전달하세요.',
      rom:'몸통 기준 앞·아래로 미는 기구 궤적을 따릅니다. 돌아올 때 가슴이 늘어나되 어깨 앞이 뒤로 꺾이는 깊이는 피합니다. 팔꿈치를 펴는 끝 지점에서 충격을 주지 않습니다.',
      tip:'가슴 아래쪽 방향으로 위팔을 모으면서 밀어냅니다. 손목만 아래로 누르는 동작으로 바꾸지 마세요. 좌우 독립 암이므로 약한 쪽의 통제 가능한 반복 범위에 맞추고 몸통이 돌아가지 않게 합니다.',
      breath:'밀며 내쉬고 돌아오며 들이쉽니다. 복귀를 약 2–3초로 통제하고, 마지막 반복에서도 등·골반 지지를 유지할 수 있는 부하로 수행합니다.',
      warn:'어깨 앞이나 가슴의 날카로운 통증, 팔의 저림이 있으면 중단합니다. 손잡이를 놓기 전에 양쪽 암을 안정적으로 복귀시키고, 원판 보관 봉과 실제 부하 봉을 구분하세요.',
      coaching:{
        cues:['가슴 아래쪽 높이에서 시작','몸 기준 앞·아래로 밀기','좌우 속도·몸통 고정'],
        position:'등과 골반을 패드에 지지하고 가슴을 편안하게 세웁니다. 팔꿈치는 손목·전완과 함께 힘을 전달할 수 있는 위치에서 기구의 경로를 따릅니다. 팔꿈치를 어깨선까지 억지로 벌리거나 밀면서 상체를 숙이지 마세요.',
        feel:'대흉근이 위팔을 앞으로 모으고 삼두근이 팔꿈치를 폅니다. 디클라인 방향은 가슴 하부의 부하를 강조하지만 대흉근 전체와 앞어깨도 참여합니다. 위팔 뒤의 힘은 정상적인 보조 작용이며 하부 가슴만 완전히 고립되는 운동은 아닙니다.',
        steps:['좌석과 양쪽 원판을 맞추고 손잡이를 잡습니다. 어깨를 뒤로 꺾지 않는 시작점에서 발·등·골반을 지지합니다.','몸통 기준 앞쪽 아래로 손잡이를 밀며 양팔을 폅니다. 손잡이 궤적을 따르고 몸을 앞으로 던지거나 좌우로 돌리지 않습니다.','끝에서 팔꿈치를 튕기지 않고 잠깐 통제합니다. 가슴의 긴장을 유지하며 양팔을 같은 속도로 시작 범위까지 되돌립니다.'],
        errors:'일반 프레스처럼 수평으로 억지로 밀거나, 딥스처럼 손잡이를 수직 아래로 누르지 마세요. 기구가 안내하는 궤적을 따릅니다. 가슴을 과하게 내밀고 허리를 젖히거나 강한 쪽으로 몸통을 돌리면 무게를 낮춥니다.'
      }
    }
  ];
  const confirmed=[...photoRows,...window.ALLDAY_PHOTO_ROWS].map(({title,template,photo,...details})=>{
    const base=(window.EXERCISE_LIBRARY||[]).find(e=>e.name===template);
    if(!base)throw new Error('Missing photo movement template: '+template);
    const e={...JSON.parse(JSON.stringify(base)),...details,name:'올데이 감일 · '+title,displayName:title,gym:'allday-gamil',status:'confirmed',loadType:'normal',aka:[],alt:[],archived:false,
      source:{type:'photo',date:photo>='IMG_5821.JPEG'?'2026-10-18':'2026-10-17',title:'사용자 제공 현장 사진',file:photo},
      recordingNote:'새 짐 전용 기록입니다. 이전 기구의 중량을 환산하거나 자동으로 가져오지 않습니다. 핀 표시값 또는 원판 합계 등 입력 기준을 기구 메모에 남기세요.'};
    delete e.reviewNote;
    return e;
  });
  const accessorySetup={
    'db-lateral':'양손에 덤벨을 들고 발을 안정적으로 둡니다. 팔꿈치를 살짝 굽힌 채 팔을 몸 옆보다 조금 앞쪽에서 벌립니다. 손목을 꺾거나 엄지를 일부러 아래로 붓듯 돌리지 않습니다.',
    'db-curl':'양손에 덤벨을 들고 상체를 세웁니다. 팔꿈치를 몸 옆에 자연스럽게 둔 채 손바닥이 앞을 향하는 방향으로 굽힙니다. 몸을 젖혀 덤벨을 튕기지 않습니다.',
    'db-hammer':'덤벨을 손바닥이 서로 마주 보게 잡습니다. 손목을 곧게 두고 팔꿈치를 굽히며, 어깨를 앞으로 들어 덤벨을 올리지 않습니다.',
    'db-calf':'한 손으로 고정 지지대를 잡고 반대 손에 덤벨을 듭니다. 안정된 평평한 바닥에서 시작하고 양발 또는 한발 방식을 세팅 메모에 기록합니다. 발목을 곧게 편다는 느낌으로 뒤꿈치를 올립니다.',
    'cable-fly':'두 풀리를 가슴 부근 높이에 맞추고 양 손잡이를 잡아 한 발을 앞으로 둡니다. 팔꿈치를 살짝 굽힌 채 위팔을 가슴 앞으로 모읍니다. 벤치나 특수 손잡이가 반드시 필요한 운동은 아닙니다.',
    'cable-rear':'두 풀리를 어깨 부근 높이에 맞춰 반대쪽 손잡이를 교차해 잡습니다. 가볍게 시작해 팔꿈치 각도를 거의 유지하며 위팔을 옆·뒤로 벌립니다. 케이블이 얼굴이나 목을 스치지 않는 위치를 고릅니다.',
    'cable-pushdown':'풀리를 높게 두고 바 또는 로프 손잡이를 잡습니다. 팔꿈치를 몸 옆에 두고 팔꿈치를 펴 아래로 누릅니다. 어깨를 앞으로 덮쳐 몸무게로 누르지 않습니다.',
    'cable-overhead':'사용 가능한 로프·손잡이와 풀리 높이를 먼저 맞추고 케이블에 등을 둔 채 팔을 머리 위에 놓습니다. 한 발을 앞으로 두고 갈비뼈를 내린 상태에서 팔꿈치를 폅니다.',
    'cable-crunch':'높은 풀리에 연결한 로프 또는 편안한 손잡이를 잡고 무릎을 꿇습니다. 손은 머리 옆에 고정하고 갈비뼈를 골반 쪽으로 가까이하며 복부를 말아 줍니다. 엉덩이만 뒤로 접지 않습니다.',
    'cable-facepull':'풀리를 눈 부근 높이에 두고 로프를 잡습니다. 가벼운 무게에서 로프를 얼굴 양옆으로 벌려 당기며 목을 앞으로 내밀지 않습니다. 손목·어깨가 불편하면 당기는 높이를 조절합니다.',
    'tbar-available':'현장 T바 로우의 가슴 패드·발판 유무를 먼저 확인합니다. 패드가 있으면 가슴을 지지하고, 없으면 고관절을 접어 몸통을 고정한 뒤 손잡이를 당깁니다. 레버·레일 구조와 중량 기준을 메모하세요.',
    'barbell-rdl':'바벨 표기 중량과 원판 합계를 확인하고 발을 골반 너비 부근에 둡니다. 무릎을 약간 굽힌 채 엉덩이를 뒤로 보내고 바를 다리 가까이 내립니다. 바닥에 닿는 것이 목표가 아닙니다.',
    'barbell-squat':'랙 높이와 안전바를 먼저 맞춥니다. 바벨을 목뼈가 아닌 등 위 근육에 받치고 양발로 지지한 뒤 무릎·고관절을 함께 굽힙니다. 가벼운 부하에서 안전바까지 복귀하는 방법을 확인합니다.'
  };
  const accessories=window.ALLDAY_ACCESSORY_ROWS.map(({id,title,template,brand,photo,reported})=>{
    const base=window.EXERCISE_LIBRARY.find(e=>e.name===template);if(!base)throw new Error('Missing accessory template: '+template);
    const e=JSON.parse(JSON.stringify(base)),c=window.ExerciseCoaching.get(e),setup=accessorySetup[id];
    if(id==='cable-fly')e.rom='팔을 몸 옆에서 가슴 앞으로 모았다가 통제하며 돌아옵니다. 손을 강제로 교차하거나 어깨를 뒤로 과하게 벌리지 않습니다.';
    if(id==='cable-overhead')e.grip='사용 가능한 로프 또는 케이블 손잡이를 안정적으로 잡고 손목을 편안하게 유지합니다.';
    const position=id==='cable-rear'?'갈비뼈와 골반을 정렬하고 팔꿈치를 약간 굽힙니다. 몸통을 돌리지 않고 위팔을 벌리며 견갑골이 자연스럽게 움직이게 합니다. 팔꿈치를 굽혀 로우로 바꾸지 않습니다.':id==='db-calf'?'몸을 지지대에 매달리지 않고 발바닥으로 지지합니다. 무릎 각도를 일정하게 두고 발목이 안팎으로 무너지지 않게 뒤꿈치를 올립니다.':c.position;
    return {...e,id,name:'올데이 감일 · '+title,displayName:title,brand,gym:'allday-gamil',status:reported?'reported':'confirmed',loadType:'normal',aka:[],alt:[],archived:false,
      source:reported?{type:'reported',date:'2026-10-18',title:'사용자 보유 확인 · 덤벨 / T바 로우 / 케이블'}:{type:'photo',date:'2026-10-17',title:'바벨 랙·플랫폼 현장 사진',file:photo},
      searchTerms:title,equipmentNote:reported?'사용자가 보유를 확인한 장비로 수행하는 운동입니다. 제조사·손잡이 종류·풀리 배율은 미확인입니다.':'IMG_5807의 랙·바벨을 사용하는 운동입니다. 스미스 머신으로 분류하지 않습니다.',
      recordingNote:'새 짐 전용 기록입니다. 덤벨 한 손 중량·바벨 총중량·핀 표시값 등 입력 기준을 기구 세팅에 기록하세요. 기구가 바뀌면 이전 kg을 직접 환산하지 않습니다.',
      setup,tip:setup,grip:brand==='덤벨'?'덤벨 손잡이를 엄지까지 감싸 잡고 손목을 전완과 정렬합니다.':e.grip,
      coaching:{...c,position,steps:[setup,position+' '+c.feel,'부하를 천천히 되돌립니다. '+e.rom],variant:[]}
    };
  });
  const available=[...confirmed,...accessories],entries=[...available,...drafts];
  const notes=[
    {title:'뉴텍 어드져스 폴리',status:'planned',source:sources.september,note:'블로그 표기 그대로 수록했습니다. 정확한 모델과 손잡이 구성을 확인한 뒤 실제 수행할 케이블 운동을 선택하세요.'},
    {title:'싸이벡스 하체 3종',status:'planned',source:sources.cybex,note:'본문에 개별 기구명이 없어 종목을 추정하지 않았습니다. 현장에서 3종의 이름·모델 확인이 필요합니다.'},
    {title:'파워플레이트',status:'arrived',source:sources.powerplate,note:'기구 도입 안내만 수록했습니다. 일반적인 중량·반복 운동 한 종목으로 추가하지 않습니다.'}
  ];
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const G=window.GymInventory={entries,confirmed,accessories,available,stations:window.ALLDAY_STATIONS,drafts,notes,sources,labels,catalog:'allday-gamil',status:'all',
    library(){return this.catalog==='allday-gamil'?available:this.catalog==='allday-gamil-draft'?drafts:(window.EXERCISE_LIBRARY||[]).filter(e=>!e.archived);},
    find(name){return entries.find(e=>e.name===name);},
    catalogFor(name){const e=this.find(name);return !e?'general':drafts.includes(e)?'allday-gamil-draft':'allday-gamil';},
    badge(e){return e.gym?'<span class="gym-status '+e.status+'">'+labels[e.status]+'</span>':'';},
    sourceHTML(e){
      if(e.source.type==='reported')return '<div class="lib-r gym-source"><span class="lib-l">확인 근거</span><span>'+esc(e.source.title)+' · '+esc(e.source.date)+'</span></div>';
      if(e.source.type==='photo')return '<div class="lib-r gym-source"><span class="lib-l">확인 근거</span><span>'+esc(e.source.title)+' · '+esc(e.source.date)+'<br>'+esc(e.source.file)+'</span></div>';
      return '<div class="lib-r gym-source"><span class="lib-l">출처</span><span><a href="'+e.source.url+'" target="_blank" rel="noopener noreferrer">공식 블로그 · '+e.source.date+' ↗</a><br>'+e.source.title+'</span></div>';
    },
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
      const active=this.catalog!=='general',draft=this.catalog==='allday-gamil-draft';
      document.querySelector('#library-catalog').value=this.catalog;
      document.querySelector('#gym-photo-info').hidden=this.catalog!=='allday-gamil';
      document.querySelector('#gym-draft-info').hidden=!draft;
      document.querySelector('#gym-status-field').hidden=!draft;
      document.querySelector('#gym-status-filter').value=this.status;
      document.querySelector('#library-scope').value=InterfaceTools.filter;
      const brands=active?[...new Set(this.library().map(e=>e.brand))]:['Hammer','Watson','Nautilus','Booty Builder','덤벨','바벨','케이블'];
      const select=document.querySelector('#library-equipment');
      select.replaceChildren(new Option('전체','all'),...brands.map(n=>new Option(n,n)));
      select.value=InterfaceTools.equipment;
    },
    mount(){
      const filters=document.querySelector('.library-filters');
      const field=document.createElement('label');field.className='library-catalog-field';field.textContent='도감 선택';
      const select=document.createElement('select');select.id='library-catalog';select.append(new Option('올데이 · 현재 기구와 운동','allday-gamil'),new Option('일반 운동 도감','general'),new Option('올데이 · 이전 블로그 초안','allday-gamil-draft'));select.onchange=()=>this.select(select.value);field.append(select);filters.prepend(field);
      const status=document.createElement('label');status.id='gym-status-field';status.textContent='블로그 확인 상태';
      const statusSelect=document.createElement('select');statusSelect.id='gym-status-filter';statusSelect.append(new Option('전체 상태','all'),...['arrived','introduced','planned'].map(k=>new Option(labels[k],k)));statusSelect.onchange=()=>{this.status=statusSelect.value;LibApp.render();};status.append(statusSelect);filters.append(status);
      const photoInfo=document.createElement('details');photoInfo.id='gym-photo-info';photoInfo.className='gym-draft-info';photoInfo.setAttribute('aria-label','사진으로 확인한 올데이 기구');
      photoInfo.innerHTML='<summary>올데이 · 현재 운동 '+available.length+'개 <span>기구 안내</span></summary><p>현장 사진 <b>45장</b>과 보유 확인한 덤벨·T바 로우·케이블을 반영했어요. 몸 위치·근육의 작용·수행 순서·실수 교정을 카드에서 확인하세요.</p><details><summary>기구 구분과 기록 기준</summary><p>기구 44종과 랙 1곳을 확인했어요. 이너·아웃타이 2대는 각각 내전/외전 운동을 나눴고, 덤벨·케이블·바벨 보조 운동 '+accessories.length+'개를 포함했어요. 사진 확인과 사용자 보유 확인은 배지로 구분합니다.</p><p>새 기구의 kg은 이전 짐 기록과 비교하지 않아요. 좌석·그립·원판 입력 기준을 기구 세팅에 남기세요. T바 로우는 브랜드·가슴 패드 유무를 현장에서 확인해 주세요.</p></details>';
      filters.closest('.library-filter-panel').after(photoInfo);
      const info=document.createElement('section');info.id='gym-draft-info';info.className='gym-draft-info';info.setAttribute('aria-label','올데이 감일본점 기구 초안 안내');
      info.innerHTML='<h3>올데이 감일본점 · 기구 초안</h3><p>이름이 확인된 기구 10개 · 그중 2개는 입고 완료 글 확인. 2024–2025년 공식 블로그를 바탕으로 정리했으며 <b>현재 설치 여부·정확한 모델은 현장 확인이 필요합니다.</b> 전체 보유 기구 목록은 아닙니다.</p><p>추가하면 <b>올데이 감일 · 기구명</b>으로 기록됩니다. 기존 짐의 중량·세팅과 구분하며, 현재 루틴은 직접 추가할 때만 바뀝니다.</p><details class="gym-notes"><summary>종목으로 추가하지 않은 기구 안내 3건</summary>'+notes.map(n=>'<article><h4>'+n.title+'</h4><span class="gym-status '+n.status+'">'+labels[n.status]+'</span><p>'+n.note+'</p>'+this.sourceHTML(n)+'</article>').join('')+'</details>';
      filters.after(info);this.refresh();
    }
  };
})();
