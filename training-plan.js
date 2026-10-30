/* 순환 루틴·반복 범위·연말 목표. 기존 기록과 날짜별 계획은 변경하지 않습니다. */
(function(){
 const cycle=['Push A','Pull A','Legs A','Push B','Pull B','Legs B'];
 const equipmentDate='2026-10-18';
 const station=id=>{const e=window.GymInventory.available.find(e=>e.id===id);if(!e)throw new Error('Missing routine equipment: '+id);return e.name;};
 const stations={
  'Push A':[['hammer-incline',3,8,12],['standing-lateral-raise-machine',3,12,20],['technogym-pure-chest-press',2,8,12],['cable-pushdown',2,10,15]],
  'Pull A':[['panatta-circular-lat',3,8,12],['cybex-eagle-nx-row',3,8,12],['rear-delt-fly-machine',3,12,20],['db-curl',2,10,15]],
  'Legs A':[['cybex-hack',3,8,12],['lexco-masterpro-curl',3,10,15],['forward-leg-extension',3,10,15],['cable-crunch',1,10,15]],
  'Push B':[['nautilus-nitro-overhead-press',2,8,12],['db-lateral',3,12,20],['hammer-horizontal',2,8,12],['pec-deck-fly',2,12,15],['cable-overhead',2,10,15]],
  'Pull B':[['hammer-iso-high-row',3,8,12],['gym80-pullover',2,10,15],['cable-rear',3,12,20],['db-hammer',2,10,15]],
  'Legs B':[['cybex-45-legpress',3,10,15],['lexco-masterpro-curl',3,10,15],['booty-hip-thrust',2,10,15],['forward-leg-extension',3,10,15],['cable-crunch',1,10,15]]
 };
 const items=Object.fromEntries(cycle.map(d=>[d,stations[d].map(([id,...v])=>[station(id),...v])]));
 const focus={'Push A':'어깨 움직임 · 가슴·측면 어깨','Pull A':'가슴 지지 로우 · 후면 어깨','Legs A':'허벅지 앞·뒤 · 시티드 컬','Push B':'어깨 움직임 · 프레스','Pull B':'등 · 후면 어깨','Legs B':'허벅지·둔근 · 그립 부담 분산'};
 const lib=window.EXERCISE_LIBRARY||[];
 const canonical=n=>{const e=lib.find(e=>e.name===n)||lib.find(e=>(e.aka||[]).includes(n));return e?e.name:n;};
 // The declared day sequence is the training order; library priority is only explanatory.
 const makeDefaults=rows=>Object.fromEntries(cycle.map(day=>[day,Object.fromEntries(rows[day].map(x=>[x[0],{sets:x[1],min:x[2],max:x[3]}]))]));
 const defaults=makeDefaults(items);
 const config={start:'2026-10-12',end:'2026-12-31',weightMin:83.5,weightMax:84.5};
 try{const c=JSON.parse(localStorage.getItem('training_config_v1')||'null');if(c&&/^\d{4}-\d{2}-\d{2}$/.test(c.start)&&/^\d{4}-\d{2}-\d{2}$/.test(c.end)&&c.end>c.start&&Number.isFinite(c.weightMin)&&Number.isFinite(c.weightMax)&&c.weightMin>=20&&c.weightMax<=300&&c.weightMax>c.weightMin)Object.assign(config,c);}catch(_){}
 // Old weight bounds remain transport-compatible but no longer drive goals or pass/fail.
 const previousSlots={
  'Push A':{[station('standing-lateral-raise-machine')]:station('db-lateral')},
  'Pull A':{[station('rear-delt-fly-machine')]:station('cable-rear')},
  'Push B':{[station('pec-deck-fly')]:station('decline-chest-fly')},
  'Legs B':{[station('booty-hip-thrust')]:station('barbell-rdl')}
 };
 const P=window.TRAINING_PLAN={version:'2026-10-30.original-goals',config,goals:{wt:84,sm:38,bf:20,ab:0.90},mode:'current',items,defaults,focus,equipmentDate,cycle,
  storageKey:'plan_v3',start:config.start,end:config.end,
  exercises:Object.fromEntries(cycle.map(d=>[d,items[d].map(x=>x[0])])),
  exercisesFor(day,date){return date<equipmentDate?[]:(items[day]||[]).map(x=>x[0]);},
  defaultsFor(day){return defaults[day];},
  cardio:{sessions:3,min:20,max:25},
  preparation(day){return /^Legs/.test(day)?[
   ['준비 세트','첫 하체 종목은 가벼운 중량부터 필요한 만큼 올립니다. 준비 세트는 W로 표시하고 본세트와 구분하세요.'],
   ['시티드 레그컬','무릎 옆을 회전축에 맞추고 허벅지 패드·등받이로 몸을 고정합니다. 발목은 편안한 각도를 유지하고, 종아리가 먼저 지치면 중량과 롤러 위치를 다시 맞추세요.'],
   ['그립이 먼저 풀리면','기본 Legs B는 시티드 컬과 힙 쓰러스트로 허벅지 뒤·둔근을 나누어 훈련합니다. 힙 쓰러스트는 RDL과 같은 햄스트링 운동이 아닙니다. RDL을 선택했다면 스트랩 체결·유격을 먼저 점검하고 그립 한계로 증량을 강행하지 마세요.']
  ]:[
   ['주 2–3회 · 약 5분','상체 운동 전 아래 두 동작을 맨손이나 아주 가볍게 연습합니다. 4회 이상 더 할 여유를 남기고 본운동 전에 지치지 않게 하세요. 본세트와 별도로 진행하는 준비동작입니다.'],
   ['전완 월슬라이드 · 2×8–12','전완을 어깨너비로 벽에 대고 가볍게 밀며 위로 미끄러뜨립니다. 갈비뼈·허리가 들리지 않는 높이까지만 올리세요. 날개뼈가 갈비뼈를 따라 위로 돌게 두고 뒤·아래로 묶지 않습니다.'],
   ['가슴 지지 Y 레이즈 · 2×10–12','인클라인 벤치에 가슴을 대고 엄지를 위로 향한 채 팔을 Y자로 뻗습니다. 가슴 지지를 유지한 범위에서 작게 들고, 턱·허리가 들리면 팔 높이나 부하를 낮추세요.'],
   ['본운동','첫 프레스·로우는 별도 준비 세트로 중량을 올립니다. 가슴 지지 로우는 팔을 보낼 때 견갑골도 자연스럽게 움직이고, 프레스는 팔이 올라갈 때 견갑골의 위쪽 회전을 허용합니다.']
  ];},
  cardioHint(day){return (/^Legs/.test(day)?'하체 날은 웨이트 우선. 추가 유산소는 필수가 아니며 가벼운 걷기 정도로 마칩니다. ':'상체 운동 후 주 '+this.cardio.sessions+'회, 회당 '+this.cardio.min+'–'+this.cardio.max+'분부터 시작하세요. ')+
   '문장으로 대화 가능한 강도. 걷기는 경사 0–3%부터 조절하고, 종아리가 먼저 지치면 경사를 낮추거나 낮은 저항의 자전거로 바꾸세요.';},
  previousSlot(day,name){return previousSlots[day]?.[name];},
  currentSlot(day,name){return Object.entries(previousSlots[day]||{}).find(([,old])=>old===name)?.[0]||name;},
  prescription(name,day,date){if(date<equipmentDate)return null;const cn=canonical(name);
   const rows=items;
   const all=Object.values(rows).flat(), row=(rows[day]||[]).find(x=>canonical(x[0])===cn)||all.find(x=>canonical(x[0])===cn);
   if(!row)return null;return {sets:row[1],min:row[2],max:row[3],baseSets:row[1],rir:2};},
  targets(date){
   const v={};
   for(const [day,rows] of Object.entries(items))for(const [name] of rows){const count=this.prescription(name,day,date)?.sets||0,key=window.GymInventory.find(name).vol.p;v[key]=(v[key]||0)+count;}
   return v;
  }
 };
})();
