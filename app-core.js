
if(typeof window.EXERCISE_LIBRARY==='undefined')window.EXERCISE_LIBRARY=[];
if(typeof window.EXERCISE_CATS==='undefined')window.EXERCISE_CATS={};
/* ── Storage shim: Claude artifact → window.storage, 브라우저 직접 → localStorage ── */
if(!window.storage||typeof window.storage.get!=='function'){
  window.storage={
    get:async(k)=>{const v=localStorage.getItem(k);return v!=null?{key:k,value:v}:null;},
    set:async(k,v)=>{localStorage.setItem(k,String(v));return{key:k,value:v};},
    delete:async(k)=>{localStorage.removeItem(k);return{key:k,deleted:true};},
    list:async(prefix='')=>{const keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix));return{keys};}
  };
}
// 영속 저장 요청: 승인되면 저장공간 부족 시 브라우저가 이 사이트 데이터를 자동 정리(eviction)하는 대상에서 제외된다.
// PWA 설치 여부와 무관한 1회성 보험 — 미지원 브라우저는 조용히 무시.
try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});}catch(_){}

// 패널 자동 선택은 ExLog.init에서 순환 타입 기준으로 수행 (요일 고정제 제거)


// ── 로컬 날짜 헬퍼: toISOString()은 UTC라 시간대에 따라 하루 어긋남 → 벽시계(로컬) 날짜로 통일 ──
function _localKey(d){const t=new Date(d);t.setMinutes(t.getMinutes()-t.getTimezoneOffset());return t.toISOString().slice(0,10);}
function _todayKey(){return _localKey(new Date());}
function _isWorkSet(s){return !!s&&s.reps>0&&!s.warmup;} // '본세트' 판정 — 워밍업 세트는 모든 볼륨·PR·추세 집계에서 제외하는 공통 기준
// 추정 1RM — 10회까지는 Epley(1+r/30), 10회를 넘으면 기울기를 절반으로 감쇠한다.
// Epley는 고반복에서 1RM을 크게 과대추정한다(15회 ×1.50, 20회 ×1.67). 12~15회로 하는
// 래터럴·펙덱·어브덕션이 실제보다 강해 보였고, '무게는 그대로인데 반복만 늘린 날'이
// 증량한 날처럼 잡혀 정체 판정이 늦어졌다. 10회에서 값·기울기가 이어지므로 기존 기록과 단절이 없다.
function _e1Of(w,r){r=+r||0;return w*(r<=10?(1+r/30):(1+10/30+(r-10)/60));}
// 세트의 '실부하'. 어시스트(체중−보조)·체중(체중+추가) 종목은 저장 시 계산해 둔 ew를 쓰고,
// ew가 없으면(일반 종목·구버전 기록) 표기 중량 그대로. e1RM·PR·추세·볼륨은 전부 이 값을 본다.
function _ldW(s){if(s?.unit&&s.unit!=='reps')return 0;return Number.isFinite(s?.ew)?s.ew:(+s?.weight||0);}
// ── 부하 유형 ───────────────────────────────────────────────────────────────
// 지금까지 앱은 '표기 중량 = 부하'라는 가정 하나로 돌았다. 어시스트 머신은 표기가 낮을수록
// 부하가 크고, 체중·시간 종목은 표기에 부하가 아예 안 잡힌다. 유형을 나눠 실부하를 계산한다.
const LOAD_LBL={normal:'일반',assist:'어시스트',bw:'체중',time:'시간',distance:'거리'};
const LOAD_DESC={
  normal:'표기 중량이 곧 부하 — 늘리는 것이 증량',
  assist:'표기값은 보조 중량 — 실부하 = 체중 − 보조, 줄이는 것이 증량',
  bw:'부하는 체중 — 표기는 벨트 등 추가 중량, 실부하 = 체중 + 추가',
  time:'반복 칸에 초를 기록 — 실부하 = 체중 + 추가, 진행은 시간'
};
function _loadGuess(n){
  const declared=window.GymInventory?.find(n)?.loadType;
  if(declared)return declared;
  if(/파머스 워크/.test(n))return 'distance';
  n=n||'';
  if(/플랭크|데드행/.test(n))return 'time';
  if(/어시스트|assist/i.test(n))return 'assist';   // '풀업 (체중/어시스트)'도 여기 — 보조 0을 넣으면 맨몸과 동일하게 계산된다
  if(/풀업|친업|턱걸이|맨몸|푸시업|딥스(?!\s*머신)/.test(n))return 'bw';
  return 'normal';
}
// HTML 이스케이프 — 운동명 등 데이터가 innerHTML/onclick에 들어갈 때 마크업 파손·주입 방지 (입력단 필터의 2차 방어선)
function _esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function _escJs(s){return _esc(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"));} // onclick 속성 안 JS 문자열용: JS 이스케이프 후 HTML 이스케이프
// ── 운동 배치 규칙 ──
// 부위 세션 순서: 큰 근육·프라임무버 먼저 → 팔·측면삼각·종아리 등 보조근 뒤 → 코어 맨 뒤 (복합 수행/복압 보호로 볼륨 보존)
// 유효 부위 버킷 — 도감의 vol.p는 카테고리 편의상 페이스풀·리어델트를 '등'에 묶어 놨다.
// 그대로 쓰면 ① 세션 순서에서 후면삼각 마무리 종목이 가슴보다 앞으로 튀어나오고
// ② 주간 볼륨에서 후면삼각 9세트가 통째로 '등'으로 계상돼 등이 과다로, 후면삼각이 0으로 보인다.
// 순서와 집계 양쪽에서 이 함수를 통과시킨다.
// ── 장비 브랜드 ─────────────────────────────────────────────────────────────
// 같은 동작이라도 캠 곡선·마찰이 달라 같은 표기 중량의 체감이 다르다. 기록을 브랜드별로 분리해야
// 자동 목표(+2.5kg 도전)와 정체 판정이 뒤섞이지 않는다.
function _brandOf(n){
  n=n||'';
  if(/hammer|해머/i.test(n)&&!/해머\s*컬|hammer\s*curl/i.test(n))return 'hammer'; // '해머 컬'은 그립 이름이라 제외
  if(/watson|왓슨/i.test(n))return 'watson';
  if(/nautilus|노틸러스/i.test(n))return 'nautilus';
  return null;
}
const BRAND_LBL={hammer:'해머',watson:'왓슨',nautilus:'노틸러스'};
// 같은 동작의 대체 기구 후보. 운동 기록·중량·자동 목표를 연결하거나 환산하지 않는다.
const VARIANT_GROUP=[
  ['Hammer ISO-인클라인 프레스','Watson 인클라인 프레스 머신'],
  ['Hammer ISO-디클라인 프레스','Watson 디클라인 프레스 머신'],
  ['Hammer ISO-프론트 풀다운','Watson 프론트 풀다운 (오버그립)','Watson 프론트 풀다운 (언더그립)','Nautilus 랫풀다운','랫풀다운'],
  ['Hammer ISO-숄더 프레스','Watson 숄더 프레스','머신 숄더 프레스'],
  ['Hammer ISO-레그 익스텐션','Nautilus 레그 익스텐션','레그 익스텐션'],
  ['Hammer ISO-레그컬','Nautilus 라잉 레그컬','라잉 레그컬','레그컬'],
  ['Hammer 슈퍼 플라이','Nautilus 펙덱 플라이','펙덱 플라이'],
  ['Watson 45도 레그프레스','Nautilus 시티드 레그프레스'],
  ['힙 어브덕션 (머신)','Booty Builder 스탠딩 힙 어브덕션'],
  ['바벨 데드리프트','Nautilus 데드리프트 머신']
];
// 칩에 쓸 짧은 라벨 — 브랜드명만으로 구분이 안 되는 경우(왓슨 오버/언더)와 무브랜드 기본 기구를 위해.
const VARIANT_LBL={
  '랫풀다운':'케이블','레그 익스텐션':'기본','라잉 레그컬':'라잉','레그컬':'시티드',
  '펙덱 플라이':'기본','머신 숄더 프레스':'기본',
  'Watson 프론트 풀다운 (오버그립)':'왓슨 오버','Watson 프론트 풀다운 (언더그립)':'왓슨 언더',
  '힙 어브덕션 (머신)':'시티드','Booty Builder 스탠딩 힙 어브덕션':'스탠딩','바벨 데드리프트':'바벨'
};
function _variantLbl(n){return VARIANT_LBL[n]||BRAND_LBL[_brandOf(n)]||n;}
// ── 동작 패턴 ───────────────────────────────────────────────────────────────
// 부위 버킷은 너무 거칠다(등 36종·후면사슬 31종). 그대로 대체 후보를 뽑으면
// 랫풀다운(수직 당김)의 대체로 T바 로우(수평 당김)·밴드 외회전이 올라온다.
// 위에서부터 먼저 매칭 — 구체적인 패턴을 앞에 둔다.
const MOVE_PAT=[
  [/레그\s*익스텐션/,'무릎 신전'],
  [/레그\s*컬|노르딕|글루트햄/,'무릎 굴곡'],
  [/힙\s*(쓰러스트|익스텐션|프레스)|글루트\s*킥백|풀스루|케틀벨\s*스윙/,'고관절 신전'],
  [/어브덕션|어덕션|멀티\s*어브덕터/,'외전·내전'],
  [/데드리프트|루마니안|RDL|굿모닝|랙풀|백\s*익스텐션|하이퍼/,'힌지'],
  [/스쿼트|레그\s*프레스|런지|스텝업|핵\s|펜듈럼/,'스쿼트'],
  [/풀다운|풀업|친업|풀오버/,'수직 당김'],
  [/로우|row/i,'수평 당김'],
  [/데드행/,'행잉'],
  [/페이스풀|리어\s*델트|리버스\s*(펙덱|플라이)|외회전|벤트오버\s*래터럴/,'후면삼각·외회전'],
  [/래터럴\s*레이즈|사이드\s*래터럴|업라이트\s*로우/,'측면삼각'],
  [/숄더\s*프레스|오버헤드\s*프레스|밀리터리|아놀드/,'수직 프레스'],
  [/인클라인(?!.*(케이블|덤벨\s*컬|리어))/,'인클라인 프레스'],
  [/디클라인|딥스/,'디클라인 프레스'],
  [/플라이|펙덱|크로스오버/,'플라이'],
  [/벤치프레스|체스트\s*프레스|호라이즌털|푸시업/,'수평 프레스'],
  [/컬/,'컬'],
  [/트라이셉스.*익스텐션|푸시다운|트라이셉스\s*킥백/,'삼두 신전'],
  [/크런치|레그레이즈|플랭크|롤아웃|우드찹|사이드밴드|압도미널/,'코어'],
  [/카프|종아리/,'종아리']
];
function _movePat(n){
  const declared=window.GymInventory?.find(n)?.movementPattern;
  if(declared)return declared;
  n=n||'';
  for(const [re,lbl] of MOVE_PAT)if(re.test(n))return lbl;
  return null;
}
function _variantsOf(name){
  for(const g of VARIANT_GROUP)if(g.includes(name))return g.filter(x=>x!==name);
  return [];
}
function _variantGroupOf(name){ // 자기 자신을 포함한 전체 그룹 (브랜드 칩 렌더링용)
  for(const g of VARIANT_GROUP)if(g.includes(name))return g;
  return [];
}
const EFF_BUCKET_RE=[[/페이스풀|리어\s*델트|리버스\s*펙덱|벤트오버\s*래터럴/,'후면삼각']];
function _effBucket(name,volBucket){
  for(const [re,b] of EFF_BUCKET_RE)if(re.test(name))return b;
  return volBucket;
}
// 고립(isolation) 종목 판정 — 같은 부위 안에서 복합보다 뒤로 보냄
const ISO_RE=/플라이|펙덱|크로스오버|레이즈|레그\s*레이즈|컬|익스텐션|푸시다운|킥\s*백|킥백|스컬|크런치|플랭크|풀오버|스트레이트\s*암|카프|종아리|슈러그|페이스풀|리스트|어브덕션|어덕션|우드촙|트위스트|롤아웃|데드버그|버드독|할로우|팔로프|V업/;
// 기구 부하 tier: 같은 부위·같은 복합 안에서 주력(무거운) 동작을 먼저. 바벨·플레이트/핀 머신=주력(0), 케이블(1), 덤벨(2), 체중·밴드(3).
function _equipRank(n){
  if(/체중|맨몸|밴드|어시스트|assist/i.test(n))return 3;
  if(/덤벨|dumbbell|\bdb\b/i.test(n))return 2;
  if(/케이블|cable/i.test(n))return 1;
  return 0; // 바벨·해머·왓슨·V스쿼트·레그프레스 등 플레이트/핀 머신 = 주력 최대부하
}
// 보완 추천: 각 날 담당 부위 + 부위별 주간 세트 목표(앱 기준: 권장 10~20, PRI 10 / 중간 8 / 소·보조 6)
const RECO_CAT={push:['가슴','측면삼각','전면삼각','후면삼각','삼두'],pull:['등','이두','승모'],legs:['대퇴사두','후면사슬','코어','종아리']};
// 주간 부위 목표는 현재 선택한 훈련 계획에서 계산합니다.
const RECO_TARGET_PRI={'측면삼각':1,'등':1,'가슴':1,'대퇴사두':1};
const RECO_TARGET=TRAINING_PLAN.targets(_todayKey());
// ── ExLog: 운동+기록 통합 ──
const DAY_COLORS_EL={"Push A":"#D85A30","Push B":"#BA7517","Pull A":"#185FA5","Pull B":"#0C447C","Legs A":"#3B6D11","Legs B":"#27500A",Push:"#D85A30","Push+":"#BA7517",Pull:"#185FA5","Pull+":"#0C447C",Legs:"#3B6D11","Legs+":"#27500A",REST:"#888780"};
const EL_DAY_EX=TRAINING_PLAN.exercises;
const EL_CYCLE=TRAINING_PLAN.cycle;
const EL_BASE={'Push':'Push A','Pull':'Pull A','Legs':'Legs A','Push+':'Push B','Pull+':'Pull B','Legs+':'Legs B'}; // 구버전(3세션 순환·옛 6일제) 기록을 신 A/B 타입으로 흡수
const EL_GROUP=t=>/^Push/.test(t)?'push':/^Pull/.test(t)?'pull':'legs'; // 타입→부위 그룹 (A/B 공통)


