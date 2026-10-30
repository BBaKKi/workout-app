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
  'Legs B':[['cybex-45-legpress',3,10,15],['barbell-rdl',2,8,12],['lexco-masterpro-curl',2,10,15],['forward-leg-extension',3,10,15],['cable-crunch',1,10,15]]
 };
 const items=Object.fromEntries(cycle.map(d=>[d,stations[d].map(([id,...v])=>[station(id),...v])]));
 const focus={'Push A':'측면 어깨 우선 · 가슴 유지','Pull A':'등 · 후면 어깨','Legs A':'허벅지 앞·뒤 · 시티드 컬','Push B':'어깨 프레스 · 측면 어깨','Pull B':'등 · 후면 어깨','Legs B':'허벅지 · 레그프레스·시티드 컬'};
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
  'Push B':{[station('pec-deck-fly')]:station('decline-chest-fly')}
 };
 const P=window.TRAINING_PLAN={version:'2026-10-30.original-goals',config,goals:{wt:84,sm:38,bf:20,ab:0.90},mode:'current',items,defaults,focus,equipmentDate,cycle,
  storageKey:'plan_v3',start:config.start,end:config.end,
  exercises:Object.fromEntries(cycle.map(d=>[d,items[d].map(x=>x[0])])),
  exercisesFor(day,date){return date<equipmentDate?[]:(items[day]||[]).map(x=>x[0]);},
  defaultsFor(day){return defaults[day];},
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
