/* 루틴·반복 범위·복귀 단계의 단일 설정. 기존 기록의 종목명과 중량은 변경하지 않습니다. */
(function(){
 const cycle=['Push A','Pull A','Legs A','Push B','Pull B','Legs B'];
 const legacyCycle=['Push A','Legs A','Pull A','Push B','Legs B','Pull B'];
 const legacy={
 'Push A':['Hammer ISO-호라이즌털 벤치프레스','딥스 머신','Nautilus 래터럴 레이즈 머신','Watson 디클라인 (isolateral)','머신 숄더 프레스','페이스풀 (케이블) ⭐필수'],
 'Pull A':['머신 로우 (체스트 서포티드)','랫풀다운','바이셉스 컬 머신','스트레이트암 풀다운','데드행'],
 'Legs A':['바벨 데드리프트','레그 익스텐션','앱 휠 롤아웃','레그컬 (머신)','힙 어브덕션 (머신)'],
 'Push B':['Hammer ISO-인클라인 프레스','케이블 래터럴 레이즈','페이스풀 (케이블) ⭐필수','인클라인 케이블 플라이','리어 델트 플라이','트라이셉스 익스텐션 머신'],
 'Pull B':['풀업 (체중/어시스트)','T-바 로우','바이셉스 컬 머신','페이스풀 (케이블) ⭐필수','데드행'],
 'Legs B':['시티드 레그프레스','루마니안 데드리프트','케이블 크런치','V스쿼트 머신','Booty Builder 힙 쓰러스트']};
 const items={
 'Push A':[['Hammer ISO-인클라인 프레스',3,8,12],['Watson 디클라인 프레스 머신',2,8,12],['Nautilus 래터럴 레이즈 머신',3,12,20],['Nautilus 펙덱 플라이',2,12,15],['트라이셉스 익스텐션 머신',2,10,15]],
 'Pull A':[['랫풀다운',3,8,12],['체스트 서포티드 로우',3,8,12],['리어 델트 플라이',3,12,20],['머신 바이셉스 컬',2,10,15]],
 'Legs A':[['V스쿼트 머신',3,8,12],['Nautilus 레그 익스텐션',2,10,15],['Nautilus 라잉 레그컬',4,10,15],['스탠딩 카프 레이즈',2,12,20],['앱 휠 롤아웃',2,6,12]],
 'Push B':[['Watson 숄더 프레스',2,8,12],['Hammer ISO-호라이즌털 벤치프레스',3,8,12],['Nautilus 래터럴 레이즈 머신',3,12,20],['Nautilus 펙덱 플라이',2,12,15],['케이블 트라이셉스 푸시다운',2,10,15]],
 'Pull B':[['Hammer ISO-하이 로우',3,8,12],['어시스트 풀업 머신',3,8,12],['리어 델트 플라이',3,12,20],['머신 바이셉스 컬',2,10,15]],
 'Legs B':[['Nautilus 라잉 레그컬',4,10,15],['Booty Builder 힙 쓰러스트',3,8,12],['Watson 45도 레그프레스',3,10,15],['Nautilus 레그 익스텐션',2,10,15],['스탠딩 카프 레이즈',2,12,20],['앱 휠 롤아웃',2,6,12]]};
 const focus={'Push A':'상부 가슴 → 측면 어깨','Pull A':'수직 당김 → 등·후면 어깨','Legs A':'허벅지 앞쪽 → 뒤쪽','Push B':'어깨 프레스 → 가슴','Pull B':'로우 → 등·후면 어깨','Legs B':'허벅지 뒤쪽 → 엉덩이'};
 let mode='current';try{mode=localStorage.getItem('routine_profile')==='legacy'?'legacy':'current';}catch(_){}
 const lib=window.EXERCISE_LIBRARY||[];
 const canonical=n=>{const e=lib.find(e=>e.name===n)||lib.find(e=>(e.aka||[]).includes(n));return e?e.name:n;};
 // Sets/reps belong to the day plan. Exercise ordering belongs to EXERCISE_LIBRARY[].weight.
 const defaults=Object.fromEntries(cycle.map(day=>[day,Object.fromEntries(items[day].map(x=>[x[0],{sets:x[1],min:x[2],max:x[3]}]))]));
 const config={start:'2026-10-12',end:'2026-12-31',weightMin:83.5,weightMax:84.5};
 try{const c=JSON.parse(localStorage.getItem('training_config_v1')||'null');if(c&&/^\d{4}-\d{2}-\d{2}$/.test(c.start)&&/^\d{4}-\d{2}-\d{2}$/.test(c.end)&&c.end>c.start&&Number.isFinite(c.weightMin)&&Number.isFinite(c.weightMax)&&c.weightMin>=20&&c.weightMax<=300&&c.weightMax>c.weightMin)Object.assign(config,c);}catch(_){}
 const offset=d=>Math.floor((Date.parse(d+'T12:00:00Z')-Date.parse(config.start+'T12:00:00Z'))/864e5);
 const P=window.TRAINING_PLAN={version:'2026-10-13.7',config,mode,items,defaults,focus,cycle:mode==='legacy'?legacyCycle:cycle,
  storageKey:mode==='legacy'?'plan_v2':'plan_v3',start:config.start,end:config.end,
  exercises:mode==='legacy'?legacy:Object.fromEntries(cycle.map(d=>[d,items[d].map(x=>x[0])])),
  phase(date){const day=offset(date);
   if(day<0)return {key:'before',label:'계획 시작 전',repsLeft:3,limited:false};
   if(date>config.end)return {key:'finished',label:'계획 종료 · 다음 목표 점검',repsLeft:2,limited:false};
   if(day<7)return {key:'return',label:'복귀 1주 · 웨이트 4회',repsLeft:3,limited:true};
   if(day<14)return {key:'adapt',label:'적응 2주 · 5–6회로 확대',repsLeft:3,limited:true};
   if((Date.parse(config.end)-Date.parse(date))/864e5<11)return {key:'maintain',label:'마무리 점검 · 회복에 맞춰 유지',repsLeft:2,limited:false};
   return {key:'build',label:'기본 루틴 · 주 6회',repsLeft:2,limited:false};},
  prescription(name,day,date){if(this.mode==='legacy')return null;const cn=canonical(name);
   const all=Object.values(items).flat(), row=(items[day]||[]).find(x=>canonical(x[0])===cn)||all.find(x=>canonical(x[0])===cn);
   if(!row)return null;const ph=this.phase(date);return {sets:ph.limited?2:row[1],min:row[2],max:row[3],baseSets:row[1],rir:ph.repsLeft};},
  schedule(date){const dow=new Date(date+'T12:00:00').getDay();
   if(offset(date)>=0&&offset(date)<7)return ['휴식','Push A','Pull A','걷기','Legs A','걷기','Push B'][dow];
   return ['휴식','Push A','Pull A','Legs A','Push B','Pull B','Legs B'][dow];},
  targets(date){const v={'가슴':12,'등':12,'측면삼각':6,'전면삼각':2,'후면삼각':6,'삼두':4,'이두':4,'대퇴사두':10,'후면사슬':11,'코어':4,'종아리':4};
   if(this.phase(date).limited)Object.keys(v).forEach(k=>v[k]=Math.max(2,Math.round(v[k]*.6)));return v;}
 };
})();
