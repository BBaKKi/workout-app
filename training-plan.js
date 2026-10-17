/* 루틴·반복 범위·복귀 단계의 단일 설정. 기존 기록의 종목명과 중량은 변경하지 않습니다. */
(function(){
 const cycle=['Push A','Pull A','Legs A','Push B','Pull B','Legs B'];
 const equipmentDate='2026-10-18';
 const station=id=>{const e=window.GymInventory.available.find(e=>e.id===id);if(!e)throw new Error('Missing routine equipment: '+id);return e.name;};
 const stations={
  'Push A':[['hammer-incline',3,8,12],['technogym-pure-chest-press',2,8,12],['db-lateral',3,12,20],['cable-pushdown',2,10,15]],
  'Pull A':[['panatta-circular-lat',3,8,12],['cybex-eagle-nx-row',3,8,12],['cable-rear',2,12,20],['db-curl',2,10,15]],
  'Legs A':[['cybex-hack',3,8,12],['lexco-masterpro-curl',3,10,15],['forward-leg-extension',2,10,15],['db-calf',2,12,20],['cable-crunch',2,10,15]],
  'Push B':[['nautilus-nitro-overhead-press',2,8,12],['hammer-horizontal',3,8,12],['db-lateral',3,12,20],['decline-chest-fly',2,12,15],['cable-overhead',2,10,15]],
  'Pull B':[['hammer-iso-high-row',3,8,12],['gym80-pullover',2,10,15],['cable-rear',2,12,20],['db-hammer',2,10,15]],
  'Legs B':[['barbell-rdl',3,8,12],['cybex-45-legpress',3,10,15],['forward-leg-extension',2,10,15],['lexco-masterpro-curl',2,10,15],['db-calf',2,12,20],['cable-crunch',2,10,15]]
 };
 const items=Object.fromEntries(cycle.map(d=>[d,stations[d].map(([id,...v])=>[station(id),...v])]));
 const focus={'Push A':'상부 가슴 → 측면 어깨','Pull A':'풀다운 → 가슴 지지 로우','Legs A':'핵 스쿼트 → 허벅지 앞·뒤','Push B':'어깨 프레스 → 가슴','Pull B':'하이 로우 → 풀오버','Legs B':'힙힌지 → 레그프레스·둔근'};
 const lib=window.EXERCISE_LIBRARY||[];
 const canonical=n=>{const e=lib.find(e=>e.name===n)||lib.find(e=>(e.aka||[]).includes(n));return e?e.name:n;};
 // The declared day sequence is the training order; library priority is only explanatory.
 const makeDefaults=rows=>Object.fromEntries(cycle.map(day=>[day,Object.fromEntries(rows[day].map(x=>[x[0],{sets:x[1],min:x[2],max:x[3]}]))]));
 const defaults=makeDefaults(items);
 const config={start:'2026-10-12',end:'2026-12-31',weightMin:83.5,weightMax:84.5};
 try{const c=JSON.parse(localStorage.getItem('training_config_v1')||'null');if(c&&/^\d{4}-\d{2}-\d{2}$/.test(c.start)&&/^\d{4}-\d{2}-\d{2}$/.test(c.end)&&c.end>c.start&&Number.isFinite(c.weightMin)&&Number.isFinite(c.weightMax)&&c.weightMin>=20&&c.weightMax<=300&&c.weightMax>c.weightMin)Object.assign(config,c);}catch(_){}
 const offset=d=>Math.floor((Date.parse(d+'T12:00:00Z')-Date.parse((config.start>equipmentDate?config.start:equipmentDate)+'T12:00:00Z'))/864e5);
 const P=window.TRAINING_PLAN={version:'2026-10-18.allday-only',config,mode:'current',items,defaults,focus,equipmentDate,cycle,
  storageKey:'plan_v3',start:config.start,end:config.end,
  exercises:Object.fromEntries(cycle.map(d=>[d,items[d].map(x=>x[0])])),
  exercisesFor(day,date){return date<equipmentDate?[]:(items[day]||[]).map(x=>x[0]);},
  defaultsFor(day){return defaults[day];},
  phase(date){const day=offset(date);
   if(day<0)return {key:'before',label:'계획 시작 전',repsLeft:3,limited:false};
   if(date>config.end)return {key:'finished',label:'계획 종료 · 다음 목표 점검',repsLeft:2,limited:false};
   if(day<7)return {key:'return',label:'기구 적응 1주 · 웨이트 4회',repsLeft:3,limited:true};
   if(day<14)return {key:'adapt',label:'기구 적응 2주 · 회복에 따라 5–6회',repsLeft:3,limited:true};
   if((Date.parse(config.end)-Date.parse(date))/864e5<11)return {key:'maintain',label:'마무리 점검 · 회복에 맞춰 유지',repsLeft:2,limited:false};
   return {key:'build',label:'기본 루틴 · 주 6회',repsLeft:2,limited:false};},
  prescription(name,day,date){if(date<equipmentDate)return null;const cn=canonical(name);
   const rows=items;
   const all=Object.values(rows).flat(), row=(rows[day]||[]).find(x=>canonical(x[0])===cn)||all.find(x=>canonical(x[0])===cn);
   if(!row)return null;const ph=this.phase(date);return {sets:ph.limited?2:row[1],min:row[2],max:row[3],baseSets:row[1],rir:ph.repsLeft};},
  schedule(date){const dow=new Date(date+'T12:00:00').getDay();
   if(offset(date)>=0&&offset(date)<7)return ['휴식','Push A','Pull A','걷기','Legs A','걷기','Push B'][dow];
   return ['휴식','Push A','Pull A','Legs A','Push B','Pull B','Legs B'][dow];},
  targets(date){
   const v={};
   for(const [day,rows] of Object.entries(items))for(const [name] of rows){const count=this.prescription(name,day,date)?.sets||0,key=window.GymInventory.find(name).vol.p;v[key]=(v[key]||0)+count;}
   return v;
  }
 };
})();
