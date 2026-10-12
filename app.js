
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
function _ldW(s){const e=+((s||{}).ew);return e>0?e:(+((s||{}).weight)||0);}
// ── 부하 유형 ───────────────────────────────────────────────────────────────
// 지금까지 앱은 '표기 중량 = 부하'라는 가정 하나로 돌았다. 어시스트 머신은 표기가 낮을수록
// 부하가 크고, 체중·시간 종목은 표기에 부하가 아예 안 잡힌다. 유형을 나눠 실부하를 계산한다.
const LOAD_LBL={normal:'일반',assist:'어시스트',bw:'체중',time:'시간'};
const LOAD_DESC={
  normal:'표기 중량이 곧 부하 — 늘리는 것이 증량',
  assist:'표기값은 보조 중량 — 실부하 = 체중 − 보조, 줄이는 것이 증량',
  bw:'부하는 체중 — 표기는 벨트 등 추가 중량, 실부하 = 체중 + 추가',
  time:'반복 칸에 초를 기록 — 실부하 = 체중 + 추가, 진행은 시간'
};
function _loadGuess(n){
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
const MUSCLE_SESSION_ORDER=['대퇴사두','후면사슬','등','가슴','전면삼각','측면삼각','후면삼각','승모','이두','삼두','전완','종아리','코어','내전근'];
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
// 사용자가 보고한 체감 서열(해머 > 왓슨·노틸러스). 실측 환산비가 잡히기 전까지 방향 안내에만 쓴다.
const BRAND_HARD={hammer:2,watson:1,nautilus:1};
const BRAND_LBL={hammer:'해머',watson:'왓슨',nautilus:'노틸러스'};
// 브랜드 체감계수 — '표기 1kg이 실제로 얼마나 무겁게 느껴지는가'의 상대값.
// 해머 1.10 = 같은 표기 중량에서 왓슨·노틸러스보다 10% 무겁게 느껴진다는 뜻(사용자 체감 보고 기준 초기값).
// 기록된 숫자는 절대 바꾸지 않는다 — 기구를 갈아탈 때 '시작 무게 제안'과 브랜드 간 비교에만 쓴다.
// 환산: 새 기구 시작 무게 = 직전 무게 × (직전 기구 계수 ÷ 새 기구 계수)
const BRAND_COEF_DEFAULT={hammer:1.10,watson:1.00,nautilus:1.00,none:1.00};
// 같은 동작의 브랜드 변형 그룹 — 자리가 차서 다른 기구를 쓸 때 시작 무게를 환산해 제안한다.
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
// 승모·종아리는 목표에서 제외 — 상부 승모는 이미 과활성이라 라운드숄더 교정과 상충하고,
// 종아리는 발달 완료로 프로그램에서 의도적으로 뺐다. 목표에 남겨두면 달성률이 영구 미달로 찍혀 신호가 죽는다.
// (볼륨 그래프에는 계속 표시되며, 기록이 있으면 값이 보인다.)
const RECO_TARGET_PRI={'측면삼각':1,'등':1,'가슴':1,'대퇴사두':1};
const RECO_TARGET=TRAINING_PLAN.targets(_todayKey());
// ── ExLog: 운동+기록 통합 ──
const DAY_COLORS_EL={"Push A":"#D85A30","Push B":"#BA7517","Pull A":"#185FA5","Pull B":"#0C447C","Legs A":"#3B6D11","Legs B":"#27500A",Push:"#D85A30","Push+":"#BA7517",Pull:"#185FA5","Pull+":"#0C447C",Legs:"#3B6D11","Legs+":"#27500A",REST:"#888780"};
const EL_DAY_EX=TRAINING_PLAN.exercises;
const EL_DAY_CORE=Object.fromEntries(TRAINING_PLAN.cycle.map(d=>[d,3]));
const EL_DAY_SS={};
const EL_CYCLE=TRAINING_PLAN.cycle;
const EL_BASE={'Push':'Push A','Pull':'Pull A','Legs':'Legs A','Push+':'Push B','Pull+':'Pull B','Legs+':'Legs B'}; // 구버전(3세션 순환·옛 6일제) 기록을 신 A/B 타입으로 흡수
const EL_GROUP=t=>/^Push/.test(t)?'push':/^Pull/.test(t)?'pull':'legs'; // 타입→부위 그룹 (A/B 공통)

// ── 종목별 고정 주의 문구 ──
// 이전의 WEEK_TARGETS(주간 목표 하드코딩 문자열)는 제거 — 목표는 suggestTarget()이 최근 기록 + 더블 프로그레션
// 규칙(+RPE 보정)으로 자동 생성하므로 매주 소스를 수동 편집할 필요가 없다.
// 여기에는 숫자와 무관해 낡지 않는 안전·수행 주의만 남기고, 자동 목표 문구 뒤에 덧붙인다.
const TARGET_NOTES={
  // ⬇ 90×8×4를 7/23부터 8/30까지 6주 유지 = 정착 조건은 이미 충족했다. 정착이 목적이 아니라 통과점이었으므로 다음 칸으로.
  '바벨 데드리프트':'⚠️ 90kg 8회×4를 6주 유지 = 정착 완료 → <b>92.5kg 6~8회로 리셋</b> · 셋업 슬랙 제거 · 오버언더 그립 좌우 교대 · 80kg 통증 이력이 있으니 첫 세션은 3세트로',
  '케이블 래터럴 레이즈':'Push B 측면삼각 담당 — 5.0에서 4주 동결이었다. 다음 칸(7.5)은 +50% 점프라 <b>한 팔씩</b>으로 실효 부하를 올리는 쪽이 맞다',
  '페이스풀 (케이블) ⭐필수':'12.5에서 5주 동결 — 원인은 앱이 스택에 없는 13.5kg를 제안하던 것. <b>15kg 15~20회</b>로 올릴 자리',
  '스트레이트암 풀다운':'견갑 하강 먼저 — 팔꿈치 굽히면 풀다운으로 변질. 20kg 6주 동결 → <b>22.5kg</b>',
  '바이셉스 컬 머신':'25↔27.5를 오가는 중 — 27.5×12를 3세트 모두 채우면 30으로 굳힌다',
  '랫풀다운':'54 → 47로 내려온 뒤 방치. 스택 단위를 다시 잡았으니 <b>50 → 54 순으로 되돌린다</b>',
  '풀업 (체중/어시스트)':'보조 70kg 4주 동결(8/25에 60을 한 세트 성공) — <b>67.5kg 10회×4</b>가 다음 목표. 숫자가 내려가야 진전이다',
  '루마니안 데드리프트':'데드와 3세션 간격 — 무게보다 햄 텐션이 기준, 허리 굽는 지점 전에서 정지',
  '레그컬 (머신)':'발목 배측굴곡(발끝 정강이 쪽) 유지 — 종아리 발달형은 비복근이 무릎 굽힘을 뺏어간다',
  '시티드 레그프레스':'Legs B 핵심 1번(26.09) — 무릎 90도 이상 깊게. 대퇴사두 목표를 8→10세트로 올렸다(26.09-b): 컷에서 가장 먼저 깎이는 부위이고 이번 블록의 병목이 근육이라 하체일에 칼로리를 몰아준다',
  '데드행':'풀 세션 마무리 고정 — 견갑 하강·척추 감압. ⚠️ <b>무게는 0으로 입력</b>(체중 종목인데 91을 넣으면 볼륨이 두 배로 잡힌다)',
};
const EX_CUES={
  'Hammer 벤치 (isolateral)':{t:'대흉근(중앙·하부), 삼두 보조',c:'견갑 후인·하강 고정, 가슴 내밀기. 가슴 중앙 높이로 밀고 정점에서 대흉근 쥐어짜기.',w:'팔꿈치 과도하게 벌리지 않기(45~60도). 어깨 앞 통증 시 손잡이 각도 조정.'},
  'Watson 인클라인 (isolateral)':{t:'대흉근 상부, 전면삼각근',c:'등판 30~45도, 쇄골 방향으로 밀며 상부 가슴에 집중.',w:'각도 45도 넘기면 어깨로 부하 이동.'},
  'Watson 디클라인 (isolateral)':{t:'대흉근 하부',c:'하부 가슴 수축 느끼며 팔꿈치 몸통 가깝게.',w:'견갑 고정, 어깨 말리지 않게.'},
  'DB 오버헤드프레스':{t:'전면·측면 삼각근, 삼두',c:'코어·둔근 조여 허리 보호. 덤벨 귀 옆에서 수직으로, 정점 팔꿈치 살짝 안 잠그기.',w:'허리 과신전 금지(갈비뼈 닫기). 어깨 충돌 시 궤도 조정.'},
  '케이블 래터럴 레이즈':{t:'측면 삼각근',c:'새끼손가락 살짝 위로, 팔꿈치 약간 굽혀 고정. 어깨 높이까지만, 천천히 내리며 장력 유지.',w:'승모로 으쓱하지 않기 — 우측 승모 과활성 주의, 가벼운 무게로 고립.'},
  '딥스 머신':{t:'대흉근 하부, 삼두',c:'가슴 타깃이면 상체 앞으로·팔꿈치 벌림, 삼두 타깃이면 상체 수직.',w:'어깨가 귀로 올라가지 않게, 과하게 깊이 내리지 않기.'},
  '오버헤드 트라이셉스 익스텐션':{t:'삼두(장두)',c:'팔꿈치 머리 옆에 고정, 신장 위치에서 장두 늘림 강조, 천천히.',w:'팔꿈치 벌어지면 효과 감소·관절 부담.'},
  '트라이셉스 익스텐션 머신':{t:'삼두',c:'팔꿈치 패드에 고정, 완전 신전 후 살짝 굽혀 장력 유지.',w:'반동 금지.'},
  '바벨 데드리프트':{t:'척추기립근, 둔근, 햄스트링, 광배',c:'오버언더 그립(우세손 오버, 매 세트 교대). 바 정강이 가까이·가슴 펴고 등 중립. 1초 정점 수축(두께) + 2~3초 천천히 내리기(너비).',w:'라운딩·락아웃 과신전 금지 — 둔근 스퀴즈+갈비뼈 다운으로 중립 마무리. 90kg 4세트 8회 정착 전 증량 금지(80kg 기립근 통증 이력). 셋업에서 슬랙 제거 필수. 오버언더 그립 시 언더 팔꿈치 완전 신전·좌우 교대.'},
  'T-바 로우':{t:'광배, 능형근, 중부 승모',c:'힙힌지 상체 45도, 배꼽 쪽으로 당기고 견갑 모으기, 정점 1초.',w:'허리 둥글지 않게 중립 유지.'},
  'Hammer ISO-호라이즌털 벤치프레스':{t:'대흉근 중부, 삼두',c:'견갑 모아 고정, 밀 때 가슴 중앙을 모은다. isolateral — 약한 쪽 기준으로 좌우 동일 중량.',w:'팔꿈치 45~75도 유지. 어깨 앞 통증 시 시트 높이 조정.'},
  'Hammer ISO-인클라인 프레스':{t:'대흉근 상부, 전면삼각',c:'가슴 위쪽이 늘었다 조이는 느낌, 손잡이 쇄골 라인 높이.',w:'허리 과아치 금지 — 엉덩이 시트 밀착.'},
  '머신 숄더 프레스':{t:'전면·측면삼각, 삼두',c:'팔꿈치 살짝 앞(스캡션 각), 정점 완전신전 직전 멈춤.',w:'허리 젖혀 밀기 금지 — 등 전체 시트 밀착.'},
  'Nautilus 래터럴 레이즈 머신':{t:'측면삼각',c:'팔꿈치로 옆을 민다는 느낌, 정점 1초. 12~15 고반복 펌프.',w:'승모 으쓱 금지 — 어깨 끌어내린 상태 유지.'},
  '펙덱 플라이':{t:'대흉근(스트레치 강조)',c:'가슴이 늘어나는 지점까지 열고, 모아서 1초 수축.',w:'어깨가 앞으로 말리지 않게 견갑 고정.'},
  '업라이트 로우':{t:'측면삼각, 승모 상부',c:'와이드 그립, 팔꿈치가 손보다 높게, 명치 높이까지만.',w:'좁은 그립·과도한 높이 = 어깨 충돌 위험.'},
  'Hammer ISO-하이 로우':{t:'광배 상부, 대원근',c:'위→아래로 당기며 팔꿈치는 골반 쪽. 신장 2~3초(너비 발달).',w:'반동 금지, 가슴 패드 밀착 유지.'},
  '바이셉스 컬 머신':{t:'이두',c:'팔꿈치 패드 고정, 정점 1초·신장 2초. MMC 집중(상체 고립 핵심 포인트).',w:'RPE 10 = 증량 신호 아님. 휴식 2분 확보가 먼저.'},
  '45도 레그프레스':{t:'대퇴사두, 둔근',c:'발판 중상단·어깨너비 = 둔근·햄 개입↑. 무릎 완전 잠금 금지. 하체 날 후 탄수 보충 OK.',w:'허리·골반이 시트에서 뜨면 ROM 줄이기.'},
  'Booty Builder 힙 쓰러스트':{t:'둔근',c:'턱 당기고 골반 후방경사, 정점 둔근 스퀴즈 1~2초.',w:'허리 신전으로 마무리 금지 — 갈비뼈 다운.'},
  'Hammer ISO 언더 로우':{t:'광배(하부), 능형근',c:'언더그립으로 광배 동원↑, 팔꿈치 몸통 가깝게 뒤로.',w:'반동·상체 흔들기 금지.'},
  '바벨 벤트오버 로우':{t:'광배, 중부 등, 후면삼각근',c:'힙힌지 45도·등 중립, 하복부로 당기고 정점 견갑 모음.',w:'허리 부담 크니 무게 욕심 금지, 코어 고정.'},
  '랫풀다운':{t:'광배(너비)',c:'가슴 살짝 위로 젖히고 쇄골 쪽으로, 팔꿈치를 아래로 내린다는 느낌으로 광배 시작.',w:'이두로 당기거나 과하게 뒤로 눕지 않기.'},
  '스트레이트 암 풀다운':{t:'광배(고립)',c:'팔 편 채 고정, 광배만으로 바를 허벅지로. 이두 개입 차단.',w:'팔꿈치 굽으면 삼두 운동 됨 — 살짝만 굽혀 고정.'},
  '케이블 시티드 로우':{t:'중부 등, 능형근, 광배',c:'가슴 펴고 배꼽으로 당기기, 정점 견갑 후인 1초, 천천히 신장.',w:'상체 과도하게 뒤로 젖히지 않기.'},
  '덤벨 바이셉스 컬':{t:'이두',c:'팔꿈치 고정, 정점에서 외회전(수피네이션) 수축, 신장성 천천히.',w:'반동·어깨 사용 금지.'},
  '컨센트레이션 컬':{t:'이두(피크)',c:'팔꿈치 허벅지 안쪽 고정, 완전 고립, 정점 1~2초 쥐어짜기.',w:'무게보다 수축에 집중.'},
  'V스쿼트 머신':{t:'대퇴사두, 둔근',c:'발 어깨너비·발끝 약간 바깥, 무릎이 발끝 방향. 깊게 앉아 사두 신장. 슬레드 각도로 체감 저항 낮으니 ROM·템포로 자극.',w:'무릎 안으로 모이지 않게(외전 유지), 코어로 허리 보호.'},
  '시티드 레그프레스':{t:'대퇴사두, 둔근',c:'발판 중앙·어깨너비, 무릎 90도 이상 깊게, 살짝 안 잠그기. 하체 날 후 탄수 보충 OK.',w:'허리·골반 시트에서 들리면 ROM 줄이기.'},
  '레그컬 (머신)':{t:'햄스트링 (시티드 권장)',c:'★발목 배측굴곡(발끝 정강이로 당김) 세트 내내 유지 — 비복근 개입 차단. 당길 때 1초·펼 때 2~3초, 햄에 집중.',w:'★종아리 발달형이라 발끝 펴지면 비복근이 일 가로챔. 완전 굴곡 직전까지만. 라잉이면 시티드로 전환.'},
  '레그 익스텐션':{t:'대퇴사두(특히 내측광근)',c:'정점에서 1~2초 사두 쥐어짜기, 발끝 안/밖으로 내·외측 강조, 천천히 내리기.',w:'반동 금지, 무릎 과신전 주의.'},
  '힙 어브덕션 (머신)':{t:'중둔근, 대둔근 상부',c:'상체 살짝 앞으로 기울이면 둔근 동원↑, 정점 둔근 수축, 천천히 모으기.',w:'반동으로 벌리지 않기.'},
  '루마니안 데드리프트':{t:'햄스트링, 둔근',c:'무릎 살짝 굽혀 고정, 힙을 뒤로 밀며 바를 허벅지 따라 내림. 햄 신장 지점까지, 둔근으로 일으킴.',w:'★기립근 통증 이력 — 가벼운 무게부터, 등 중립 사수, 바가 몸에서 멀어지지 않게.'},
  '사이드 플랭크':{t:'복사근, 측면 코어',c:'몸 일직선, 골반 들어 유지, 호흡 정상, 좌우 균형.',w:'골반 처지지 않게, 시간 점진 증가.'},
  '덤벨 숄더프레스':{t:'전면·측면 삼각근, 삼두',c:'팔꿈치 살짝 앞·귀 옆에서 수직, 코어 고정, 정점 살짝 안 잠금.',w:'허리 과신전 금지, 어깨 충돌 시 궤도 조정.'},
  '페이스풀 (케이블) ⭐필수':{t:'후면삼각근, 회전근개(외회전), 중부승모',c:'★자세 교정 핵심. 얼굴 쪽으로 당기며 손을 바깥 위로 회전(W자), 견갑 후인, 가볍게 15~20회.',w:'무겁게 하지 말 것 — 자세·외회전이 목적. 우측 어깨 밸런스에도 도움.'},
  '덤벨 플라이 / 펙덱':{t:'대흉근(신장·내전)',c:'팔꿈치 살짝 굽혀 고정, 가슴 크게 벌려 신장 후 모을 때 쥐어짜기, 천천히.',w:'팔꿈치 과신전·어깨 앞 통증 주의, 너무 깊게 벌리지 않기.'},
  '케이블 트라이셉스 푸시다운':{t:'삼두(외측·내측두)',c:'팔꿈치 몸통 옆 고정, 완전 신전 후 정점 수축, 상체 고정.',w:'어깨로 누르거나 반동 금지.'},
  '벤치 딥스':{t:'삼두',c:'팔꿈치 뒤로 곧게, 몸 벤치 가까이, 90도까지 내림.',w:'어깨 앞 통증 시 중단 — 너무 깊게 내리면 어깨 부담.'},
  '풀업 (체중)':{t:'광배, 능형근, 이두',c:'견갑 하강으로 시작(어깨 내리기), 가슴을 바로, 광배로 당기기, 천천히 완전 신전.',w:'어깨 으쓱·반동(키핑) 금지, 어시스트로 풀 ROM 확보.'},
  '원암 덤벨 로우':{t:'광배, 능형근',c:'벤치 한 손 지지·등 평평, 팔꿈치 골반 쪽으로 당기고 정점 수축, 광배 신장까지 내림.',w:'몸통 회전(반동)으로 당기지 않기.'},
  '인클라인 덤벨 컬':{t:'이두(장두 신장)',c:'인클라인 벤치에 기대 팔 뒤로 — 이두 최대 신장, 그 위치에서 컬.',w:'팔꿈치 앞으로 나오지 않게, 신장 위치 유지.'},
  '해머 컬':{t:'상완근, 상완요골근(전완)',c:'중립 그립(망치 쥐듯) 유지, 팔꿈치 고정, 전완·상완근 자극.',w:'반동 금지.'},
  '케이블 바이셉스 컬':{t:'이두',c:'케이블 지속 장력 활용, 팔꿈치 고정, 정점 수축, 천천히 신장.',w:'어깨·반동 사용 금지.'},
  '데드행':{t:'악력, 광배 신장, 척추 감압',c:'바에 매달려 견갑 살짝 활성, 어깨 완전히 빠지지 않게, 호흡 유지, 시간 점진 증가.',w:'어깨 통증 시 중단.'},
  '불가리안 스플릿 스쿼트':{t:'대퇴사두, 둔근',c:'뒷발 벤치에 올리고 앞다리로 수직 하강, 앞무릎 발끝 방향, 균형 천천히.',w:'앞무릎 안으로 모이지 않게, 상체 약간 앞으로 둔근 강조.'},
  '힙쓰러스트':{t:'대둔근',c:'견갑 벤치에 걸치고 턱 당김, 발 골반너비, 정점 둔근 1초 쥐어짜며 골반 완전 신전, 갈비뼈 닫기.',w:'허리로 젖히지 않기(둔근으로 밀기), 패드로 골반 보호.'},
  '워킹 런지':{t:'대퇴사두, 둔근, 햄스트링',c:'보폭 길게(둔근)·짧게(사두), 앞무릎 90도·뒷무릎 바닥 가까이, 상체 곧게.',w:'앞무릎 발끝 넘어 과하게 나가지 않게, 균형.'},
  '레그레이즈':{t:'하복부(복직근 하부), 장요근',c:'허리 바닥 밀착, 골반 살짝 말아 올리기, 반동 없이 천천히, 내릴 때 복부 장력 유지.',w:'허리 뜨면 요추 부담 — ROM 줄이기, 다리 반동 금지.'},
  '케이블 크런치':{t:'복직근',c:'무릎 꿇고 척추 둥글게 말기(복근으로), 골반 고정, 팔로 당기지 않기, 정점 수축.',w:'엉덩이로 당기지 않기 — 복근 굴곡에 집중.'},
  '플랭크':{t:'코어 전체(복횡근)',c:'머리~발뒤꿈치 일직선, 복부·둔근 조이고 호흡 유지, 시간 점진 증가.',w:'엉덩이 처지거나 솟지 않게, 목 중립.'},
};
const ExLog={
  prescription(name,day){return TRAINING_PLAN.prescription(name,day||this.dayType(this.date),this.date);},
  initRoutineUI(){
    document.querySelectorAll('.day-panel').forEach((panel)=>{
      const day=this.panelDayOf(panel),i=this.PANEL_DAY.indexOf(day),label=document.querySelector('.lbl-d'+(i+1));
      if(label){label.querySelector('.dn').textContent=day;label.querySelector('.dl').textContent=TRAINING_PLAN.mode==='current'?(['월','화','수','목','금','토'][i]+' · '+({'Push A':'가슴 중심','Pull A':'수직 당김','Legs A':'허벅지 앞','Push B':'어깨 중심','Pull B':'로우 중심','Legs B':'뒤쪽·엉덩이'}[day])):'기존 루틴';}
      panel.querySelector('.hbadge').textContent=day;
      panel.querySelector('.hbadge').style.background=DAY_COLORS_EL[day];
      panel.querySelector('.hinfo').textContent=TRAINING_PLAN.mode==='current'?TRAINING_PLAN.focus[day]+' · 복합 2–3분 / 고립 1–2분 휴식':'기존 편집 루틴 · 컨디션에 맞춰 진행';
      const dn=panel.querySelector('.done-banner .dt');if(dn)dn.textContent=day+' 완료';
    });
    const select=document.getElementById('routine-profile');if(select)select.value=TRAINING_PLAN.mode;
    this.renderRoutineUI();
  },
  async selectRoutine(mode){
    await this.save();await this.savePlan();
    localStorage.setItem('routine_profile',mode==='legacy'?'legacy':'current');location.reload();
  },
  renderRoutineUI(){
    const el=document.getElementById('routine-brief');if(!el)return;
    const ph=TRAINING_PLAN.phase(this.date),planned=TRAINING_PLAN.schedule(this.date),legacy=TRAINING_PLAN.mode==='legacy';
    el.innerHTML='<b>'+(legacy?'기존 편집 루틴':ph.label)+'</b><span>'+(legacy?'새 루틴과 편집 내용을 따로 보관합니다.':('예정: '+planned+' · '+(ph.limited?'종목당 2세트 · 3–4회 여유':'1–3회 여유 · 일요일 휴식')))+'</span><small>'
      +(legacy?'기록·별칭·기구 설정은 두 루틴에서 함께 사용합니다.':(ph.limited?'유산소 15–20분 × 주 3회부터. 복귀 1주는 월·화·목·토 웨이트.':'상체 운동 후 유산소 20–30분, 주 4회까지. 피로가 남으면 줄이세요.'))+'</small>';
    document.querySelectorAll('.day-panel .ex-wrap').forEach(w=>{
      const nm=(w.querySelector('.ex-nm')?.textContent||'').trim(),day=this.panelDayOf(w.closest('.day-panel')),p=this.prescription(nm,day);
      const tag=w.querySelector('.tag.t-s');if(tag&&p)tag.textContent=p.sets+'×'+p.min+'–'+p.max;
    });
    this.renderSyncStatus();
  },
  date:_todayKey(),
  dataVer:0, // 데이터 쓰기마다 증가 — 분석 탭이 '변경 없음'이면 재렌더를 건너뛰는 기준
  data:{},
  plan:{},
  rest:{name:'',endAt:0,total:0,int:null},

  async init(){
    this._wrapData(); // load 전에 감시 설치 — 이후 모든 data 쓰기가 캐시 무효화를 동반
    await this.load();
    await DataSync.prepareIds();
    await this.loadPlan();
    await this.loadAlias();
    await this.loadMeta();
    await this.loadBase();
    await this.loadCoef();
    await this.loadLoadType();
    this.migrateEw();          // 인바디 로드를 기다리므로 await하지 않는다 (첫 화면 지연 방지)
    await this.loadMemo();
    await this.loadRestCfg();
    this.seedAlias();
    await this.autoConsolidate(); // 도감 표준명 기준 광범위 별칭 통합(1회)
    this.syncPanel(this.dayType(this.date)); // 오늘 타입 패널 자동 선택 (switchDay와 동일 경로)
    document.addEventListener('input',e=>{if(e.target&&e.target.classList&&e.target.classList.contains('wl-kg-input'))this._updateTotalHint(e.target);});
    if(typeof PlanApp!=='undefined'&&PlanApp.renderBlock)PlanApp.renderBlock(); // 메타 로드 후 플랜 블록 카드 동기화
    this.initRoutineUI();
    this.injectBar();
    this.injectLogs();
    this.injectAddBtns();
    this.injectDeleteBtns();
    this.reconcilePanels(); // 정적 카드를 EL_DAY_EX에 맞춘 뒤에 슬롯을 굳힌다 — 둘이 어긋나 있던 원인 제거
    this._assignSlots();   // applyPlan(→_sortDay)보다 먼저 — HTML 순서를 슬롯으로 굳힌 뒤에 재배치를 허용
    this.applyPlan();
    this.injectTargets();
    this.refresh();
    augmentCards();
    this.injectRecos();
    this.initWakeLock();
    this.initDateRollover();
    // 지난 세션 미전송분 자동 재전송 — 오프라인에서 기록한 뒤 앱을 열어보기만 해도 시트가 따라잡게.
    // 이전에는 다음 세트를 입력해야 전송이 시작됐다. URL 미설정이면 _syncSoon이 조용히 무시.
    this._syncSoon();
    this._delQ.forEach(k=>this._dirty.add(k.date));
    window.addEventListener('online',()=>this._syncSoon());
    // v5 never uploads unchanged history on a timer.
  },

  // ── 저장: 월 단위 분할(wl_v2:YYYY-MM) ──
  // 이전에는 세트 1개마다 전체 기록을 wl_v2 한 키로 재직렬화(동기 localStorage 쓰기 = 메인스레드 블로킹).
  // 기록이 쌓일수록 입력 지연이 커지므로, 변경된 달만 다시 써서 저장 비용을 총 데이터량과 무관하게 만든다.
  // 레거시 단일 키(wl_v2)는 최초 1회 월 키로 분할 이관 후 다시 읽지 않는다(만일을 위해 삭제하지도 않음).
  _dirtyMonths:new Set(),
  _monthOf(d){return String(d).slice(0,7);},
  markDirty(date){this.dataVer++;this._invalidateIdx();this._dirtyMonths.add(this._monthOf(date||this.date));}, // 데이터 쓰기 단일 관문 — 종목 인덱스·분석탭 버전도 여기서 무효화
  async load(){
    try{
      const r=await window.storage.list('wl_v2:');
      const keys=((r&&r.keys)||[]).sort();
      if(keys.length){
        for(const k of keys){try{const v=await window.storage.get(k);if(v)Object.assign(this.data,JSON.parse(v.value)||{});}catch(_){}}
        return;
      }
      const legacy=await window.storage.get('wl_v2'); // 월 키가 없으면 레거시 단일 키에서 1회 이관
      if(legacy){
        this.data=JSON.parse(legacy.value)||{};
        Object.keys(this.data).forEach(d=>this.markDirty(d));
        await this.save();
      }
    }catch(_){}
  },
  async save(){
    if(!this._dirtyMonths.size)return;
    const versions=new Map([...this._dirtyMonths].map(m=>[m,JSON.stringify(Object.fromEntries(Object.entries(this.data).filter(([d])=>this._monthOf(d)===m)))]));
    for(const [m,value] of versions){
      await window.storage.set('wl_v2:'+m,value);
      const now=JSON.stringify(Object.fromEntries(Object.entries(this.data).filter(([d])=>this._monthOf(d)===m)));
      if(now===value)this._dirtyMonths.delete(m);
    }
  },

  // ── 6주 훈련 블록: 시작일 저장 → 주차 계산 → 6주차에 보조 종목 로테이션 리뷰 트리거 ──
  block:null,
  lastBackup:null,
  async loadMeta(){
    try{const r=await window.storage.get('block_v1');if(r)this.block=JSON.parse(r.value);}catch(_){}
    try{const r=await window.storage.get('deload_v1');if(r)this.deload=JSON.parse(r.value);}catch(_){}
    try{const r=await window.storage.get('last_backup');if(r)this.lastBackup=r.value;}catch(_){}
    try{const r=await window.storage.get('sync_dirty');if(r)JSON.parse(r.value).forEach(d=>this._dirty.add(d));}catch(_){} // 지난 세션의 미전송 날짜 복원
    try{const r=await window.storage.get('sync_del');if(r)this._delQ=JSON.parse(r.value)||[];}catch(_){} // 지난 세션의 미전송 삭제 복원
  },
  saveBlock(){window.storage.set('block_v1',JSON.stringify(this.block)).catch(e=>SafeStore.report(e));},
  blockWeek(){ // 1부터 시작하는 주차. 블록 미설정/미래 시작일이면 null
    if(!this.block||!this.block.start)return null;
    const ms=new Date(this.date+'T12:00:00')-new Date(this.block.start+'T12:00:00');
    if(ms<0)return null;
    return Math.floor(ms/86400000/7)+1;
  },
  // ── 회복 지표(개인 기준선) ────────────────────────────────────────────────
  // RPE·수면을 고정 임계가 아니라 '내 최근 28일 기준선' 대비로 판정한다.
  // 고정 임계(RPE 9.0/9.3)는 항상 8.5~9로 찍는 사용자에게 영구 미발동이 되어 신호 자체가 죽는다.
  // 전 기록을 1회만 스캔하고 dataVer+열람일로 캐시 — suggestTarget()이 종목 카드마다 호출되므로 재계산 금지.
  _recCache:null,
  recovery(){
    const ck=this.dataVer+'|'+this.date;
    if(this._recCache&&this._recCache.k===ck)return this._recCache.v;
    const base=new Date(this.date+'T12:00:00');
    const R28=[],S28=[],e1by={};
    const mk=()=>({r:[],vol:0,sl:[],pain:0});
    const w0=mk(),w1=mk();                                   // w0=최근 7일, w1=그 전 7일
    this._dateKeys().forEach(k=>{
      const ago=Math.round((base-new Date(k+'T12:00:00'))/864e5);
      if(ago<0||ago>70)return;                               // 정체 판정에 필요한 최근 3세션 범위까지만
      const s=this.data[k]||{};
      const w=(ago<7)?w0:((ago<14)?w1:null);
      (s.exercises||[]).forEach(ex=>{
        const sets=(ex.sets||[]).filter(st=>_isWorkSet(st)&&st.weight>0);
        if(!sets.length)return;
        if(!this.isTimed(ex.name)){                          // 종목별 e1RM — 최근 3세션만 유지(오름차순 스캔)
          const cn=this.canon(ex.name);
          const e1=Math.max.apply(null,sets.map(st=>_e1Of(_ldW(st),st.reps)));
          const a=(e1by[cn]=e1by[cn]||[]);a.push(e1);if(a.length>3)a.shift();
        }
        sets.forEach(st=>{
          if(ago<28&&st.rpe)R28.push(st.rpe);
          if(!w)return;
          w.vol+=_ldW(st)*st.reps;
          if(st.rpe)w.r.push(st.rpe);
          if(st.pain)w.pain++;
        });
      });
      const sl=+((s.cond||{}).sleep||0);
      if(sl>0){if(ago<28)S28.push(sl);if(w)w.sl.push(sl);}
    });
    const med=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;};
    const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
    let plateau=0;                                           // 복합 종목 3회 연속 e1RM 정체 수
    for(const cn in e1by){
      const a=e1by[cn];
      if(a.length<3||!this.isCompound(cn))continue;
      if(a[2]<=a[1]+0.3&&a[1]<=a[0]+0.3)plateau++;
    }
    const pack=w=>({rpe:avg(w.r),n:w.r.length,vol:w.vol,sleep:avg(w.sl),sn:w.sl.length,pain:w.pain});
    const v={rpeBase:R28.length>=30?avg(R28):null,            // 표본 30세트 미만이면 기준선 판단 보류
             sleepBase:S28.length>=7?med(S28):null,            // RPE는 평균(비교 대상 w0.rpe와 통계량을 맞춘다), 수면은 중앙값(단일 일자와 비교)
             w0:pack(w0),w1:pack(w1),plateau};
    this._recCache={k:ck,v};
    return v;
  },

  // ── 디로드 단일 판정 ──────────────────────────────────────────────────────
  // 이전에는 계획 탭(PlanApp.deloadSignals)과 추세 탭(renderTrends 인라인)이 서로 다른 기준으로 따로 판정해
  // 한쪽만 켜지거나, "디로드 하세요"와 "+2.5kg 도전"이 동시에 뜨는 모순이 생겼다.
  // 이제 두 배너와 자동 목표가 모두 이 함수 하나를 본다.
  deloadState(){
    const r=this.recovery(),sig=[],B=r.rpeBase;
    if(B!=null&&r.w0.n>=6&&r.w0.rpe>=B+0.3)
      sig.push('7일 RPE '+r.w0.rpe.toFixed(2)+' (기준선 '+B.toFixed(1)+' 대비 +'+(r.w0.rpe-B).toFixed(2)+')');
    if(r.w0.n>=6&&r.w1.n>=6&&(r.w0.rpe-r.w1.rpe)>=0.3)
      sig.push('RPE 전주 대비 +'+(r.w0.rpe-r.w1.rpe).toFixed(2));
    if(r.w0.pain>=2)sig.push('통증 플래그 '+r.w0.pain+'회/7일');
    if(r.w1.vol>0&&r.w0.vol<r.w1.vol*0.9&&r.w0.n>=3&&r.w0.rpe>=r.w1.rpe)
      sig.push('볼륨 −'+Math.round((1-r.w0.vol/r.w1.vol)*100)+'%인데 RPE 유지↑');
    if(r.plateau>=2)sig.push('복합 '+r.plateau+'종 3회 연속 정체');
    const wk=this.blockWeek()||0;
    if(wk>=5)sig.push('블록 '+wk+'주차');
    // ── 사각지대 보고 ────────────────────────────────────────────────────
    // 6개 신호 중 '통증'과 '블록 주차'는 각각 통증 플래그·블록 시작일이 있어야만 켜진다.
    // 둘 다 비어 있으면 판정이 사실상 RPE 3종으로만 이뤄지는데, RPE가 내려가는 국면에서는
    // 그 3종도 켜지지 않아 suggest 임계(2개)에 영영 못 닿는다. 화면에는 '이상 없음'으로만 보이므로
    // 왜 조용한지를 함께 돌려준다. 컷처럼 회복이 느린 국면에서 디로드를 놓치는 경로가 여기다.
    const blind=[];
    if(!wk)blind.push('훈련 블록이 시작되지 않아 「블록 5주차+」 신호가 꺼져 있습니다');
    if(!this._painEver())blind.push('통증 플래그를 한 번도 쓰지 않아 「통증 2회+/7일」 신호가 꺼져 있습니다');
    return{signals:sig,suggest:sig.length>=2,day:this.deloadDay(),blind};
  },
  // 통증 플래그가 기록에 한 번이라도 쓰였는지 — dataVer로 메모이즈
  _painEver(){
    if(this._painEverCache&&this._painEverCache.k===this.dataVer)return this._painEverCache.v;
    let found=false;
    for(const dk in this.data){
      if(found)break;
      (this.data[dk].exercises||[]).forEach(e=>{(e.sets||[]).forEach(st=>{if(st&&st.pain)found=true;});});
    }
    this._painEverCache={k:this.dataVer,v:found};
    return found;
  },

  // ── 유산소 실적: 계획은 '주 2~3회 × 20~30분'인데 10주간 1회뿐이었다 ──────────
  // 웨이트 볼륨·강도는 매 세션 화면에 뜨지만 유산소는 어디에도 집계되지 않아, 안 하고 있다는 사실
  // 자체가 보이지 않았다. 내장지방 레벨이 11→10에서 7주째 멈춰 있는 것과 같은 자리의 문제다.
  weekCardio(){
    const base=new Date(this.date+'T12:00:00');
    let n=0,min=0;
    for(const k in this.data){
      const ago=Math.round((base-new Date(k+'T12:00:00'))/864e5);
      if(ago<0||ago>=7)continue;
      ((this.data[k]||{}).cardio||[]).forEach(c=>{const m=+c.min||0;if(m>0){n++;min+=m;}});
    }
    return{n,min,need:2,needMin:20};   // 계획: 주 2~3회 × 20~30분 (웨이트 대체 금지)
  },

  // ── 회복 병목(수면): 디로드와 분리한다 ────────────────────────────────────
  // 수면 부족은 훈련 피로가 아니라 회복 용량 자체의 문제라 볼륨을 줄여도 원인이 남는다.
  // 같은 배너에 섞으면 "디로드 했는데 왜 그대로지"가 반복되므로 별도 신호로 노출한다.
  sleepBottleneck(){
    const r=this.recovery();
    if(r.w0.sn<3||r.w1.sn<3)return null;
    if(r.w0.sleep<6.5&&r.w1.sleep<6.5)
      return{avg:(r.w0.sleep+r.w1.sleep)/2,w0:r.w0.sleep,w1:r.w1.sleep};
    return null;
  },

  // ── 디로드 주 실행: 한 번 켜면 자동 목표가 따라오고 7일 후 스스로 해제된다 ──
  deload:null,
  saveDeload(){window.storage.set('deload_v1',JSON.stringify(this.deload)).catch(e=>SafeStore.report(e));},
  deloadDay(){                                               // 진행 일차 1~7, 미실행·종료면 0
    if(!this.deload||!this.deload.start)return 0;
    const d=Math.floor((new Date(this.date+'T12:00:00')-new Date(this.deload.start+'T12:00:00'))/864e5);
    return (d>=0&&d<7)?d+1:0;
  },
  _afterDeloadChange(){
    this._recCache=null;
    this.injectTargets();                                    // 자동 목표 배지는 refresh()가 갱신하지 않는다
    this.refresh();
    if(typeof PlanApp!=='undefined'){if(PlanApp.renderBlock)PlanApp.renderBlock();if(PlanApp.renderTrends)PlanApp.renderTrends();}
  },
  startDeload(){
    if(!confirm('이번 주를 디로드 주로 전환할까요?\n\n· 중량은 그대로, 세트 수만 55%\n· 증량 제안 중지\n· 7일 뒤 자동 종료'))return;
    this.deload={start:this.date};this.saveDeload();this._afterDeloadChange();
  },
  endDeload(){
    this.deload=null;this.saveDeload();this._afterDeloadChange();
  },

  startBlock(){
    if(this.block&&this.block.start&&!confirm('새 6주 블록을 오늘부터 시작할까요?\n(현재 블록: '+this.block.start+' 시작, '+this.blockWeek()+'주차)'))return;
    this.block={start:this.date};this.saveBlock();this.refresh();
    if(typeof PlanApp!=='undefined'){if(PlanApp.renderTrends)PlanApp.renderTrends();if(PlanApp.renderBlock)PlanApp.renderBlock();}
  },

  // ── 기록 연결(별칭): 옛이름 → 새이름 매핑. 장비·짐이 바뀌어 종목명이 달라져도 추세·직전기록·PR이 이어지도록 ──
  alias:{},
  async loadAlias(){try{const r=await window.storage.get('ex_alias');if(r)this.alias=JSON.parse(r.value)||{};}catch(_){}},
  saveAlias(){this.dataVer++;this._invalidateIdx();window.storage.set('ex_alias',JSON.stringify(this.alias)).catch(e=>SafeStore.report(e));}, // 별칭=canon 변경 → 종목 인덱스·분석탭 무효화
  // ── 자동 별칭: (1) 알려진 중복 표기 시드 (2) 정규화(공백·하이픈·괄호 무시) 동일명 첫 기록 시 자동 연결 ──
  DEFAULT_ALIAS:{
   'T바 로우':'T-바 로우',
   /* 왓슨 풀다운은 오버/언더 두 기구가 따로 있어 이름을 그립까지 명시하도록 바꿨다.
      옛 표기 기록은 오버그립으로 승계한다(그동안 쓰던 것이 오버그립). */
   'Watson 오버헤드 풀다운':'Watson 프론트 풀다운 (오버그립)',
   '왓슨 오버헤드 풀다운':'Watson 프론트 풀다운 (오버그립)',
   '노틸러스 트라이셉스 인스텐션 머신':'트라이셉스 익스텐션 머신',
   '숄더프레스':'머신 숄더 프레스',
   'Hammer 벤치 (isolateral)':'Hammer ISO-호라이즌털 벤치프레스',
   'Hammer ISO-체스트 프레스':'Hammer ISO-호라이즌털 벤치프레스',
   '해머스트랭스 iso-래터럴 인클라인 프레스 머신':'Hammer ISO-인클라인 프레스',
   /* 'Watson 인클라인 (isolateral)' → Hammer 연결 제거: 브랜드가 다르면 같은 중량도 체감이 달라
      자동 목표·정체 판정이 섞인다. 왓슨 기록은 'Watson 인클라인 프레스 머신'으로 따로 쌓는다. */
   'Watson 인클라인 (isolateral)':'Watson 인클라인 프레스 머신',
   'Watson 디클라인 (isolateral)':'Watson 디클라인 프레스 머신',
   '랫풀다운 / 풀업':'랫풀다운',
   'Booty Builder 힙 어브덕션':'힙 어브덕션 (머신)',
   /* 26.08.13 실사: 레그프레스가 2대이고 브랜드·구동 방식이 다르다.
      Watson 45도 = 원판(랙) 방식 / Nautilus 시티드 = 핀(케이블 스위치) 방식.
      같은 표기 중량의 체감이 달라 한 종목으로 묶으면 자동 목표와 정체 판정이 섞인다. */
   '45도 레그프레스':'Watson 45도 레그프레스',
   '시티드 레그프레스':'Nautilus 시티드 레그프레스',
   '레그프레스':'Nautilus 시티드 레그프레스', /* 기구 미상 3세트 — 사용자 확인에 따라 노틸러스 시티드로 귀속 */
   '체스트 서포티드 로우':'머신 로우',
   /* 26.08 기록 감사: 40세션에 종목명 56개가 흩어져 추세·정체 판정이 쪼개져 있었다.
      같은 기구·같은 동작인데 표기만 다른 것들을 시드로 묶는다. */
   '머신 로우 (체스트 서포티드)':'머신 로우',
   '레그컬 (머신)':'레그컬',
   '케이블 시티드 로우':'시티드 케이블 로우',
   '머신 바이셉스 컬':'바이셉스 컬 머신',
   '풀업 (체중)':'풀업 (체중/어시스트)',
   'Hammer ISO-벤치프레스':'Hammer ISO-호라이즌털 벤치프레스',
   '힙 어브덕션':'힙 어브덕션 (머신)',
   /* 짐에 스탠딩 '어덕션'은 없고 '어브덕션'이 있다 — 옛 기록은 표기 실수였으므로 정정한다.
      (이전에 '힙 어덕션 머신'으로 묶었던 것은 오류: 선 자세와 앉은 자세는 부하 체계가 다른 별개 기구다.) */
   'Booty Builder 스탠딩 힙 어덕션':'Booty Builder 스탠딩 힙 어브덕션',
   '덤벨 플라이 / 펙덱':'펙덱 플라이'
   /* '힙 어덕션 머신'(모음)은 어브덕션(벌림)과 다른 운동 — 연결 금지 */
  },
  _normName(n){return String(n||'').toLowerCase().replace(/[\s\-_·/()\[\]]+/g,'');},
  _hasHist(cn){return this._exFor(cn).length>0;}, // 인덱스는 세트가 있는 기록만 담으므로 존재=이력
  _migrateCfg(oldKey,newCanon){ // 별칭 연결 시 세팅 메모·휴식 오버라이드 승계 (옛 키 고아화 버그 수정)
    if(oldKey===newCanon)return;
    if(this.memo&&this.memo[oldKey]!=null){if(this.memo[newCanon]==null)this.memo[newCanon]=this.memo[oldKey];delete this.memo[oldKey];this.saveMemo();}
    if(this.restCfg&&this.restCfg[oldKey]!=null){if(this.restCfg[newCanon]==null)this.restCfg[newCanon]=this.restCfg[oldKey];delete this.restCfg[oldKey];this.saveRestCfg();}
  },
  seedAlias(){ // 앱 시작 시 1회 — 사용자가 이미 직접 연결/해제한 항목은 존중
    let ch=false;
    for(const k in this.DEFAULT_ALIAS){
      const v=this.DEFAULT_ALIAS[k];
      if(this.alias[k]||k===v||this.canon(v)===k)continue;
      this.alias[k]=v;this._migrateCfg(k,this.canon(v));ch=true;
    }
    if(ch)this.saveAlias();
  },
  // ── 별칭 광범위 자동 통합(1회 마이그레이션): 기록에 등장한 모든 이름을 도감 표준명으로 연결 ──
  // 표기 흔들림(도감 aka에 등록된 동의어)으로 갈라진 추세·PR·직전기록을 통합한다. 세팅 메모·휴식 설정은 _migrateCfg로 승계.
  async autoConsolidate(){
    try{const r=await window.storage.get('alias_consol_v1');if(r)return;}catch(_){}
    let ch=false;
    this._histNames().forEach(n=>{
      const cn=this.canon(n);
      const e=this.libByName(cn);
      if(!e||e.name===cn)return;
      if(this.canon(e.name)===cn||this.canon(e.name)===n)return; // 순환 연결 방지
      if(!this.brandCompatible(cn,e.name))return;                // 브랜드가 다르면 자동 통합 금지
      this.alias[cn]=e.name;this._migrateCfg(cn,this.canon(e.name));ch=true;
    });
    if(ch){this.saveAlias();this._pbCache={};this._stepCache={};}
    try{await window.storage.set('alias_consol_v1','1');}catch(_){}
  },
  // 자동 통합 허용 여부 — 한쪽이라도 브랜드가 명시돼 있고 서로 다르면 막는다.
  // 사용자가 🔗 버튼으로 직접 연결하는 것은 명시적 의도라 이 가드를 거치지 않는다.
  brandCompatible(a,b){
    const ba=_brandOf(a),bb=_brandOf(b);
    if(ba&&bb)return ba===bb;
    return !ba&&!bb;                    // 한쪽만 브랜드 표기 = 다른 기구일 가능성이 커 보류
  },
  // ── 브랜드 환산비 학습 ────────────────────────────────────────────────────
  // 같은 그룹의 두 변형 모두 2세션 이상 기록되면 세션별 최고 e1RM의 중앙값 비율로 환산한다.
  // 추정치를 미리 박아넣지 않는 이유: 기구별 체감차는 개인·세팅에 따라 달라 실측이 유일한 근거다.
  _e1Cache:null,
  _e1ByName(name){
    const cn=this.canon(name);
    if(!this._e1Cache||this._e1Cache.v!==this.dataVer)this._e1Cache={v:this.dataVer,m:{}};
    const hit=this._e1Cache.m[cn];if(hit)return hit;
    const out=[];
    this._dateKeys().forEach(k=>{
      (this.data[k].exercises||[]).forEach(ex=>{
        if(this.canon(ex.name)!==cn)return;
        const sets=(ex.sets||[]).filter(st=>_isWorkSet(st)&&st.weight>0);
        if(sets.length)out.push(Math.max.apply(null,sets.map(st=>_e1Of(_ldW(st),st.reps))));
      });
    });
    this._e1Cache.m[cn]=out;
    return out;
  },
  // 카드에 쓰인 이름 → 변형 그룹 해석. canon(별칭)으로 못 찾으면 도감 표준명으로 한 번 더 찾는다.
  // ('레그컬 (머신)'처럼 도감 aka로만 존재하는 표기가 요일 플랜에 그대로 쓰이기 때문)
  variantGroup(name){
    const cn=this.canon(name);
    let g=_variantGroupOf(cn);
    if(g.length)return{group:g,cur:cn};
    const e=this.libByName(cn);
    if(e){g=_variantGroupOf(e.name);if(g.length)return{group:g,cur:e.name};}
    return{group:[],cur:cn};
  },
  variantHint(name){
    const vg=this.variantGroup(name);
    const alts=vg.group.filter(x=>x!==vg.cur);
    if(!alts.length)return null;
    const mine=this._e1ByName(name);
    const med=a=>{const b=a.slice().sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;};
    let best=null;
    alts.forEach(alt=>{
      const o=this._e1ByName(alt);
      if(!o.length)return;
      const prev=this.prevSession(alt);
      if(!prev)return;
      const lastW=prev.sets[prev.sets.length-1].weight;
      const ratio=(mine.length>=2&&o.length>=2)?med(mine)/med(o):null;
      const cand={alt,lastW,ratio,n:o.length};
      if(!best||(cand.ratio&&!best.ratio)||(cand.n>best.n&&!!cand.ratio===!!best.ratio))best=cand;
    });
    if(!best)return null;
    if(best.ratio)return{alt:best.alt,est:Math.round(best.lastW*best.ratio*2)/2,ratio:best.ratio,lastW:best.lastW,n:Math.min(mine.length,best.n)};
    // 실측 환산비가 아직 없다 → 설정된 브랜드 보정계수로 환산 (계수가 같으면 방향 안내만)
    const cv=this.coefConvert(best.alt,vg.cur,best.lastW);
    if(cv)return{alt:best.alt,est:cv.est,lastW:best.lastW,coef:cv.k};
    const ba=_brandOf(vg.cur),bb=_brandOf(best.alt);
    let dir='';
    if(ba&&bb&&BRAND_HARD[ba]!==BRAND_HARD[bb])
      dir=BRAND_HARD[bb]>BRAND_HARD[ba]?BRAND_LBL[bb]+' 쪽이 더 무겁게 느껴진다고 기록됨 — 같거나 살짝 높게 시작'
                                       :BRAND_LBL[bb]+' 쪽보다 무겁게 느껴질 수 있음 — 같거나 살짝 낮게 시작';
    return{alt:best.alt,lastW:best.lastW,dir};
  },
  autoAlias(name){ // 새 종목명 첫 세트 저장 시 — 정규화가 같은 과거 이름을 자동 연결 (기록·추세·PR 즉시 승계)
    const cn=this.canon(name);const nn=this._normName(cn);let ch=false;
    this._histNames().forEach(h=>{
      if(h===name||this.canon(h)===cn||this.canon(cn)===h)return;
      if(this._normName(this.canon(h))===nn){this.alias[h]=cn;this._migrateCfg(h,cn);ch=true;}
    });
    if(ch){this.saveAlias();this._pbCache={};this._stepCache={};}
    return ch;
  },
  canon(name){ // 별칭 체인을 최종 이름으로 해석 (순환 방지 최대 5단계)
    let n=name,hop=0;
    while(this.alias[n]&&hop<5){n=this.alias[n];hop++;}
    return n;
  },
  _histNames(){ // 기록에 등장한 모든 종목명 (최근 등장일 내림차순)
    const seen={};
    for(const dk in this.data)(this.data[dk].exercises||[]).forEach(e=>{if((e.sets||[]).length&&(!seen[e.name]||seen[e.name]<dk))seen[e.name]=dk;});
    return Object.keys(seen).sort((a,b)=>seen[b].localeCompare(seen[a]));
  },
  toggleAlias(btn){
    const log=btn.closest('.ex-log');if(!log)return;
    const cur=log.dataset.exname;
    let box=log.querySelector('.ex-alias-box');
    if(box){box.remove();return;}
    box=document.createElement('div');box.className='ex-alias-box';
    const canonCur=this.canon(cur);
    const linked=Object.keys(this.alias).filter(k=>this.canon(k)===canonCur&&k!==cur);
    const cands=this._histNames().filter(n=>n!==cur&&this.canon(n)!==canonCur).slice(0,20);
    let html='<div class="ex-alias-hd">🔗 과거 기록 연결 — 장비가 바뀌어 이름이 달라진 옛 종목을 선택하면 추세·직전기록이 이어집니다</div>';
    if(linked.length)html+='<div class="ex-alias-linked">연결됨: '+linked.map(n=>'<span class="ex-alias-tag">'+_esc(n)+' <b class="ex-alias-x" onclick="ExLog.unlinkAlias(\''+_escJs(n)+'\',this)">✕</b></span>').join('')+'</div>';
    html+=cands.length?'<div class="ex-alias-list">'+cands.map(n=>'<button class="wl-picker-tag" onclick="ExLog.linkAlias(\''+_escJs(n)+'\',\''+_escJs(cur)+'\',this)">'+_esc(n)+'</button>').join('')+'</div>':'<div class="ex-alias-empty">연결할 다른 기록이 없습니다.</div>';
    box.innerHTML=html;
    log.appendChild(box);
  },
  linkAlias(oldName,newName,el){
    if(this.canon(newName)===oldName){alert('순환 연결은 만들 수 없습니다.');return;}
    this.alias[oldName]=newName;this.saveAlias();
    this._migrateCfg(oldName,this.canon(newName)); // 세팅 메모·휴식 설정 승계
    this._pbCache={};this._stepCache={}; // 별칭 변경 = canon 변경 → 과거최고 캐시 무효화
    const box=el&&el.closest('.ex-alias-box');if(box)box.remove();
    this.refresh();this.injectTargets();
    if(typeof PlanApp!=='undefined')PlanApp.renderTrends();
  },
  unlinkAlias(oldName,el){
    delete this.alias[oldName];this.saveAlias();this._pbCache={};this._stepCache={};
    const box=el&&el.closest('.ex-alias-box');if(box)box.remove();
    this.refresh();this.injectTargets();
    if(typeof PlanApp!=='undefined')PlanApp.renderTrends();
  },

  // ── 자정 롤오버: 앱을 켜둔 채 날짜가 바뀌면, '오늘'을 보고 있던 경우에만 새 오늘로 이동 ──
  // (사용자가 의도적으로 과거 날짜를 열람 중이면 그대로 둔다)
  _todaySeen:null,
  initDateRollover(){
    this._todaySeen=_todayKey();
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState!=='visible')return;
      const t=_todayKey();
      if(t===this._todaySeen)return;
      const wasOnToday=(this.date===this._todaySeen);
      this._todaySeen=t;
      if(wasOnToday){this.date=t;if(this.updateBar)this.updateBar();this.injectTargets();}
      this.refresh();
    });
  },

  // ── 화면 꺼짐 방지(Wake Lock): 세트 사이 휴식 중 화면 유지. 미지원 브라우저는 조용히 무시 ──
  _wakeLock:null,
  initWakeLock(){
    if(!('wakeLock' in navigator))return;
    const req=async()=>{try{this._wakeLock=await navigator.wakeLock.request('screen');}catch(_){}};
    req();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')req();});
  },

  _baseType(t){return EL_BASE[t]||t;},
  // 순환제 dayType: 기록된 날은 저장된 타입, 미기록 날은 '가장 최근 운동일(리프팅 본세트 기준)의 다음 순서'.
  // 유산소만 한 날·쉰 날은 순환을 밀지 않는다. 기록이 전혀 없으면 Push부터.
  dayType(d){
    const cur=this.data[d];
    if(cur&&cur.day)return this._baseType(cur.day);
    if(TRAINING_PLAN.mode==='current'&&d>=TRAINING_PLAN.start&&d<=TRAINING_PLAN.end){const scheduled=TRAINING_PLAN.schedule(d);if(EL_CYCLE.includes(scheduled))return scheduled;}
    const keys=this._pastKeysDesc(d); // 캐시된 내림차순 키
    for(const k of keys){
      const ps=this.data[k];
      if(!ps||!(ps.exercises||[]).some(e=>(e.sets||[]).some(_isWorkSet)))continue;
      const i=EL_CYCLE.indexOf(this._baseType(ps.day));
      if(i<0)continue;
      return EL_CYCLE[(i+1)%EL_CYCLE.length];
    }
    return 'Push A';
  },
  fmt(d){const today=_todayKey();const s=new Date(d+'T12:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'});return d===today?'오늘 ('+s+')':s;},
  session(){return this.data[this.date]||{day:this.dayType(this.date),exercises:[]};},
  _dirty:new Set(), // 시트 미전송 변경 날짜 — 증분 동기화용 (전송 성공 시 해당 날짜만 비움)
  _delQ:[], // 시트 미반영 삭제 키 큐 — fire-and-forget이던 delete를 영속화해 오프라인·실패 시 유실(pull 복원 때 세트 부활) 방지
  // 영속화: 오프라인에서 기록 → 동기화 실패 → 앱 종료 시에도 미전송분이 남아 다음 실행에서 재전송되게
  _saveDirty(){window.storage.set('sync_dirty',JSON.stringify([...this._dirty])).catch(e=>SafeStore.report(e));},
  setSession(s){DataSync.assignNewIds(s);this.data[this.date]=s;this.markDirty(this.date);this._dirty.add(this.date);DataSync.noteLocal('workout',this.date);this._saveDirty();this.save().catch(e=>SafeStore.report(e));},

  // ── 데이 플랜 편집 (DB에서 구성 · 추가/삭제 · 영속) ──
  PANEL_DAY:TRAINING_PLAN.cycle, // EL_CYCLE과 동일 — 탭 순서와 순환 순서를 한 축으로
  DAY_CATS:{'Push A':['push','small'],'Pull A':['pull','small'],'Legs A':['legs','core'],'Push B':['push','small'],'Pull B':['pull','small'],'Legs B':['legs','core']},
  panelDayOf(panel){const m=((panel&&panel.className)||'').match(/dp([1-9])/);return m?this.PANEL_DAY[+m[1]-1]:'Push A';},
  async loadPlan(){try{const r=await window.storage.get(TRAINING_PLAN.storageKey);if(r)this.plan=JSON.parse(r.value);}catch(_){}},
  async savePlan(){await window.storage.set(TRAINING_PLAN.storageKey,JSON.stringify(this.plan));},
  planFor(day){if(!this.plan[day])this.plan[day]={add:[],rm:[]};return this.plan[day];},
  libByName(name){const L=window.EXERCISE_LIBRARY||[];return L.find(e=>e.name===name)||L.find(e=>(e.aka||[]).includes(name));},
  _tagBtn(n){return '<button class="wl-picker-tag" onclick="ExLog.addEx(\''+_escJs(n)+'\',this)">'+_esc(n)+'</button>';},

  dbCardInner(e,name){
    const nm=_esc(name||(e&&e.name)||'');
    if(!e){return '<details class="ex-card"><summary><label class="ck-btn" onclick="event.stopPropagation()"><span class="ck-icon">✓</span></label><div class="ex-info"><div class="ex-nm">'+nm+'</div></div><span class="chev">▾</span></summary><div class="ex-detail"><div class="focus-grid"><div class="fb stim"><div class="fl">🎯 자극점</div><div class="ft">도감 미등록 종목 — 주동근이 <b>늘어났다 조여지는 느낌</b>에 집중.</div></div><div class="fb tip"><div class="fl">💡 요령</div><div class="ft">첫 세트는 가볍게 폼 확인 후 증량. 수축 정점 1초·신장 2초.</div></div><div class="fb warn"><div class="fl">⚠ 주의</div><div class="ft">날카로운 통증이 느껴지면 즉시 중단. 반동 금지.</div></div><div class="fb link"><div class="fl">🔍 도감 미연결</div><div class="ft">이름을 도감 표기와 맞추면 폼·세팅 정보와 부위 집계가 연결됩니다. 예전에 다른 이름으로 기록했다면 기록 옆 <b>🔗</b>로 이어 주세요.</div></div></div></div></details>';}
    const stim=e.target||'';const tip=e.tip||e.grip||'';const warn=e.warn||'통증이 느껴지면 즉시 중단.';
    const tags='<span class="tag t-s">'+(e.sets||'')+'</span>'+(e.mus?'<span class="tag t-m">'+e.mus+'</span>':'');
    return '<details class="ex-card"><summary><label class="ck-btn" onclick="event.stopPropagation()"><span class="ck-icon">✓</span></label><div class="ex-info"><div class="ex-nm">'+nm+'</div><div class="ex-meta">'+tags+'</div></div><span class="chev">▾</span></summary><div class="ex-detail"><div class="focus-grid"><div class="fb stim"><div class="fl">🎯 자극점</div><div class="ft">'+stim+'</div></div><div class="fb tip"><div class="fl">💡 요령</div><div class="ft">'+tip+'</div></div><div class="fb warn"><div class="fl">⚠ 주의</div><div class="ft">'+warn+'</div></div></div></div></details>';
  },
  _addDelBtn(card,name){
    const sm=card.querySelector('summary');if(!sm||sm.querySelector('.ex-del-btn'))return;
    const b=document.createElement('button');b.className='ex-del-btn';b.type='button';b.textContent='✕';b.title='이 운동 빼기';
    b.setAttribute('onclick','event.stopPropagation();event.preventDefault();ExLog.removeEx(this)');
    const chev=sm.querySelector('.chev');if(chev)sm.insertBefore(b,chev);else sm.appendChild(b);
  },
  _addSwapBtn(card){
    const sm=card.querySelector('summary');if(!sm||sm.querySelector('.ex-swap-btn'))return;
    const b=document.createElement('button');b.className='ex-swap-btn';b.type='button';b.textContent='🔄';b.title='비슷한 운동으로 대체';
    b.setAttribute('onclick','event.stopPropagation();event.preventDefault();ExLog.toggleSwap(this)');
    const del=sm.querySelector('.ex-del-btn');const chev=sm.querySelector('.chev');
    if(del)sm.insertBefore(b,del);else if(chev)sm.insertBefore(b,chev);else sm.appendChild(b);
  },
  // 브랜드 칩 전환 — 같은 동작의 기구 변형으로 제자리 교체.
  // swapEx와 달리 '기록을 이어갈까요?' 확인을 띄우지 않는다: 브랜드별 분리가 이 기능의 목적이라
  // 승계는 오히려 자동 목표를 오염시킨다. 시작 무게는 🎯 자동 목표가 환산해서 제안한다.
  switchBrand(btn,newName){
    const wrap=btn.closest('.ex-wrap');const panel=btn.closest('.day-panel');if(!wrap||!panel)return;
    const cur=(wrap.querySelector('.ex-nm')?.textContent||'').trim();
    if(!newName||cur===newName)return;
    const p=this.planFor(this.panelDayOf(panel));
    if(wrap.classList.contains('custom-ex')){
      p.add=(p.add||[]).map(n=>n===wrap.dataset.cname?newName:n);
      this._transformWrap(wrap,newName);wrap.dataset.cname=newName;
    }else{
      const orig=wrap.dataset.origname||cur;
      (p.swap=p.swap||{})[orig]=newName;
      this._transformWrap(wrap,newName);
      wrap.dataset.origname=orig;wrap.dataset.swapto=newName;
    }
    this.savePlan();this.refresh();this.injectTargets();augmentCards();this.injectRecos();
  },
  toggleLoadType(btn){
    const det=btn.closest('.ex-detail');if(!det)return;
    let panel=det.querySelector('.ex-load-panel');
    if(panel){panel.remove();return;}
    const log=det.querySelector('.ex-log');const name=log?log.dataset.exname:'';
    const cur=this.loadTypeOf(name);
    panel=document.createElement('div');panel.className='ex-load-panel';
    panel.innerHTML='<div class="ex-load-hd">⚖ <b>이 종목의 부하 유형</b> — 자동 목표 방향·PR·추세가 이 설정을 따릅니다. 바꾸면 <b>과거 기록의 실부하도 다시 계산</b>됩니다.</div>'
      +['normal','assist','bw','time'].map(t=>'<button type="button" class="ex-load-opt'+(t===cur?' on':'')+'" onclick="ExLog.pickLoadType(this,\''+t+'\')"><b>'+LOAD_LBL[t]+'</b><span>'+LOAD_DESC[t]+'</span></button>').join('');
    btn.insertAdjacentElement('afterend',panel);
  },
  pickLoadType(el,t){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    if(log)this.setLoadType(log.dataset.exname,t);
    const pan=det.querySelector('.ex-load-panel');if(pan)pan.remove();
    this.refresh();this.injectTargets();
    if(typeof PlanApp!=='undefined'&&PlanApp.renderTrends)PlanApp.renderTrends();
  },
  toggleCoef(btn){
    const det=btn.closest('.ex-detail');if(!det)return;
    let panel=det.querySelector('.ex-coef-panel');
    if(panel){panel.remove();return;}
    panel=document.createElement('div');panel.className='ex-coef-panel';
    const row=b=>'<label class="ex-coef-row"><span>'+BRAND_LBL[b]+'</span>'
      +'<input type="number" step="0.01" min="0.5" max="1.5" class="ex-coef-inp" data-b="'+b+'" value="'+this.coefOf(b).toFixed(2)+'"></label>';
    panel.innerHTML='<div class="ex-coef-hd">⚙ <b>브랜드 체감 보정</b> — 같은 표기 1kg이 얼마나 무겁게 느껴지는지의 상대값입니다. '
      +'해머 1.10이면 왓슨 50kg ≒ <b>해머 45.5kg</b>로 시작 무게를 제안합니다.<br>'
      +'<b>기록되는 중량은 바뀌지 않습니다</b> — 시작 무게 제안에만 쓰이고, 같은 그룹의 두 기구가 각각 2세션 이상 쌓이면 실측 환산비가 이 값을 대체합니다.</div>'
      +'<div class="ex-coef-grid">'+['hammer','watson','nautilus'].map(row).join('')+'</div>'
      +'<div class="ex-coef-row2"><button class="ex-base-save" onclick="ExLog.saveCoefFromUI(this)">저장</button>'
      +'<button class="ex-base-clear" onclick="ExLog.resetCoefFromUI(this)">기본값으로</button></div>';
    (btn.parentNode||btn).insertAdjacentElement('afterend',panel);
  },
  saveCoefFromUI(el){
    const panel=el.closest('.ex-coef-panel');
    panel.querySelectorAll('.ex-coef-inp').forEach(i=>this.setCoef(i.dataset.b,parseFloat(i.value)));
    panel.remove();
    document.querySelectorAll('.ex-brand-row').forEach(r=>{r.dataset.sig='';});
    this.injectTargets();
  },
  resetCoefFromUI(el){
    const panel=el.closest('.ex-coef-panel');
    ['hammer','watson','nautilus'].forEach(b=>{delete this.bcoef[b];});
    this.saveCoef();panel.remove();
    document.querySelectorAll('.ex-brand-row').forEach(r=>{r.dataset.sig='';});
    this.injectTargets();
  },
  toggleSwap(btn){
    const card=btn.closest('details.ex-card');if(!card)return;
    const det=card.querySelector('.ex-detail');if(!det)return;
    const name=(card.querySelector('.ex-nm')?.textContent||'').trim();
    let panel=det.querySelector('.ex-swap');
    if(panel&&panel.classList.contains('open')){panel.classList.remove('open');panel.innerHTML='';return;}
    if(!panel){panel=document.createElement('div');panel.className='ex-swap';det.insertBefore(panel,det.firstChild);}
    const mu=(typeof PlanApp!=='undefined'&&PlanApp.muscleOf)?PlanApp.muscleOf(name):null;
    const bucket=_effBucket(name,mu?mu.p:null);
    const lib=window.EXERCISE_LIBRARY||[];
    const cn=ExLog.canon(name);
    const vars=_variantsOf(cn);
    const pat=_movePat(name), iso=ISO_RE.test(name);
    const myLib=ExLog.libByName(cn)||ExLog.libByName(name);   // 별칭(aka)으로 이어진 자기 자신을 후보에서 빼기 위한 기준
    const myCat=myLib?myLib.cat:null;
    const mySec=((mu&&mu.s)||[]);
    // 점수제: 동작 패턴 일치를 부위 일치보다 크게 본다 (같은 '등'이라도 수직/수평 당김은 다른 운동)
    const scored=lib.map(function(e){
      if(e.name===name||e.name===cn||e===myLib)return null;   // 카드명과 도감명이 달라도 같은 종목이면 제외
      const m=PlanApp.muscleOf(e.name);if(!m)return null;
      const eb=_effBucket(e.name,m.p);
      let sc=0;
      if(vars.includes(e.name))sc+=20;                        // 같은 기구의 브랜드 변형
      if(pat&&_movePat(e.name)===pat)sc+=6;                   // 동작 패턴 일치
      if(bucket&&eb===bucket)sc+=3;                           // 주동근 일치
      if(myCat&&e.cat===myCat)sc+=1;
      if(ISO_RE.test(e.name)===iso)sc+=1;                     // 복합/고립 성격 일치
      const ov=((m.s)||[]).filter(function(x){return mySec.includes(x);}).length;
      sc+=Math.min(ov,2);
      return sc>=6?{e:e,sc:sc,p:_movePat(e.name),v:vars.includes(e.name)}:null;  // 패턴 또는 부위+α 이상만
    }).filter(Boolean).sort(function(a,b){return b.sc-a.sc;});
    card.open=true;
    if(!scored.length){panel.innerHTML='<div class="ex-swap-hd">대체할 만한 운동이 도감에 없습니다.</div>';}
    else{
      const top=scored.slice(0,12);
      const same=top.filter(function(x){return pat&&x.p===pat;}).length;
      panel.innerHTML='<div class="ex-swap-hd">🔄 '+(pat?'<b>'+pat+'</b> 패턴 우선':'같은 부위')+(bucket?' · '+bucket:'')
        +' — 탭하면 교체'+(same?' <span class="ex-swap-cnt">동작 일치 '+same+'개</span>':'')+'</div>'
        +top.map(function(x){
          const tag=x.v?'<span class="ex-swap-tag v">🔁 브랜드 변형</span>'
                       :(pat&&x.p===pat?'<span class="ex-swap-tag s">동작 일치</span>'
                       :'<span class="ex-swap-tag">'+(x.p||'기타')+'</span>');
          return '<div class="ex-swap-row"><span class="ex-swap-nm">'+_esc(x.e.name)+tag+'</span><button class="ex-swap-pick" onclick="ExLog.swapEx(this,\''+_escJs(x.e.name)+'\')">교체</button></div>';
        }).join('');}
    panel.classList.add('open');
  },
  _transformWrap(wrap,newName){
    // wrap의 class/위치는 유지하고 내부 카드만 새 운동으로 교체
    const fresh=this.buildCardEl(newName);
    wrap.innerHTML='';
    while(fresh.firstChild)wrap.appendChild(fresh.firstChild);
  },
  swapEx(btn,newName){
    const wrap=btn.closest('.ex-wrap');const panel=btn.closest('.day-panel');if(!wrap||!panel)return;
    newName=(newName||'').trim();if(!newName)return;
    const p=this.planFor(this.panelDayOf(panel));
    let prevName='';
    if(wrap.classList.contains('custom-ex')){
      const cur=wrap.dataset.cname;prevName=cur;
      p.add=(p.add||[]).map(n=>n===cur?newName:n);   // 같은 위치에서 이름만 교체
      this._transformWrap(wrap,newName);
      wrap.dataset.cname=newName;
    }else{
      const orig=wrap.dataset.origname||(wrap.querySelector('.ex-nm')?.textContent||'').trim();
      prevName=wrap.dataset.swapto||orig;            // 교체 직전 화면에 있던 이름
      (p.swap=p.swap||{})[orig]=newName;             // 기본 슬롯 제자리 대체
      this._transformWrap(wrap,newName);
      wrap.dataset.origname=orig;wrap.dataset.swapto=newName;
    }
    // ── 승계: 표기만 다른 같은 이름은 자동 연결, 그 외 기록 보유 종목은 1회 확인 후 연결 (기록·메모·휴식 설정이 따라옴) ──
    if(prevName&&prevName!==newName&&this.canon(prevName)!==this.canon(newName)&&this.canon(newName)!==prevName){
      const same=this._normName(this.canon(prevName))===this._normName(this.canon(newName));
      if(same||(this._hasHist(this.canon(prevName))&&confirm("'"+prevName+"' 기록·세팅 메모·휴식 설정을 '"+newName+"'(으)로 이어갈까요?\n같은 동작의 장비 교체일 때만 [확인]을 누르세요."))){
        this.alias[prevName]=newName;this.saveAlias();this._migrateCfg(prevName,this.canon(newName));
        if(typeof PlanApp!=='undefined'&&PlanApp.renderTrends)PlanApp.renderTrends();
      }
    }
    this._sortDay(panel); // 교체 후에도 부위별 볼륨 보존 순서로 재정렬
    this.savePlan();this.refresh();this.injectTargets();augmentCards();this.injectRecos();
  },
  injectDeleteBtns(){
    document.querySelectorAll('.day-panel .ex-wrap:not(.custom-ex) details.ex-card').forEach(card=>{this._addDelBtn(card);this._addSwapBtn(card);});
  },
  buildCardEl(name){
    const wrap=document.createElement('div');wrap.className='ex-wrap custom-ex';wrap.dataset.cname=name;
    const newId='cx_'+Math.random().toString(36).slice(2,8);
    const match=[...document.querySelectorAll('.day-panel .ex-wrap:not(.custom-ex) .ex-nm')].find(el=>el.textContent.trim()===name);
    let card;
    if(match){
      card=match.closest('details.ex-card').cloneNode(true);
      ['.ex-log','.ex-extra','.ex-more','.ex-week-target','.ex-cue','.ex-del-btn'].forEach(s=>card.querySelector(s)?.remove());
    }else{
      const tmp=document.createElement('div');tmp.innerHTML=this.dbCardInner(this.libByName(name),name);card=tmp.firstElementChild;
    }
    const cb=document.createElement('input');cb.type='checkbox';cb.className='exck';cb.id=newId;
    const lbl=card.querySelector('.ck-btn');if(lbl){lbl.setAttribute('for',newId);lbl.setAttribute('onclick','event.stopPropagation()');}
    this._addDelBtn(card,name);this._addSwapBtn(card);
    wrap.appendChild(cb);wrap.appendChild(card);
    const det=card.querySelector('.ex-detail');
    if(det&&!det.querySelector('.ex-log')){const log=document.createElement('div');log.className='ex-log';log.dataset.exname=name;log.innerHTML=this.makeLogHtml();det.appendChild(log);}
    return wrap;
  },
  // ── 보완 추천 ──
  _recoLibIndex(){ // 도감 부위 인덱스 1회 구축(정적) → 재사용
    if(this._libIdx)return this._libIdx;
    const idx={};(window.EXERCISE_LIBRARY||[]).forEach(e=>{const mu=(typeof PlanApp!=='undefined'&&PlanApp.muscleOf)?PlanApp.muscleOf(e.name):null;if(mu&&mu.p)(idx[mu.p]=idx[mu.p]||[]).push(e.name);});
    return this._libIdx=idx;
  },
  _weekMuscleSets(){ // renderVolume와 동일 계산(주동근 1·보조근 0.5세트) — 메모리(ExLog.data) 기준
    const vol={};
    if(typeof PlanApp==='undefined'||!PlanApp._weekKeys||!PlanApp.muscleOf)return vol;
    const ks=new Set(PlanApp._weekKeys(0));const data=this.data||{};
    for(const dk in data){if(!ks.has(dk))continue;
      (data[dk].exercises||[]).forEach(ex=>{
        const n=(ex.sets||[]).filter(_isWorkSet).length;if(!n)return;
        const mu=PlanApp.muscleOf(ex.name);if(!mu)return;
        const bp=_effBucket(ex.name,mu.p);
        vol[bp]=(vol[bp]||0)+n;
      });
    }
    return vol;
  },
  injectRecos(){
    if(TRAINING_PLAN.phase(this.date).limited)return;
    if(typeof PlanApp==='undefined'||!PlanApp.muscleOf)return;
    const vol=this._weekMuscleSets();const byMuscle=this._recoLibIndex();
    document.querySelectorAll('.day-panel').forEach(panel=>{
      const list=panel.querySelector('.ex-list');if(!list)return;
      const dpc=[...panel.classList].find(c=>/^dp[1-6]$/.test(c));const nd=dpc?+dpc.slice(2):0;if(!nd)return;
      const cat=EL_GROUP(this.PANEL_DAY[nd-1]||'Push A'); // 패널 순서가 바뀌어도 따라오도록 PANEL_DAY 기준
      const present=new Set([...list.querySelectorAll('.ex-wrap')].map(w=>(w.dataset.cname||w.dataset.swapto||w.querySelector('.ex-nm')?.textContent||'').trim()));
      const gaps=RECO_CAT[cat].filter(m=>(vol[m]||0)<(RECO_TARGET[m]||10)).sort((a,b)=>(vol[a]||0)-(vol[b]||0));
      const recos=[];
      gaps.forEach(m=>{
        const take=(gaps.length===1?2:1);
        (byMuscle[m]||[]).filter(nm=>!present.has(nm)&&!recos.some(r=>r.name===nm)).slice(0,take).forEach(nm=>{if(recos.length<3)recos.push({name:nm,muscle:m,sets:vol[m]||0});});
      });
      const old=list.querySelector('.day-reco');if(old)old.remove();
      if(!recos.length)return;
      const card=document.createElement('div');card.className='day-reco';
      card.innerHTML='<div class="reco-hd">💡 이번 주 운동 선택 참고<span class="reco-sub">회복 후 선택 · 추가 필수 아님</span></div>'+
        recos.map(r=>{const st=(r.sets%1===0?r.sets:r.sets.toFixed(1));return '<div class="reco-item" onclick="ExLog.addEx(\''+r.name.replace(/'/g,"\\'")+'\',this)"><span class="reco-plus">＋</span><span class="reco-nm">'+r.name+'</span><span class="reco-why">'+r.muscle+' · '+st+'세트/주</span></div>';}).join('');
      list.appendChild(card);
    });
  },
  removeEx(btn){
    const wrap=btn.closest('.ex-wrap');const panel=btn.closest('.day-panel');if(!wrap||!panel)return;
    const name=(wrap.querySelector('.ex-nm')?.textContent||wrap.dataset.cname||'').trim();
    const p=this.planFor(this.panelDayOf(panel));
    if(wrap.classList.contains('custom-ex')){
      p.add=(p.add||[]).filter(n=>n!==name);
      wrap.remove();
    }else{
      const rmName=wrap.dataset.origname||name;
      if(!(p.rm||[]).includes(rmName))(p.rm=p.rm||[]).push(rmName);
      wrap.style.display='none';
    }
    this.savePlan();this.refresh();this.injectRecos();
  },
  applyPlan(){
    document.querySelectorAll('.day-panel').forEach(panel=>{
      const day=this.panelDayOf(panel);const p=this.plan[day];if(!p)return;
      const statics=()=>[...panel.querySelectorAll('.ex-wrap:not(.custom-ex)')];
      // 1) 자리바꿈 복원: 기본 슬롯을 제자리에서 대체 운동으로 변환
      const swap=p.swap||{};
      Object.keys(swap).forEach(orig=>{
        if((p.rm||[]).includes(orig))return;
        const newName=swap[orig];
        let wrap=statics().find(w=>w.dataset.origname===orig)||statics().find(w=>!w.dataset.origname&&(w.querySelector('.ex-nm')?.textContent||'').trim()===orig);
        if(!wrap||wrap.dataset.swapto===newName)return;
        this._transformWrap(wrap,newName);
        wrap.dataset.origname=orig;wrap.dataset.swapto=newName;wrap.style.display='';
      });
      // 2) 삭제 숨김 (원본 이름 또는 origname 기준)
      (p.rm||[]).forEach(name=>{
        const wrap=statics().find(w=>w.dataset.origname===name)||(statics().map(w=>w).find(w=>(w.querySelector('.ex-nm')?.textContent||'').trim()===name));
        if(wrap)wrap.style.display='none';
      });
      // 3) 추가 운동 — 메인 리스트(.ex-list) 끝에 plan.add 순서대로 통합
      const list=panel.querySelector('.ex-list');if(!list)return;
      panel.querySelectorAll('.custom-ex-label').forEach(el=>el.remove()); // 구버전 '+추가됨' 구분 라벨 정리
      (p.add||[]).forEach(name=>{
        if(statics().some(x=>x.style.display!=='none'&&((x.dataset.swapto||x.querySelector('.ex-nm')?.textContent||'').trim())===name))return; // 기본 카드와 중복 방지
        let w=[...panel.querySelectorAll('.custom-ex')].find(w=>w.dataset.cname===name);
        if(!w)w=this.buildCardEl(name);
        list.appendChild(w); // 기존 노드면 리스트 끝으로 이동(순서 정렬), 없으면 신규 추가
      });
      this._sortDay(panel); // 추가 종목만 배치 (기본 슬롯 순서는 보존)
    });
  },
  // ── 패널 ↔ EL_DAY_EX 정합 ──────────────────────────────────────────────
  // 정적 카드와 EL_DAY_EX를 따로 손으로 관리하다 26.08 개편이 목록에만 반영되어 4개 타입이 어긋났었다
  // (운동 탭은 여전히 디클라인인데 목록은 인클라인, Legs A는 레그레이즈 vs 케이블 크런치 …).
  // 이제 EL_DAY_EX가 유일한 기준이다: 목록 순서대로 카드를 재배치하고, 없는 종목은 도감에서 만들어 붙이고,
  // 목록에 없는 정적 카드는 숨긴다(삭제하지 않아 plan.add로 언제든 되살릴 수 있다).
  // _assignSlots보다 먼저 돌아야 슬롯 번호가 목록 기준으로 굳는다.
  reconcilePanels(){
    document.querySelectorAll('.day-panel').forEach(panel=>{
      const list=panel.querySelector('.ex-list');if(!list)return;
      const day=this.panelDayOf(panel);
      const want=EL_DAY_EX[day];if(!want||!want.length)return;
      const nameOf=w=>(w.dataset.swapto||w.dataset.cname||w.querySelector('.ex-nm')?.textContent||'').trim();
      const have=new Map();
      [...list.querySelectorAll('.ex-wrap')].forEach(w=>{const n=nameOf(w);if(n&&!have.has(n))have.set(n,w);});
      want.forEach(n=>{
        let w=have.get(n);
        if(!w){ w=this.buildCardEl(n); w.classList.remove('custom-ex'); delete w.dataset.cname; have.set(n,w); }
        w.style.display='';
        list.appendChild(w);            // 기존 노드면 끝으로 이동 → want 순서가 그대로 DOM 순서가 된다
      });
      // 목록에서 빠진 카드는 숨기고 뒤로 보낸다 — _assignSlots가 DOM 순서로 슬롯을 매기므로
      // 앞에 남아 있으면 보이지도 않는 카드가 1번 슬롯을 차지한다.
      have.forEach((w,n)=>{ if(!want.includes(n)){ w.style.display='none'; list.appendChild(w); } });
      this._markTiers(panel,day,list);
    });
  },
  // 핵심/선택 경계선과 슈퍼세트 배지 — '시간이 없으면 어디까지'를 카드에서 바로 읽게 한다
  _markTiers(panel,day,list){
    list.querySelectorAll('.ex-tier').forEach(el=>el.remove());
    panel.querySelectorAll('.ex-ss-badge').forEach(el=>el.remove());
    const want=EL_DAY_EX[day]||[], core=EL_DAY_CORE[day]||0;
    const wraps=[...list.querySelectorAll('.ex-wrap')].filter(w=>w.style.display!=='none');
    if(core>0&&wraps[core]){
      const d=document.createElement('div');d.className='ex-tier';
      d.innerHTML='<b>우선순위 '+core+'종목</b><span>시간이 부족하면 여기까지. 전체 세트 목표를 채웠다는 뜻은 아닙니다.</span>';
      list.insertBefore(d,wraps[core]);
    }
    (EL_DAY_SS[day]||[]).forEach((pair,pi)=>{
      pair.forEach((nm,i)=>{
        const w=wraps.find(x=>((x.dataset.swapto||x.dataset.cname||x.querySelector('.ex-nm')?.textContent||'').trim())===nm);
        const sm=w&&w.querySelector('summary .ex-info');
        if(!sm||sm.querySelector('.ex-ss-badge'))return;
        const b=document.createElement('span');b.className='ex-ss-badge';
        b.textContent='🔗 슈퍼세트 '+(i===0?'A':'B')+' — '+pair[1-i];
        b.title='두 종목을 번갈아 하고 라운드 사이에만 60~90초 쉰다';
        sm.appendChild(b);
      });
    });
  },
  // ── 기본 카드에 슬롯 번호 부여: HTML에 손으로 짠 순서(day-header의 '순서 근거')를 1급 데이터로 고정 ──
  // 최초 1회 DOM 순서대로 부여하므로 HTML을 수동 편집할 필요가 없다. 스왑은 _transformWrap이 제자리 변환이라 슬롯이 승계된다.
  _assignSlots(){
    document.querySelectorAll('.day-panel').forEach(panel=>{
      const list=panel.querySelector('.ex-list');if(!list)return;
      let i=0;
      [...list.children].forEach(el=>{
        if(!el.classList||!el.classList.contains('ex-wrap'))return;
        if(el.classList.contains('custom-ex'))return;      // 사용자가 추가한 종목은 슬롯 없음
        if(!el.dataset.slot)el.dataset.slot=String(++i);else i=+el.dataset.slot;
      });
    });
  },
  // ── 하루 운동 순서 ────────────────────────────────────────────────────────
  // 이전: 매번 전체를 MUSCLE_SESSION_ORDER로 재정렬 → 스왑/추가가 하나라도 있는 날은 손으로 짠 순서가 통째로 깨졌다
  //       (예: Push B에서 인클라인 프레스가 3번으로 밀리고 페이스풀·리어델트가 1·2번을 차지).
  // 이제: 슬롯이 있는 기본 카드는 HTML 순서를 그대로 유지하고, 슬롯이 없는 추가 종목만
  //       '같은 부위 그룹의 마지막 카드 뒤'에 끼워넣는다.
  _sortDay(panel){
    if(typeof PlanApp==='undefined'||!PlanApp.muscleOf)return;
    const list=panel.querySelector('.ex-list');if(!list)return;
    const wraps=[...list.children].filter(el=>el.classList&&el.classList.contains('ex-wrap'));
    if(wraps.length<2)return;
    const nameOf=w=>(w.dataset.cname||w.dataset.swapto||w.querySelector('.ex-nm')?.textContent||'').trim();
    const grpOf=w=>{
      const n=nameOf(w);const m=PlanApp.muscleOf(n);
      const b=_effBucket(n,m?m.p:null);
      const g=b?MUSCLE_SESSION_ORDER.indexOf(b):-1;
      return g<0?MUSCLE_SESSION_ORDER.length:g;                  // 미상/미등록 부위 → 맨 뒤
    };
    const slotted=wraps.filter(w=>w.dataset.slot).sort((a,b)=>(+a.dataset.slot)-(+b.dataset.slot));
    const extra=wraps.filter(w=>!w.dataset.slot);                // 추가 종목 — 추가한 순서 유지
    const out=slotted.slice();
    extra.forEach(w=>{
      const g=grpOf(w);
      let at=-1;
      for(let i=0;i<out.length;i++)if(grpOf(out[i])<=g)at=i;     // 같은/앞선 부위의 마지막 위치
      out.splice(at+1,0,w);                                      // at<0 이면 맨 앞
    });
    let changed=out.length!==wraps.length;
    if(!changed)for(let i=0;i<out.length;i++)if(out[i]!==wraps[i]){changed=true;break;}
    if(!changed)return;                                          // 이미 제 순서 → DOM 미변경
    const frag=document.createDocumentFragment();
    out.forEach(w=>frag.appendChild(w));
    list.appendChild(frag);                                      // .ex-list엔 카드만 있음(+추가 행은 panel 직속)
    const rc=list.querySelector('.day-reco');if(rc)list.appendChild(rc); // 추천 카드는 항상 맨 아래
  },

  prev(){const d=new Date(this.date+'T12:00:00');d.setDate(d.getDate()-1);this.date=_localKey(d);this.updateBar();this.injectTargets();this.refresh();},
  next(){const d=new Date(this.date+'T12:00:00');d.setDate(d.getDate()+1);this.date=_localKey(d);this.updateBar();this.injectTargets();this.refresh();},

  injectBar(){
    const tabW=document.querySelector('.tab-body.tab-w');
    if(!tabW||document.getElementById('ex-log-bar'))return;
    const bar=document.createElement('div');
    bar.className='log-date-bar';bar.id='ex-log-bar';
    const day=this.dayType(this.date);
    bar.innerHTML=`<button class="log-nav-btn" onclick="ExLog.prev()">‹</button><div class="log-date-center"><span class="log-date-txt" id="log-date-txt">${this.fmt(this.date)}</span><button type="button" class="log-day-badge" id="log-day-badge" onclick="ExLog.toggleTypePick()" title="루틴 직접 선택" style="background:${DAY_COLORS_EL[day]||'#888'}">${day}</button></div><button class="log-nav-btn" onclick="ExLog.next()">›</button><button class="log-sync-btn" id="log-sync-btn" onclick="ExLog.openSync()" title="Google Sheets 동기화">☁️</button>`;
    const ds=tabW.querySelector('.day-sel');if(ds)ds.insertAdjacentElement('afterend',bar);else tabW.insertBefore(bar,tabW.firstChild);
    // 루틴 직접 선택 패널 — 순환 추천과 별개로 언제든 수동 전환 가능하게 (날짜↔루틴 분리)
    const pick=document.createElement('div');pick.className='log-type-pick';pick.id='log-type-pick';
    bar.insertAdjacentElement('afterend',pick);
    const prog=document.createElement('div');prog.className='log-progress';prog.id='log-progress';
    pick.insertAdjacentElement('afterend',prog);
    const brief=document.createElement('div');brief.className='log-brief';brief.id='log-brief';
    prog.insertAdjacentElement('afterend',brief);
  },
  // ── 오늘의 브리핑: 카드를 펼치지 않아도 오늘의 도전(증량)·채우기 목표가 보이게. 기록된 종목은 목록에서 빠져 '남은 목표'로 동작 ──
  // ── 오늘 타입 추천: 기본은 순환 다음 타입. 타입별 '마지막 수행 경과일×2 + 담당 부위 주간 목표 부족 세트'를
  //    점수화해 순환보다 뚜렷이 급한(점수차 3+) 타입이 있으면 근거와 함께 제안. 탭하면 오늘 타입 전환. ──
  _lastDoneAgo(t){
    const keys=this._pastKeysDesc(); // 캐시된 내림차순 키 — 호출마다 filter+sort 반복 제거
    for(const k of keys){
      const s=this.data[k];
      if(!s||this._baseType(s.day)!==t)continue;
      if((s.exercises||[]).some(e=>(e.sets||[]).some(_isWorkSet)))return Math.round((new Date(this.date+'T12:00:00')-new Date(k+'T12:00:00'))/864e5);
    }
    return 999; // 수행 기록 없음
  },
  _typeDeficit(t){
    const vol=this._weekMuscleSets?this._weekMuscleSets():{};
    const cat=RECO_CAT[EL_GROUP(t)]||[];
    return cat.reduce((a,m)=>a+Math.max(0,(RECO_TARGET[m]||0)-(vol[m]||0)),0);
  },
  recommendType(){
    if(TRAINING_PLAN.mode==='current'&&TRAINING_PLAN.phase(this.date).limited)return null;
    const cur=this.data[this.date];
    if(cur&&(cur.exercises||[]).some(e=>(e.sets||[]).length))return null; // 오늘 이미 시작 — 추천 침묵
    // 성숙도 가드: 세 타입을 모두 돌아본 데이터가 있어야 추천 — 초기/공백기엔 순환 자체가 답이라 추천이 소음이 된다
    if(EL_CYCLE.filter(t=>this._lastDoneAgo(t)<=90).length<3)return null;
    const next=this.dayType(this.date);
    // ① 균형 보정(A/B 6세션 전용): 순환상 다음 타입을 최근 7일 안에 이미 했는데 7일 넘게 빠진 타입이 있으면
    //    그쪽을 먼저 제안한다. 순환만 따르면 한쪽(주로 B)이 계속 밀려도 스스로 복구되지 않는다.
    if(this._lastDoneAgo(next)<7){
      const stale=EL_CYCLE.filter(t=>t!==next&&this._lastDoneAgo(t)>=7).sort((a,b)=>this._lastDoneAgo(b)-this._lastDoneAgo(a));
      if(stale.length){const ago=this._lastDoneAgo(stale[0]);
        return{type:stale[0],why:(ago>=999?'수행 기록 없음':'마지막 '+ago+'일 전')+' · 순환 균형 보정'};}
    }
    const sc=t=>Math.min(this._lastDoneAgo(t),14)*2+this._typeDeficit(t); // 경과일은 14일에서 포화 — 부족 세트와 균형
    let best=next;EL_CYCLE.forEach(t=>{if(sc(t)>sc(best))best=t;});
    if(best===next||sc(best)-sc(next)<3||this._lastDoneAgo(best)-this._lastDoneAgo(next)<2)return null;
    return{type:best,why:'마지막 '+this._lastDoneAgo(best)+'일 전 · 이번 주 부족 '+this._typeDeficit(best)+'세트'};
  },
  switchDay(t){
    if(EL_CYCLE.indexOf(t)<0)return;
    const s=this.session();s.day=t;this.setSession(s);
    this.syncPanel(t);                       // 화면 패널도 함께 이동 — 전환 후 손으로 탭을 찾지 않게
    const p=document.getElementById('log-type-pick');if(p)p.classList.remove('open');
    this.updateBar();this.injectTargets();this.refresh();
  },
  // ── 날짜 ↔ 루틴 분리: 순환은 '기본 제안'일 뿐이고, 어떤 날에든 6타입 중 무엇이든 고를 수 있다 ──
  // 공백 후 복귀나 컨디션·기구 사정으로 순서를 건너뛰는 경우가 실제로 잦다. 순환만 강제하면
  // 기록이 엉뚱한 타입으로 쌓여 부위별 주간 집계와 '이전 같은 타입 대비' 비교가 함께 어긋난다.
  syncPanel(t){
    try{const i=this.PANEL_DAY.indexOf(t);if(i<0)return;
      const r=document.getElementById('d'+(i+1));if(r&&!r.checked)r.checked=true;}catch(_){}
  },
  toggleTypePick(){
    const p=document.getElementById('log-type-pick');if(!p)return;
    const open=!p.classList.contains('open');
    p.classList.toggle('open',open);
    if(open)this.renderTypePick();
  },
  renderTypePick(){
    const p=document.getElementById('log-type-pick');if(!p)return;
    const cur=this.dayType(this.date);
    const started=((this.data[this.date]||{}).exercises||[]).some(e=>(e.sets||[]).length);
    let h='';
    EL_CYCLE.forEach(t=>{
      const ago=this._lastDoneAgo(t),def=this._typeDeficit(t);
      const agoTxt=ago>=999?'기록 없음':(ago===0?'오늘':ago+'일 전');
      h+='<button type="button" class="tp'+(t===cur?' cur':'')+'" onclick="ExLog.switchDay(\''+t+'\')">'
        +'<b style="background:'+(DAY_COLORS_EL[t]||'#888')+'">'+t+'</b>'
        +'<small>'+agoTxt+(def>0?'<br>부족 '+def+'세트':'')+'</small></button>';
    });
    h+='<div class="tp-hint">'+(started
      ? '⚠️ 오늘 이미 기록이 있습니다 — 타입만 바뀌고 기록은 그대로 유지됩니다.'
      : '순환 순서와 무관하게 선택할 수 있습니다. 경과일이 길거나 부족 세트가 많은 쪽이 우선순위입니다.')+'</div>';
    p.innerHTML=h;
  },
  // ── 오늘의 준비도: 오늘 컨디션·수면 + 최근 운동일 RPE + 최근 7일 통증을 종합한 당일 강도 가이드 ──
  // 디로드 제안(주 단위)과 달리 '오늘 증량을 갈지'의 당일 판단. 점수제(좋음 +1/나쁨 −1)로 근거를 그대로 노출하고,
  // 신호가 없거나 중립이면 침묵한다(습관성 배너 방지).
  readiness(){
    const s=this.session();
    let score=0,n=0;const bad=[],good=[];
    const rec=this.recovery();
    const sB=rec.sleepBase;
    const sl=+((s.cond||{}).sleep||0);
    // 수면: 절대 6h가 아니라 '내 평소보다 1h 이상 부족'을 감점 신호로 삼는다.
    // 상시 수면부족(5~6h)이면 절대 기준으로는 매일 −1이 되어 배너가 상시 노출되고 신호로서 의미가 죽는다.
    if(sl){n++;
      const loT=(sB!=null)?Math.min(6,sB-1):6, hiT=(sB!=null)?Math.max(7,sB+0.5):7;
      if(sl>=hiT){score++;good.push('수면 '+sl+'h');}
      else if(sl<loT){score--;bad.push('수면 '+sl+'h'+(sB!=null?' (평소 '+sB.toFixed(1)+'h)':''));}
    }
    const rt=+((s.cond||{}).rate||0);
    if(rt){n++;if(rt>=4){score++;good.push('컨디션 '+rt+'/5');}else if(rt<=2){score--;bad.push('컨디션 '+rt+'/5');}}
    // 최근 운동일(7일 내) 평균 RPE — 표본 3세트 미만이면 판단 보류
    const keys=this._pastKeysDesc(); // 캐시된 내림차순 키 — 호출마다 filter+sort 반복 제거
    for(const k of keys){
      const ago=Math.round((new Date(this.date+'T12:00:00')-new Date(k+'T12:00:00'))/864e5);
      if(ago>7)break;
      let rs=0,rn=0,has=false;
      (this.data[k].exercises||[]).forEach(ex=>(ex.sets||[]).forEach(st=>{if(!_isWorkSet(st))return;has=true;if(st.rpe){rs+=st.rpe;rn++;}}));
      if(!has)continue;
      if(rn>=3){n++;const avg=rs/rn;
        const thr=(rec.rpeBase!=null)?rec.rpeBase+0.4:9.3;  // 기준선 미확보(표본 부족) 시에만 옛 고정값으로 폴백
        if(avg>=thr){score--;bad.push('전 세션 RPE '+avg.toFixed(1)+(rec.rpeBase!=null?' / 기준선 '+rec.rpeBase.toFixed(1):''));}}
      break; // 가장 최근 운동일 하나만 본다
    }
    let pain=0;
    keys.forEach(k=>{
      const ago=Math.round((new Date(this.date+'T12:00:00')-new Date(k+'T12:00:00'))/864e5);
      if(ago>7)return;
      (this.data[k].exercises||[]).forEach(ex=>(ex.sets||[]).forEach(st=>{if(st.pain)pain++;}));
    });
    if(pain>=2){n++;score--;bad.push('통증 '+pain+'회/7일');}
    if(!n)return null;
    if(score<=-2)return{lvl:'low',msg:'🪫 준비도 낮음 ('+bad.join(' · ')+') — 오늘은 증량 보류 · 무게 유지, 필요하면 볼륨 −10~20%'};
    if(score<0)return{lvl:'mid',msg:'🔸 준비도 보통 이하 ('+bad.join(' · ')+') — 무리한 증량 자제, RPE 여유 있을 때만 도전'};
    if(score>=2)return{lvl:'high',msg:'🔋 준비도 좋음 ('+good.join(' · ')+') — 도전 중량 가기 좋은 날'};
    return null;
  },
  renderBrief(){
    const el=document.getElementById('log-brief');if(!el)return;
    const day=this.dayType(this.date);
    const idx=this.PANEL_DAY.indexOf(day);
    const panel=idx>=0?document.querySelector('.day-panel.dp'+(idx+1)):null;
    if(!panel||day==='REST'){el.style.display='none';el.innerHTML='';return;}
    const names=[...new Set([...panel.querySelectorAll('.ex-wrap .ex-nm')].map(x=>x.textContent.trim()))];
    const s=this.session();
    const logged=new Set((s.exercises||[]).filter(e=>(e.sets||[]).some(_isWorkSet)).map(e=>this.canon(e.name)));
    const chal=[],fill=[];
    names.forEach(n=>{
      if(logged.has(this.canon(n)))return;                    // 이미 기록한 종목은 제외 → 남은 목표 리스트
      let sug=null;try{sug=this.suggestTarget(n);}catch(_){}
      if(!sug)return;
      if(sug.up&&sug.nextW)chal.push({n,w:sug.nextW});
      else if(sug.fillW!=null&&sug.cap)fill.push({n,w:sug.fillW,cap:sug.cap});
    });
    const rd=this.readiness();
    const rec=this.recommendType();
    const dlD=this.deloadDay();   // 디로드 주는 7일 한정이라 상시 노출이 아니고, 무게를 정하는 화면에서 보여야 의미가 있다
    if(!chal.length&&!fill.length&&!rd&&!rec&&!dlD){el.style.display='none';el.innerHTML='';return;}
    const short=n=>n.length>11?n.slice(0,10)+'…':n;
    const esc=n=>n.replace(/'/g,"\'");
    const item=(n,txt)=>'<span class="lb-item" onclick="ExLog.jumpToEx(\''+esc(n)+'\')">'+short(n)+' <b>'+txt+'</b></span>';
    let h=dlD?'<span class="lb-ready low">🪫 디로드 주 '+dlD+'/7일 — 중량 유지 · 세트 55% · 증량 보류</span>':'';
    if(rd)h+='<span class="lb-ready '+rd.lvl+'">'+rd.msg+'</span>';
    if(rec)h+='<span class="lb-ready mid lb-reco" onclick="ExLog.switchDay(\''+rec.type+'\')">📌 오늘 추천: <b>'+rec.type+'</b> — '+rec.why+' (탭하여 전환)</span>';
    if(chal.length)h+='<span class="lb-lbl up">⬆ 도전</span>'+chal.map(c=>item(c.n,c.w+'kg')).join('');
    if(fill.length)h+='<span class="lb-lbl">🎯 채우기</span>'+fill.slice(0,3).map(f=>item(f.n,f.w+'×'+f.cap)).join('');
    el.style.display='flex';el.innerHTML=h;
  },
  // 브리핑 항목 탭 → 해당 요일 패널로 전환 후 그 종목 카드로 스크롤·펼침
  jumpToEx(name){
    const day=this.dayType(this.date);
    const idx=this.PANEL_DAY.indexOf(day);if(idx<0)return;
    const radio=document.getElementById('d'+(idx+1));if(radio)radio.checked=true;
    const panel=document.querySelector('.day-panel.dp'+(idx+1));if(!panel)return;
    const wrap=[...panel.querySelectorAll('.ex-wrap')].find(w=>(w.querySelector('.ex-nm')?.textContent.trim())===name);
    if(!wrap)return;
    const det=wrap.querySelector('details');if(det)det.open=true;
    if(wrap.scrollIntoView)wrap.scrollIntoView({behavior:'smooth',block:'start'});
  },
  // 세션 진행률: 보고 있는 날짜의 데이 플랜 종목 중 본세트가 기록된 종목 수 — 수동 체크가 아닌 기록 기반(주간 그리드와 동일 원칙)
  renderProgress(){
    const el=document.getElementById('log-progress');if(!el)return;
    const day=this.dayType(this.date);
    const idx=this.PANEL_DAY.indexOf(day);
    const panel=idx>=0?document.querySelector('.day-panel.dp'+(idx+1)):null;
    if(!panel||day==='REST'){el.style.display='none';return;}
    const names=[...new Set([...panel.querySelectorAll('.ex-wrap .ex-nm')].map(x=>this.canon(x.textContent.trim())))];
    if(!names.length){el.style.display='none';return;}
    const doneSet=new Set((this.session().exercises||[]).filter(e=>(e.sets||[]).some(_isWorkSet)).map(e=>this.canon(e.name)));
    const done=names.filter(n=>doneSet.has(n)).length;
    el.style.display='flex';
    el.innerHTML='<div class="lp-bar"><div class="lp-fill" style="width:'+Math.round(done/names.length*100)+'%;background:'+(DAY_COLORS_EL[day]||'#085041')+'"></div></div><span class="lp-txt">'+done+'/'+names.length+'종목</span>';
  },

  updateBar(){
    const p0=document.getElementById('log-type-pick');if(p0&&p0.classList.contains('open'))this.renderTypePick();
    const t=document.getElementById('log-date-txt'),b=document.getElementById('log-day-badge');
    const day=this.dayType(this.date);
    if(t)t.textContent=this.fmt(this.date);
    if(b){b.textContent=day;b.style.background=DAY_COLORS_EL[day]||'#888';}
    const di=this.PANEL_DAY.indexOf(day); // 보는 날짜의 타입 패널로 동기화 (순환제)
    if(di>=0){const r=document.getElementById('d'+(di+1));if(r&&!r.checked)r.checked=true;}
  },

  makeLogHtml(){
    return`<div class="ex-log-top"><span class="ex-log-lbl">📊 오늘 기록</span><button class="ex-alias-btn" onclick="ExLog.toggleAlias(this)" title="과거 기록 연결 (장비·이름 변경 시)">🔗</button><button class="ex-log-add-btn" onclick="ExLog.startSet(this)">＋ 세트</button></div><div class="ex-log-chips"><span class="ex-log-empty">기록 없음</span></div><div class="ex-log-input" style="display:none"><span class="ex-log-sn"></span><input type="number" class="wl-kg-input" placeholder="kg" step="2.5" inputmode="decimal"><span class="wl-set-x">×</span><input type="number" class="wl-rp-input" placeholder="회" inputmode="numeric" onkeydown="if(event.key==='Enter')ExLog.confirmSet(this)"><select class="wl-rpe-sel" title="RPE (선택 — 마지막 세트 체감 강도)"><option value="">RPE</option><option>7</option><option>7.5</option><option>8</option><option>8.5</option><option>9</option><option>9.5</option><option>10</option></select><button class="wl-confirm-btn" onclick="ExLog.confirmSet(this)">✓</button><button class="wl-pain-btn" onclick="ExLog.togglePainSet(this)" title="이 세트에서 통증 발생 — 확정 전에 눌러두면 함께 저장됩니다">⚠️</button><button class="wl-del-btn" onclick="ExLog.deleteSet(this)" style="display:none" title="이 세트 삭제">🗑</button><button class="wl-cancel-btn" onclick="ExLog.cancelSet(this)">✕</button></div><div class="wl-rep-chips" style="display:none"></div>`;
  },

  injectLogs(){
    document.querySelectorAll('details.ex-card').forEach(card=>{
      const det=card.querySelector('.ex-detail');
      const nm=card.querySelector('.ex-nm')?.textContent?.trim();
      if(!det||!nm||det.querySelector('.ex-log'))return;
      const log=document.createElement('div');
      log.className='ex-log';log.dataset.exname=nm;
      log.innerHTML=this.makeLogHtml();
      det.appendChild(log);
    });
  },

  injectAddBtns(){
    document.querySelectorAll('.day-panel').forEach(panel=>{
      if(panel.querySelector('.ex-add-row'))return;
      const row=document.createElement('div');
      row.className='ex-add-row';
      row.innerHTML=`<button class="ex-add-btn" onclick="ExLog.togglePicker(this)">＋ 운동 추가</button><div class="ex-add-picker" style="display:none"></div><div class="ex-custom-area"></div>`;
      panel.appendChild(row);
    });
    // 컨디션(1~5)·수면(h) 기록 — 정체·디로드 판단의 회복 맥락 데이터
    document.querySelectorAll('.day-panel').forEach(panel=>{
      if(panel.querySelector('.cond-row'))return;
      const cd=document.createElement('div');
      cd.className='cond-row';
      cd.innerHTML='<span class="cond-lbl">😴 컨디션</span><span class="cond-dots">'+[1,2,3,4,5].map(n=>'<b class="cond-dot" data-n="'+n+'" onclick="ExLog.setCond('+n+')">'+n+'</b>').join('')+'</span><input type="number" class="cond-sleep" step="0.5" min="0" max="14" inputmode="decimal" placeholder="수면 h" onchange="ExLog.setSleep(this.value)">';
      panel.insertBefore(cd,panel.firstChild);
      // 세션 노트 — 컨디션 점수로 못 담는 맥락(통증·특이사항·환경) 한 줄 기록
      const nr=document.createElement('div');
      nr.className='note-row';
      nr.innerHTML='<input type="text" class="sess-note" maxlength="200" placeholder="📝 세션 메모 — 통증·특이사항·환경 (선택)" onchange="ExLog.setNote(this.value)">';
      panel.insertBefore(nr,cd.nextSibling);
    });
    // 유산소 기록 (내장지방 목표의 두 번째 축 — 근볼륨과 분리 집계)
    document.querySelectorAll('.day-panel').forEach(panel=>{
      if(panel.querySelector('.cardio-row'))return;
      const cr=document.createElement('div');
      cr.className='cardio-row';
      cr.innerHTML=`<div class="cardio-hd">🏃 유산소</div><div class="cardio-list"></div><button class="cardio-add" onclick="ExLog.toggleCardio(this)">＋ 유산소 기록</button><div class="cardio-form" style="display:none"><select class="cd-type"><option>걷기(LISS)</option><option>인클라인 워킹</option><option>자전거</option><option>러닝</option><option>수영</option><option>기타</option></select><input type="number" class="cd-min" placeholder="분" inputmode="numeric" min="1"><button class="cd-ok" onclick="ExLog.saveCardio(this)">기록</button></div>`;
      panel.appendChild(cr);
    });
  },
  toggleCardio(btn){const f=btn.nextElementSibling;f.style.display=f.style.display==='none'?'flex':'none';},
  saveCardio(btn){
    const f=btn.closest('.cardio-form');
    const type=f.querySelector('.cd-type').value;
    const min=parseInt(f.querySelector('.cd-min').value)||0;
    if(!min){f.querySelector('.cd-min').focus();return;}
    const s=this.session();(s.cardio=s.cardio||[]).push({type,min,ts:new Date().toISOString()});
    this.setSession(s);
    f.querySelector('.cd-min').value='';f.style.display='none';
    this.refresh();if(this._syncSoon)this._syncSoon();
  },
  delCardio(i){
    const s=this.session();if(!s.cardio)return;
    s.cardio.splice(i,1);this.setSession(s);this.refresh();if(this._syncSoon)this._syncSoon();
  },
  setCond(n){
    const s=this.session();(s.cond=s.cond||{}).rate=n;this.setSession(s);this.renderCond();if(this._syncSoon)this._syncSoon();
  },
  setSleep(v){
    const h=parseFloat(v);const s=this.session();
    s.cond=s.cond||{};if(h>0)s.cond.sleep=h;else delete s.cond.sleep;
    this.setSession(s);if(this._syncSoon)this._syncSoon();
  },
  setNote(v){
    const s=this.session();
    const t=String(v||'').trim().slice(0,200);
    if(t)s.note=t;else delete s.note;
    this.setSession(s);
  },
  renderCond(){
    const ses=this.session();const c=ses.cond||{};
    document.querySelectorAll('.cond-row').forEach(row=>{
      row.querySelectorAll('.cond-dot').forEach(d=>d.classList.toggle('on',+d.dataset.n<=(c.rate||0)));
      const sl=row.querySelector('.cond-sleep');
      if(sl&&document.activeElement!==sl)sl.value=c.sleep||'';
    });
    document.querySelectorAll('.sess-note').forEach(inp=>{
      if(document.activeElement!==inp)inp.value=ses.note||'';   // 날짜 이동 시 해당 세션 노트 반영
    });
  },
  // ── 수면 ↔ 퍼포먼스 상관: 최근 28일에서 수면 기록+본세트가 있는 날을 6.5h 기준으로 나눠 볼륨·RPE 비교 ──
  // 양쪽 표본이 3일 미만이면 침묵(우연 상관 방지). 인과 단정이 아니라 본인 데이터의 경향 제시가 목적.
  sleepInsight(){
    const lo=[],hi=[];
    const base=new Date(_todayKey()+'T12:00:00');
    for(let i=0;i<28;i++){
      const d=new Date(base);d.setDate(base.getDate()-i);
      const s=this.data[_localKey(d)];
      if(!s||!s.cond||!(+s.cond.sleep))continue;
      let vol=0,rs=0,rn=0;
      (s.exercises||[]).forEach(ex=>(ex.sets||[]).forEach(st=>{if(!_isWorkSet(st))return;vol+=_ldW(st)*st.reps;if(st.rpe){rs+=st.rpe;rn++;}}));
      if(!vol)continue;
      (+s.cond.sleep<6.5?lo:hi).push({vol,rpe:rn?rs/rn:null});
    }
    if(lo.length<3||hi.length<3)return null;
    const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
    const dV=Math.round((avg(lo.map(x=>x.vol))-avg(hi.map(x=>x.vol)))/avg(hi.map(x=>x.vol))*100);
    let html='💤 최근 4주 — 수면 6.5h 미만 '+lo.length+'일 vs 이상 '+hi.length+'일: 세션 볼륨 '+(dV>0?'+':'')+dV+'%';
    const loR=lo.filter(x=>x.rpe!=null),hiR=hi.filter(x=>x.rpe!=null);
    if(loR.length>=3&&hiR.length>=3){
      const dR=avg(loR.map(x=>x.rpe))-avg(hiR.map(x=>x.rpe));
      html+=' · 평균 RPE '+(dR>0?'+':'')+dR.toFixed(1);
    }
    return{html,lo:lo.length,hi:hi.length};
  },
  _weekCondAvg(){ // 이번 주 컨디션·수면 평균 (기록된 날만)
    const ks=(typeof PlanApp!=='undefined'&&PlanApp._weekKeys)?PlanApp._weekKeys(0):[];
    let rs=0,rn=0,ss=0,sn=0;
    ks.forEach(dk=>{const c=this.data[dk]&&this.data[dk].cond;if(!c)return;if(c.rate){rs+=c.rate;rn++;}if(c.sleep){ss+=c.sleep;sn++;}});
    return{rate:rn?rs/rn:null,sleep:sn?ss/sn:null};
  },
  renderCardio(){
    const list=this.session().cardio||[];
    const html=list.map((c,i)=>'<div class="cd-item">'+c.type+' <b>'+c.min+'분</b><span class="cd-x" onclick="ExLog.delCardio('+i+')">✕</span></div>').join('');
    document.querySelectorAll('.cardio-list').forEach(el=>{el.innerHTML=html;});
  },
  _weekCardioMin(){
    const ks=(typeof PlanApp!=='undefined'&&PlanApp._weekKeys)?PlanApp._weekKeys(0):[];
    let m=0;ks.forEach(dk=>{const d=this.data[dk];if(d&&d.cardio)d.cardio.forEach(c=>m+=(+c.min||0));});
    return m;
  },

  togglePicker(btn){
    const picker=btn.nextElementSibling;
    if(picker.style.display!=='none'){picker.style.display='none';return;}
    const panel=btn.closest('.day-panel');const day=this.panelDayOf(panel);
    picker.dataset.day=day;
    const tagId='pt_'+Date.now();
    const L=window.EXERCISE_LIBRARY||[];
    picker.innerHTML='<div class="wl-picker-title">'+day+' 운동 추가 · 도감 '+L.length+'종에서</div>'
      +'<input class="wl-picker-search" placeholder="🔍 전체 검색 (이름·부위)..." oninput="ExLog.filterPicker(this,\''+tagId+'\')">'
      +'<div class="wl-picker-tags" id="'+tagId+'"></div>'
      +'<div class="wl-custom-row"><input class="wl-custom-input" id="el-ci" placeholder="직접 입력..."><button class="wl-confirm-btn" onclick="ExLog.addEx(document.getElementById(\'el-ci\').value,this)">추가</button><button class="wl-cancel-btn" onclick="this.closest(\'.ex-add-picker\').style.display=\'none\'">✕</button></div>';
    picker.style.display='block';
    this._fillPicker(picker,tagId,'');
  },
  _shownNames(panel){const set=new Set();panel.querySelectorAll('.ex-wrap').forEach(w=>{if(w.style.display!=='none'){const n=w.querySelector('.ex-nm');if(n)set.add(n.textContent.trim());}});return set;},
  _hiddenStaticNames(panel){const arr=[];panel.querySelectorAll('.ex-wrap:not(.custom-ex)').forEach(w=>{if(w.style.display==='none'){const n=w.querySelector('.ex-nm');if(n)arr.push(n.textContent.trim());}});return arr;},
  _tagRestoreBtn(n){return '<button class="wl-picker-tag wl-picker-restore" onclick="ExLog.addEx(\''+_escJs(n)+'\',this)" title="지웠던 기본 운동 복구">'+_esc(n)+'</button>';},
  _fillPicker(picker,tagId,q){
    const el=picker.querySelector('#'+tagId);if(!el)return;
    const panel=picker.closest('.day-panel');const day=picker.dataset.day;
    const cats=this.DAY_CATS[day]||[];const shown=this._shownNames(panel);
    const L=window.EXERCISE_LIBRARY||[];q=(q||'').trim().toLowerCase();
    // 지웠던 기본 카드(복구 후보) — 도감 매칭 여부와 무관하게 항상 노출
    let hidden=this._hiddenStaticNames(panel);
    if(q)hidden=hidden.filter(n=>n.toLowerCase().includes(q));
    const hiddenSet=new Set(hidden);
    const restoreHtml=hidden.map(n=>this._tagRestoreBtn(n)).join('');
    let list;
    if(!q)list=L.filter(e=>cats.includes(e.cat)&&!shown.has(e.name)&&!hiddenSet.has(e.name));
    else list=L.filter(e=>!shown.has(e.name)&&!hiddenSet.has(e.name)&&(e.name.toLowerCase().includes(q)||(e.mus||'').toLowerCase().includes(q)||(e.aka||[]).some(a=>a.toLowerCase().includes(q))));
    const libHtml=list.map(e=>this._tagBtn(e.name)).join('');
    el.innerHTML=(restoreHtml+libHtml)||'<span class="wl-picker-empty">'+(q?'결과 없음':'추가할 종목이 없습니다')+'</span>';
  },
  filterPicker(input,tagId){const picker=input.closest('.ex-add-picker');if(picker)this._fillPicker(picker,tagId,input.value);},

  addEx(name,triggerEl){
    name=(name||'').trim().replace(/[<>"]/g,'');if(!name)return; // 이름이 innerHTML 곳곳에 들어감 — 마크업 파손 문자 제거
    const picker=triggerEl.closest('.ex-add-picker');if(picker)picker.style.display='none';
    const panel=triggerEl.closest('.day-panel');if(!panel)return;
    const p=this.planFor(this.panelDayOf(panel));
    const s=this.session();if(!s.exercises.find(e=>e.name===name)){s.exercises.push({name,sets:[]});this.setSession(s);}
    // 숨겨진 기본 카드면 다시 표시
    const staticW=[...panel.querySelectorAll('.ex-wrap:not(.custom-ex)')].find(w=>{const n=w.querySelector('.ex-nm');return n&&n.textContent.trim()===name;});
    if(staticW){p.rm=(p.rm||[]).filter(n=>n!==name);staticW.style.display='';this.savePlan();this.refresh();this.injectTargets();this.injectRecos();return;}
    const list=panel.querySelector('.ex-list');if(!list)return;
    if([...panel.querySelectorAll('.custom-ex')].some(w=>w.dataset.cname===name)){this.refresh();return;}
    if(!(p.add||[]).includes(name))(p.add=p.add||[]).push(name);
    list.appendChild(this.buildCardEl(name));
    this._sortDay(panel);
    this.savePlan();this.refresh();this.injectTargets();augmentCards();this.injectRecos();
  },

  addExternal(name){
    name=(name||'').trim();if(!name)return false;
    const dr=document.querySelector('.day-r:checked');const idx=dr?dr.id.replace('d',''):'1';
    const panel=document.querySelector('.day-panel.dp'+idx);if(!panel)return false;
    const trig=panel.querySelector('.ex-add-btn')||panel.querySelector('.ex-add-row');if(!trig)return false;
    this.addEx(name,trig);
    return true;
  },

  startSet(btn){
    const log=btn.closest('.ex-log');
    const inp=log.querySelector('.ex-log-input');
    const sn=log.querySelector('.ex-log-sn');
    log.dataset.editIdx='';                                  // 신규 입력 모드
    const del=inp.querySelector('.wl-del-btn');if(del)del.style.display='none';
    const pb=inp.querySelector('.wl-pain-btn');if(pb)pb.classList.remove('on');
    const rs=inp.querySelector('.wl-rpe-sel');if(rs)rs.value='';
    const wu=inp.querySelector('.wl-wu-btn');if(wu)wu.classList.remove('on');
    const s=this.session();
    const ex=s.exercises.find(e=>e.name===log.dataset.exname);
    if(sn)sn.textContent=(ex?.sets.length||0)+1;
    let lastW=ex?.sets.length?ex.sets[ex.sets.length-1].weight:'';
    if(!ex?.sets.length){const prev=this.prevSession(log.dataset.exname);if(prev&&prev.sets.length)lastW=prev.sets[prev.sets.length-1].weight;}
    const wi=inp.querySelector('.wl-kg-input');
    const base=this.baseOf(log.dataset.exname);
    if(wi)wi.value=lastW?(base?Math.max(0,Math.round((lastW-base)*100)/100):lastW):'';  // 기본무게 등록 시 입력칸은 추가 원판
    if(wi&&base)wi.placeholder='＋원판';
    const _lt=this.loadTypeOf(log.dataset.exname);
    const _ri=inp.querySelector('.wl-rp-input');
    if(wi&&!base)wi.placeholder=_lt==='assist'?'보조kg':(_lt==='bw'||_lt==='time'?'추가kg':'kg');
    if(_ri)_ri.placeholder=_lt==='time'?'초':'회';
    inp.querySelector('.wl-rp-input').value='';
    inp.style.display='flex';btn.style.display='none';
    // 렙 원탭 칩: 지난 세트 렙 ±1 + 렙 상단(✦) — 탭 한 번으로 세트 확정 (무게는 프리필돼 있으므로 필요 시 먼저 수정)
    const chips=log.querySelector('.wl-rep-chips');
    if(chips){
      const nm=log.dataset.exname;
      if(this.isTimed(nm)){chips.style.display='none';}
      else{
        const cap=this.repCap(nm);
        let lastR=ex?.sets.length?ex.sets[ex.sets.length-1].reps:0;
        if(!lastR){const pv=this.prevSession(nm);if(pv&&pv.sets.length)lastR=pv.sets[pv.sets.length-1].reps;}
        if(!lastR)lastR=cap;
        const cand=[...new Set([lastR-1,lastR,lastR+1,cap].filter(x=>x>0))].sort((a,b)=>a-b);
        chips.innerHTML='<span class="wl-rep-chip-lbl">렙 원탭</span>'+cand.map(x=>'<button type="button" class="wl-rep-chip'+(x>=cap?' cap':'')+'" onclick="ExLog.pickRep(this,'+x+')">'+x+(x>=cap?'✦':'')+'</button>').join('');
        chips.style.display='flex';
      }
    }
    if(wi)this._updateTotalHint(wi);
    setTimeout(()=>wi?.focus(),50);
  },
  // 렙 칩 탭 → 렙 입력 후 즉시 확정 (RPE·워밍업 토글은 칩을 누르기 전에 설정하면 함께 저장됨)
  pickRep(btn,n){
    const log=btn.closest('.ex-log');if(!log)return;
    const inp=log.querySelector('.ex-log-input');if(!inp)return;
    const ri=inp.querySelector('.wl-rp-input');if(ri)ri.value=n;
    this.confirmSet(inp.querySelector('.wl-confirm-btn'));
  },

  editSet(chip){
    const log=chip.closest('.ex-log');if(!log)return;
    const inp=log.querySelector('.ex-log-input');
    const sn=log.querySelector('.ex-log-sn');
    const i=parseInt(chip.dataset.i);
    const s=this.session();
    const ex=s.exercises.find(e=>e.name===log.dataset.exname);
    if(!ex||!ex.sets[i])return;
    log.dataset.editIdx=String(i);                           // 수정 모드
    const rc=log.querySelector('.wl-rep-chips');if(rc)rc.style.display='none'; // 수정은 값 프리필 — 원탭 칩 미표시
    if(sn)sn.textContent=(i+1)+' 수정';
    const wi=inp.querySelector('.wl-kg-input');
    const ri=inp.querySelector('.wl-rp-input');
    const base=this.baseOf(log.dataset.exname);
    if(wi)wi.value=base?Math.max(0,Math.round((ex.sets[i].weight-base)*100)/100):ex.sets[i].weight;
    if(ri)ri.value=ex.sets[i].reps;
    if(wi)this._updateTotalHint(wi);
    const rs=inp.querySelector('.wl-rpe-sel');if(rs)rs.value=ex.sets[i].rpe?String(ex.sets[i].rpe):'';
    const wu=inp.querySelector('.wl-wu-btn');if(wu)wu.classList.toggle('on',!!ex.sets[i].warmup);
    const pb=inp.querySelector('.wl-pain-btn');if(pb)pb.classList.toggle('on',!!ex.sets[i].pain);
    const del=inp.querySelector('.wl-del-btn');if(del)del.style.display='';
    const ab=log.querySelector('.ex-log-add-btn');if(ab)ab.style.display='none';
    inp.style.display='flex';
    setTimeout(()=>ri?.focus(),50);
  },

  _prE1(s){return _e1Of(_ldW(s),s.reps);},
  _priorSets(name){
    let arr=[];const cn=this.canon(name);
    for(const dk in this.data){(this.data[dk].exercises||[]).forEach(e=>{if(this.canon(e.name)===cn)arr=arr.concat(e.sets||[]);});}
    return arr.filter(_isWorkSet);
  },
  // 세트에 붙일 부하 메타 — 일반 종목이면 아무것도 붙이지 않아 기존 기록 형식과 동일하다.
  _loadMeta(name,w){
    const t=this.loadTypeOf(name);
    if(t==='normal')return{};
    const bw=this.bwOn(this.date);
    if(!bw)return{};
    return{ew:this.effW(name,w,this.date,bw),bw:bw};
  },
  checkPR(name,w,r){
    const prior=this._priorSets(name);if(!prior.length)return false;
    const lt=this.loadTypeOf(name);
    if(lt==='time'){                                  // 시간 종목은 초(=reps)가 기록이다
      return r>Math.max.apply(null,prior.map(s=>s.reps||0));
    }
    const ew=this.effW(name,w,this.date);             // 어시스트·체중은 실부하로 비교 (보조를 줄인 날이 신기록)
    if(ew>0){
      const loaded=prior.filter(s=>_ldW(s)>0);if(!loaded.length)return true;
      const best=Math.max.apply(null,loaded.map(s=>this._prE1(s)));
      return _e1Of(ew,r)>best+0.05;
    }else{
      const bws=prior.filter(s=>_ldW(s)===0);if(!bws.length)return false;
      return r>Math.max.apply(null,bws.map(s=>s.reps));
    }
  },
  showPR(name){
    let t=document.getElementById('pr-toast');
    if(!t){t=document.createElement('div');t.id='pr-toast';t.className='pr-toast';document.body.appendChild(t);}
    t.innerHTML='<span class="pr-emoji">🎉</span><div class="pr-txt"><div class="pr-t1">개인 신기록!</div><div class="pr-t2">'+_esc(name)+'</div></div>';
    t.classList.remove('show');void t.offsetWidth;t.classList.add('show');
    clearTimeout(this._prTimer);this._prTimer=setTimeout(function(){t.classList.remove('show');},2800);
  },

  confirmSet(el){
    const inp=el.closest('.ex-log-input');
    const log=inp.closest('.ex-log');
    let w=parseFloat(inp.querySelector('.wl-kg-input').value)||0;
    const r=parseInt(inp.querySelector('.wl-rp-input').value)||0;
    if(!w&&!r){this.cancelSet(el);return;}
    const _base=this.baseOf(log.dataset.exname);
    if(_base&&(w>0||r>0))w=Math.round((w+_base)*100)/100;   // 입력=추가 원판 → 총 무게로 저장
    const rpeSel=inp.querySelector('.wl-rpe-sel');
    const rpe=rpeSel?parseFloat(rpeSel.value)||0:0;          // RPE는 선택 입력 — 있을 때만 세트에 저장
    const wuBtn=inp.querySelector('.wl-wu-btn');
    const wuOn=!!(wuBtn&&wuBtn.classList.contains('on'));    // 워밍업 세트 — 기록은 남기되 집계 제외
    const painBtn=inp.querySelector('.wl-pain-btn');
    const painOn=!!(painBtn&&painBtn.classList.contains('on')); // 통증 — RPE·워밍업과 같은 방식으로 확정 시 함께 저장
    const editIdx=log.dataset.editIdx;
    const s=this.session();
    let ex=s.exercises.find(e=>e.name===log.dataset.exname);
    if(!ex){ex={name:log.dataset.exname,sets:[]};s.exercises.push(ex);this.autoAlias(ex.name);}
    if(editIdx!==''&&editIdx!=null&&ex.sets[+editIdx]){
      // 기존 세트 제자리 수정 (휴식 타이머·PR 토스트 없음). ts는 최초 기록 시각, pain 플래그 보존.
      const old=ex.sets[+editIdx];
      ex.sets[+editIdx]=Object.assign({_id:old._id,weight:w,reps:r,ts:old.ts||new Date().toISOString()},this._loadMeta(log.dataset.exname,w),painOn?{pain:true}:{},rpe?{rpe}:{},wuOn?{warmup:true}:{});
      this.setSession(s);
      this.cancelSet(el);
      this.refresh();
      this._syncSoon();
      return;
    }
    // 신규 세트 (워밍업은 PR 판정 대상 아님)
    const isPR=wuOn?false:this.checkPR(log.dataset.exname,w,r);
    ex.sets.push(Object.assign({weight:w,reps:r,ts:new Date().toISOString()},this._loadMeta(log.dataset.exname,w),rpe?{rpe}:{},wuOn?{warmup:true}:{},painOn?{pain:true}:{}));
    this.setSession(s);
    this.cancelSet(el);
    this.refresh();
    if(isPR)this.showPR(log.dataset.exname);
    if(this.date===_todayKey()){this._askNotify();this.startRest(log.dataset.exname,wuOn?60:0);} // 워밍업 후 휴식은 짧게(60초)
    this._maybeSessionDone();
    this._syncSoon();
  },
  // ── 세션 결산: 오늘 데이 플랜의 마지막 종목이 기록되는 순간 1회 — 세트·볼륨·시간·PR·지난 같은 요일 대비 ──
  _doneShown:'',
  _maybeSessionDone(){
    if(this.date!==_todayKey()||this._doneShown===this.date)return;
    const day=this.dayType(this.date);if(day==='REST')return;
    const idx=this.PANEL_DAY.indexOf(day);
    const panel=idx>=0?document.querySelector('.day-panel.dp'+(idx+1)):null;if(!panel)return;
    const names=[...new Set([...panel.querySelectorAll('.ex-wrap .ex-nm')].map(x=>this.canon(x.textContent.trim())))];
    if(!names.length)return;
    const s=this.session();
    const logged=new Set((s.exercises||[]).filter(e=>(e.sets||[]).some(_isWorkSet)).map(e=>this.canon(e.name)));
    if(!names.every(n=>logged.has(n)))return;
    this._doneShown=this.date;
    // 통계: 본세트·볼륨·소요시간(ts)·오늘 PR 종목 수
    let sets=0,vol=0;const tss=[];
    (s.exercises||[]).forEach(e=>(e.sets||[]).forEach(st=>{if(st.ts)tss.push(st.ts);if(_isWorkSet(st)){sets++;vol+=(st.weight||0)*st.reps;}}));
    let dur='';if(tss.length>=2){tss.sort();const m=Math.round((new Date(tss[tss.length-1])-new Date(tss[0]))/60000);if(m>0&&m<300)dur=' · '+m+'분';}
    let prs=0;
    (s.exercises||[]).forEach(e=>{
      const ws=(e.sets||[]).filter(_isWorkSet);if(!ws.length)return;
      const cn=this.canon(e.name);
      let today=-1;ws.forEach(st=>{const v=_ldW(st)>0?_e1Of(_ldW(st),st.reps):st.reps;if(v>today)today=v;});
      let prior=-1;
      this._exFor(cn).forEach(r=>{if(r.date>=this.date)return; // 종목 인덱스 — 전체 날짜 풀스캔 제거
        (r.ex.sets||[]).filter(_isWorkSet).forEach(st=>{const v=_ldW(st)>0?_e1Of(_ldW(st),st.reps):st.reps;if(v>prior)prior=v;});});
      if(prior>=0&&today>prior+0.05)prs++;
    });
    // 지난 같은 요일 세션 대비 볼륨
    let cmp='';
    const prevK=this._pastKeysDesc().find(k=>(this.data[k]||{}).day===day); // 캐시된 키에서 첫 매치만
    if(prevK){
      let pv=0;(this.data[prevK].exercises||[]).forEach(e=>(e.sets||[]).filter(_isWorkSet).forEach(st=>{pv+=(st.weight||0)*st.reps;}));
      if(pv>0){const p=Math.round((vol-pv)/pv*100);cmp='<div class="dn-t3">지난 '+day+' 대비 볼륨 '+(p>=0?'+':'')+p+'%</div>';}
    }
    let t=document.getElementById('done-toast');
    if(!t){t=document.createElement('div');t.id='done-toast';t.className='done-toast';document.body.appendChild(t);}
    t.innerHTML='<span class="dn-emoji">✅</span><div class="dn-txt"><div class="dn-t1">'+day+' 세션 완료!</div><div class="dn-t2">'+sets+'세트 · '+Math.round(vol).toLocaleString()+'kg'+dur+(prs?' · PR '+prs+'개 🎉':'')+'</div>'+cmp+'</div>';
    t.classList.remove('show');void t.offsetWidth;t.classList.add('show');
    try{navigator.vibrate&&navigator.vibrate(120);}catch(_){}
    clearTimeout(this._dnTimer);this._dnTimer=setTimeout(function(){t.classList.remove('show');},6000);
  },
  // 알림 권한: 사용자 제스처(세트 확정) 시 1회만 요청 — 백그라운드에서 휴식 종료 알림용
  _notifAsked:false,
  _askNotify(){
    if(this._notifAsked)return;this._notifAsked=true;
    try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch(_){}
  },

  cancelSet(el){
    const inp=el.closest('.ex-log-input');
    const log=inp.closest('.ex-log');
    inp.querySelector('.wl-rp-input').value='';
    const rs=inp.querySelector('.wl-rpe-sel');if(rs)rs.value='';
    const wu=inp.querySelector('.wl-wu-btn');if(wu)wu.classList.remove('on');
    inp.style.display='none';
    const rc=log.querySelector('.wl-rep-chips');if(rc)rc.style.display='none';
    log.dataset.editIdx='';
    const del=inp.querySelector('.wl-del-btn');if(del)del.style.display='none';
    const pb=inp.querySelector('.wl-pain-btn');if(pb)pb.classList.remove('on');
    const ab=log.querySelector('.ex-log-add-btn');
    if(ab)ab.style.display='';
  },

  // ── 통증 플래그: 세트 수정 모드에서 ⚠️ 토글 — '날카로운 통증=중단' 원칙의 기록 수단 ──
  togglePainSet(el){
    const inp=el.closest('.ex-log-input');
    const log=inp.closest('.ex-log');
    const editIdx=log.dataset.editIdx;
    // 신규 입력 모드: 버튼 상태만 켜두고 confirmSet이 저장한다.
    // 이전에는 수정 모드에서만 눌 수 있어서, 통증을 남기려면 세트를 확정한 뒤 칩을 눌러 수정으로 들어가야 했다.
    // 통증은 세트 도중에 생기는데 기록에 두 단계가 더 필요했던 셈이고, 857세트 중 0건이 그 결과다.
    // 디로드 신호 「통증 2회+/7일」과 '같은 종목 재도전 시 통증 이력 상기'가 둘 다 이 플래그에 걸려 있다.
    if(editIdx===''||editIdx==null){el.classList.toggle('on');return;}
    const s=this.session();
    const ex=s.exercises.find(e=>e.name===log.dataset.exname);
    if(!ex||!ex.sets[+editIdx])return;
    const next=!ex.sets[+editIdx].pain;
    if(next)ex.sets[+editIdx].pain=true;else delete ex.sets[+editIdx].pain;
    this.setSession(s);
    el.classList.toggle('on',next);
    this.refresh();
    this._syncSoon();
  },
  // 과거 통증 이력 (canon 기준 최근 1건) — 같은 종목 재도전 시 상기용
  _lastPain(name){
    const cn=this.canon(name);let hit=null;
    for(const dk in this.data){
      if(dk===this.date)continue;
      (this.data[dk].exercises||[]).forEach(e=>{
        if(this.canon(e.name)!==cn)return;
        (e.sets||[]).forEach(st=>{if(st.pain&&(!hit||dk>hit.date))hit={date:dk,w:st.weight,r:st.reps};});
      });
    }
    return hit;
  },

  deleteSet(el){
    const inp=el.closest('.ex-log-input');
    const log=inp.closest('.ex-log');
    const editIdx=log.dataset.editIdx;
    if(editIdx===''||editIdx==null){this.cancelSet(el);return;}
    const s=this.session();
    const ex=s.exercises.find(e=>e.name===log.dataset.exname);
    if(ex&&ex.sets[+editIdx]){
      const removedSetNo=ex.sets.length; // 삭제 후 뒤 세트들이 한 칸씩 당겨지며 마지막 setNo가 시트에 잔여 행으로 남음
      ex.sets.splice(+editIdx,1);
      this.setSession(s);
      this._deleteFromSheet(this.date,ex.name,removedSetNo);
    }
    this.cancelSet(el);
    this.refresh();
    this._syncSoon();
  },
  // upsert 방식에서는 로컬 삭제만으로 시트 행이 안 지워지므로, 잔여 행을 명시적으로 정리.
  // 이전에는 fire-and-forget fetch라 오프라인·실패 시 삭제가 시트에 영영 누락 → pull 복원 때 지운 세트가 부활했다.
  // 지금은 영속 큐(sync_del)에 넣고 성공 시에만 제거 — init/online/동기화 시점에 자동 재전송된다.
  _saveDelQ(){window.storage.set('sync_del',JSON.stringify(this._delQ)).catch(e=>SafeStore.report(e));},
  _deleteFromSheet(date){this._dirty.add(date);this._saveDirty();this._syncSoon();},
  _flushDeletes(){this._delQ.forEach(k=>this._dirty.add(k.date));this._saveDirty();return Promise.resolve(true);},
  _drainDeletes(){return this._flushDeletes();},

  // 다른 날짜(오늘 제외) 기준 최고 — 토스트(checkPR)·주간요약과 동일한 e1RM(맨몸은 reps) 기준으로 통일
  // ── 종목 인덱스: canon → [{date,ex}] 날짜 오름차순 ──
  // 이전에는 _priorBest·prevSession·_hasHist·완료토스트 PR 집계가 각각 전체 기록(모든 날×모든 종목)을 풀스캔했다.
  // 지연 구축 + 데이터 변경 시 무효화(markDirty)로, 조회 비용을 '그 종목의 기록 수'에 비례하게 축소 —
  // 기록이 수년치로 쌓여도 날짜 이동·목표 주입이 일정 속도를 유지한다. ex는 참조 공유라 세트 편집이 즉시 반영된다.
  _exIdx:null,
  _invalidateIdx(){this._exIdx=null;this._dk=null;this._pkdCache=null;},
  // data 감시 프록시: this.data[k]=… / delete / this.data={} 전체 교체 — 어떤 경로로 써도 캐시가 자동 무효화된다.
  // 실제 앱은 markDirty가 쓰기 관문이지만, 시트 복원·백업 가져오기·테스트처럼 data를 직접 다루는 코드도 안전해진다.
  // 같은 참조 재대입(setSession의 통상 경로)은 스킵 — 인덱스가 ex 참조를 공유하므로 무효화 불필요.
  _wrapData(){
    if(this._dataWrapped)return;this._dataWrapped=true;
    const self=this;
    const wrap=obj=>new Proxy(obj,{
      set(o,k,v){if(o[k]!==v){o[k]=v;self._invalidateIdx();}return true;},
      deleteProperty(o,k){delete o[k];self._invalidateIdx();return true;}
    });
    let cur=wrap(this.data||{});
    Object.defineProperty(this,'data',{
      get(){return cur;},
      set(v){cur=wrap(v||{});self._invalidateIdx();},
      configurable:true
    });
  },
  _buildExIdx(){
    const idx={};
    for(const dk of this._dateKeys()){
      (this.data[dk].exercises||[]).forEach(ex=>{
        if(!(ex.sets||[]).length)return;
        const cn=this.canon(ex.name);
        (idx[cn]=idx[cn]||[]).push({date:dk,ex});
      });
    }
    return this._exIdx=idx;
  },
  _exFor(cn){return (this._exIdx||this._buildExIdx())[cn]||[];},
  // 정렬된 날짜 키 캐시 — Object.keys().filter().sort()를 호출부마다 반복하던 것을 공용화
  _dk:null,
  _dateKeys(){return this._dk||(this._dk=Object.keys(this.data).sort());},
  _pkdCache:null,
  _pastKeysDesc(d){ // 기준일(기본: 열람일) 이전 날짜 내림차순 — (데이터·기준일)당 1회만 계산
    d=d||this.date;
    const c=this._pkdCache;
    if(c&&c.d===d)return c.a;
    const a=this._dateKeys().filter(k=>k<d).reverse();
    this._pkdCache={d,a};
    return a;
  },
  // 캐시: refresh()가 세트 입력마다 카드 수 × 전체 기록 일수를 재스캔하던 것을 (열람일·canon)당 1회로 축소.
  // 과거최고는 '열람일 이외' 날짜의 데이터라 같은 날 안에서는 불변 — 날짜 이동(_miniCacheCheck)·별칭 변경 시 무효화.
  _pbCache:{},
  _priorBest(name){
    const cn=this.canon(name); // 루프 밖 1회 계산 (이전에는 날짜×종목 비교마다 재계산)
    const ck=this.date+'|'+cn;
    const hit=this._pbCache[ck];if(hit)return hit;
    let bestE1=-1,bestReps=-1;
    for(const r of this._exFor(cn)){
      if(r.date===this.date)continue;
      r.ex.sets.forEach(st=>{if(_isWorkSet(st)){if(_ldW(st)>0){const e1=_e1Of(_ldW(st),st.reps);if(e1>bestE1)bestE1=e1;}else if(st.reps>bestReps)bestReps=st.reps;}});
    }
    return this._pbCache[ck]={bestE1,bestReps};
  },

  // ── 세션 페이스: 세트 타임스탬프(ts)로 세션 소요시간·세트 간격을 집계, 종목별 목표 휴식과 비교 ──
  // 간격 = 휴식 + 다음 세트 수행 시간이므로 목표 휴식보다 다소 긴 게 정상. 15분 초과 공백은 이동/중단으로 간주해 제외.
  _fmtSec(sec){const m=Math.floor(sec/60),ss=Math.round(sec%60);return m?(m+'분'+(ss?' '+ss+'초':'')):(ss+'초');},
  sessionPace(dateKey){
    const s=this.data[dateKey||this.date];if(!s)return null;
    const evs=[];
    (s.exercises||[]).forEach(ex=>{const rs=this.restSec(ex.name);(ex.sets||[]).forEach(st=>{if(st.ts&&st.reps>0)evs.push({t:+st.ts,rs});});});
    if(evs.length<4)return null;
    evs.sort((x,y)=>x.t-y.t);
    const mins=Math.round((evs[evs.length-1].t-evs[0].t)/60000);
    let gap=0,tgt=0,n=0;
    for(let i=1;i<evs.length;i++){
      const g=(evs[i].t-evs[i-1].t)/1000;
      if(g>900)continue;
      gap+=g;tgt+=evs[i].rs;n++;
    }
    if(!n||mins<5)return null;
    return{mins,avg:Math.round(gap/n),tgt:Math.round(tgt/n),n};
  },
  refresh(){
    this.renderRoutineUI();
    const s=this.session();
    this.renderProgress();
    this.renderBrief();
    let totSets=0,totVol=0;
    this._miniCacheCheck();                                  // 날짜 바뀌면 '지난 기록' 캐시 무효화
    document.querySelectorAll('.ex-log').forEach(log=>{
      const ex=s.exercises.find(e=>e.name===log.dataset.exname);
      this._updateMini(log,ex);                              // 접힘 상태 요약(지난 기록·오늘 세트) — 기록 없어도 갱신
      const chips=log.querySelector('.ex-log-chips');
      if(!chips)return;
      if(!ex||!ex.sets.length){chips.innerHTML='<span class="ex-log-empty">기록 없음</span>';return;}
      // 신기록 세트 1개만 강조 — 로딩 종목은 e1RM 최고, 맨몸 종목은 reps 최고가 과거(다른 날) 최고를 넘으면 표시
      const pb=this._priorBest(ex.name);
      const loadedToday=ex.sets.some(st=>_ldW(st)>0&&_isWorkSet(st));
      let prIdx=-1,prBest=-1;
      ex.sets.forEach((st,i)=>{
        if(!_isWorkSet(st))return;
        if(loadedToday){if(_ldW(st)>0){const e1=_e1Of(_ldW(st),st.reps);if(pb.bestE1>=0&&e1>pb.bestE1+0.05&&e1>prBest){prBest=e1;prIdx=i;}}}
        else{if(pb.bestReps>=0&&st.reps>pb.bestReps&&st.reps>prBest){prBest=st.reps;prIdx=i;}}
      });
      chips.innerHTML=ex.sets.map((set,i)=>{
        const isWu=!!set.warmup;
        const cls=isWu?'wu':(set.reps>=8?'hit':set.reps>=6?'':'miss');
        if(!isWu&&set.reps>0){totSets++;totVol+=_ldW(set)*set.reps;}  // 워밍업은 세트·볼륨 합계 제외
        const badge=(i===prIdx)?'<span class="pr-trophy" title="개인 기록 갱신">🏆</span>':'';
        const rpeMk=set.rpe?'<i class="chip-rpe">@'+set.rpe+'</i>':'';
        const painMk=set.pain?'<i class="chip-pain" title="통증 기록됨">⚠️</i>':'';
        const wuMk=isWu?'W ':'';
        const lt=this.loadTypeOf(ex.name);
        const body=lt==='time'?(set.reps+'초'+(set.weight>0?('+'+set.weight):''))
                 :(lt==='assist'?('보조'+set.weight+'×'+set.reps)
                 :(lt==='bw'?((set.weight>0?('+'+set.weight):'맨몸')+'×'+set.reps)
                 :(set.weight+'×'+set.reps)));
        const efTip=(set.ew>0&&lt!=='normal')?(' · 실부하 '+set.ew+'kg'):'';
        return`<span class="wl-set-chip ${cls}" data-i="${i}" onclick="ExLog.editSet(this)" title="탭하여 수정·삭제${efTip}">${wuMk}${body}${rpeMk}${painMk}${badge}</span>`;
      }).join('');
    });
    const sum=document.getElementById('sess-sum');
    if(sum){
      if(totSets===0){sum.style.display='none';}
      else{
        // 같은 데이 타입(Push/Pull/…)의 직전 세션 톤수와 비교 — '오늘 하루'가 좋은 날인지 즉시 피드백
        let cmp='';
        const pv=this._prevDayTypeVol(s.day||this.dayType(this.date));
        if(pv&&pv.vol>0){
          const pct=Math.round((totVol-pv.vol)/pv.vol*100);
          cmp=pct===0?`<span class="sess-cmp">지난 ${pv.day}와 동일</span>`
            :`<span class="sess-cmp ${pct>0?'up':'dn'}">지난 ${pv.day} 대비 ${pct>0?'+':''}${pct}% ${pct>0?'↑':'↓'}</span>`;
        }
        const pace=this.sessionPace(this.date);
        const paceHtml=pace?`<span class="sess-pace">⏱ 세션 ${pace.mins}분 · 세트 간격 평균 ${this._fmtSec(pace.avg)} (목표 휴식 ${this._fmtSec(pace.tgt)}${pace.avg-pace.tgt>150?' — 간격 김':''})</span>`:'';
        sum.style.display='';sum.innerHTML=`💪 오늘 <b>${totSets}</b>세트 · 볼륨 <b>${Math.round(totVol).toLocaleString()}</b>kg${cmp}${paceHtml}`;
      }
    }
    const mb=document.getElementById('motiv-bar');
    if(mb){
      const {wk,total}=this.weekStats();
      if(total===0){mb.style.display='none';}
      else{
        // 주간 목표 볼륨 달성률 — 보고 있는 날짜가 이번 주일 때만 표시(주간 계산이 현재 주 기준이므로)
        let goal='';
        if(typeof PlanApp!=='undefined'&&PlanApp._weekKeys&&PlanApp._weekKeys(0).includes(this.date)){
          const g=this._weekGoalPct();if(g)goal=` · 목표 볼륨 <b>${g.pct}%</b> (${g.done}/${g.target}세트)`;
        }
        mb.style.display='';mb.innerHTML=`🔥 이번 주 ${wk}/6일 완료 · 누적 ${total}회 운동${goal}`;
      }
    }
    // 6주 블록 칩 (motiv-bar 아래)
    if(mb&&mb.parentNode){
      let bc=document.getElementById('block-chip');
      if(!bc){bc=document.createElement('div');bc.id='block-chip';bc.className='block-chip';mb.parentNode.insertBefore(bc,mb.nextSibling);}
      const bw=this.blockWeek();
      bc.innerHTML=bw?('📆 훈련 블록 <b>'+bw+'/6주차</b>'+(bw>=6?' <span class="bc-due">리뷰 시점 — 플랜 탭 확인</span>':'')+'<span class="bc-act" onclick="ExLog.startBlock()">새 블록</span>')
                    :('📆 6주 블록 미설정<span class="bc-act" onclick="ExLog.startBlock()">오늘부터 시작</span>');
    }
    // 레그데이 영양 리마인더 (확정된 프로토콜 상기용 — Legs/Legs+ 날짜에만)
    if(mb&&mb.parentNode){
      let ln=document.getElementById('legday-note');
      if(!ln){ln=document.createElement('div');ln.id='legday-note';ln.className='legday-note';ln.style.display='none';const bc2=document.getElementById('block-chip');mb.parentNode.insertBefore(ln,(bc2||mb).nextSibling);}
      if(/Legs/.test(this.dayType(this.date))){ln.style.display='';ln.innerHTML='🍚 <b>레그데이 영양</b> — 운동 후 평소 식사와 수분을 챙기고, 다음 세션까지 회복 상태를 확인하세요';}
      else ln.style.display='none';
    }
    this.renderCardio();                                     // 유산소 목록 갱신
    this.renderCond();                                       // 컨디션·수면 표시 갱신
    this.renderWeeklyReport();                               // 주간 리포트 동기 갱신 (운동 탭 하단 상시 노출)
    this.updateGripChips();                                  // 데드 그립 교대 표시 갱신
  },

  // ── 접힘 상태 카드 요약: '지난 50×10 · 오늘 2세트' ──
  _miniCacheCheck(){if(this._miniDate!==this.date){this._miniDate=this.date;this._miniPrev={};this._pbCache={};this._stepCache={};}},
  _prevTopStr(name){
    if(name in this._miniPrev)return this._miniPrev[name];   // prevSession은 오늘 기록과 무관 → 날짜 단위 캐시
    const prev=this.prevSession(name);
    let str=null;
    if(prev&&prev.sets.length){
      const top=prev.sets.reduce((a,s)=>(s.weight>a.weight||(s.weight===a.weight&&s.reps>a.reps))?s:a,prev.sets[0]);
      str=this.isTimed(name)?(top.reps+'초'):(top.weight>0?(top.weight+'×'+top.reps):(top.reps+'회'));
    }
    return this._miniPrev[name]=str;
  },
  _updateMini(log,ex){
    const card=log.closest('details.ex-card');if(!card)return;
    const info=card.querySelector('summary .ex-info');if(!info)return;
    const parts=[];
    const prev=this._prevTopStr(log.dataset.exname);
    if(prev)parts.push('지난 '+prev);
    const n=ex?ex.sets.filter(_isWorkSet).length:0;
    if(n)parts.push('오늘 <b>'+n+'</b>세트');
    let mini=info.querySelector('.ex-mini');
    if(!parts.length){if(mini)mini.remove();return;}
    if(!mini){mini=document.createElement('div');mini.className='ex-mini';info.appendChild(mini);mini.setAttribute('onclick','event.preventDefault();event.stopPropagation();ExLog.showHistory(this.closest(\'.ex-wrap\').querySelector(\'.ex-log\').dataset.exname)');mini.title='탭하면 이 종목 전체 기록';}
    mini.innerHTML=parts.join(' · ');
  },

  // ── 종목별 전체 히스토리: canon 기준 전 기간 날짜별 본세트 + e1RM 곡선 (6주 블록 리뷰·정체 판단 근거) ──
  showHistory(name){
    const cn=this.canon(name);
    const rows=[];                                            // {dk, sets(본세트), e1(그날 최고)}
    Object.keys(this.data).sort().forEach(dk=>{
      (this.data[dk].exercises||[]).forEach(e=>{
        if(this.canon(e.name)!==cn)return;
        const sets=(e.sets||[]).filter(_isWorkSet);if(!sets.length)return;
        let e1=0;sets.forEach(s=>{const v=_ldW(s)>0?_e1Of(_ldW(s),s.reps):0;if(v>e1)e1=v;});
        rows.push({dk,sets,e1});
      });
    });
    let m=document.getElementById('hist-modal');
    if(!m){
      m=document.createElement('div');m.id='hist-modal';m.className='ib-modal';m.style.display='none';
      m.setAttribute('onclick',"if(event.target===this)ExLog.closeHistory()");
      m.innerHTML='<div class="ib-modal-box"><div class="ib-modal-handle"></div><div class="ib-modal-hd" id="hist-hd"></div><div class="ib-modal-sub" id="hist-sub"></div><div id="hist-body"></div><button class="hist-close" onclick="ExLog.closeHistory()">닫기</button></div>';
      document.body.appendChild(m);
    }
    document.getElementById('hist-hd').textContent='📈 '+cn;
    document.getElementById('hist-sub').textContent='전체 기록 '+rows.length+'회 (워밍업 제외 · 별칭 연결 포함)';
    const body=document.getElementById('hist-body');
    if(!rows.length){body.innerHTML='<div class="hist-empty">아직 기록이 없습니다.</div>';}
    else{
      // e1RM 전체 곡선 (로딩 기록 2회 이상일 때만)
      const e1s=rows.filter(r=>r.e1>0).map(r=>r.e1);
      let spark='';
      if(e1s.length>=2){
        const mn=Math.min(...e1s),mx=Math.max(...e1s),rng=(mx-mn)||.001;
        const W=320,H=56,pad=6,step=(W-pad*2)/(e1s.length-1);
        const pts=e1s.map((v,i)=>(pad+i*step).toFixed(1)+','+(H-pad-(v-mn)/rng*(H-pad*2)).toFixed(1));
        const last=pts[pts.length-1].split(',');
        spark='<div class="hist-spark"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline points="'+pts.join(' ')+'" fill="none" stroke="#085041" stroke-width="2" stroke-linejoin="round"/><circle cx="'+last[0]+'" cy="'+last[1]+'" r="3" fill="#085041"/></svg></div>';
      }
      const bestE1=Math.max(0,...e1s);
      const first=rows[0],lastR=rows[rows.length-1];
      const gain=(first.e1>0&&lastR.e1>0)?('<span>변화 <b>'+(lastR.e1-first.e1>=0?'+':'')+(lastR.e1-first.e1).toFixed(1)+'kg</b></span>'):'';
      const stat='<div class="hist-stat"><span>최고 e1RM <b>'+(bestE1>0?bestE1.toFixed(1)+'kg':'—')+'</b></span>'+gain+'<span>기간 <b>'+first.dk.slice(5).replace('-','/')+'~'+lastR.dk.slice(5).replace('-','/')+'</b></span></div>';
      const fmt=(typeof PlanApp!=='undefined'&&PlanApp._fmtSets)?PlanApp._fmtSets.bind(PlanApp):(ss=>ss.map(s=>s.weight+'×'+s.reps).join(', '));
      const list=rows.slice().reverse().map(r=>{
        const d=new Date(r.dk+'T12:00:00').toLocaleDateString('ko-KR',{year:'2-digit',month:'numeric',day:'numeric'});
        return '<div class="hist-row"><span class="hist-date">'+d+'</span><span class="hist-sets">'+fmt(r.sets)+'</span><span class="hist-e1'+(r.e1>0&&r.e1>=bestE1-0.05?' pr':'')+'">'+(r.e1>0?r.e1.toFixed(1):'')+'</span></div>';
      }).join('');
      body.innerHTML=spark+stat+'<div class="hist-rows">'+list+'</div>';
    }
    m.style.display='flex';
  },
  closeHistory(){const m=document.getElementById('hist-modal');if(m)m.style.display='none';},

  // ── 같은 데이 타입의 직전 세션 톤수 ──
  _prevDayTypeVol(day){
    if(!day||day==='REST')return null;
    const keys=this._pastKeysDesc(); // 캐시된 내림차순 키 — 호출마다 filter+sort 반복 제거
    for(const k of keys){
      const ses=this.data[k];if(!ses||this._baseType(ses.day)!==this._baseType(day))continue; // 옛 Push+ 기록도 Push 이력으로 비교
      let v=0,has=false;
      (ses.exercises||[]).forEach(e=>(e.sets||[]).forEach(st=>{if(_isWorkSet(st)){has=true;v+=(st.weight||0)*st.reps;}}));
      if(has)return{vol:v,day,date:k};
    }
    return null;
  },

  // ── 주간 목표 볼륨 달성률: 부위별 목표(RECO_TARGET) 상한으로 캡핑해 과잉 부위가 미달 부위를 상쇄하지 못하게 ──
  _weekGoalPct(){
    const vol=this._weekMuscleSets();
    let done=0,target=0;
    for(const m in RECO_TARGET){target+=RECO_TARGET[m];done+=Math.min(vol[m]||0,RECO_TARGET[m]);}
    if(!target)return null;
    return{pct:Math.round(done/target*100),done:Math.round(done*10)/10,target};
  },

  // ── 세션 타이밍: ts 있는 세트로 세션 소요시간·세트 간 평균 간격 계산 (구 기록·이상치는 자동 제외) ──
  _sessionTiming(dk){
    const d=this.data[dk];if(!d)return null;
    const ts=[];(d.exercises||[]).forEach(e=>(e.sets||[]).forEach(st=>{if(st.ts&&st.reps>0){const t=new Date(st.ts).getTime();if(!isNaN(t))ts.push(t);}}));
    if(ts.length<2)return null;
    ts.sort((a,b)=>a-b);
    const dur=(ts[ts.length-1]-ts[0])/60000;
    if(dur<5||dur>300)return null;                       // 5분 미만·5시간 초과 = 일괄 입력/이상치
    const gaps=[];for(let i=1;i<ts.length;i++){const g=(ts[i]-ts[i-1])/60000;if(g>0.2&&g<15)gaps.push(g);}
    return{dur,gap:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null};
  },
  _fmtMin(m){const h=Math.floor(m/60),mm=Math.round(m%60);return h?h+'시간 '+mm+'분':mm+'분';},

  // ── 인바디 측정 리마인더: 일요일(고정 측정일)인데 이번 주 측정 기록이 없으면 리포트 상단에 안내 ──
  _ibReminderHtml(now){
    try{
      now=now||new Date();
      if(now.getDay()!==0)return'';
      if(typeof InBody==='undefined'||!Array.isArray(InBody._log))return'';
      const mon=PlanApp._weekKeys(0)[0];
      if(InBody._log.some(e=>e.date>=mon))return'';
      return'<div class="wr-remind">📏 오늘은 인바디 측정일 — 같은 조건(운동 전 · 식후 2~3시간 · 전날 저염)으로 측정 후 체성분 현황에 입력하세요.</div>';
    }catch(_){return'';}
  },
  // 백업 리마인더: 마지막 JSON 내보내기 14일 경과 시 (해외 체류 중 기기 리스크 대비)
  _backupReminderHtml(){
    try{
      const lb=this.lastBackup;
      const days=lb?Math.round((new Date(_todayKey()+'T12:00:00')-new Date(lb+'T12:00:00'))/86400000):null;
      if(days!==null&&days<14)return'';
      return'<div class="wr-remind">💾 마지막 백업 '+(days===null?'기록 없음':days+'일 전')+' — 백업 카드에서 JSON 내보내기로 보관해 두세요.</div>';
    }catch(_){return'';}
  },

  // ── 주간 리포트 (REST 패널): PR·최고 리프트·부위 달성·다음 주 도전 ──
  renderWeeklyReport(){
    const box=document.getElementById('weekly-report');if(box)box.innerHTML=this._weeklyReportHtml();
  },
  _weeklyReportHtml(){
    if(typeof PlanApp==='undefined'||!PlanApp._weekKeys)return'';
    const wkKeys=PlanApp._weekKeys(0),wkSet=new Set(wkKeys);
    // 이번 주 PR — 주간요약(renderWeekSummary)과 동일한 1패스 러닝베스트 방식
    const prs=[];const best={};let top=null;
    Object.keys(this.data).sort().forEach(dk=>{
      const inWeek=wkSet.has(dk);
      (this.data[dk].exercises||[]).forEach(e=>{
        const sets=(e.sets||[]).filter(_isWorkSet);if(!sets.length)return;
        let dayMax=-1,dayTopSet=null;
        sets.forEach(s=>{
          const cur=_ldW(s)>0?_e1Of(_ldW(s),s.reps):s.reps;
          if(cur>dayMax){dayMax=cur;dayTopSet=s;}
          if(inWeek&&s.weight>0){const e1=_e1Of(_ldW(s),s.reps);if(!top||e1>top.e1)top={e1,name:e.name,w:s.weight,r:s.reps};}
        });
        if(inWeek){
          const b=best[e.name];
          if(b!==undefined&&dayMax>b+0.05&&!prs.some(p=>p.name===e.name))
            prs.push({name:e.name,txt:dayTopSet.weight>0?(dayTopSet.weight+'×'+dayTopSet.reps):(dayTopSet.reps+'회')});
        }
        if(dayMax>(best[e.name]??-Infinity))best[e.name]=dayMax;
      });
    });
    const sessions=wkKeys.filter(dk=>{const d=this.data[dk];return d&&((d.exercises||[]).some(e=>(e.sets||[]).some(_isWorkSet))||(d.cardio&&d.cardio.length));}).length; // 유산소만 한 날도 활동일
    const remind=this._ibReminderHtml()+this._backupReminderHtml();
    if(!sessions)return'<div class="wr-card"><div class="wr-hd">📋 이번 주 리포트</div>'+remind+'<div class="wr-empty">이번 주 기록이 아직 없습니다. 세트를 기록하면 일요일에 여기서 한 주를 결산합니다.</div></div>';
    // 부위별 목표 달성/미달
    const vol=this._weekMuscleSets();
    const misses=[];const hits=[];
    for(const m in RECO_TARGET){const v=vol[m]||0;(v>=RECO_TARGET[m]?hits:misses).push({m,v,t:RECO_TARGET[m]});}
    misses.sort((a,b)=>(a.v/a.t)-(b.v/b.t));
    // 다음 주 도전 — 이번 주 수행 종목 중 증량 신호(⬆)가 뜬 것
    const ups=[];const seenEx=new Set();
    wkKeys.forEach(dk=>{(this.data[dk]&&this.data[dk].exercises||[]).forEach(e=>{
      if(seenEx.has(e.name)||!(e.sets||[]).some(_isWorkSet))return;seenEx.add(e.name);
      const sg=this.suggestTarget(e.name);if(sg&&sg.up)ups.push(e.name);
    });});
    const g=this._weekGoalPct();
    let h='<div class="wr-card"><div class="wr-hd">📋 이번 주 리포트</div>'+remind;
    h+='<div class="wr-row"><span>운동 일수</span><span class="v">'+sessions+'/6일</span></div>';
    // 유산소 주간 누적 (목표 150분 — LISS 중심, 내장지방 감량 축)
    const cm=this._weekCardioMin();
    h+='<div class="wr-row"><span>유산소</span><span class="v'+(cm>=150?' pr':(cm?'':' miss'))+'">'+cm+'/150분</span></div>';
    // 컨디션·수면 평균 (기록된 날만)
    const ca=this._weekCondAvg();
    if(ca.rate!=null)h+='<div class="wr-row"><span>평균 컨디션</span><span class="v'+(ca.rate<3?' miss':'')+'">'+ca.rate.toFixed(1)+'/5</span></div>';
    if(ca.sleep!=null)h+='<div class="wr-row"><span>평균 수면</span><span class="v'+(ca.sleep<6?' miss':'')+'">'+ca.sleep.toFixed(1)+'h</span></div>';
    const si=this.sleepInsight();if(si)h+='<div class="wr-insight">'+si.html+'</div>';
    // 이번 주 세션 노트 — 볼륨·정체 해석의 맥락 (통증·환경 등)
    const notes=[];wkKeys.forEach(dk=>{const n=this.data[dk]&&this.data[dk].note;if(n)notes.push({dk,n});});
    if(notes.length){
      h+='<div class="wr-sec">📝 세션 메모</div>';
      notes.forEach(x=>{const dd=new Date(x.dk+'T12:00:00').toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',weekday:'short'});h+='<div class="wr-note-row"><b>'+dd+'</b> — '+String(x.n).replace(/</g,'&lt;')+'</div>';});
    }
    // 세션 시간·세트 간격 (ts 있는 세션만 평균)
    const tms=wkKeys.map(dk=>this._sessionTiming(dk)).filter(Boolean);
    if(tms.length){
      const avgDur=tms.reduce((a,t)=>a+t.dur,0)/tms.length;
      h+='<div class="wr-row"><span>평균 세션 시간</span><span class="v">'+this._fmtMin(avgDur)+' <small>('+tms.length+'회 기준)</small></span></div>';
      const gaps=tms.filter(t=>t.gap!=null);
      if(gaps.length){
        const avgGap=gaps.reduce((a,t)=>a+t.gap,0)/gaps.length;
        h+='<div class="wr-row"><span>평균 세트 간격</span><span class="v">'+Math.round(avgGap*60)+'초</span></div>';
      }
    }
    if(g)h+='<div class="wr-row"><span>목표 볼륨 달성</span><span class="v'+(g.pct>=100?' pr':'')+'">'+g.pct+'%</span></div>';
    if(top)h+='<div class="wr-row"><span>최고 리프트</span><span class="v">'+top.name+' '+top.w+'×'+top.r+'</span></div>';
    h+='<div class="wr-sec">🏆 이번 주 신기록 '+(prs.length?'('+prs.length+')':'')+'</div>';
    h+=prs.length?prs.slice(0,6).map(p=>'<div class="wr-row"><span>'+p.name+'</span><span class="v pr">'+p.txt+'</span></div>').join('')
      :'<div class="wr-empty">이번 주 신기록 없음 — 커팅 중엔 유지도 성공입니다.</div>';
    if(misses.length){
      h+='<div class="wr-sec">⚠ 목표 미달 부위</div>';
      h+=misses.slice(0,4).map(x=>'<div class="wr-row"><span>'+x.m+'</span><span class="v miss">'+(x.v%1?x.v.toFixed(1):x.v)+'/'+x.t+'세트</span></div>').join('');
    }
    if(ups.length){
      h+='<div class="wr-sec">⬆ 다음 주 증량 도전</div>';
      h+=ups.slice(0,5).map(n=>'<div class="wr-row"><span>'+n+'</span><span class="v">준비 완료</span></div>').join('');
    }
    h+='</div>';
    return h;
  },

  // ── 도전 무게 자동 산출 ──
  isCompound(name){return /스쿼트|데드|벤치|프레스|로우|풀업|풀다운|런지|딥스|쓰러스트|스플릿/.test(name);},
  // ── 증량 단위(step): 그 기구에서 실제로 만들 수 있는 최소 무게 간격 ────────────────
  // [고친 문제] 자동 목표가 고립 종목에 일률적으로 +1kg를 제안했다. 그런데 케이블·머신 스택은
  //   2.5kg 단위라 12.5 → 13.5 같은 무게는 존재하지 않는다. 제안이 실행 불가능하니 그대로 무시됐고,
  //   페이스풀 12.5(5주) · 스트레이트암 20(6주) · 머신 바이셉스컬 25(3주) · 케이블 래터럴 5.0(4주)이
  //   모두 같은 이유로 얼어붙어 있었다. 정체는 의지가 아니라 제안 해상도의 문제였다.
  // [해결] ① 그 종목에서 실제로 써 온 무게들의 최소 간격을 스택 단위로 추론하고
  //        ② 목표 증량분(복합 2.5 / 고립 1)을 그 단위의 배수로 올림한다.
  //   바벨은 1.25kg 원판 한 쌍 = 2.5kg가 실제 해상도이므로 기록 추론보다 우선한다
  //   (기록상 간격이 5~10인 것은 기구 한계가 아니라 증량 습관이라서).
  stepOf(name){
    const cn=this.canon(name);
    if(/바벨|EZ바|트랩바/.test(cn))return 2.5;
    if(/덤벨/.test(cn))return 2;
    const c=this._stepCache||(this._stepCache={});
    if(c[cn]!=null)return c[cn];
    const ws=new Set();
    (this._exFor(cn)||[]).forEach(r=>(r.ex.sets||[]).forEach(st=>{if(_isWorkSet(st)&&st.weight>0)ws.add(Math.round(st.weight*100)/100);}));
    const a=[...ws].sort((x,y)=>x-y);
    let g=0;
    for(let i=1;i<a.length;i++){const d=Math.round((a[i]-a[i-1])*100)/100;if(d>0&&(!g||d<g))g=d;}
    // 표본이 얕으면(서로 다른 무게 3개 미만) 추론을 믿지 않는다. 상식 범위 밖도 버린다.
    const ok=a.length>=3&&g>=0.5&&g<=25;
    return c[cn]=ok?Math.max(1,g):2.5;
  },
  // 다음 목표 무게: 증량분을 스택 단위의 배수로 올림. 실제로 걸 수 있는 무게만 제안한다.
  nextWeight(name,lastW){
    const step=this.stepOf(name);
    const inc=this.isCompound(name)?2.5:1;
    const add=Math.ceil((inc-1e-9)/step)*step;
    return{w:Math.round((lastW+add)*100)/100,step,add};
  },
  isTimed(name){return /플랭크|데드행/.test(name);},
  // 펌프성(고반복 소근육·둔근 고립) 종목 — 회복 수요가 낮아 기본 휴식 90초
  isPump(name){return /래터럴|레이즈|페이스풀|어브덕션|어덕션|슈러그|카프|종아리|크런치/.test(name);},
  restSec(name){const o=+this.restCfg[this.canon(name)];if(o>0)return o;if(this.isPump(name))return 90;return this.isCompound(name)?180:120;},
  // ── 종목별 휴식시간 오버라이드: 기본(복합 180초/고립 120초 — RPE 회복 우선, 펌프성 종목만 90초 지정)이 안 맞는 종목만 커스텀 (canon 기준 — 별칭 연결 시 승계) ──
  restCfg:{},
  async loadRestCfg(){try{const r=await window.storage.get('ex_rest');if(r)this.restCfg=JSON.parse(r.value)||{};}catch(_){}},
  saveRestCfg(){window.storage.set('ex_rest',JSON.stringify(this.restCfg)).catch(e=>SafeStore.report(e));},
  setRestCfg(name,sec){
    const cn=this.canon(name);
    if(sec>0)this.restCfg[cn]=Math.min(600,Math.round(sec));else delete this.restCfg[cn];
    this.saveRestCfg();
  },
  toggleRestCfg(btn){
    const det=btn.closest('.ex-detail');if(!det)return;
    let panel=det.querySelector('.ex-rest-panel');
    if(panel){panel.remove();return;}
    const log=det.querySelector('.ex-log');const name=log?log.dataset.exname:'';
    const cur=+this.restCfg[this.canon(name)]||'';
    const def=this.isCompound(name)?180:120;
    panel=document.createElement('div');panel.className='ex-base-panel';
    panel.innerHTML='<div class="ex-base-hd">⏱ 이 종목의 세트 간 <b>휴식시간</b>을 조정합니다. 비우면 기본('+def+'초)으로 돌아갑니다.</div>'
      +'<div class="ex-base-row"><input type="number" class="ex-rest-inp" step="15" min="15" max="600" inputmode="numeric" placeholder="기본 '+def+'초" value="'+cur+'">'
      +'<button class="ex-base-save" onclick="ExLog.saveRestFromUI(this)">저장</button>'
      +(cur?'<button class="ex-base-clear" onclick="ExLog.clearRestFromUI(this)">기본값</button>':'')+'</div>';
    btn.insertAdjacentElement('afterend',panel);
  },
  saveRestFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setRestCfg(log.dataset.exname,parseFloat(det.querySelector('.ex-rest-inp').value)||0);
    det.querySelector('.ex-base-panel').remove();
    this.injectTargets();
  },
  clearRestFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setRestCfg(log.dataset.exname,0);
    det.querySelector('.ex-base-panel').remove();
    this.injectTargets();
  },
  repCap(name){
    const p=this.prescription(name);if(p)return p.max;
    // 이전: WEEK_TARGETS 문구에서 rep 상한 파싱(문구가 낡으면 목표도 어긋남) → 운동 도감(sets:'4×6~8')에서 파싱
    const e=this.libByName(this.canon(name))||this.libByName(name);
    const s=(e&&e.sets)||'';
    // '3~4×8~12' 같은 표기에서 세트 수 범위(3~4)를 오파싱하지 않도록 '×' 뒤 렙 범위를 우선 매칭
    const rr=s.match(/×\s*(\d+)\s*~\s*(\d+)/);if(rr)return parseInt(rr[2]);
    const rep=s.match(/×\s*(\d+)/);if(rep)return parseInt(rep[1]);
    const range=s.match(/(\d+)\s*~\s*(\d+)/);if(range)return parseInt(range[2]);
    return this.isCompound(name)?8:12;
  },
  prevSession(name){
    // 요일 무관: 같은 종목명이 기록된 가장 최근 과거 날짜를 직전 기록으로 사용
    // (불규칙 스케줄에서도 도전 무게가 실제 최신 수행을 따라가도록)
    const cn=this.canon(name);
    const rs=this._exFor(cn); // 종목 인덱스 — 전체 날짜가 아니라 이 종목의 기록만 역순 탐색
    for(let i=rs.length-1;i>=0;i--){
      const r=rs[i];
      if(r.date>=this.date)continue;
      if((r.ex.sets||[]).some(_isWorkSet))return{date:r.date,sets:r.ex.sets.filter(_isWorkSet)};
    }
    return null;
  },
  _targetNote(name){const n=TARGET_NOTES[this.canon(name)]||TARGET_NOTES[name];return n?' · '+n:'';},
  suggestTarget(name){
    const prev=this.prevSession(name);
    const note=this._targetNote(name);
    const phase=TRAINING_PLAN.phase(this.date);
    if(TRAINING_PLAN.mode==='current'&&phase.limited)return {html:'<b>복귀·적응: 2세트 · 3–4회 여유</b> — 워밍업으로 중량 결정. 자동 증량 보류.',up:false,cap:this.repCap(name)};
    if(!prev){
      const e=this.libByName(this.canon(name))||this.libByName(name);
      const p=this.prescription(name);const rec=p?('루틴 '+p.sets+'×'+p.min+'–'+p.max+' · '):(e&&e.sets?('도감 권장 '+e.sets+' · '):'');
      // 자리가 차서 다른 브랜드 기구로 갈아탄 상황 — '첫 기록'이라도 시작 무게를 제안한다.
      const vh=this.variantHint(name);
      if(vh&&vh.est&&vh.ratio){
        const src=vh.ratio?('실측비 '+vh.ratio.toFixed(2)+' · n='+vh.n):('보정계수 ×'+vh.coef.toFixed(2)+' · 설정값');
        return{html:rec+'<b>'+vh.est+'kg 시작 제안</b> <span class="wt-var">'+vh.alt+' '+vh.lastW+'kg × '+src+'</span>'+note,up:false,fillW:vh.est};
      }
      if(vh)
        return{html:rec+vh.alt+' 최근 <b>'+vh.lastW+'kg</b> <span class="wt-var">'+(vh.dir||'브랜드가 달라 체감이 다를 수 있음 — 가볍게 시작')+'</span>'+note,up:false};
      return{html:rec+'첫 기록을 남기면 자동 목표가 생성됩니다'+note,up:false};
    }
    // 기록이 있는 경우에도 환산비가 잡혔으면 칩으로 노출 — 기구 전환 판단에 쓴다
    const vsuf=(()=>{const v=this.variantHint(name);
      if(v&&v.ratio)return ' <span class="wt-var">'+v.alt+' 대비 실측 ×'+v.ratio.toFixed(2)+' (n='+v.n+')</span>';
      if(v&&v.coef)return ' <span class="wt-var">'+v.alt+' 대비 보정 ×'+v.coef.toFixed(2)+'</span>';
      return '';})();
    const sets=prev.sets;
    const lt=this.loadTypeOf(name);
    const setStr=sets.map(s=>lt==='time'?(s.reps+'초'+(s.weight>0?('+'+s.weight+'kg'):''))
                          :(lt==='assist'?('보조'+s.weight+'×'+s.reps)
                          :(s.weight+'×'+s.reps))).join(', ');
    // 직전 기록이 며칠 전인지 — 3일 전과 3주 전은 증량 기대치가 다르다 (요일 무관 최근 기록 방식의 맥락 보완)
    const ago=Math.round((new Date(this.date+'T12:00:00')-new Date(prev.date+'T12:00:00'))/864e5);
    const agoStr=ago<=0?'오늘':(ago===1?'어제':ago+'일 전');
    const prevLbl='<span class="wt-prev">지난('+agoStr+'): '+setStr+'</span>';
    if(lt==='time'){
      // 시간 종목: 반복 칸이 초다. 마지막 세트 +5초를 다음 목표로 제시하고 역대 최고를 함께 띄운다.
      const lastSec=sets[sets.length-1].reps;
      const addW=sets[sets.length-1].weight||0;
      const best=this._bestSec(name);
      const nx=lastSec+5;
      const bestTxt=best>lastSec?(' <span class="wt-var">역대 최고 '+best+'초</span>')
                   :(best?' <span class="wt-var">지금이 역대 최고 ⏱</span>':'');
      return{html:prevLbl+' → <b>'+nx+'초 도전 ⏱</b>'+(addW?(' · 추가 '+addW+'kg 유지'):'')+bestTxt+note,up:true,fillW:addW,cap:nx};
    }
    const cap=this.repCap(name);
    const lastW=sets[sets.length-1].weight;
    // 디로드 주에는 증량 제안을 끄고 '중량 유지 · 세트 55%'로 자동 전환한다(7일 뒤 자동 복귀).
    // 배너와 자동 목표가 반대 방향을 가리키던 모순을 제거하는 부분.
    const dlD=this.deloadDay();
    if(dlD){
      const sc=Math.max(2,Math.round(sets.length*0.55));
      return{html:prevLbl+' → <b>'+lastW+'kg 유지 · '+sc+'세트</b> <span class="wt-dl">디로드 '+dlD+'/7일</span>'+note,up:false,fillW:lastW,cap};
    }
    const prescribed=this.prescription(name);
    if(sets.some(s=>s.pain)||this.readiness()?.lvl==='low')return {html:prevLbl+' → <b>증량 보류 · 통증과 회복 상태 확인</b>'+note,up:false,cap};
    if(ago>14)return {html:prevLbl+' → <b>공백 후 재적응 · 여유 3회 남기는 중량부터</b>'+note,up:false,cap};
    const allHit=sets.length>=(prescribed?prescribed.sets:2)&&sets.every(s=>s.reps>=cap&&s.weight===lastW);
    if(allHit){
      // 증량분은 스택 단위(stepOf)의 배수로 올림 — 기구에 실제로 걸 수 있는 무게만 제안한다.
      const nx=this.nextWeight(name,lastW);
      // RPE 반영: 렙 상단을 채웠어도 마지막 세션 체감 강도가 9.5+면 같은 무게 한 번 더 굳히기
      const hardest=Math.max.apply(null,sets.map(s=>s.rpe||0));
      if(hardest>9)return{html:prevLbl+' → '+this._wLbl(lt,lastW)+' 한 번 더 굳히기 (RPE '+hardest+' — 한계 근접)'+note+vsuf,up:false,fillW:lastW,cap};
      const ease=(hardest>0&&hardest<=8)?' (RPE '+hardest+' 여유)':'';
      if(lt==='assist'){
        // 어시스트는 보조가 줄어드는 것이 증량 — 방향을 반대로 제안한다.
        // [26.09] 기준을 '마지막 세트'가 아니라 '그 세션의 대표 무게(최빈값)'로 바꿨다.
        //   8/25 풀업은 보조 70×3세트 + 60×1세트였는데 마지막 세트만 보면 다음 목표가 57.5가 된다.
        //   마지막 한 세트를 짜낸 것은 새 기준선이 아니라 그 날의 최대치다 — 4세트를 그 무게로 다시 하라는 제안이 되어 버린다.
        //   동률이면 보조가 큰 쪽(= 보수적인 쪽)을 대표로 삼는다.
        const cnt={};sets.forEach(s=>{cnt[s.weight]=(cnt[s.weight]||0)+1;});
        const base=Object.keys(cnt).map(Number).sort((a,b)=>cnt[b]-cnt[a]||b-a)[0];
        if(base<=0)return{html:prevLbl+' → <b>보조 0 달성 — 반복을 더 채우거나 추가 중량 단계로 ⬆</b>'+ease+note+vsuf,up:true,nextW:0};
        const step=this.stepOf(name);
        const nw=Math.max(0,Math.round((base-Math.max(nx.add,step))*100)/100);
        const baseTxt=(base!==lastW)?(' <span class="wt-var">대표 '+base+'kg 기준('+cnt[base]+'세트)</span>'):'';
        return{html:prevLbl+' → <b>보조 '+nw+'kg 도전 ⬇</b>'+baseTxt+ease+note+vsuf,up:true,nextW:nw};
      }
      // 한 칸이 현재 무게의 25%를 넘으면 그 기구에서는 무게로 갈 자리가 아니다.
      // 소근육 경량 종목(케이블 래터럴 5.0 → 다음 칸 7.5 = +50%)에서 반복수가 무너지는 구간이라,
      // 무게 대신 한 팔씩(유니래터럴)·세트 추가·템포로 과부하를 만드는 쪽을 제안한다.
      if(lastW>0&&nx.add/lastW>0.25)
        return{html:prevLbl+' → <b>'+this._wLbl(lt,nx.w)+'는 +'+Math.round(nx.add/lastW*100)+'% 점프</b> '
          +'<span class="wt-var">스택 '+nx.step+'kg 단위 — 무게 대신 현재 무게로 반복·자세를 안정시키세요</span>'+ease+note+vsuf,up:false,fillW:lastW,cap};
      return{html:prevLbl+' → <b>'+this._wLbl(lt,nx.w)+' 도전 ⬆</b> <span class="wt-var">스택 '+nx.step+'kg 단위</span>'+ease+note+vsuf,up:true,nextW:nx.w};
    }
    return{html:prevLbl+' → '+this._wLbl(lt,lastW)+'로 '+cap+'회 채우기'+note+vsuf,up:false,fillW:lastW,cap};
  },
  // ── 기본무게: 종목별 장비 자체 무게(바벨 20kg, 스미스 바, 머신 캐리지 등)를 등록하면
  //    세트 입력은 '추가 원판'만 받고 총 무게(기본+추가)로 저장·집계한다. 기록은 항상 총 무게 기준 ──
  // ── 부하 유형: 종목별 설정(미설정이면 이름으로 추정). 값이 바뀌면 그 종목의 실부하를 다시 계산한다 ──
  ltype:{},   // 주의: ExLog.load()는 기록 로딩 메서드라 필드명을 ltype으로 둔다
  async loadLoadType(){try{const r=await window.storage.get('ex_load');if(r)this.ltype=JSON.parse(r.value)||{};}catch(_){}},
  saveLoadType(){window.storage.set('ex_load',JSON.stringify(this.ltype)).catch(e=>SafeStore.report(e));},
  loadTypeOf(name){const cn=this.canon(name);return this.ltype[cn]||_loadGuess(cn);},
  setLoadType(name,t){
    const cn=this.canon(name);
    if(t&&LOAD_LBL[t]&&t!==_loadGuess(cn))this.ltype[cn]=t;else delete this.ltype[cn];
    this.saveLoadType();
    this._recalcEw(cn);                       // 유형이 바뀌면 과거 기록의 실부하도 함께 맞춘다
    this.dataVer++;this._pbCache={};this._stepCache={};
  },
  // 해당 날짜 시점의 체중 — 인바디 기록 중 그 날짜 이전의 가장 최근 값.
  // 세트 저장 시 함께 박아두므로(bw), 나중에 체중이 변해도 과거 e1RM이 흔들리지 않는다.
  bwOn(dateKey){
    try{
      const L=(typeof InBody!=='undefined')?InBody._log:null;
      if(!L||!L.length)return 0;
      let best=0;
      for(const r of L){if(!r||!r.wt)continue;if(!dateKey||r.date<=dateKey)best=+r.wt;}
      if(!best)for(const r of L){if(r&&r.wt){best=+r.wt;break;}}
      return best>0?best:0;
    }catch(_){return 0;}
  },
  effW(name,rawW,dateKey,bwFixed){
    const t=this.loadTypeOf(name);
    const w=+rawW||0;
    if(t==='normal')return w;
    const bw=bwFixed>0?+bwFixed:this.bwOn(dateKey||this.date);
    if(!bw)return w;                           // 체중 기록이 없으면 환산 보류 — 원값을 그대로 둔다
    const e=(t==='assist')?Math.max(0,bw-w):(bw+w);
    return Math.round(e*10)/10;
  },
  _recalcEw(cn,defer){
    let any=false;
    Object.keys(this.data||{}).forEach(dk=>{
      let dayTouched=false;                       // 날짜별로 판정해야 실제로 바뀐 달만 저장된다
      (this.data[dk].exercises||[]).forEach(ex=>{
        if(this.canon(ex.name)!==cn)return;
        const t=this.loadTypeOf(ex.name);
        (ex.sets||[]).forEach(st=>{
          if(t==='normal'){if(st.ew!=null){delete st.ew;delete st.bw;dayTouched=true;}return;}
          const bw=+st.bw||this.bwOn(dk);if(!bw)return;
          const v=this.effW(ex.name,st.weight,dk,bw);
          if(st.ew!==v||st.bw!==bw){st.ew=v;st.bw=bw;dayTouched=true;}
        });
      });
      if(dayTouched){this.markDirty(dk);any=true;}
    });
    if(any&&!defer)this.save();
    return any;
  },
  // 비일반 종목 전체의 실부하를 다시 만든다. ew·bw는 (표기 중량 + 그날 체중 + 부하 유형)에서
  // 항상 파생되는 값이라, 시트 복원처럼 두 필드가 빠진 경로로 기록이 들어와도 이걸로 완전 복구된다.
  async recalcAllEw(){
    try{if(typeof InBody!=='undefined'&&!InBody._log&&InBody.load)await InBody.load();}catch(_){}
    if(!this.bwOn(null))return 0;                 // 체중 기록이 없으면 환산 근거가 없다
    const names={};
    Object.keys(this.data||{}).forEach(dk=>(this.data[dk].exercises||[]).forEach(ex=>{names[this.canon(ex.name)]=1;}));
    let n=0;
    Object.keys(names).forEach(cn=>{if(this.loadTypeOf(cn)!=='normal'&&this._recalcEw(cn,true))n++;});
    if(n){this._pbCache={};this._stepCache={};}
    return n;
  },
  // 최초 1회: 기존 기록에 실부하를 채워 넣는다. 인바디 로그가 아직 없으면 다음 실행으로 미룬다.
  async migrateEw(){
    try{const r=await window.storage.get('ew_migrate_v2');if(r)return;}catch(_){}
    try{if(typeof InBody!=='undefined'&&!InBody._log&&InBody.load)await InBody.load();}catch(_){}
    if(!this.bwOn(null))return;                // 체중 데이터 없음 — 플래그도 세우지 않고 다음 기회에
    if(await this.recalcAllEw())await this.save();
    try{await window.storage.set('ew_migrate_v2','1');}catch(_){}
  },
  _wLbl(lt,w){return lt==='assist'?('보조 '+w+'kg'):(lt==='bw'?(w>0?('추가 '+w+'kg'):'맨몸'):(w+'kg'));},
  _bestSec(name){
    const cn=this.canon(name);let b=0;
    this._exFor(cn).forEach(r=>(r.ex.sets||[]).forEach(st=>{if(_isWorkSet(st)&&st.reps>b)b=st.reps;}));
    return b;
  },
  // ── 브랜드 체감 보정계수: 기구를 갈아탈 때 시작 무게 환산에만 쓰는 값 ──
  //    저장되는 세트 중량은 언제나 기구에 표기된 실제 중량 그대로다. 계수를 기록에 곱하면
  //    자동 목표(+2.5kg)와 정체 판정이 오염되므로 절대 섞지 않는다.
  bcoef:{},
  async loadCoef(){try{const r=await window.storage.get('brand_coef');if(r)this.bcoef=JSON.parse(r.value)||{};}catch(_){}},
  saveCoef(){window.storage.set('brand_coef',JSON.stringify(this.bcoef)).catch(e=>SafeStore.report(e));},
  coefOf(b){const k=b||'none';const v=+this.bcoef[k];return v>0?v:(BRAND_COEF_DEFAULT[k]||1);},
  setCoef(b,v){
    v=+v;
    const def=BRAND_COEF_DEFAULT[b]||1;
    if(v>0&&v>=0.5&&v<=1.5&&Math.abs(v-def)>1e-9)this.bcoef[b]=Math.round(v*100)/100;
    else delete this.bcoef[b];
    this.saveCoef();
  },
  // fromName 기구의 무게 w를 toName 기구의 표기 중량으로 환산. 계수가 같으면 null(=환산 의미 없음).
  coefConvert(fromName,toName,w){
    const bf=_brandOf(fromName)||'none',bt=_brandOf(toName)||'none';
    const cf=this.coefOf(bf),ct=this.coefOf(bt);
    if(!(w>0)||Math.abs(cf-ct)<1e-9)return null;
    return{est:Math.round(w*cf/ct*2)/2,k:cf/ct,from:bf,to:bt};
  },
  base:{},
  async loadBase(){try{const r=await window.storage.get('ex_base');if(r)this.base=JSON.parse(r.value)||{};}catch(_){}},
  saveBase(){window.storage.set('ex_base',JSON.stringify(this.base)).catch(e=>SafeStore.report(e));},
  baseOf(name){const b=+this.base[this.canon(name)];return b>0?b:0;},
  setBase(name,kg){
    const cn=this.canon(name);
    if(kg>0)this.base[cn]=kg;else delete this.base[cn];
    this.saveBase();
  },
  // ── 종목별 세팅 메모: 시트 높이·핀 번호·발판 위치 등 내 몸에 맞춘 기구 세팅 (canon 기준 — 별칭 연결 시 메모 승계) ──
  memo:{},
  async loadMemo(){try{const r=await window.storage.get('ex_memo');if(r)this.memo=JSON.parse(r.value)||{};}catch(_){}},
  saveMemo(){window.storage.set('ex_memo',JSON.stringify(this.memo)).catch(e=>SafeStore.report(e));},
  memoOf(name){return this.memo[this.canon(name)]||'';},
  setMemo(name,txt){
    const cn=this.canon(name);
    const t=String(txt||'').trim().slice(0,120);
    if(t)this.memo[cn]=t;else delete this.memo[cn];
    this.saveMemo();
  },
  toggleMemo(btn){
    const det=btn.closest('.ex-detail');if(!det)return;
    let panel=det.querySelector('.ex-memo-panel');
    if(panel){panel.remove();return;}
    const log=det.querySelector('.ex-log');const name=log?log.dataset.exname:'';
    const cur=this.memoOf(name);
    panel=document.createElement('div');panel.className='ex-memo-panel';
    panel.innerHTML='<div class="ex-memo-hd">📝 이 기구의 <b>내 세팅</b>을 기록하세요 — 시트 높이·핀 번호·발판 위치·패드 각도 등.</div>'
      +'<div class="ex-memo-row"><input type="text" class="ex-memo-inp" maxlength="120" placeholder="예: 시트 4번 · 발판 중앙 한 뼘 위" value="'+cur.replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'Enter\')ExLog.saveMemoFromUI(this)">'
      +'<button class="ex-base-save" onclick="ExLog.saveMemoFromUI(this)">저장</button>'
      +(cur?'<button class="ex-base-clear" onclick="ExLog.clearMemoFromUI(this)">삭제</button>':'')+'</div>';
    btn.insertAdjacentElement('afterend',panel);
    setTimeout(()=>panel.querySelector('.ex-memo-inp')?.focus(),50);
  },
  saveMemoFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setMemo(log.dataset.exname,det.querySelector('.ex-memo-inp').value);
    det.querySelector('.ex-memo-panel').remove();
    this.injectTargets();
  },
  clearMemoFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setMemo(log.dataset.exname,'');
    det.querySelector('.ex-memo-panel').remove();
    this.injectTargets();
  },
  // 원판 분해: 한쪽 무게를 표준 원판(25~1.25)으로 그리디 분해
  _plateSplit(perSide){
    const PL=[25,20,15,10,5,2.5,1.25];const out=[];let r=perSide;
    for(const p of PL){while(r>=p-0.001){out.push(p);r-=p;}}
    return{combo:out,rem:Math.round(r*100)/100};
  },
  // 총 무게 힌트: '= 총 60kg · 한쪽 20 (20)' — 기본무게 있을 때 세트 입력 밑에 표시
  _totalHint(name,addedW){
    const lt=this.loadTypeOf(name);
    if(lt!=='normal'){
      // 어시스트·체중 종목: 입력값이 곧 부하가 아니므로 실부하를 그 자리에서 보여준다.
      const bw=this.bwOn(this.date);
      if(!bw)return '<small>체중 기록이 없어 실부하 환산 보류 — 인바디 탭에 체중을 입력하면 자동 적용됩니다</small>';
      const add=+addedW||0;
      const eff=this.effW(name,add,this.date,bw);
      if(lt==='assist')return '보조 '+add+'kg → <b>실부하 '+eff+'kg</b> <small>(체중 '+bw+' − 보조 '+add+')</small>';
      if(lt==='time')return '<b>'+eff+'kg</b>를 매단 채 버티기 <small>(체중 '+bw+(add?(' + 추가 '+add):'')+') · 반복 칸은 초</small>';
      return (add?('추가 '+add+'kg'):'맨몸')+' → <b>실부하 '+eff+'kg</b> <small>(체중 '+bw+(add?(' + '+add):'')+')</small>';
    }
    const base=this.baseOf(name);if(!base)return'';
    const add=+addedW||0;const total=Math.round((base+add)*100)/100;
    let h='= 총 <b>'+total+'kg</b> <small>(기본 '+base+' + 원판 '+add+')</small>';
    if(add>0){
      const ps=add/2;const sp=this._plateSplit(ps);
      h+=' · 한쪽 '+(Math.round(ps*100)/100)+'kg';
      if(sp.combo.length&&sp.rem===0)h+=' <small>['+sp.combo.join('+')+']</small>';
    }
    return h;
  },
  _updateTotalHint(inp){
    const log=inp.closest('.ex-log');if(!log)return;
    const name=log.dataset.exname;
    let hint=log.querySelector('.wl-total-hint');
    const base=this.baseOf(name);
    if(!base){if(hint)hint.remove();return;}
    if(!hint){hint=document.createElement('div');hint.className='wl-total-hint';inp.closest('.ex-log-input').appendChild(hint);}
    hint.innerHTML=this._totalHint(name,parseFloat(inp.value)||0);
  },
  toggleBase(btn){
    const det=btn.closest('.ex-detail');if(!det)return;
    let panel=det.querySelector('.ex-base-panel');
    if(panel){panel.remove();return;}
    const log=det.querySelector('.ex-log');const name=log?log.dataset.exname:'';
    const cur=this.baseOf(name);
    const ph=/바벨|스쿼트|데드리프트|스미스|랜드마인|트랩바|T바|로우/.test(this.canon(name))?'예: 바벨 20':'장비 자체 kg';
    panel=document.createElement('div');panel.className='ex-base-panel';
    panel.innerHTML='<div class="ex-base-hd">🏗 기본무게(장비 자체 무게)를 등록하면 세트 입력은 <b>추가 원판만</b> 받고 총 무게로 저장됩니다.</div>'
      +'<div class="ex-base-row"><input type="number" class="ex-base-inp" step="0.5" inputmode="decimal" placeholder="'+ph+'" value="'+(cur||'')+'">'
      +'<button class="ex-base-save" onclick="ExLog.saveBaseFromUI(this)">저장</button>'
      +(cur?'<button class="ex-base-clear" onclick="ExLog.clearBaseFromUI(this)">해제</button>':'')+'</div>';
    btn.insertAdjacentElement('afterend',panel);
  },
  saveBaseFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');const name=log.dataset.exname;
    const kg=parseFloat(det.querySelector('.ex-base-inp').value)||0;
    this.setBase(name,kg);
    det.querySelector('.ex-base-panel').remove();
    this.injectTargets();this.refresh();
  },
  clearBaseFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setBase(log.dataset.exname,0);
    det.querySelector('.ex-base-panel').remove();
    this.injectTargets();this.refresh();
  },

  // ── 데드리프트 오버언더 그립 교대: 세트마다 언더 손을 좌우 교대 (이두 파열 예방 프로토콜) ──
  _gripStartMem:null, // 메모리 우선 + localStorage 영속 시도 (localStorage 불가 환경에서도 세션 내 동작 보장)
  _gripStart(){
    if(this._gripStartMem)return this._gripStartMem;
    try{this._gripStartMem=localStorage.getItem('dl_grip_start')||'왼';}catch(_){this._gripStartMem='왼';}
    return this._gripStartMem;
  },
  flipGripStart(){
    const nx=this._gripStart()==='왼'?'오른':'왼';
    this._gripStartMem=nx;
    try{localStorage.setItem('dl_grip_start',nx);}catch(_){}
    this.updateGripChips();
  },
  _gripChipHtml(name){
    const st=this.session();
    const ex=(st.exercises||[]).find(e=>this.canon(e.name)===this.canon(name));
    const done=ex?(ex.sets||[]).filter(_isWorkSet).length:0;
    const setNo=done+1;
    const start=this._gripStart();
    const under=(setNo%2===1)?start:(start==='왼'?'오른':'왼');
    return'🤝 '+setNo+'세트 언더그립: <b>'+under+'손</b><span class="grip-note">언더 팔꿈치 완전 신전 유지 · 탭하면 시작손 변경</span>';
  },
  updateGripChips(){
    document.querySelectorAll('.ex-grip-chip').forEach(ch=>{
      const det=ch.closest('.ex-detail');const log=det&&det.querySelector('.ex-log');
      if(log)ch.innerHTML=this._gripChipHtml(log.dataset.exname);
    });
  },
  injectBrief(){
    document.querySelectorAll('.day-panel').forEach(panel=>{
      let bc=panel.querySelector('.brief-card');
      const lines=[];
      panel.querySelectorAll('.ex-log[data-exname]').forEach(log=>{
        if(lines.length>=3)return;
        const name=log.dataset.exname;
        if(!this.isCompound(name)||this.isTimed(name))return;
        const prev=this.prevSession(name);
        if(!prev||!prev.sets.length)return;
        const top=prev.sets.reduce((a,b)=>(b.weight||0)>(a.weight||0)?b:a,prev.sets[0]);
        const badge=log.closest('.ex-detail')?.querySelector('.ex-week-target');
        const tgt=badge?badge.textContent.replace(/\s+/g,' ').trim():'';
        lines.push('<div class="brief-line"><b>'+name+'</b> 직전 '+top.weight+'×'+top.reps+(tgt?' <span class="brief-tgt">'+tgt+'</span>':'')+'</div>');
      });
      if(!lines.length){if(bc)bc.remove();return;}
      if(!bc){
        bc=document.createElement('div');bc.className='brief-card';
        const anchor=panel.querySelector('.cond-row');
        if(anchor)panel.insertBefore(bc,anchor.nextSibling);else panel.insertBefore(bc,panel.firstChild);
      }
      bc.innerHTML='<div class="brief-hd">📋 오늘의 앵커</div>'+lines.join('');
    });
  },
  _round25(x){return Math.max(0,Math.round(x/2.5)*2.5);},
  _warmupRows(w,base){
    if(!(w>0))return'<div class="ex-wu-empty">본세트 무게를 입력하면 단계가 계산됩니다.</div>';
    base=+base||0;
    const steps=[[0.4,8],[0.6,5],[0.8,3]];
    const plate=t=>{ // 기본무게 있으면 단계별 원판 안내 (총무게 기준 반올림 후 원판 환산)
      if(!base||t<=base)return'';
      const ps=(t-base)/2;const sp=this._plateSplit(ps);
      return' <span class="ex-wu-plate">한쪽 '+(Math.round(ps*100)/100)+(sp.combo.length&&sp.rem===0?' ['+sp.combo.join('+')+']':'')+'</span>';
    };
    return steps.map(([p,r],i)=>{const t=this._round25(w*p);return'<div class="ex-wu-row"><span class="ex-wu-step">'+(i+1)+'단계</span><b>'+t+'kg</b> × '+r+'회 <span class="ex-wu-pct">('+Math.round(p*100)+'%)</span>'+plate(t)+'<button type="button" class="ex-wu-log" onclick="ExLog.logWarmup(this,'+t+','+r+')">기록</button></div>';}).join('')
      +'<div class="ex-wu-note">세트 간 휴식 짧게(30~60초) → 본세트 '+w+'kg'+plate(w)+'</div>';
  },
  // 램프 단계 원탭 기록 — W 플래그 세트로 저장 + 60초 짧은 휴식 시작 (계산만 하고 수동 입력하던 흐름 제거)
  logWarmup(btn,wt,reps){
    const det=btn.closest('.ex-detail');if(!det)return;
    const log=det.querySelector('.ex-log');if(!log)return;
    const name=log.dataset.exname;
    const s=this.session();
    let ex=s.exercises.find(e=>e.name===name);
    if(!ex){ex={name,sets:[]};s.exercises.push(ex);}
    ex.sets.push({weight:wt,reps,ts:new Date().toISOString(),warmup:true});
    this.setSession(s);
    this.refresh();
    if(this.date===_todayKey()){this._askNotify();this.startRest(name,60);}
    this._syncSoon();
    btn.textContent='✓';btn.disabled=true;
  },
  toggleWarmup(btn){
    const det=btn.closest('.ex-detail');if(!det)return;
    let panel=det.querySelector('.ex-warmup');
    if(panel){panel.remove();return;}
    const log=det.querySelector('.ex-log');const name=log?log.dataset.exname:'';
    // 본세트 무게 추정: 직전 세션 탑세트 → 없으면 빈칸
    let w=0;const prev=this.prevSession(name);
    if(prev&&prev.sets.length){w=Math.max.apply(null,prev.sets.map(s=>s.weight||0));}
    panel=document.createElement('div');panel.className='ex-warmup';
    const wbase=this.baseOf(name);
    panel.dataset.base=wbase;
    panel.innerHTML='<div class="ex-wu-hd">🔥 워밍업 램프업 <input type="number" class="ex-wu-inp" step="2.5" inputmode="decimal" placeholder="본세트 총 kg" value="'+(w||'')+'" oninput="ExLog._updateWarmup(this)"></div><div class="ex-wu-body">'+this._warmupRows(w,wbase)+'</div>';
    btn.insertAdjacentElement('afterend',panel);
  },
  _updateWarmup(inp){
    const panel=inp.closest('.ex-warmup');
    panel.querySelector('.ex-wu-body').innerHTML=this._warmupRows(parseFloat(inp.value)||0,+panel.dataset.base||0);
  },
  injectTargets(){
    document.querySelectorAll('.ex-log').forEach(log=>{
      const name=log.dataset.exname;
      const det=log.closest('.ex-detail');if(!det)return;
      let badge=det.querySelector('.ex-week-target');
      const sug=this.suggestTarget(name);
      if(!sug){if(badge){badge.remove();badge=null;}}
      else{
        if(!badge){badge=document.createElement('div');det.insertBefore(badge,det.firstChild);}
        badge.className='ex-week-target'+(sug.up?' up':'');
        badge.innerHTML='📈 '+sug.html;
      }
      // 워밍업 세트 제거(사용자 요청) — 종목별 램프업 버튼/패널을 표시하지 않고, 이전에 주입된 것도 정리
      const wuBtn=det.querySelector('.ex-warmup-btn');if(wuBtn)wuBtn.remove();
      const wuPanel=det.querySelector('.ex-warmup');if(wuPanel)wuPanel.remove();
      // 기본무게 설정 칩 (모든 종목 — 상태를 라벨에 표시)
      let bb=det.querySelector('.ex-base-btn');
      if(!bb){
        bb=document.createElement('button');bb.className='ex-base-btn';bb.type='button';
        bb.setAttribute('onclick','ExLog.toggleBase(this)');
        const anchorB=det.querySelector('.ex-warmup-btn')||det.querySelector('.ex-week-target');
        if(anchorB)det.insertBefore(bb,anchorB.nextSibling);else det.insertBefore(bb,det.firstChild);
      }
      const bkg=this.baseOf(name);
      bb.textContent=bkg?('🏗 기본 '+bkg+'kg · 입력은 ＋원판'):'🏗 기본무게 설정';
      // 세팅 메모 칩 (모든 종목 — 새 헬스장 기구 세팅 기록)
      let mb2=det.querySelector('.ex-memo-btn');
      if(!mb2){
        mb2=document.createElement('button');mb2.className='ex-memo-btn';mb2.type='button';
        mb2.setAttribute('onclick','ExLog.toggleMemo(this)');
        det.insertBefore(mb2,bb.nextSibling);
      }
      const mm=this.memoOf(name);
      mb2.classList.toggle('has',!!mm);
      mb2.textContent=mm?('📝 '+mm):'📝 세팅 메모';
      // 휴식시간 칩 (모든 종목 — 기본값과 다르면 강조)
      let rb=det.querySelector('.ex-rest-btn');
      if(!rb){
        rb=document.createElement('button');rb.className='ex-rest-btn';rb.type='button';
        rb.setAttribute('onclick','ExLog.toggleRestCfg(this)');
        det.insertBefore(rb,mb2.nextSibling);
      }
      const rsec=this.restSec(name);
      const rCustom=!!(+this.restCfg[this.canon(name)]);
      rb.classList.toggle('has',rCustom);
      rb.textContent='⏱ 휴식 '+rsec+'초'+(rCustom?' (커스텀)':'');
      // ── 브랜드 칩: 같은 동작의 기구 변형을 한 탭으로 전환 ──
      //    기록은 기구별로 분리된 상태를 유지한다(승계 확인을 띄우지 않는 이유).
      // 부하 유형 칩 — 일반이 아니면 강조. 어시스트/체중/시간 종목의 계산 근거를 카드에서 바로 확인·수정.
      let lb=det.querySelector('.ex-load-btn');
      if(!lb){
        lb=document.createElement('button');lb.className='ex-load-btn';lb.type='button';
        lb.setAttribute('onclick','ExLog.toggleLoadType(this)');
        det.insertBefore(lb,bb);
      }
      const ltc=this.loadTypeOf(name);
      lb.classList.toggle('has',ltc!=='normal');
      lb.textContent='⚖ '+LOAD_LBL[ltc];
      const vg=this.variantGroup(name);
      const cnName=vg.cur;
      const grpAll=vg.group;
      let brow=det.querySelector('.ex-brand-row');
      if(grpAll.length<2){if(brow)brow.remove();}
      else{
        if(!brow){brow=document.createElement('div');brow.className='ex-brand-row';det.insertBefore(brow,bb);}
        const sig=this.dataVer+'|'+cnName;
        if(brow.dataset.sig!==sig){ // 기록/종목이 바뀔 때만 재계산 — 매 refresh마다 prevSession 반복 호출 방지
          brow.dataset.sig=sig;
          brow.innerHTML='<span class="ex-brand-lb">기구</span>'+grpAll.map(v=>{
            const on=(v===cnName);
            const pv=this.prevSession(v);
            const w=pv?pv.sets[pv.sets.length-1].weight:0;
            return '<button type="button" class="ex-brand-chip'+(on?' on':'')+'" '
              +(on?'disabled':'onclick="ExLog.switchBrand(this,\''+_escJs(v)+'\')"')
              +' title="'+_esc(v)+'">'+_esc(_variantLbl(v))+(w?' <b>'+w+'</b>':'')+'</button>';
          }).join('')+'<button type="button" class="ex-brand-chip cfg" onclick="ExLog.toggleCoef(this)" title="브랜드 체감 보정계수 설정">⚙</button>';
        }
      }
      // 통증 이력 경고 (canon 기준 최근 1건 — 재도전 시 상기)
      let pw=det.querySelector('.ex-pain-warn');
      const ph2=this._lastPain(name);
      if(ph2){
        if(!pw){pw=document.createElement('div');pw.className='ex-pain-warn';det.insertBefore(pw,mb2.nextSibling);}
        const pd=new Date(ph2.date+'T12:00:00').toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'});
        pw.innerHTML='⚠️ <b>통증 이력</b> '+pd+' '+(ph2.w>0?ph2.w+'kg':'맨몸')+'×'+ph2.r+' — 워밍업 충분히, 날카로운 통증이면 즉시 중단';
      }else if(pw){pw.remove();}
      // 프리웨이트 데드리프트 계열: 세트별 언더그립 손 표시 (머신·RDL 제외 — 더블 오버/고정 그립)
      let gc=det.querySelector('.ex-grip-chip');
      const cn=this.canon(name);
      if(/데드리프트|랙풀/.test(cn)&&!/루마니안|머신|Booty/.test(cn)){
        if(!gc){
          gc=document.createElement('div');gc.className='ex-grip-chip';
          gc.setAttribute('onclick','ExLog.flipGripStart()');
          const anchor3=det.querySelector('.ex-warmup-btn')||det.querySelector('.ex-week-target');
          if(anchor3)det.insertBefore(gc,anchor3.nextSibling);else det.insertBefore(gc,det.firstChild);
        }
        gc.innerHTML=this._gripChipHtml(name);
      }else if(gc){gc.remove();}
      // 통합(가독성): '💡 폼 & 자극점'(EX_CUES) 박스는 상단 focus-grid(🎯자극점·💡요령·⚠주의)와 내용이 중복 → 제거.
      // 기술 상세는 focus-grid(개인 코칭) + 📐 그립·세팅·ROM(ex-more, 도감)로 일원화. 이전에 주입된 박스도 정리.
      const cue=det.querySelector('.ex-cue');if(cue)cue.remove();
    });
    this.injectBrief();                                      // 목표 배지 주입 후 브리핑 갱신
  },
  weekStats(){
    const today=new Date(this.date+'T12:00:00');
    const dow=(today.getDay()+6)%7;
    const monday=new Date(today);monday.setDate(today.getDate()-dow);
    let wk=0,total=0;
    for(const k in this.data){
      if(!this.data[k].exercises?.some(e=>(e.sets||[]).some(_isWorkSet)))continue;
      total++;
      const d=new Date(k+'T12:00:00');
      if(d>=monday&&d<=today)wk++;
    }
    return{wk,total};
  },

  // ── 휴식 타이머 (Date 기준 — 백그라운드에서도 정확) ──
  startRest(name,secOverride){
    this.stopRest();
    const total=secOverride||this.restSec(name);
    // 다음 세트 목표 힌트 — suggestTarget 재사용, "지난: …" 프리픽스는 떼고 행동 지시부만 미니바에 표시
    let hint='';
    try{const sug=this.suggestTarget(name);if(sug)hint=String(sug.html).replace(/<span class="wt-prev">[\s\S]*?<\/span>\s*(→\s*)?/,'');}catch(_){}
    this.rest={name,endAt:Date.now()+total*1000,total,int:setInterval(()=>this.tickRest(),500),hint,notified:false};
    this.tickRest();
  },
  // 휴식 타이머 표시는 스티키 미니바 하나로 통일 — 카드 상태·스크롤 위치와 무관하게 항상 같은 자리
  _restMini(){
    let m=document.getElementById('rest-mini');
    if(!m){
      m=document.createElement('div');m.id='rest-mini';m.className='rest-mini';
      m.innerHTML='<div class="rm-left"><span class="rm-nm"></span><span class="rm-hint"></span></div><span class="rm-time">0:00</span><button class="rm-btn" onclick="ExLog.addRest(30)">+30초</button><button class="rm-btn" onclick="ExLog.skipRest()">스킵</button><div class="rm-bar"></div>';
      document.body.appendChild(m);
    }
    return m;
  },
  tickRest(){
    const r=this.rest;if(!r.name)return;
    const remain=Math.max(0,Math.round((r.endAt-Date.now())/1000));
    const mm=Math.floor(remain/60),ss=remain%60;
    const tstr=mm+':'+String(ss).padStart(2,'0');
    const pct=(r.total?Math.max(0,remain/r.total*100):0)+'%';
    const mini=this._restMini();
    mini.classList.add('show');
    mini.classList.toggle('done',remain<=0);
    mini.querySelector('.rm-nm').textContent='⏱ '+r.name;
    mini.querySelector('.rm-hint').innerHTML=r.hint?('다음: '+r.hint):'';
    mini.querySelector('.rm-time').textContent=tstr;
    mini.querySelector('.rm-bar').style.width=pct;
    if(remain<=0&&r.int){
      clearInterval(r.int);this.rest.int=null;
      try{navigator.vibrate&&navigator.vibrate([200,100,200]);}catch(_){}
      // 화면을 벗어나 있으면 시스템 알림으로 휴식 종료 통지 (권한 있을 때만)
      if(!r.notified){
        r.notified=true;
        try{if(document.hidden&&'Notification' in window&&Notification.permission==='granted')new Notification('⏱ 휴식 끝',{body:'다음 세트: '+r.name,tag:'rest-timer'});}catch(_){}
      }
      setTimeout(()=>{if(!this.rest.int&&this.rest.name===r.name)this.stopRest();},8000);
    }
  },
  addRest(sec){
    if(!this.rest.name)return;
    this.rest.endAt+=sec*1000;this.rest.total+=sec;
    if(!this.rest.int)this.rest.int=setInterval(()=>this.tickRest(),500);
    this.tickRest();
  },
  skipRest(){this.stopRest();},
  stopRest(){
    if(this.rest.int)clearInterval(this.rest.int);
    this.rest={name:'',endAt:0,total:0,int:null};
    const m=document.getElementById('rest-mini');if(m)m.classList.remove('show','done');
  },

  // ── 주 1회 자동 전체 동기화(일요일 첫 실행): 증분 동기화가 남길 수 있는 시트 엣지(잔여 행 등) 자가 치유 ──
  async autoFullSync(){return false;},

  // ── Google Sheets 동기화 ──
  async getScriptUrl(){
    try{const r=await window.storage.get('gs_script_url');return r?r.value:'';}catch(_){return'';}
  },
  // 연속 입력(세트 여러 개)을 한 번의 전송으로 합치는 디바운스. URL이 없으면 자동 무시.
  _syncSoon(){
    clearTimeout(this._syncTimer);
    this._syncTimer=setTimeout(()=>{this.getScriptUrl().then(url=>{if(url)this.syncToSheets(url);});},1500);
  },
  async openSync(){
    const url=await this.getScriptUrl();
    const inp=document.getElementById('sync-url-inp');
    if(inp)inp.value=url||'';
    document.getElementById('sync-token-inp').value=DataSync.token(url);
    document.getElementById('sync-modal')?.classList.add('open');
  },
  closeSync(){document.getElementById('sync-modal')?.classList.remove('open');},
  async saveAndSync(){return DataSync.connect();},
  syncMessage:'',
  async api(url,body){return DataSync.request(url,body);},
  renderSyncStatus(){if(window.AppFeatures)AppFeatures.renderSyncStatus();},
  async syncInBody(){ /* DataSync includes all record kinds in one versioned flow. */ },
  async restoreFromSheets(){return DataSync.connect();},
  _syncRows(onlyDates){
    // 시트 upsert용 행 — 리프팅 세트 + 유산소('🏃 ' 접두, reps열=분·weight/vol=0)
    // onlyDates(Set)가 주어지면 그 날짜들만 직렬화 — 증분 동기화 시 전체 기록 재전송 방지.
    // ★모든 행은 동일한 필드 집합·순서를 갖는다(리프팅·유산소 공통) — 열 어긋남/필드명 불일치 방지.
    // ★(date|name|setNo) 키로 페이로드 내 중복 행 제거 — 같은 세트가 두 번 실려 시트에 중복 append 되는 것 방지.
    const rows=[];const seen=new Set();
    const ROW=(date,day,name,setNo,weight,reps,vol,ts,wu,rpe,pain,setId)=>{
      const k=date+'|'+name+'|'+setNo;if(seen.has(k))return;seen.add(k);
      rows.push({date,day,name,setNo,weight,reps,vol,ts,wu,rpe,pain,setId}); // 필드 순서 고정
    };
    Object.keys(this.data).sort().forEach(date=>{
      if(onlyDates&&!onlyDates.has(date))return;
      const s=this.data[date];if(!s)return;
      (s.exercises||[]).forEach(ex=>{
        if(!ex.sets?.length)return;
        ex.sets.forEach((set,i)=>{
          ROW(date,s.day||'',ex.name,i+1,set.weight,set.reps,Math.round(_ldW(set)*set.reps),set.ts||null,set.warmup?1:'',set.rpe||'',set.pain?1:'',set._id);
        });
      });
      (s.cardio||[]).forEach((c,i)=>{
        if(!(+c.min>0))return;
        ROW(date,s.day||'','🏃 '+(c.type||'유산소'),i+1,0,+c.min,0,c.ts||null,'','','',c._id); // 유산소도 wu/rpe/pain 빈칸으로 동일 형태
      });
    });
    return rows;
  },
  // ── 동시 실행 가드 ────────────────────────────────────────────────────
  // 이전에는 디바운스 동기화가 비행 중일 때 ☁️를 누르면 upsert 두 개가 겹쳤다. 서버 락이
  // 직렬화해 주므로 데이터는 안전하지만 뒤 요청이 락 대기(최대 25초) 동안 묶인다.
  // 코얼레싱만 하고 끝내면 비행 중 생긴 변경이 다음 _syncSoon(1.5초)까지 밀리므로,
  // '후행 1회'를 예약해 마지막 상태가 반드시 한 번은 전송되게 한다.
  // full 요청이 하나라도 끼어 있으면 후행도 full — 전체 스냅샷 요구가 증분으로 격하되지 않도록.
  syncToSheets(url,full){
    if(this._syncP){
      const nx=this._syncNext;
      this._syncNext={url:url||(nx&&nx.url)||null, full:!!full||!!(nx&&nx.full)};
      return this._syncP;
    }
    const p=this._syncRun(url,full)
      .catch(err=>{console.error('sync error',err);})   // 항상 resolve — 후행 예약이 건너뛰어지지 않게
      .finally(()=>{
        if(this._syncP===p)this._syncP=null;this.renderSyncStatus();
        const nx=this._syncNext;this._syncNext=null;
        if(nx)this.syncToSheets(nx.url,nx.full);        // 비행 중 쌓인 변경 반영
      });
    this._syncP=p;
    return p;
  },
  async _syncRun(url){
    url=url||await this.getScriptUrl();if(!url)return false;
    clearTimeout(this._syncTimer);this.syncMessage='';
    try{await this.save();await DataSync.run(url);return true;}
    catch(err){this.syncMessage=err.name==='AbortError'?'연결 시간 초과 · 전송 대기 유지':err.message;return false;}
    finally{this.renderSyncStatus();}
  }

};

// ── PlanApp ──
const PlanApp={
  // 타입→색은 상단 DAY_COLORS_EL을 단일 소스로 참조 (요일→타입 고정표는 순환제 전환으로 제거)
  DAY_COLORS:DAY_COLORS_EL,
  init(){this.renderPhase();this.renderAnalysis(true);this.loadBlood();},
  // 분석 탭 일괄 렌더 — ExLog.dataVer가 그대로면 스킵. 이전에는 탭 전환마다 8종 렌더러(SVG 다수)를 무조건 재실행했다.
  renderAnalysis(force){
    const v=(typeof ExLog!=='undefined')?ExLog.dataVer:-1;
    if(!force&&this._renderedVer===v)return;
    this._renderedVer=v;
    this.renderSleep();this.renderBlock();this.renderWeek();this.renderVolume();this.renderVolTrend();this.renderTrends();this.renderWeekSummary();this.renderPRBoard();this.renderCalendar();
  },
  jumpTo(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},
  // 루틴 설정과 같은 기간을 표시합니다.
  renderPhase(){
    const ph=TRAINING_PLAN.phase(_todayKey());const start=new Date(TRAINING_PLAN.start+'T12:00:00'),end=new Date(TRAINING_PLAN.end+'T12:00:00');
    const pct=Math.max(0,Math.min(100,(Date.now()-start)/(end-start)*100));
    const label=document.getElementById('ph-label'),days=document.getElementById('ph-days'),bar=document.getElementById('ph-prog');
    if(label)label.textContent=ph.label;if(days)days.textContent=TRAINING_PLAN.start+'–'+TRAINING_PLAN.end+' · 체중 유지와 수행능력 회복';if(bar)bar.style.width=pct+'%';
    const rule=document.getElementById('weight-rule');if(rule)rule.textContent='체중 유지 — 목표 범위 '+IB_GOALS.wtMin+'–'+IB_GOALS.wtMax+'kg. 최근 7일 평균과 함께 판단하세요.';
  },
  // ── 디로드 자동 제안: 최근 7일 vs 그 전 7일의 RPE·통증·볼륨 + 블록 주차를 종합, 신호 2개 이상이면 제안 ──
  // 판단 근거를 그대로 노출해 사용자가 수긍/기각할 수 있게 한다. RPE 표본 6세트 미만이면 해당 신호는 침묵.
  deloadSignals(){return (typeof ExLog!=='undefined'&&ExLog.deloadState)?ExLog.deloadState():{signals:[],suggest:false,day:0};},
  // ── 수면: 지금 이 사람의 최대 제약이 훈련량이 아니라 수면인데, 앱은 기록만 하고 목표도 피드백도 없었다.
  // 볼륨·RPE에는 목표·추세·배너가 다 있으면서 정작 병목 축만 측정에 머물면 행동이 바뀌지 않는다.
  SLEEP_GOAL:7,
  // ── 순환 완주 추적 ─────────────────────────────────────────────────────────
  // KPI를 「순환 완주 8일 이내」로 정해놓고 화면에는 없었다. 8/22~8/30 사이클에서 Legs A가
  // 통째로 빠진 것도 사후에 기록을 뒤져서야 발견했다. 진행 중인 한 바퀴를 실시간으로 보여준다.
  cycleProgress(){
    if(typeof ExLog==='undefined')return null;
    const data=ExLog.data||{}, today=_todayKey();
    const done=Object.keys(data).filter(k=>k<=today&&(data[k].exercises||[]).some(e=>(e.sets||[]).some(_isWorkSet)))
      .sort().reverse();
    if(!done.length)return null;
    const base=t=>(typeof EL_BASE!=='undefined'&&EL_BASE[t])||t;
    const seen=new Map();                            // 타입 → 가장 최근 수행일
    for(const k of done){
      const t=base((data[k].day||'').trim());
      if(EL_CYCLE.indexOf(t)<0)continue;
      if(!seen.has(t))seen.set(t,k);
      if(seen.size===EL_CYCLE.length)break;
    }
    // 현재 한 바퀴 = 마지막으로 '완주가 닫힌' 지점 이후. 가장 오래된 타입의 수행일을 사이클 시작으로 본다
    const missing=EL_CYCLE.filter(t=>!seen.has(t));
    const dates=[...seen.values()].sort();
    const startK=dates[0]||done[done.length-1];
    const elapsed=Math.round((new Date(today+'T12:00:00')-new Date(startK+'T12:00:00'))/864e5)+1;
    const next=(typeof ExLog.nextType==='function')?ExLog.nextType():null;
    return{done:EL_CYCLE.length-missing.length,total:EL_CYCLE.length,missing:missing,
           elapsed:elapsed,start:startK,next:next,over:elapsed>8&&missing.length>0};
  },
  // 최근 7일 수면 미달 일수 — SMM 경고에 병기한다(제지방 보존의 단일 최대 레버)
  sleepShortfall(){
    if(typeof ExLog==='undefined')return null;
    const data=ExLog.data||{}, base=new Date(_todayKey()+'T12:00:00');
    let n=0,rec=0;
    for(const k in data){
      const h=+((data[k].cond||{}).sleep||0);if(!(h>0))continue;
      const ago=Math.round((base-new Date(k+'T12:00:00'))/864e5);
      if(ago>=0&&ago<7){rec++;if(h<this.SLEEP_GOAL)n++;}
    }
    return rec>=3?{short:n,rec:rec}:null;
  },
  renderSleep(){
    const el=document.getElementById('sleep-card');if(!el)return;
    if(typeof ExLog==='undefined'){el.innerHTML='';return;}
    const G=this.SLEEP_GOAL, data=ExLog.data||{}, base=new Date(_todayKey()+'T12:00:00');
    const day=[];                                   // 최근 28일 [{ago, h}]
    for(const k in data){
      const h=+((data[k].cond||{}).sleep||0); if(!(h>0))continue;
      const ago=Math.round((base-new Date(k+'T12:00:00'))/864e5);
      if(ago>=0&&ago<28)day.push({ago,h});
    }
    if(day.length<3){el.innerHTML='<div class="plan-vol-empty">운동 탭에서 수면 시간을 3일 이상 기록하면 목표 달성률과 연속 기록이 표시됩니다.</div>';return;}
    day.sort((a,b)=>a.ago-b.ago);
    let streak=0;                                   // 오늘(또는 최근 기록일)부터 연속 달성
    for(const d of day){ if(d.h>=G)streak++; else break; }
    let best=0,cur=0;
    [...day].reverse().forEach(d=>{ if(d.h>=G){cur++;best=Math.max(best,cur);} else cur=0; });
    const wk=[0,1,2,3].map(w=>{const v=day.filter(d=>d.ago>=w*7&&d.ago<(w+1)*7).map(d=>d.h);
      return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;});
    const w0=wk[0],w1=wk[1];
    const hit=day.filter(d=>d.h>=G).length, rate=Math.round(hit/day.length*100);
    const avg=(day.reduce((a,d)=>a+d.h,0)/day.length);
    const bars=wk.map((v,i)=>{
      const lbl=(i===0?'이번':i+'주전');   // wk는 [이번주,1주전,2주전,3주전] 순 — reverse() 후에도 라벨은 그대로 따라간다
      if(v==null)return '<div class="sl-bar"><div class="sl-fill" style="height:0"></div><span>'+lbl+'</span></div>';
      const hp=Math.round(Math.min(v/9,1)*100);
      return '<div class="sl-bar" title="'+v.toFixed(1)+'h"><div class="sl-fill'+(v>=G?' ok':'')+'" style="height:'+hp+'%"></div><span>'+(i===0?'이번':i+'주전')+'</span></div>';
    }).reverse().join('');
    const trend=(w0!=null&&w1!=null)?(w0-w1):null;
    let verdict;
    if(avg>=G) verdict='<b>목표를 유지하고 있습니다.</b> 이 구간에서는 증량·볼륨 확대를 시도해도 회복이 따라옵니다.';
    else if(avg>=6.5) verdict='목표까지 <b>'+(G-avg).toFixed(1)+'시간</b> — 취침을 30분 앞당기는 것부터. 운동 종료 후 심부체온이 내려가는 데 1.5~2시간이 걸립니다.';
    else verdict='평균 <b>'+avg.toFixed(1)+'시간</b> — 훈련량이 아니라 <b>여기가 상한</b>입니다. 이 상태에서 볼륨을 늘리면 회복이 먼저 무너집니다. '
      +'운동 종료를 1시간 앞당기고 카페인을 오후로 제한하는 것이 e1RM 증량보다 효과가 큽니다.';
    el.innerHTML='<div class="sl-top">'
      +'<div class="sl-kpi"><span class="sl-n'+(streak>0?' ok':'')+'">'+streak+'</span><span class="sl-l">연속 달성</span></div>'
      +'<div class="sl-kpi"><span class="sl-n">'+avg.toFixed(1)+'h</span><span class="sl-l">28일 평균</span></div>'
      +'<div class="sl-kpi"><span class="sl-n">'+rate+'%</span><span class="sl-l">'+G+'h 달성률</span></div>'
      +'<div class="sl-kpi"><span class="sl-n">'+best+'</span><span class="sl-l">최고 연속</span></div>'
      +'</div><div class="sl-bars">'+bars+'</div>'
      +(trend!=null?'<div class="sl-trend">전주 대비 '+(trend>=0?'+':'')+trend.toFixed(1)+'h</div>':'')
      +'<div class="sl-verdict">'+verdict+'</div>';
  },
  renderDeload(){
    const el=document.getElementById('block-deload-note');if(!el)return;
    if(typeof ExLog==='undefined'||!ExLog.deloadState){el.style.display='none';el.innerHTML='';return;}
    const st=ExLog.deloadState();
    let sb=null;try{sb=ExLog.sleepBottleneck();}catch(_){}
    let h='';
    if(st.day){
      h='🪫 <b>디로드 주 '+st.day+'/7일 진행 중</b> — 중량 유지 · 세트 55%. 운동 탭 자동 목표에 이미 반영돼 있습니다.'
        +'<span class="bc-act" onclick="ExLog.endDeload()">지금 종료</span>';
    }else if(st.suggest){
      h='🪫 <b>디로드 검토 신호 '+st.signals.length+'개</b> — '+st.signals.join(' · ')
        +'<span class="bc-act" onclick="ExLog.startDeload()">이번 주 디로드 시작</span>';
    }
    // 신호가 하나도 안 켜졌는데 그 이유가 '데이터가 없어서'라면, 조용한 것과 안전한 것은 다르다.
    else if(st.blind&&st.blind.length){
      h='🔌 <b>디로드 판정이 반쪽입니다</b> — '+st.blind.join(' · ')
        +'. 6개 신호 중 '+st.blind.length+'개가 꺼져 있어 「2개 이상」 조건에 닿기 어렵습니다.'
        +(st.blind.some(x=>/블록/.test(x))?'<span class="bc-act" onclick="ExLog.startBlock()">블록 시작</span>':'');
    }
    // 유산소는 웨이트와 다른 축이라 별도 줄로 — 볼륨을 늘려도 내장지방은 안 빠진다.
    let cd=null;try{cd=ExLog.weekCardio();}catch(_){}
    if(cd&&cd.n<cd.need){
      h+=(h?'<div class="dl-sep"></div>':'')
        +'🏃 <b>유산소 이번 주 '+cd.n+'회'+(cd.min?' · '+cd.min+'분':'')+'</b> — 계획은 주 '+cd.need+'~3회 × 20~30분입니다. '
        +'내장지방은 웨이트 볼륨이 아니라 여기서 움직입니다. 웨이트 뒤 15~20분도 1회로 칩니다.';
    }
    // 수면 병목은 디로드와 독립적으로 표시한다 — 볼륨을 줄이는 것으로는 해결되지 않는 축이라 처방이 다르다.
    if(sb){
      h+=(h?'<div class="dl-sep"></div>':'')
        +'🛏 <b>회복 병목: 수면</b> — 2주 평균 '+sb.avg.toFixed(1)+'h (이번 주 '+sb.w0.toFixed(1)+'h · 전주 '+sb.w1.toFixed(1)+'h). '
        +'수면 부족은 훈련량을 줄여도 원인이 남습니다. 디로드보다 수면 복구가 먼저입니다.';
    }
    if(!h){el.style.display='none';el.innerHTML='';return;}
    el.style.display='';el.innerHTML=h;
    // 이 배너는 접힌 details(⏱ 6주 블록 진행) 안에 있어 그냥 두면 보이지 않는다.
    // 신호가 처음 생겼을 때 1회만 자동으로 펼친다(사용자가 닫으면 다시 열지 않음).
    if(!this._dlOpened){const d=el.closest('details');if(d&&!d.open){d.open=true;this._dlOpened=true;}}
  },
  _dlOpened:false,
  renderBlock(){
    this.renderDeload();
    // 운동 탭 블록 트래커(ExLog.block)와 단일 소스 — 하드코딩 시작일 제거
    const fill=document.getElementById('block-fill');
    const rd=document.getElementById('block-review-date');
    const dt=document.getElementById('block-days-txt');
    const rm=document.getElementById('block-remain-txt');
    const title=document.querySelector('.plan-block-title');
    const blk=(typeof ExLog!=='undefined')?ExLog.block:null;
    if(!blk||!blk.start){
      if(title)title.textContent='블록 미설정';
      if(fill)fill.style.width='0%';
      if(rd)rd.textContent='';
      if(dt)dt.textContent='운동 탭 상단 칩에서 블록을 시작하세요';
      if(rm)rm.textContent='';
      return;
    }
    const start=new Date(blk.start+'T00:00:00');
    const review=new Date(start);review.setDate(start.getDate()+42);
    const now=new Date();
    const elapsedRaw=Math.max(0,Math.floor((now-start)/864e5));
    const elapsed=Math.min(42,elapsedRaw);
    const pct=Math.round(elapsed/42*100);
    const wk=Math.floor(elapsedRaw/7)+1;
    if(title)title.textContent='블록 리뷰 ('+wk+'주차)';
    if(fill)fill.style.width=pct+'%';
    if(rd)rd.textContent=review.toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
    if(dt)dt.textContent=elapsed+'/42일 ('+pct+'%)';
    if(rm)rm.textContent=elapsedRaw>=42?'✅ 리뷰 시점 — 추세 섹션 확인':'잔여 '+(42-elapsedRaw)+'일';
  },
  _wkOff:0, // 0=이번 주, -1=지난주 … (미래 불가) — 그리드·주간 요약·보고 복사가 공유
  shiftWeek(d){
    this._wkOff=Math.min(0,this._wkOff+d);
    this.renderWeek();this.renderWeekSummary();
  },
  renderWeek(){
    const keys=this._weekKeys(this._wkOff);
    const ws=new Date(keys[0]+'T12:00:00');ws.setHours(0,0,0,0);
    // 네비 라벨·미래 버튼 비활성
    const lbl=document.getElementById('plan-week-lbl');const nx=document.getElementById('pw-next');
    if(lbl){
      const fd=k=>{const d=new Date(k+'T12:00:00');return (d.getMonth()+1)+'.'+d.getDate();};
      lbl.textContent=this._wkOff===0?'이번 주':(this._wkOff===-1?'지난주':(-this._wkOff)+'주 전')+' ('+fd(keys[0])+'~'+fd(keys[6])+')';
    }
    if(nx)nx.disabled=this._wkOff>=0;
    this._logData().then(data=>this._drawWeek(ws,data));
  },
  _drawWeek(ws,data){
    const grid=document.getElementById('plan-week-grid');if(!grid)return;
    const ns=['월','화','수','목','금','토','일'];
    const today=_todayKey();
    const self=this;
    grid.innerHTML=ns.map(function(n,i){
      const d=new Date(ws);d.setDate(ws.getDate()+i);
      const dk=_localKey(d);
      // 순환제: 요일 고정 타입 대신 실제 기록 타입 표시, 오늘(미기록)은 순환 예측, 그 외 미기록은 '—'
      const ses=data[dk];
      let type=ses&&ses.day?(typeof ExLog!=='undefined'?ExLog._baseType(ses.day):ses.day):'';
      if(!type&&dk===today&&typeof ExLog!=='undefined')type=ExLog.dayType(dk);
      const sets=self._sessionSets(data,dk);                  // 기록에서 자동 판정 — 수동 체크와 이원화되던 것 통일
      const isToday=dk===today,isDone=sets>0,isPast=d<new Date()&&!isToday;
      const cls='plan-day-cell'+(isDone?' done':'')+(isToday?' today':'')+(!type?' rest':'');
      return '<div class="'+cls+'" title="'+dk+(isDone?' · '+sets+'세트':'')+'" style="cursor:default">'
        +'<span class="plan-day-nm">'+n+'</span>'
        +'<span class="plan-day-tp" style="color:'+(self.DAY_COLORS[type]||'#888')+'">'+(type||'—')+'</span>'
        +'<span class="plan-day-ck">'+(isDone?'✓':isPast?'○':'·')+'</span></div>';
    }).join('');
  },
  async loadBlood(){
    let checked={};try{const r=await window.storage.get('plan_blood_v1');if(r)checked=JSON.parse(r.value);}catch(_){}
    document.querySelectorAll('.plan-blood-item').forEach(item=>{
      const cb=item.querySelector('.plan-blood-cb');
      if(checked[item.dataset.key]){item.classList.add('done-test');if(cb){cb.classList.add('checked');const ck=cb.querySelector('.plan-blood-ck');if(ck)ck.textContent='✓';}}
      else{item.classList.remove('done-test');if(cb){cb.classList.remove('checked');const ck=cb.querySelector('.plan-blood-ck');if(ck)ck.textContent='';}}
    });
  },
  async toggleBlood(el){
    const key=el.dataset.key;let checked={};
    try{const r=await window.storage.get('plan_blood_v1');if(r)checked=JSON.parse(r.value);}catch(_){}
    checked[key]=!checked[key];await window.storage.set('plan_blood_v1',JSON.stringify(checked));this.loadBlood();
  },
  // ── 로그 분석: 부위별 주간 볼륨 + 종목 추세 ──
  // 이미 ExLog가 메모리에 들고 있는 파싱본을 재사용(플랜 탭에서 4개 렌더가 각자 JSON.parse 하던 것 제거). 없을 때만 storage 폴백.
  async _logData(){try{if(typeof ExLog!=='undefined'&&ExLog.data&&Object.keys(ExLog.data).length)return ExLog.data;}catch(_){}try{
      const l=await window.storage.list('wl_v2:');const out={};
      for(const k of ((l&&l.keys)||[]).sort()){const v=await window.storage.get(k);if(v)Object.assign(out,JSON.parse(v.value)||{});}
      return out;
    }catch(_){return{};}},
  _weekRange(){
    const now=new Date();const dow=now.getDay();
    const ws=new Date(now);ws.setDate(now.getDate()-(dow===0?6:dow-1));ws.setHours(0,0,0,0);
    const we=new Date(ws);we.setDate(ws.getDate()+6);we.setHours(23,59,59,999);
    return{ws,we};
  },
  _isTimed(n){return /플랭크|데드행/.test(n||'');},
  // 부위 판정: ① 도감의 명시 매핑(vol 필드)이 진실의 원천 → ② 정규식은 도감 미등록 직접입력 종목의 fallback
  // 결과는 이름별로 캐시 (도감·정규식 모두 페이지 수명 동안 불변 — injectRecos 등 반복 호출 비용 제거)
  _muscleCache:{},
  muscleOf(name){
    const n=name||'';const c=this._muscleCache;
    if(n in c)return c[n];
    let r=null;
    const lib=(typeof ExLog!=='undefined'&&ExLog.libByName)?ExLog.libByName(n):null;
    if(lib&&lib.vol)r=lib.vol;
    else r=this._muscleOfRegex(n);
    c[n]=r;return r;
  },
  _muscleOfRegex(name){
    const n=name||'';
    if(/데드행/.test(n))return null; // 시간 종목 — 볼륨 집계 제외
    if(/플랭크|크런치|싯업|레그\s*레이즈|레그레이즈|니\s*?레이즈|토즈\s*투\s*바|복근|롤아웃|데드버그|버드독|할로우|팔로프|V업|우드촙|트위스트|마운틴/.test(n))return{p:'코어',s:[]};
    if(/스컬|JM/.test(n))return{p:'삼두',s:[]};
    if(/노르딕|글루트햄|햄\s*컬/.test(n))return{p:'후면사슬',s:[]};
    if(/업라이트/.test(n))return{p:'측면삼각',s:['승모']};
    if(/래터럴|레터럴|사이드\s*레이즈/.test(n)&&!/벤치|프레스|풀다운/.test(n))return /벤트오버|리어/.test(n)?{p:'후면삼각',s:['등']}:{p:'측면삼각',s:[]};
    if(/페이스풀|리어|후면\s*삼각|리버스\s*펙|리버스\s*플라이|외회전/.test(n))return{p:'후면삼각',s:['등']};
    if(/숄더\s*?프레스|오버헤드\s*?프레스|밀리터리|OHP|아놀드|파이크|바이킹|랜드마인/i.test(n))return{p:'전면삼각',s:['삼두','측면삼각']};
    if(/프론트\s*레이즈/.test(n))return{p:'전면삼각',s:[]};
    if(/리스트\s*컬|손목|파머스/.test(n))return{p:'전완',s:[]};
    if(/슈러그|shrug/i.test(n))return{p:'승모',s:[]};
    if(/카프|종아리|calf/i.test(n))return{p:'종아리',s:[]};
    if(/컬|바이셉스/.test(n)&&!/레그/.test(n))return{p:'이두',s:[]};
    if(/킥백/.test(n))return /글루트|둔근|힙/.test(n)?{p:'후면사슬',s:[]}:{p:'삼두',s:[]};
    if(/트라이|푸시다운|딥스/.test(n))return{p:'삼두',s:[]};
    if(/크로스오버|플라이|펙덱/.test(n))return{p:'가슴',s:['전면삼각']};
    if(/토르소|로터리/.test(n))return{p:'코어',s:[]};
    if(/레그\s*?익스텐션|시시/.test(n))return{p:'대퇴사두',s:[]};
    if(/어덕션|내전/.test(n))return{p:'내전근',s:[]};
    if(/굿모닝|풀스루|스윙|백\s*익스텐션|하이퍼|루마니안|RDL|레그\s*?컬|힙\s*?쓰러스트|힙\s*?어브덕션|어브덕터|글루트/.test(n))return{p:'후면사슬',s:[]};
    if(/데드리프트|랙풀/.test(n))return{p:'후면사슬',s:['등']};
    if(/로우|풀\s*?다운|풀업|풀오버|랫|친업/.test(n))return{p:'등',s:['이두']};
    if(/체스트|벤치|푸시업|인클라인|디클라인/.test(n))return{p:'가슴',s:['삼두']};
    if(/스쿼트|레그\s*?프레스|익스텐션|런지|스텝업|불가리안|고블릿|시시/.test(n))return{p:'대퇴사두',s:['후면사슬']};
    return null;
  },
  async renderVolume(){
    const box=document.getElementById('plan-vol');if(!box)return;
    const data=await this._logData();const{ws,we}=this._weekRange();
    const order=['가슴','등','측면삼각','전면삼각','후면삼각','삼두','이두','대퇴사두','후면사슬','코어','전완','내전근','승모','종아리'];
    const COL={'가슴':'#D85A30','등':'#185FA5','측면삼각':'#BA7517','전면삼각':'#E0922F','후면삼각':'#9A5B2E','삼두':'#0C447C','이두':'#3B6D11','대퇴사두':'#27500A','후면사슬':'#6B4FA0','코어':'#888','전완':'#5B8A2A','내전근':'#8B5E3C','승모':'#7A6F2E','종아리':'#3E2E66'};
    const PRI={'측면삼각':1,'등':1,'가슴':1};
    const OPT={'전완':1,'내전근':1,'승모':1,'종아리':1};
    const vol={};order.forEach(m=>vol[m]=0);
    for(const dk in data){
      const d=new Date(dk+'T12:00:00');if(d<ws||d>we)continue;
      (data[dk].exercises||[]).forEach(ex=>{
        const n=(ex.sets||[]).filter(_isWorkSet).length;if(!n)return;
        const mu=this.muscleOf(ex.name);if(!mu)return;
        const bp=_effBucket(ex.name,mu.p);
        vol[bp]=(vol[bp]||0)+n;
        
      });
    }
    const total=order.reduce((a,m)=>a+vol[m],0);
    if(total===0){box.innerHTML='<div class="plan-vol-empty">이번 주 기록이 없습니다. 운동 탭에서 세트를 기록하면 부위별로 집계됩니다.</div>';return;}
    // 목표 달성률 헤드라인 — 부위별 목표(RECO_TARGET) 상한 캡핑 합산: 한 부위 과잉이 다른 부위 미달을 못 가림
    let gDone=0,gTarget=0;
    for(const m in RECO_TARGET){gTarget+=RECO_TARGET[m];gDone+=Math.min(vol[m]||0,RECO_TARGET[m]);}
    const gPct=gTarget?Math.round(gDone/gTarget*100):0;
    const goalHtml='<div class="vol-goal"><div class="vol-goal-top"><span class="vol-goal-pct'+(gPct>=100?' hit':'')+'">'+gPct+'%'+(gPct>=100?' 🎉':'')+'</span><span class="vol-goal-sub">이번 주 목표 볼륨 '+(gDone%1?gDone.toFixed(1):gDone)+'/'+gTarget+'세트</span></div><div class="vol-goal-bar"><div class="vol-goal-fill" style="width:'+Math.min(100,gPct)+'%"></div></div></div>';
    const shown=order.filter(m=>!OPT[m]||vol[m]>0);
    const max=Math.max(10,...shown.map(m=>vol[m]));
    box.innerHTML=goalHtml+'<div class="plan-vol-head">이번 주 누적 세트 · 부위별</div>'+shown.map(m=>{
      const v=vol[m];const w=Math.round(v/max*100);const low=PRI[m]&&v<(RECO_TARGET[m]||0);
      const vt=(v%1===0?String(v):v.toFixed(1));
      return '<div class="pv-row"><span class="pv-nm">'+m+(PRI[m]?' ⭐':'')+'</span><div class="pv-track"><div class="pv-fill" style="width:'+w+'%;background:'+COL[m]+'"></div></div><span class="pv-val'+(low?' low':'')+'">'+vt+(low?' ⚠':'')+'</span></div>';
    }).join('')+this._rebalanceHtml(vol)+'<div class="plan-vol-note">주동근 직접 본세트 · 목표는 기본 루틴의 참고량입니다. 복귀 단계에는 낮춰 적용합니다.</div>'+this._vol4Html(data,order,COL);
  },
  // ── 볼륨 재배분 제안 ──────────────────────────────────────────────────
  // 부위별 미달 표시만으로는 '무엇을 줄여 무엇에 줄지'가 안 보인다. 회복 총량은 유한하므로
  // 과다 부위에서 덜어 부족 부위로 옮기는 게 총량을 늘리는 것보다 안전하다.
  // 우선순위(PRI: 측면삼각·등·가슴)가 부족하면 먼저 채우고, 기증자는 초과폭이 큰 부위부터.
  _rebalanceHtml(vol){
    const over=[],under=[];
    for(const m in RECO_TARGET){
      const v=vol[m]||0,t=RECO_TARGET[m];
      if(v>=t*1.4&&v-t>=3)over.push({m,v,t,ex:v-t});
      else if(v<=t*0.8)under.push({m,v,t,gap:t-v});
    }
    if(!over.length||!under.length)return'';
    over.sort((a,b)=>b.ex-a.ex);
    under.sort((a,b)=>(RECO_TARGET_PRI[b.m]||0)-(RECO_TARGET_PRI[a.m]||0)||b.gap-a.gap);
    const lines=[];
    let pool=over.map(o=>Object.assign({},o));
    under.slice(0,2).forEach(u=>{
      let need=Math.min(u.gap,4);                       // 한 번에 4세트 넘게 옮기지 않는다 — 급격한 이동은 폼·회복을 흔든다
      for(const o of pool){
        if(need<=0||o.ex<1)continue;
        const mv=Math.min(need,o.ex,3);
        if(mv<1)continue;
        o.ex-=mv;need-=mv;
        lines.push('<b>'+o.m+'</b>에서 <b>'+(mv%1?mv.toFixed(1):mv)+'세트</b> → <b>'+u.m+'</b>'+(RECO_TARGET_PRI[u.m]?' ⭐':''));
      }
    });
    if(!lines.length)return'';
    return '<div class="vol-rebal"><div class="vol-rebal-hd">♻ 재배분 제안 — 총량을 늘리지 말고 옮기세요</div>'
      +lines.map(l=>'<div class="vol-rebal-row">'+l+'</div>').join('')
      +'<div class="vol-rebal-note">과다 부위를 줄여 확보한 회복 여력을 부족 부위에 씁니다. ⭐는 V-테이퍼 우선 부위라 먼저 채웁니다.</div></div>';
  },
  // 최근 4주 부위별 주간 세트 추이 — 4주 누적이 주 분석 단위이므로 정체·과부족을 주 단위가 아닌 4주 흐름으로 판단
  _vol4Html(data,order,COL){
    const wk4=[-3,-2,-1,0].map(o=>new Set(this._weekKeys(o)));
    const v4={};order.forEach(m=>v4[m]=[0,0,0,0]);
    for(const dk in data){
      let wi=-1;for(let i=0;i<4;i++)if(wk4[i].has(dk)){wi=i;break;}
      if(wi<0)continue;
      (data[dk].exercises||[]).forEach(ex=>{
        const n=(ex.sets||[]).filter(_isWorkSet).length;if(!n)return;
        const mu=this.muscleOf(ex.name);if(!mu)return;
        const bp=_effBucket(ex.name,mu.p);
        if(v4[bp])v4[bp][wi]+=n;
        
      });
    }
    const rows=order.filter(m=>RECO_TARGET[m]&&v4[m].some(v=>v>0));
    if(rows.length<2)return'';
    const fmt=v=>v%1?v.toFixed(1):String(v);
    return'<details class="vol4"><summary>📆 최근 4주 부위별 추이</summary><div class="vol4-body">'
      +rows.map(m=>{
        const t=RECO_TARGET[m];
        const bars=v4[m].map((v,i)=>{
          const hp=Math.round(Math.min(v/t,1.25)/1.25*100);
          const hit=v>=t;
          return'<div class="v4-bar" title="'+(3-i)+'주 전: '+fmt(v)+'세트"><div class="v4-fill" style="height:'+hp+'%;background:'+COL[m]+';opacity:'+(hit?'1':'.35')+'"></div></div>';
        }).join('');
        return'<div class="v4-row"><span class="v4-nm">'+m+'</span><div class="v4-bars">'+bars+'</div><span class="v4-val">'+v4[m].map(fmt).join(' · ')+' <small>/주'+t+'</small></span></div>';
      }).join('')
      +'<div class="v4-note">막대 4개 = 3주 전 → 이번 주. 진한 색 = 주간 목표 달성.</div></div></details>';
  },
  _e1rm(s){return _e1Of(_ldW(s),s.reps);},
  _spark(vals){
    const w=84,h=26,pad=4;
    const v=vals.slice(-6);                                      // 표시 창 먼저 자르고
    const mn=Math.min(...v),mx=Math.max(...v);const rng=mx-mn||1; // 창 기준 정규화 — 전체 이력 기준이면 초기 저중량에 눌려 최근 변화가 평평하게 왜곡됨
    const step=v.length>1?(w-pad*2)/(v.length-1):0;
    const pts=v.map((x,i)=>(pad+i*step).toFixed(1)+','+(h-pad-(x-mn)/rng*(h-pad*2)).toFixed(1));
    const lp=pts[pts.length-1].split(',');const top=v[v.length-1]>=mx-0.01;
    return '<svg class="tr-spark" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'"><polyline points="'+pts.join(' ')+'" fill="none" stroke="#185FA5" stroke-width="1.5" stroke-linejoin="round"/><circle cx="'+lp[0]+'" cy="'+lp[1]+'" r="2.3" fill="'+(top?'#3B6D11':'#888')+'"/></svg>';
  },
  // ── 주간 볼륨 추이(8주): 부위 카테고리별 스택 막대 — 볼륨 축적/피로 누적을 한눈에. 디로드 판단 보조 ──
  async renderVolTrend(){
    const box=document.getElementById('plan-voltrend');if(!box)return;
    const data=await this._logData();
    const weeks=[];
    for(let off=-7;off<=0;off++){
      const keys=this._weekKeys(off);
      const cat={push:0,pull:0,legs:0,etc:0};let tot=0;
      keys.forEach(dk=>{const ses=data[dk];if(!ses)return;(ses.exercises||[]).forEach(ex=>{
        const mu=this.muscleOf(ex.name);const b=mu&&mu.p;let c='etc';
        for(const k in RECO_CAT){if(RECO_CAT[k].includes(b)){c=k;break;}}
        (ex.sets||[]).forEach(st=>{if(!_isWorkSet(st))return;const v=(st.weight||0)*st.reps;cat[c]+=v;tot+=v;});
      });});
      weeks.push({lbl:keys[0].slice(5).replace('-','/'),tot,cat});
    }
    if(!weeks.some(w=>w.tot>0)){box.innerHTML='<div class="plan-vol-empty">기록이 쌓이면 주 단위 볼륨 추이가 여기 표시됩니다.</div>';return;}
    const max=Math.max.apply(null,weeks.map(w=>w.tot))||1;
    const W=330,H=124,bw=28,gap=(W-8*bw)/8;
    const COLV={push:'#D85A30',pull:'#185FA5',legs:'#3B6D11',etc:'#999'};
    let bars='';
    weeks.forEach((w,i)=>{
      const x=gap/2+i*(bw+gap);let y=H-18;
      ['legs','pull','push','etc'].forEach(c=>{
        const h=w.tot?Math.round(w.cat[c]/max*(H-42)):0;
        if(h>0){y-=h;bars+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="2" fill="'+COLV[c]+'"/>';}
      });
      if(w.tot>0)bars+='<text x="'+(x+bw/2)+'" y="'+(y-4)+'" font-size="8" text-anchor="middle" fill="#666">'+(w.tot>=1000?(w.tot/1000).toFixed(1)+'k':Math.round(w.tot))+'</text>';
      bars+='<text x="'+(x+bw/2)+'" y="'+(H-6)+'" font-size="8" text-anchor="middle"'+(i===7?' font-weight="700" fill="#085041"':' fill="#999"')+'>'+w.lbl+'</text>';
    });
    box.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">'+bars+'</svg>'
      +'<div class="vt-legend"><span><i style="background:#D85A30"></i>푸시</span><span><i style="background:#185FA5"></i>풀</span><span><i style="background:#3B6D11"></i>하체</span></div>'
      +'<div class="vt-note">주간 총볼륨(kg) · 마지막 막대 = 이번 주(진행 중)</div>';
  },
  async renderTrends(){
    const box=document.getElementById('plan-trend');if(!box)return;
    const data=await this._logData();const byEx={};
    Object.keys(data).sort().forEach(dk=>{
      (data[dk].exercises||[]).forEach(ex=>{
        if(this._isTimed(ex.name))return;
        const sets=(ex.sets||[]).filter(s=>s.weight>0&&_isWorkSet(s));if(!sets.length)return;
        const e1=Math.max.apply(null,sets.map(s=>this._e1rm(s)));
        const heavy=sets.reduce((a,s)=>s.weight>a.weight?s:a,sets[0]);
        const cn=(typeof ExLog!=='undefined')?ExLog.canon(ex.name):ex.name; // 별칭 연결 시 옛 기록을 같은 추세로 묶음
        (byEx[cn]=byEx[cn]||[]).push({dk,e1,w:heavy.weight,r:heavy.reps,sc:sets.length});
      });
    });
    const names=Object.keys(byEx).filter(n=>byEx[n].length>=2);
    if(!names.length){box.innerHTML='<div class="plan-vol-empty">추세를 보려면 같은 종목을 2회 이상 기록하세요. 점진 과부하가 쌓이면 여기서 추정 1RM 흐름과 정체를 확인할 수 있습니다.</div>';return;}
    names.sort((a,b)=>byEx[b][byEx[b].length-1].dk.localeCompare(byEx[a][byEx[a].length-1].dk));
    // 상대강도(×BW): 인바디 최신 체중 기준 — 커팅 중 절대중량 유지 = 상대강도 상승을 가시화
    let bwKg=null;
    try{if(typeof InBody!=='undefined'){if(!InBody._log)await InBody.load();if(InBody._log&&InBody._log.length)bwKg=InBody._log[InBody._log.length-1].wt||null;}}catch(_){}
    const rowFor=(n)=>{
      const arr=byEx[n];const last=arr[arr.length-1],prev=arr[arr.length-2];
      const delta=last.e1-prev.e1;
      const arrow=delta>0.3?'<span class="tr-up">▲</span>':(delta<-0.3?'<span class="tr-dn">▼</span>':'<span class="tr-eq">—</span>');
      let plateau=false;
      if(arr.length>=3){const a=arr.slice(-3).map(x=>x.e1);plateau=(a[2]<=a[1]+0.3&&a[1]<=a[0]+0.3);}
      // e1RM 마일스톤 — 복합 종목만: 역대 최고 e1RM 기준 다음 10kg 단위까지 진행 바 (커팅 중에도 반복수로 움직이는 지표)
      let ms='';
      if(typeof ExLog!=='undefined'&&ExLog.isCompound(n)){
        const best=Math.max.apply(null,arr.map(x=>x.e1));
        const next=Math.floor(best/10)*10+10;
        const p=Math.round((best-(next-10))/10*100);
        ms='<div class="tr-ms"><span class="tr-ms-txt">🏁 <b>'+next+'kg</b>까지 '+(next-best).toFixed(1)+'kg</span><div class="tr-ms-bar"><div class="tr-ms-fill" style="width:'+p+'%"></div></div></div>';
      }
      return '<div class="tr-row"><div class="tr-top"><span class="tr-nm" onclick="ExLog.showHistory(\''+n.replace(/'/g,"\\'")+'\')" title="탭하면 전체 기록">'+n+'</span>'+(plateau?'<span class="tr-plat">정체</span><button class="tr-alt-btn" onclick="PlanApp.toggleAlt(this,\''+n.replace(/'/g,"\\'")+'\')">🔄 대체 종목</button>':'')+'</div><div class="tr-mid">'+this._spark(arr.map(x=>x.e1))+'<div class="tr-stat"><span class="tr-e1">e1RM '+last.e1.toFixed(1)+'kg</span>'+((bwKg&&typeof ExLog!=='undefined'&&ExLog.isCompound(n))?' <span class="tr-bw">'+(last.e1/bwKg).toFixed(2)+'×BW</span>':'')+' '+arrow+' <span class="tr-set">최근 '+last.w+'×'+last.r+'</span></div></div>'+ms+(plateau?'<div class="tr-alt"></div>':'')+'</div>';
    };
    // ── 가독성: 부위 그룹핑 + 그룹당 기본 5개(전체 펼치기) — 최근 기록순 단일 긴 목록이던 것을 푸시/풀/하체로 구획 ──
    const catLbl={push:'🔴 푸시',pull:'🔵 풀',legs:'🟢 하체',etc:'⚪ 기타'};
    const catOf=n=>{const mu=this.muscleOf(n);const b=_effBucket(n,mu&&mu.p);for(const c in RECO_CAT){if(RECO_CAT[c].includes(b))return c;}return 'etc';};
    const groups={push:[],pull:[],legs:[],etc:[]};
    names.forEach(n=>groups[catOf(n)].push(n));
    const LIMIT=this._trAll?999:5;
    let rowsHtml='';let hidden=0;
    ['push','pull','legs','etc'].forEach(c=>{
      const g=groups[c];if(!g.length)return;
      rowsHtml+='<div class="tr-grp">'+catLbl[c]+' <span class="tr-grp-n">'+g.length+'</span></div>'+g.slice(0,LIMIT).map(rowFor).join('');
      if(g.length>LIMIT){hidden+=g.length-LIMIT;rowsHtml+='<div class="tr-more-note">… '+(g.length-LIMIT)+'개 숨김</div>';}
    });
    if(hidden)rowsHtml+='<button class="tr-more-btn" onclick="PlanApp._trAll=true;PlanApp.renderTrends()">전체 펼치기 ('+hidden+'개 더)</button>';
    else if(this._trAll)rowsHtml+='<button class="tr-more-btn" onclick="PlanApp._trAll=false;PlanApp.renderTrends()">접기</button>';
    // 디로드 신호는 표시 개수와 무관하게 전체 종목 기준으로 재계산
    plateauCompounds=names.filter(n=>{
      if(!(typeof ExLog!=='undefined'&&ExLog.isCompound(n)))return false;
      const arr=byEx[n];if(arr.length<3)return false;
      const a=arr.slice(-3).map(x=>x.e1);
      return a[2]<=a[1]+0.3&&a[1]<=a[0]+0.3;
    }).length;
    // 6주 블록 리뷰: 6주차 도달 시 블록 내 보조 종목 정체를 나열하고 같은 부위 대체 후보 제안
    let blockBanner='';
    const bw6=(typeof ExLog!=='undefined'&&ExLog.blockWeek)?ExLog.blockWeek():null;
    if(bw6>=6){
      const bs=ExLog.block.start;
      const stale=[];
      names.forEach(n=>{
        if(ExLog.isCompound(n))return;                       // 앵커(복합)는 고정 — 보조/고립만 로테이션 대상
        const arr=byEx[n].filter(x=>x.dk>=bs);
        if(arr.length<3)return;
        const a=arr.slice(-3).map(x=>x.e1);
        if(a[2]<=a[1]+0.3&&a[1]<=a[0]+0.3)stale.push(n);
      });
      const lib=window.EXERCISE_LIBRARY||[];
      const performed=new Set(names.map(n=>ExLog.canon(n)));
      const sugg=n=>{
        const mu=this.muscleOf(n);if(!mu)return'';
        const alts=lib.filter(e=>e.vol&&e.vol.p===mu.p&&!performed.has(ExLog.canon(e.name))).slice(0,2).map(e=>e.name);
        return alts.length?' <span class="tr-block-alt">→ '+alts.join(' · ')+'</span>':'';
      };
      blockBanner='<div class="tr-block">📆 <b>6주 블록 리뷰</b> ('+bw6+'주차) — '
        +(stale.length
          ?'정체한 보조 종목의 로테이션을 검토하세요:<div class="tr-block-list">'+stale.slice(0,4).map(n=>'<div>· '+n+sugg(n)+'</div>').join('')+'</div>'
          :'보조 종목이 모두 진행 중입니다. 이번 블록 구성을 유지해도 좋습니다.')
        +'<span class="bc-act" onclick="ExLog.startBlock()">새 블록 시작</span></div>';
    }
    // 디로드 배너: 계획 탭과 동일한 ExLog.deloadState() 판정을 쓴다(이전에는 여기만 다른 기준이었다)
    let banner='';
    const dlSt=(typeof ExLog!=='undefined'&&ExLog.deloadState)?ExLog.deloadState():null;
    // 수면 병목은 디로드와 독립 배너로 — 디로드 신호가 없어도 떠야 한다(볼륨 축소로 해결되지 않는 문제라서).
    let sleepBanner='';
    try{
      const sb=(typeof ExLog!=='undefined'&&ExLog.sleepBottleneck)?ExLog.sleepBottleneck():null;
      if(sb)sleepBanner='<div class="tr-sleep">🛏 <b>회복 병목: 수면</b> — 2주 평균 <b>'+sb.avg.toFixed(1)+'h</b> (이번 주 '+sb.w0.toFixed(1)+'h · 전주 '+sb.w1.toFixed(1)+'h). '
        +'수면 부족은 회복 용량 자체를 낮춰 훈련량을 줄여도 원인이 남습니다. 지금은 증량 페이스보다 <b>수면 복구가 상한</b>입니다.</div>';
    }catch(_){}
    if(dlSt&&(dlSt.day||dlSt.suggest)){
      const condNote='';
      // 디로드 플랜 데이터: 최근 수행 복합(앵커) 종목의 마지막 무게·세트 수 스냅샷 (버튼 탭 시 즉석 표 생성)
      this._deloadRows=names.filter(n=>ExLog.isCompound(n)&&!ExLog.isTimed(n)).slice(0,6)
        .map(n=>{const l=byEx[n][byEx[n].length-1];return{n,w:l.w,sc:l.sc||3};});
      banner='<div class="tr-deload">🛌 <b>'+(dlSt.day?'디로드 주 '+dlSt.day+'/7일 진행 중':'디로드 검토')+'</b> — '+dlSt.signals.join(' · ')
        +(dlSt.day?'. 중량 유지 · 세트 55% — 자동 목표에 반영 중입니다.':'. 1주간 중량 유지·볼륨 50~60%로 줄여 회복 후 재도전을 권장합니다.')+condNote
        +'<span class="bc-act" onclick="'+(dlSt.day?'ExLog.endDeload()':'ExLog.startDeload()')+'">'+(dlSt.day?'지금 종료':'이번 주 디로드 시작')+'</span>'
        +'<span class="bc-act" onclick="PlanApp.toggleDeloadPlan(this)">📋 디로드 플랜</span><div class="tr-deload-plan"></div></div>';
    }
    box.innerHTML=blockBanner+sleepBanner+banner+rowsHtml;
  },
  // 디로드 주 즉석 플랜: 앱 권장(중량 유지·볼륨 50~60%)을 종목별 숫자로 — "줄이라"에서 "이 숫자로 하라"로
  toggleDeloadPlan(btn){
    const panel=btn.parentElement&&btn.parentElement.querySelector('.tr-deload-plan');if(!panel)return;
    if(panel.classList.contains('open')){panel.classList.remove('open');panel.innerHTML='';return;}
    const rows=this._deloadRows||[];
    if(!rows.length){panel.innerHTML='<div class="tr-alt-empty">최근 복합 종목 기록이 없습니다.</div>';}
    else{
      panel.innerHTML='<div class="dl-hd">1주 디로드 — 중량 유지 · 세트 절반 · 렙은 범위 하단. 다음 주 원래 볼륨으로 복귀.</div>'
        +rows.map(r=>{
          const half=Math.max(1,Math.round(r.sc*0.55));
          return '<div class="dl-row"><span class="dl-nm">'+r.n+'</span><span class="dl-val">'+r.w+'kg × '+half+'세트 <small>(기존 '+r.sc+')</small></span></div>';
        }).join('');
    }
    panel.classList.add('open');
  },
  toggleAlt(btn,name){
    const row=btn.closest('.tr-row');const panel=row&&row.querySelector('.tr-alt');if(!panel)return;
    if(panel.classList.contains('open')){panel.classList.remove('open');panel.innerHTML='';return;}
    const mu=this.muscleOf(name);const bucket=mu?mu.p:null;
    const lib=window.EXERCISE_LIBRARY||[];
    const self=this;
    const alts=lib.filter(function(e){const m=self.muscleOf(e.name);return m&&m.p===bucket&&e.name!==name;}).slice(0,6);
    if(!alts.length){panel.innerHTML='<div class="tr-alt-empty">같은 부위 대체 종목이 도감에 없습니다.</div>';}
    else{panel.innerHTML='<div class="tr-alt-hd">같은 부위('+(bucket||'')+') 대체 종목 — 6주째 정체면 교체 고려</div>'+alts.map(function(e){return '<div class="tr-alt-row"><span class="tr-alt-nm">'+e.name+'</span><button class="tr-alt-add" onclick="ExLog.addExternal(\''+e.name.replace(/'/g,"\\'")+'\');this.textContent=\'✓ 추가됨\';this.disabled=true">＋추가</button></div>';}).join('');}
    panel.classList.add('open');
  },
  _weekKeys(offset){
    const now=new Date();const dow=now.getDay();
    const ws=new Date(now);ws.setDate(now.getDate()-(dow===0?6:dow-1)+offset*7);ws.setHours(0,0,0,0);
    const keys=[];for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);keys.push(_localKey(d));}
    return keys;
  },
  _sessionSets(data,dk){let n=0;(data[dk]&&data[dk].exercises||[]).forEach(e=>{n+=(e.sets||[]).filter(_isWorkSet).length;});return n;},
  _weekVolume(data,keys){let v=0;keys.forEach(dk=>{(data[dk]&&data[dk].exercises||[]).forEach(e=>{(e.sets||[]).forEach(s=>{if(_isWorkSet(s))v+=(s.weight||0)*s.reps;});});});return v;},
  async renderPRBoard(){
    const box=document.getElementById('pr-board');if(!box)return;
    const data=await this._logData();
    const best={}; // canon명 → {e1,w,r,date}
    for(const dk in data){
      (data[dk].exercises||[]).forEach(ex=>{
        const cn=(typeof ExLog!=='undefined')?ExLog.canon(ex.name):ex.name;
        (ex.sets||[]).forEach(st=>{
          if(!(_isWorkSet(st)&&st.weight>0))return;
          const e1=_e1Of(_ldW(st),st.reps);
          if(!best[cn]||e1>best[cn].e1)best[cn]={e1,w:st.weight,r:st.reps,date:dk};
        });
      });
    }
    const names=Object.keys(best);
    if(!names.length){box.innerHTML='<div class="pr-empty">아직 기록이 없습니다.</div>';return;}
    // 복합(앵커) 우선, 그 안에서 e1RM 내림차순 — 상위 12개
    const isC=n=>(typeof ExLog!=='undefined'&&ExLog.isCompound)?ExLog.isCompound(n):false;
    names.sort((a,b)=>(isC(b)-isC(a))||(best[b].e1-best[a].e1));
    box.innerHTML=names.slice(0,12).map((n,i)=>{
      const b=best[n];
      const d=new Date(b.date+'T12:00:00').toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
      return'<div class="pr-row'+(isC(n)?' anchor':'')+'"><span class="pr-rank">'+(i+1)+'</span><span class="pr-nm">'+n+'</span><span class="pr-e1">'+b.e1.toFixed(1)+'kg</span><span class="pr-meta">'+b.w+'×'+b.r+' · '+d+'</span></div>';
    }).join('');
  },
  async renderWeekSummary(){
    const box=document.getElementById('week-summary');if(!box)return;
    const data=await this._logData();
    const off=this._wkOff||0;
    const thisWk=this._weekKeys(off),lastWk=this._weekKeys(off-1); // 보는 주 기준 — 전주 대비도 그 주의 '전주'로
    const days=thisWk.filter(dk=>this._sessionSets(data,dk)>0).length;
    const volT=this._weekVolume(data,thisWk),volL=this._weekVolume(data,lastWk);
    const volPct=volL?Math.round((volT-volL)/volL*100):0;
    // PR 수 (이번 주) — 날짜 오름차순 1패스. 종목별 '직전 날짜까지 최고값'을 누적하며 비교(기존 O(날짜²) 재스캔 제거).
    let prCount=0;const seen={};const thisSet=new Set(thisWk);
    const best={};                                   // name → 그 날짜 '이전'까지의 최고 (e1RM 또는 맨몸 reps)
    const allDates=Object.keys(data).sort();
    allDates.forEach(dk=>{
      const inWeek=thisSet.has(dk);
      (data[dk]&&data[dk].exercises||[]).forEach(e=>{
        const sets=(e.sets||[]).filter(_isWorkSet);if(!sets.length)return;
        let dayMax=-1;                               // 이 날짜의 최고값 (best 갱신용 — 같은 날 세트끼리는 PR로 안 침)
        const cn=(typeof ExLog!=='undefined')?ExLog.canon(e.name):e.name; // 별칭 기준 PR 연속성
        sets.forEach(s=>{
          const cur=_ldW(s)>0?_e1Of(_ldW(s),s.reps):s.reps;
          if(inWeek){const b=best[cn]; if(b!==undefined&&cur>b+0.05&&!seen[cn]){prCount++;seen[cn]=1;}}
          if(cur>dayMax)dayMax=cur;
        });
        if(dayMax>(best[cn]??-Infinity))best[cn]=dayMax;
      });
    });
    // D-day (12월 31일)
    const goal=new Date(TRAINING_PLAN.end+'T23:59:59');const dday=Math.max(0,Math.ceil((goal-new Date())/864e5));
    // 체성분 추세
    let bfTrend='';try{const r=await window.storage.get('inbody_log');const log=r?JSON.parse(r.value):[];if(log.length>=2){const d=log[log.length-1].bf-log[log.length-2].bf;bfTrend=d<0?'↓':(d>0?'↑':'—');}}catch(_){}
    const volStr=volL?((volPct>=0?'+':'')+volPct+'%'):'기준 주';
    box.innerHTML=
      '<div class="ws-grid">'
      +'<div class="ws-cell"><div class="ws-v">'+days+'<span class="ws-u">/6일</span></div><div class="ws-l">'+(off===0?'이번 주':'해당 주')+' 운동</div></div>'
      +'<div class="ws-cell"><div class="ws-v '+(volPct>0?'up':(volPct<0?'dn':''))+'">'+volStr+'</div><div class="ws-l">볼륨 vs 전주</div></div>'
      +'<div class="ws-cell"><div class="ws-v '+(prCount>0?'pr':'')+'">'+(prCount>0?'🎉 '+prCount:'0')+'</div><div class="ws-l">'+(off===0?'이번 주':'해당 주')+' 신기록</div></div>'
      +'<div class="ws-cell"><div class="ws-v">D-'+dday+'</div><div class="ws-l">목표(12월)까지</div></div>'
      +'</div>'
      +(bfTrend?'<div class="ws-note">체지방률 추세 '+bfTrend+' · 골격근·체지방은 체성분 현황에서 확인</div>':'');
  },
  // ── 캘린더 셀 → 해당 날짜의 운동 기록으로 점프 ──
  gotoDate(dk){
    if(typeof ExLog==='undefined'||!dk)return;
    if(new Date(dk+'T12:00:00')>new Date())return;           // 미래 셀 무시
    ExLog.date=dk;
    const tw=document.getElementById('tw');if(tw)tw.checked=true; // 운동 탭으로 전환 (라디오 → CSS 표시 전환)
    ExLog.updateBar();ExLog.injectTargets();ExLog.refresh();
    if(ExLog.injectRecos)setTimeout(()=>ExLog.injectRecos(),20);  // 탭 라벨 클릭과 동일한 후처리
    window.scrollTo({top:0,behavior:'smooth'});
  },
  // ── Claude 보고용 요약: 최근 인바디 + 이번 주 세션·컨디션을 마크다운으로 복사 (일요일 보고 워크플로우) ──
  _fmtSets(sets){
    // 같은 무게 연속 세트 압축: 52.5×8, 52.5×8, 52.5×7 → 52.5×8·8·7
    const parts=[];let curW=null,reps=[];
    const flush=()=>{if(curW!=null)parts.push((curW>0?curW+'×':'맨몸 ')+reps.join('·'));};
    sets.forEach(s=>{
      if(s.weight!==curW){flush();curW=s.weight;reps=[];}
      reps.push(s.reps+(s.rpe?'@'+s.rpe:'')+(s.pain?'⚠️':''));
    });
    flush();return parts.join(', ');
  },
  async copyReport(btn){
    const data=await this._logData();
    const wkKeys=this._weekKeys(this._wkOff||0); // 과거 주를 보는 중이면 그 주를 보고로 복사
    const L=[];
    const fd=d=>new Date(d+'T12:00:00').toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',weekday:'short'});
    L.push('## 주간 보고 ('+fd(wkKeys[0])+' ~ '+fd(wkKeys[6])+')');
    // 체성분 — 최근 2회 + 변화량
    try{
      if(typeof InBody!=='undefined'&&!InBody._log)await InBody.load();
      const log=(typeof InBody!=='undefined'&&InBody._log)||[];
      if(log.length){
        L.push('','### 체성분');
        log.slice(-2).forEach(e=>{
          let s='- '+e.date+': 체중 '+e.wt+' · 골격근 '+e.sm+' · 체지방률 '+e.bf+'% · 복부 '+e.ab;
          if(e.waist)s+=' · 허리 '+e.waist;if(e.vf)s+=' · 내장지방 '+e.vf;if(e.pa)s+=' · 위상각 '+e.pa;if(e.bmr)s+=' · BMR '+e.bmr;
          L.push(s);
        });
        if(log.length>=2){
          const a=log[log.length-2],b=log[log.length-1];
          const dv=(x,y)=>{const d=+(y-x).toFixed(2);return(d>0?'+':'')+d;};
          L.push('- Δ: 체중 '+dv(a.wt,b.wt)+' · 골격근 '+dv(a.sm,b.sm)+' · 체지방률 '+dv(a.bf,b.bf)+'%p · 복부 '+dv(a.ab,b.ab));
        }
      }
    }catch(_){}
    // 세션별 상세
    L.push('','### 세션');
    let any=false,condS=0,condN=0,slpS=0,slpN=0,cardioMin=0;
    wkKeys.forEach(dk=>{
      const d=data[dk];if(!d)return;
      const exLines=(d.exercises||[]).filter(e=>(e.sets||[]).some(_isWorkSet))
        .map(e=>{
          const sets=e.sets.filter(_isWorkSet);
          const top=sets.reduce((a,s)=>{return _e1Of(_ldW(s),s.reps)>_e1Of(_ldW(a),a.reps)?s:a;},sets[0]);
          const e1=top.weight>0?' (e1RM '+_e1Of(_ldW(top),top.reps).toFixed(1)+')':'';
          return '  - '+e.name+': '+this._fmtSets(sets)+e1;
        });
      const cd=(d.cardio||[]).map(c=>c.type+' '+c.min+'분');
      (d.cardio||[]).forEach(c=>cardioMin+=(+c.min||0));
      if(d.cond){if(d.cond.rate){condS+=d.cond.rate;condN++;}if(d.cond.sleep){slpS+=d.cond.sleep;slpN++;}}
      if(!exLines.length&&!cd.length&&!d.note)return;
      any=true;
      let hd='- **'+fd(dk)+' ('+(d.day||'')+')**';
      if(d.cond&&(d.cond.rate||d.cond.sleep))hd+=' — 컨디션 '+(d.cond.rate||'-')+'/5'+(d.cond.sleep?' · 수면 '+d.cond.sleep+'h':'');
      L.push(hd);
      if(d.note)L.push('  - 메모: '+d.note);
      exLines.forEach(x=>L.push(x));
      if(cd.length)L.push('  - 유산소: '+cd.join(', '));
    });
    if(!any)L.push('- 이번 주 기록 없음');
    // 주간 합계
    const volT=this._weekVolume(data,wkKeys),volL=this._weekVolume(data,this._weekKeys(-1));
    let setsT=0;wkKeys.forEach(dk=>setsT+=this._sessionSets(data,dk));
    const days=wkKeys.filter(dk=>this._sessionSets(data,dk)>0).length;
    L.push('','### 주간 합계');
    L.push('- 운동 '+days+'일 · '+setsT+'세트 · 볼륨 '+Math.round(volT).toLocaleString()+'kg'+(volL?' (지난주 대비 '+(volT>=volL?'+':'')+Math.round((volT-volL)/volL*100)+'%)':''));
    if(cardioMin)L.push('- 유산소 누적 '+cardioMin+'분');
    if(condN||slpN)L.push('- 컨디션 평균 '+(condN?(condS/condN).toFixed(1):'-')+'/5 · 수면 평균 '+(slpN?(slpS/slpN).toFixed(1)+'h':'-'));
    const md=L.join('\n');
    // 복사 (clipboard 실패 시 execCommand 폴백)
    let ok=false;
    try{await navigator.clipboard.writeText(md);ok=true;}
    catch(_){try{const ta=document.createElement('textarea');ta.value=md;document.body.appendChild(ta);ta.select();ok=document.execCommand('copy');ta.remove();}catch(__){}}
    if(btn){
      const orig='📋 Claude 보고용 요약 복사';
      btn.textContent=ok?'✓ 복사됨 — Claude에 붙여넣어 분석 요청하세요':'❌ 복사 실패 — 다시 시도';
      btn.classList.toggle('ok',ok);
      setTimeout(()=>{btn.textContent=orig;btn.classList.remove('ok');},3000);
    }
    return md;
  },
  async renderCalendar(){
    const box=document.getElementById('plan-calendar');if(!box)return;
    const data=await this._logData();
    const WEEKS=12;
    // 연속 주(주 4회 이상) 계산
    let streak=0;for(let off=0;off>-53;off--){const ks=this._weekKeys(off);const cnt=ks.filter(dk=>this._sessionSets(data,dk)>0).length;if(off===0){if(cnt>=4)streak++;continue;}if(cnt>=4)streak++;else break;}
    const monthDays=(()=>{let n=0;const today=new Date();for(let i=0;i<28;i++){const d=new Date(today);d.setDate(today.getDate()-i);if(this._sessionSets(data,_localKey(d))>0)n++;}return n;})();
    // 12주 그리드 (열=주, 행=월~일)
    let cols='';
    for(let w=WEEKS-1;w>=0;w--){
      const ks=this._weekKeys(-w);
      let cells='';
      ks.forEach(dk=>{
        const sets=this._sessionSets(data,dk);
        const fut=new Date(dk+'T12:00:00')>new Date(); // 로컬 정오 파싱 — UTC 자정 파싱 시 UTC− 시간대에서 내일 셀이 과거로 오판되던 것 통일
        let lv=0;if(sets>=12)lv=4;else if(sets>=8)lv=3;else if(sets>=4)lv=2;else if(sets>=1)lv=1;
        cells+='<div class="cal-cell l'+lv+(fut?' fut':'')+'" title="'+dk+' · '+sets+'세트"'+(fut?'':' style="cursor:pointer" onclick="PlanApp.gotoDate(\''+dk+'\')"')+'></div>';
      });
      cols+='<div class="cal-col">'+cells+'</div>';
    }
    box.innerHTML=
      '<div class="cal-top"><div class="cal-streak">🔥 <b>'+streak+'</b>주 연속<span class="cal-sub">(주 4회+)</span></div><div class="cal-month">최근 28일 <b>'+monthDays+'</b>일 훈련</div></div>'
      +'<div class="cal-grid-wrap"><div class="cal-rowlabels"><span>월</span><span>수</span><span>금</span><span>일</span></div><div class="cal-grid">'+cols+'</div></div>'
      +'<div class="cal-legend">적음 <span class="cal-cell l1"></span><span class="cal-cell l2"></span><span class="cal-cell l3"></span><span class="cal-cell l4"></span> 많음</div>';
  }
};
const MUSCLE_INFO={
 '가슴':{c:'#D85A30',loc:'가슴 앞면 · 대흉근(Pectoralis major)',anat:'쇄골부(상부)·흉골부(중부)·복부(하부) 세 갈래. 각도로 동원 부위가 달라진다.',fn:'팔을 몸 앞·안쪽으로 모으는 수평 내전과 미는 동작의 주동근. 어깨 굴곡에도 관여.',stretch:'바·덤벨을 내릴 때 가슴이 양옆으로 활짝 열리며 길게 늘어나야 한다. 견갑은 모아 고정해 어깨가 말리지 않게.',contract:'밀어 올려 양손을 모을 때 가슴 중앙을 짜내듯 조이고 정점 1초. 손이 아닌 가슴이 모이는 힘.',cue:'인클라인=상부, 플랫=중부, 디클라인=하부. 팔꿈치 45~75도로 어깨 보호.',mistake:'팔꿈치를 90도로 완전히 벌려 어깨에 부담을 주거나, 가슴이 아닌 삼두·어깨로 미는 것.'},
 '등':{c:'#185FA5',loc:'등 전체 · 광배근·능형근·승모 중하부',anat:'광배근(너비)·능형근/중하 승모(두께)·대원근. 수직 당김은 너비, 수평 당김은 두께.',fn:'팔을 아래·뒤로 당기는 모든 동작의 주동근. 견갑 후인·하강으로 자세를 잡아준다.',stretch:'당기기 전 팔을 끝까지 뻗어 광배가 위로 길게 늘어나고 견갑이 따라 올라가야 한다.',contract:'팔꿈치를 갈비뼈·엉덩이 방향으로 당겨 견갑을 모으고 1초 짜기.',cue:'손이 아니라 팔꿈치를 뒷주머니에 넣는 느낌. 랫풀다운 하강 시 검지·중지에, 릴리즈 시 약지·소지에 힘을 실으면 팔 개입이 줄고 광배 자극이 산다.',mistake:'팔(이두)로 당기거나 상체를 크게 흔들어 반동을 쓰는 것. 견갑을 모으지 않으면 등이 일하지 않는다.'},
 '측면삼각':{c:'#BA7517',loc:'어깨 바깥 · 중간 삼각근(Lateral deltoid)',anat:'삼각근 세 갈래 중 가운데. 어깨너비와 V-테이퍼를 좌우로 넓혀주는 부위.',fn:'팔을 옆으로 들어올리는 외전의 주동근.',stretch:'내릴 때 팔이 몸 옆을 지나며 어깨 바깥이 길어진다. 2~3초로 천천히 내려 장력 유지.',contract:'새끼손가락 쪽을 살짝 위로, 팔꿈치로 옆을 민다는 느낌으로 어깨 높이까지. 정점에서 멈춤.',cue:'케이블/머신은 전 구간 장력이 걸려 덤벨보다 자극이 균일하다. 가벼운 무게 고반복이 유리.',mistake:'승모근이 으쓱 올라가 어깨 대신 목이 일하는 것. 반동으로 들어올리면 자극이 사라진다.'},
 '전면삼각':{c:'#E0922F',loc:'어깨 앞 · 전면 삼각근(Anterior deltoid)',anat:'삼각근 앞 갈래. 오버헤드·벤치 프레스에서 크게 동원되어 이미 자극이 많은 편.',fn:'팔을 앞·위로 드는 어깨 굴곡의 주동근. 모든 프레스의 핵심.',stretch:'프레스를 내릴 때 앞어깨가 늘어난다(귀 높이까지).',contract:'머리 위로 밀어 정점에서 어깨를 귀 옆까지 올려 잠근다.',cue:'프레스로 충분히 자극되므로 별도 고립은 최소화. 허리를 젖히지 말고 복압으로 상체 고정.',mistake:'허리를 과신전해 척추로 미는 것. 어깨가 아닌 허리로 무게를 받치면 부상 위험.'},
 '이두':{c:'#3B6D11',loc:'위팔 앞 · 상완이두근(Biceps brachii)',anat:'장두(바깥)·단두(안쪽) 두 갈래. 인클라인 컬은 장두 신장, 컨센트레이션은 단두 피크.',fn:'팔꿈치를 굽히고 손바닥을 바깥으로 돌리는 회외를 담당.',stretch:'내릴 때 팔을 완전히 펴 이두가 길게 늘어나야 한다. 끝까지 신전이 성장의 핵심.',contract:'올릴 때 새끼손가락을 바깥으로 살짝 돌리며(회외) 정점에서 짜기.',cue:'팔꿈치를 옆구리에 고정. 신장 위치를 강조하는 인클라인 컬과 피크를 강조하는 컨센트레이션을 병행하면 좋다.',mistake:'반동·어깨로 들어올리거나, 끝까지 펴지 않아 가동범위를 줄이는 것.'},
 '삼두':{c:'#0C447C',loc:'위팔 뒤 · 상완삼두근(Triceps brachii)',anat:'장두·외측두·내측두 세 갈래. 위팔 두께의 약 2/3. 장두는 어깨 신전도 담당해 오버헤드 동작에서 가장 늘어난다.',fn:'팔꿈치를 펴는 신전의 주동근.',stretch:'팔을 머리 위·뒤로 내려 장두가 최대로 늘어난다(오버헤드 익스텐션).',contract:'팔꿈치를 고정하고 전완만 펴 정점에서 1초 조이기.',cue:'오버헤드(장두 강조)와 푸시다운(외측두 강조)을 섞으면 균형 있게 발달한다.',mistake:'팔꿈치가 옆으로 벌어지거나 앞뒤로 움직이는 것 — 고정이 깨지면 효과 급감.'},
 '대퇴사두':{c:'#27500A',loc:'허벅지 앞 · 대퇴사두근(Quadriceps)',anat:'외측광근·내측광근·중간광근·대퇴직근 네 갈래. 스쿼트·레그프레스의 주동근.',fn:'무릎을 펴는 신전의 주동근. 대퇴직근은 고관절 굴곡도 보조.',stretch:'앉아 내려갈 때 깊게 내려 허벅지 앞이 늘어난다(가동범위 확보).',contract:'일어설 때 무릎을 펴며 허벅지 앞을 조임. 레그익스텐션 정점 1초.',cue:'발 위치가 낮은 레그프레스/좁은 스탠스는 사두 강조. 발 전체로 바닥을 민다.',mistake:'무릎이 안으로 모이는 니인(knee-in), 또는 발 앞쪽만 써서 무릎에 전단력이 걸리는 것.'},
 '후면사슬':{c:'#6B4FA0',loc:'엉덩이·허벅지 뒤 · 둔근·햄스트링',anat:'대둔근(고관절 신전)·햄스트링 3갈래(고관절 신전+무릎 굽힘). 힘과 자세의 원천.',fn:'고관절을 펴고(둔근) 무릎을 굽히는(햄스트링) 동작. 점프·데드리프트의 동력.',stretch:'RDL·힌지에서 엉덩이를 뒤로 빼며 햄스트링이 길게 늘어나야 한다.',contract:'엉덩이를 앞으로 밀어 잠그며(힙쓰러스트 정점) 둔근을 강하게 조임.',cue:'허리가 아니라 엉덩이로 민다. 레그컬은 발끝을 정강이로 당겨(배측굴곡) 종아리 개입을 줄인다.',mistake:'허리(기립근)로 들어 햄·둔근 자극이 빠지는 것. 골반 중립이 무너지면 즉시 중단.'},
 '코어':{c:'#888',loc:'배 앞·옆 · 복직근·복사근·복횡근',anat:'복직근(전면 식스팩)·내외복사근(측면·회전)·복횡근(심부 복압). 모든 리프트의 토대.',fn:'척추를 굽히고 비틀며, 무엇보다 모든 동작에서 몸통을 안정화한다.',stretch:'크런치 상단에서 복부가 늘어난다(과신전 아님).',contract:'갈비뼈를 골반 쪽으로 말아 복부를 짧게. 숨을 내쉬며 조이기.',cue:'목·고관절 힘이 아니라 복부로 말아 올린다. 플랭크는 엉덩이·복부를 동시에 조여 일직선.',mistake:'목을 당겨 일으키거나 허리를 과신전하는 것. 복부 0.96 개선엔 회전·측면(복사근) 병행이 중요.'},
 '후면삼각':{c:'#C46A2A',loc:'어깨 뒤 · 후면 삼각근(Posterior deltoid)',anat:'삼각근 뒤 갈래. 프레스가 많을수록 상대적으로 약해져 자세 불균형의 원인이 된다.',fn:'팔을 뒤로 펴는 어깨 신전·수평 외전. 회전근개와 함께 어깨 뒤를 안정화.',stretch:'팔을 몸 앞으로 가져가 어깨 뒤가 늘어난 상태에서 시작.',contract:'팔꿈치를 뒤·옆으로 당겨 견갑을 모으며 후면삼각을 1초 조임.',cue:'페이스풀·리어델트 플라이로 보강. 라운드 숄더(굽은 어깨) 교정의 핵심 부위.',mistake:'무겁게 들어 광배·승모가 대신 일하는 것. 가볍게 고반복으로 후면삼각만 분리.'},
 '승모':{c:'#7A6F2E',loc:'목·등 위쪽 · 승모근(Trapezius)',anat:'상부(견갑 거상)·중부(후인)·하부(하강) 세 부분. 상부는 슈러그, 중하부는 로우에서 발달.',fn:'견갑골을 올리고·모으고·내리며 어깨를 안정화. 목·어깨 두께를 만든다.',stretch:'슈러그 하단에서 어깨를 충분히 내려 상부 승모가 늘어난다.',contract:'어깨를 귀 쪽으로 곧게 들어 정점 1초(슈러그). 돌리지 말 것.',cue:'데드리프트·로우에서 이미 많이 쓰이므로 별도 슈러그는 보조로 충분.',mistake:'어깨를 앞뒤로 돌리는(원형) 슈러그 — 직선 상하로만 움직여야 안전하다.'},
 '전완':{c:'#5B8A2A',loc:'아래팔 · 전완 굴근·신근',anat:'손목 굴근(안쪽)·신근(바깥)·완요골근. 악력과 팔뚝 두께를 담당.',fn:'손목을 굽히고 펴며, 무엇보다 모든 당기는 동작에서 바를 쥐는 악력을 낸다.',stretch:'리스트 컬 하단에서 손가락을 펴 전완이 늘어난다. 데드행도 강한 신장 자극.',contract:'손목을 말아 쥐며 정점에서 조이기. 데드행은 등척성으로 버티며 악력 유지.',cue:'데드리프트 악력이 한계면 오버언더 그립으로 보완. 데드행으로 악력·척추 감압을 함께.',mistake:'스트랩에만 의존해 전완을 전혀 쓰지 않는 것. 가끔은 맨손으로 악력을 길러야 한다.'},
 '종아리':{c:'#3E2E66',loc:'정강이 뒤 · 비복근·가자미근',anat:'비복근(무릎 펴고 서서)·가자미근(무릎 굽혀 앉아서). 둘 다 자극하려면 스탠딩+시티드 병행.',fn:'발목을 펴는 저측굴곡. 걷기·점프의 추진. 본인은 걷기로 이미 발달한 편.',stretch:'뒤꿈치를 발판 아래로 깊게 내려 종아리가 길게 늘어나야 한다.',contract:'까치발로 최대한 밀어 올려 정점 1~2초 강하게 조임.',cue:'이미 발달해 있어 볼륨보다 자극 분산이 우선. 레그컬에서 발끝을 정강이로 당겨 종아리 개입을 줄인다.',mistake:'반동으로 빠르게 튕기는 것 — 스트레칭과 정점 수축을 모두 천천히.'},
 '내전근':{c:'#8B5E3C',loc:'허벅지 안쪽 · 내전근군(장·단·대내전근)',anat:'허벅지 안쪽 라인을 만드는 근육군. 어브덕션(벌림)과 정반대로 다리를 몸 중심으로 모은다.',fn:'다리를 안쪽으로 모으는 내전 + 스쿼트 하단에서 골반 안정·신전 보조. 스쿼트 바닥 안정성의 숨은 기반.',stretch:'와이드·스모 스탠스 스쿼트 하단에서 허벅지 안쪽이 길게 늘어난다.',contract:'어덕션 머신에서 무릎으로 패드를 밀어 다리를 모으고 정점 1초.',cue:'발이 아니라 무릎 안쪽으로 패드를 미는 힘. 상체를 살짝 앞으로 숙이면 자극↑.',mistake:'발에 힘을 줘 다리를 모으는 것 — 자극이 정강이로 샌다.'}
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
      +'<div class="mm-sc">'
      +'<div class="mm-scr stretch"><span class="tg">신장 ↕</span><span class="tx">'+info.stretch+'</span></div>'
      +'<div class="mm-scr contract"><span class="tg">수축 ◉</span><span class="tx">'+info.contract+'</span></div>'
      +'<div class="mm-scr cue"><span class="tg">포인트</span><span class="tx">'+info.cue+'</span></div>'
      +'</div>'
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
      +(info.mistake?'<div class="mm-mistake"><span class="mm-mistake-t">⚠ 흔한 실수</span>'+info.mistake+'</div>':'')
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
  const m={};(window.EXERCISE_LIBRARY||[]).forEach(e=>{m[e.name]=e;(e.aka||[]).forEach(a=>{if(!m[a])m[a]=e;});});
  libLookup._m=m;return m;
}
function augmentCards(){
  const m=libLookup();
  document.querySelectorAll('details.ex-card').forEach(card=>{
    const nm=card.querySelector('.ex-nm');const det=card.querySelector('.ex-detail');
    if(!nm||!det)return;
    const e=m[nm.textContent.trim()];if(!e)return;
    if(det.querySelector('.ex-more'))return;
    // 자극점은 도감(target)을 단일 소스로 삼는다 — 카드마다 같은 내용을 짧게 재서술하던 중복을 없애고
    // 근섬유 주행 방향·보상작용 큐가 담긴 도감 본문을 그대로 보여준다(카드 대비 평균 2.4배 분량).
    if(e.target){const st=det.querySelector('.fb.stim .ft');if(st)st.innerHTML=e.target;}
    // 통일: 그립·힘/세팅/ROM/순서를 focus-grid(자극점·요령·주의)와 동일한 [라벨|내용] 행으로 이어붙여 한 흐름으로.
    let rows=(e.grip?'<div class="exx-row"><span class="exx-l lgrip">✊ 그립힘</span><span>'+e.grip+'</span></div>':'')
      +(e.setup?'<div class="exx-row"><span class="exx-l lset">🎚 세팅</span><span>'+e.setup+'</span></div>':'')
      +(e.rom?'<div class="exx-row"><span class="exx-l lrom">↔ ROM</span><span>'+e.rom+'</span></div>':'')
      +(e.breath?'<div class="exx-row"><span class="exx-l lbr">🫁 호흡·템포</span><span>'+e.breath+'</span></div>':'')
      +(e.common?'<div class="exx-row"><span class="exx-l lmiss">🚫 흔한 실수</span><span>'+e.common+'</span></div>':'')
      +((e.alt&&e.alt.length)?'<div class="exx-row"><span class="exx-l lalt">🔁 대체 종목</span><span class="exx-alts">'
          +e.alt.map(a=>'<span class="exx-altb">'+a+'</span>').join('')+'</span></div>':'');
    // 동작 순서(flow-d 접이식)를 같은 행 포맷으로 흡수 — 별도 탭 제거로 시각 언어 일원화
    const flow=det.querySelector('.flow-d');
    if(flow){
      const steps=[...flow.querySelectorAll('.stxt')].map(s=>s.innerHTML.trim()).filter(Boolean);
      if(steps.length){
        const seq=steps.map((t,i)=>'<b class="stp-n">'+(i+1)+'</b>'+t).join('<span class="stp-sep">›</span>');
        rows+='<div class="exx-row"><span class="exx-l lseq">📋 순서</span><span class="stp-seq">'+seq+'</span></div>';
      }
      flow.remove();
    }
    if(!rows)return;
    const box=document.createElement('div');box.className='ex-more';
    box.innerHTML=rows;
    // focus-grid 다음, 기록(ex-log) 앞에 배치
    const log=det.querySelector('.ex-log');
    if(log)det.insertBefore(box,log);else det.appendChild(box);
  });
}
const LibApp={
  cat:'all',q:'',
  render(){
    const box=document.getElementById('lib-list');if(!box)return;
    const lib=window.EXERCISE_LIBRARY||[];const cats=window.EXERCISE_CATS||{};
    const chipWrap=document.getElementById('lib-chips');
    if(chipWrap&&!chipWrap.dataset.done){
      let h='<button class="lib-chip on" data-c="all" onclick="LibApp.setCat(\'all\')">전체</button>';
      Object.keys(cats).forEach(c=>{h+='<button class="lib-chip" data-c="'+c+'" onclick="LibApp.setCat(\''+c+'\')">'+cats[c].split(' ')[0]+'</button>';});
      chipWrap.innerHTML=h;chipWrap.dataset.done='1';
    }
    const q=this.q.trim().toLowerCase();
    const COL={push:'#D85A30',pull:'#185FA5',legs:'#27500A',core:'#888',small:'#BA7517'};
    const items=lib.filter(e=>(this.cat==='all'||e.cat===this.cat)&&(!q||e.name.toLowerCase().indexOf(q)>=0||(e.mus||'').toLowerCase().indexOf(q)>=0||(e.aka||[]).some(a=>a.toLowerCase().indexOf(q)>=0)));
    if(!items.length){box.innerHTML='<div class="lib-empty">검색 결과가 없습니다.</div>';return;}
    // [지연 렌더 26.09-c] 목록은 요약줄만 그리고, 본문 10행은 카드를 처음 펼칠 때 만든다.
    //   도감 보강으로 카드당 텍스트가 350자 → 920자가 되면서 전개 상태로 다 그리면
    //   198장 × 46노드 ≈ 9,200노드가 시작하자마자 만들어졌다(전체 DOM의 64%, 전부 숨김 상태).
    //   요약만 그리면 카드당 6노드로 줄고, 실제로 펼친 카드만 비용을 낸다.
    this._items=items;
    box.innerHTML=items.map(function(e,i){
      return '<details class="lib-card" data-i="'+i+'"><summary><span class="lib-dot" style="background:'+(COL[e.cat]||'#888')+'"></span><span class="lib-nm">'+e.name+'</span><span class="lib-mus">'+(e.mus||'')+'</span><span class="chev">▾</span></summary>'
        +'<div class="lib-body"></div></details>';
    }).join('');
    // toggle 이벤트는 버블링하지 않으므로 캡처 단계로 위임한다(카드마다 리스너를 달지 않기 위해).
    if(!box.dataset.lazy){
      box.addEventListener('toggle',function(ev){
        const d=ev.target;
        if(d&&d.tagName==='DETAILS'&&d.open)LibApp._build(d);
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
    body.innerHTML=
       '<div class="lib-r"><span class="lib-l">타겟</span><span>'+(e.target||'')+'</span></div>'
      +(e.grip?'<div class="lib-r"><span class="lib-l">그립·힘</span><span>'+e.grip+'</span></div>':'')
      +(e.setup?'<div class="lib-r"><span class="lib-l">세팅</span><span>'+e.setup+'</span></div>':'')
      +(e.rom?'<div class="lib-r"><span class="lib-l">ROM</span><span>'+e.rom+'</span></div>':'')
      +(e.breath?'<div class="lib-r"><span class="lib-l">호흡</span><span>'+e.breath+'</span></div>':'')
      +(e.common?'<div class="lib-r"><span class="lib-l miss">실수</span><span>'+e.common+'</span></div>':'')
      +(e.tip?'<div class="lib-r"><span class="lib-l tip">요령</span><span>'+e.tip+'</span></div>':'')
      +(e.warn?'<div class="lib-r"><span class="lib-l warn">주의</span><span>'+e.warn+'</span></div>':'')
      +(e.sets?'<div class="lib-r"><span class="lib-l">권장</span><span>'+e.sets+'</span></div>':'')
      // 대체 종목: 기구가 찼을 때의 분기점. 눌러서 바로 그 종목 카드로 이동한다.
      +((e.alt&&e.alt.length)?'<div class="lib-r"><span class="lib-l alt">대체</span><span class="lib-alts">'
          +e.alt.map(a=>'<button class="lib-altb" onclick="LibApp.goto(\''+a.replace(/'/g,"\\'")+'\')">'+a+'</button>').join('')
        +'</span></div>':'')
      +'<button class="lib-add" onclick="LibApp.add(this,\''+e.name.replace(/'/g,"\\'")+'\')">＋ 운동에 추가</button>';
  },
  setCat(c){this.cat=c;document.querySelectorAll('.lib-chip').forEach(b=>b.classList.toggle('on',b.dataset.c===c));this.render();},
  search(v){this.q=v;clearTimeout(this._t);this._t=setTimeout(()=>this.render(),120);},
  // 대체 종목 칩 → 그 종목으로 검색을 좁히고 카드를 펼친다(전체 카테고리로 되돌려야 검색이 걸린다).
  goto(name){
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
      btn.textContent='✓ 운동 탭에 추가됨';btn.classList.add('added');btn.disabled=true;
      setTimeout(function(){btn.textContent='＋ 운동에 추가';btn.classList.remove('added');btn.disabled=false;},2500);
    }
  }
};
// 허리 88cm: 체지방 20%(지방 −9.5kg) 도달 시 추정치이자, 도중에 복부비만 컷오프(남성 90cm)를 지나는 값.
// 안드로이드 체형에서 어깨-허리 대비를 만드는 건 어깨(골격 고정)가 아니라 허리 쪽이라 프레임의 1순위 지표다.
const IB_GOALS={wt:(TRAINING_PLAN.config.weightMin+TRAINING_PLAN.config.weightMax)/2,wtMin:TRAINING_PLAN.config.weightMin,wtMax:TRAINING_PLAN.config.weightMax,sm:37,bf:24};
const GOAL_MODEL={
  fatOf:(wt,bf)=>wt*bf/100,lbmOf:(wt,bf)=>wt*(1-bf/100),
  weightState(wt){return wt<IB_GOALS.wtMin?'low':wt>IB_GOALS.wtMax?'high':'maintain';},
  judge(wt,bf,sm){const state=this.weightState(wt);return {cond:[
    {k:'체중 '+IB_GOALS.wtMin+'–'+IB_GOALS.wtMax+'kg',ok:state==='maintain',v:wt.toFixed(1)+'kg',m:state==='low'?'유지 범위 아래 · 추가 감량보다 회복 확인':state==='high'?'목표 범위까지 천천히 조절':'유지 범위 · 추가 감량 목표 없음'},
    {k:'체지방률 23–24%',ok:bf<=24,v:bf.toFixed(1)+'%',m:'기본 참고 목표 · 같은 조건에서 추세 확인'},
    {k:'골격근량 약 37kg',ok:sm!=null&&sm>=37,v:sm==null?'—':sm.toFixed(1)+'kg',m:'회복 참고 목표 · 수분 변동과 운동 수행 함께 확인'}]};}
};
const Backup={
  KEYS:['plan_v3','routine_profile','brand_coef','ex_load','deload_v1','inbody_dirty','sync_dirty','sync_del','sync_last_ok','plan_v2','inbody_log','plan_blood_v1','gs_script_url','ex_alias','block_v1','last_backup','ex_base','ex_memo','ex_rest','dl_grip_start'],
  PREFIXES:['wl_v2:'], // 운동 기록 월 키 (wl_v2:YYYY-MM) — 단일 키(wl_v2)는 내보내지 않음(이관 후 낡은 사본이라 백업 부풀림 방지)
  MERGE_KEYS:['ex_memo','ex_base','ex_rest','ex_alias','brand_coef','ex_load'], // 가져오기 시 덮어쓰기 대신 병합 — 로컬에서 저장한 세팅 메모·기본무게·휴식·별칭이 지워지지 않게
  async restoreSnapshot(){const r=await window.storage.get('restore_backup');if(!r){this._msg('복원 전 백업이 없습니다.');return;}document.getElementById('bk-ta').value=r.value;this._msg('복원 전 백업을 열었습니다. 파일 저장 또는 가져오기를 선택하세요.');},
  _allowed(k){return this.KEYS.includes(k)||k==='wl_v2'/*레거시 백업 파일 가져오기 호환*/||this.PREFIXES.some(p=>k.startsWith(p));},
  _msg(t,err){const el=document.getElementById('bk-msg');if(!el)return;el.textContent=t;el.classList.toggle('err',!!err);},
  // ── 데이터 점검: 별칭 순환·미연결 중복 표기·도감 미매칭·0kg 본세트·미래 날짜 등 이상치 나열 ──
  async runCheck(){
    const el=document.getElementById('bk-check');if(!el)return;
    const out=[];
    try{
      const data=(typeof ExLog!=='undefined'&&ExLog.data)||{};
      const today=_todayKey();
      const future=Object.keys(data).filter(k=>k>today&&(data[k].exercises||[]).some(e=>(e.sets||[]).length));
      if(future.length)out.push('📅 미래 날짜 기록: '+future.join(', '));
      for(const k in ExLog.alias){let n=k,hop=0;while(ExLog.alias[n]&&hop<10){n=ExLog.alias[n];hop++;}if(hop>=10)out.push('🔗 별칭 순환 의심: '+k);}
      const hist=ExLog._histNames();
      const seen={};
      hist.forEach(n=>{const nn=ExLog._normName(ExLog.canon(n));(seen[nn]=seen[nn]||new Set()).add(ExLog.canon(n));});
      for(const nn in seen){if(seen[nn].size>1)out.push('🔀 미연결 중복 의심: '+[...seen[nn]].join(' ↔ ')+' — 기록 옆 🔗로 연결하면 추세가 합쳐집니다');}
      const unm=hist.filter(n=>!ExLog.libByName(ExLog.canon(n)));
      if(unm.length)out.push('📚 도감 미매칭 종목 ('+unm.length+'): '+unm.slice(0,8).join(', ')+(unm.length>8?' …':''));
      const zero=new Set();
      Object.keys(data).forEach(k=>(data[k].exercises||[]).forEach(e=>(e.sets||[]).forEach(st=>{if(_isWorkSet(st)&&!(st.weight>0))zero.add(e.name);})));
      if(zero.size)out.push('⚖️ 0kg 본세트: '+[...zero].slice(0,8).join(', ')+' (체중·시간 종목이면 정상)');
      // ── 체중 중복 입력 검사 ─────────────────────────────────────────────
      // bw·time 종목의 '추가 중량' 칸은 벨트에 매단 무게를 받는 자리다. 여기에 자기 체중을 적으면
      // 실부하가 체중 + 체중 = 두 배로 잡힌다(데드행 91 입력 → 181로 집계). 볼륨 그래프가 통째로 부풀어서
      // 눈으로는 잘 안 보이므로 자동으로 잡아낸다.
      const dupBw=new Set();
      Object.keys(data).forEach(k=>(data[k].exercises||[]).forEach(e=>{
        const t=ExLog.loadTypeOf(e.name);
        if(t!=='bw'&&t!=='time')return;
        const bw=ExLog.bwOn(k);if(!(bw>0))return;
        (e.sets||[]).forEach(st=>{if(_isWorkSet(st)&&st.weight>0&&Math.abs(st.weight-bw)<=3)dupBw.add(e.name);});
      }));
      if(dupBw.size)out.push('🏋️ 체중 중복 입력 의심: '+[...dupBw].join(', ')
        +' — 추가 중량 칸에 체중을 넣으면 실부하가 두 배로 잡힙니다. 벨트에 매단 무게가 없으면 <b>0</b>을 넣으세요');
    }catch(e){out.push('점검 중 오류: '+e.message);}
    el.innerHTML=out.length?out.map(o=>'<div class="bk-check-row">'+o+'</div>').join(''):'<div class="bk-check-row ok">✓ 이상 없음 — 별칭·도감 연결·기록이 깨끗합니다</div>';
  },
  async _collect(){
    const out={};
    for(const k of this.KEYS){try{const r=await window.storage.get(k);if(r&&r.value!=null)out[k]=String(r.value);}catch(_){}}
    for(const p of this.PREFIXES){
      try{const r=await window.storage.list(p);
        for(const k of ((r&&r.keys)||[])){try{const v=await window.storage.get(k);if(v&&v.value!=null)out[k]=String(v.value);}catch(_){}}
      }catch(_){}
    }
    return out;
  },
  async exportData(){
    try{
      if(SafeStore.error){SafeStore.emergencyBackup();this._msg('미저장 입력을 포함한 긴급 백업 파일을 만들었습니다.');return;}
      await ExLog.save();const data=await this._collect();
      const json=JSON.stringify({app:'fit-tracker',version:2,exported:_todayKey(),data});
      const ta=document.getElementById('bk-ta');if(ta){ta.value=json;ta.select();}
      try{await window.storage.set('last_backup',_todayKey());if(typeof ExLog!=='undefined'){ExLog.lastBackup=_todayKey();ExLog.renderWeeklyReport&&ExLog.renderWeeklyReport();}}catch(_){}
      this._msg('✓ 내보내기 완료 — [복사] 또는 [파일 저장]으로 안전한 곳에 보관하세요. ('+Object.keys(data).length+'개 키, '+Math.round(json.length/1024)+'KB)');
    }catch(e){this._msg('내보내기 실패: '+e.message,true);}
  },
  async copy(){
    const ta=document.getElementById('bk-ta');if(!ta||!ta.value){this._msg('먼저 [내보내기]를 눌러주세요.',true);return;}
    try{await navigator.clipboard.writeText(ta.value);this._msg('✓ 클립보드에 복사됨');}
    catch(_){ta.select();try{document.execCommand('copy');this._msg('✓ 클립보드에 복사됨');}catch(e){this._msg('복사 실패 — 텍스트를 길게 눌러 직접 복사하세요.',true);}}
  },
  download(){
    const ta=document.getElementById('bk-ta');if(!ta||!ta.value){this._msg('먼저 [내보내기]를 눌러주세요.',true);return;}
    try{
      const blob=new Blob([ta.value],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fit-backup-'+_todayKey()+'.json';
      document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
      this._msg('✓ 파일 다운로드 시작 (환경에 따라 차단될 수 있음 — 실패 시 [복사] 사용)');
    }catch(e){this._msg('파일 저장 실패 — [복사]로 백업하세요.',true);}
  },
  async importData(){return SafeBackup.importData();}

};
const IB_SEED=[];
const InBody={
  _log:null,
  async load(){
    if(this._log)return;
    try{const r=await window.storage.get('inbody_log');this._log=r?JSON.parse(r.value):null;}catch(_){this._log=null;}
    if(!this._log){this._log=[...IB_SEED];await this._save();}
  },
  async _save(){await window.storage.set('inbody_log',JSON.stringify(this._log));},
  async render(){
    await this.load();
    const log=this._log;const last=log[log.length-1];
    const box=document.getElementById('inbody-cards');
    const note=document.getElementById('plan-inbody-note');
    if(!box)return;
    if(!last){box.innerHTML='<div class="ib-no-data">아직 측정 기록이 없습니다.<br>아래 버튼으로 첫 인바디 수치를 입력하세요.</div>';if(note)note.textContent='';return;}

    const FIELDS=[
      {key:'wt',lbl:'체중',unit:'kg',goal:IB_GOALS.wt,col:'#085041',dir:-1,wide:true,
       sub:v=>GOAL_MODEL.weightState(v)==='maintain'?'유지 범위 '+IB_GOALS.wtMin+'–'+IB_GOALS.wtMax+'kg':GOAL_MODEL.weightState(v)==='low'?'유지 범위 아래 · 추가 감량 보류':'유지 범위까지 '+(v-IB_GOALS.wtMax).toFixed(1)+'kg'},
      {key:'sm',lbl:'골격근량',unit:'kg',goal:IB_GOALS.sm,col:'#3B6D11',dir:1,
       sub:v=>{const s=log[0]?.sm??v;const d=(v-s).toFixed(1);const r=(IB_GOALS.sm-v).toFixed(1);return(d>=0?'+':'')+d+'kg 변화 · 잔여 +'+Math.max(0,r)+'kg';}},
      {key:'bf',lbl:'체지방률',unit:'%',goal:IB_GOALS.bf,col:'#185FA5',dir:-1,
       sub:v=>{const s=log[0]?.bf??v;const d=(v-s).toFixed(1);const r=(v-IB_GOALS.bf).toFixed(1);return(d<0?d:'+'+d)+'%p 변화 · 잔여 −'+Math.max(0,r)+'%p';}}
    ];

    const pct=(f,v)=>{
      if(f.key==='wt')return GOAL_MODEL.weightState(v)==='maintain'?100:Math.max(0,100-Math.abs(v-84)*10);
      const start=log[0]?.[f.key]??v,goal=f.goal;
      const total=Math.abs(goal-start);if(!total)return 0;
      const done=f.dir===1?(v-start):(start-v);
      return Math.min(100,Math.max(0,Math.round(done/total*100)));
    };

    const spark=(key,col)=>{
      if(log.length<2)return'';
      const vals=log.slice(-8).map(e=>e[key]);
      const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||.001;
      const W=200,H=28,pad=4;
      const step=(W-pad*2)/(vals.length-1);
      const pts=vals.map((v,i)=>(pad+i*step).toFixed(1)+','+(H-pad-(v-mn)/rng*(H-pad*2)).toFixed(1));
      const last=pts[pts.length-1].split(',');
      return'<div class="ib-spark-wrap"><div class="ib-spark-lbl">최근 '+vals.length+'회 추세</div>'
        +'<div class="ib-spark"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'
        +'<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="1.8" stroke-linejoin="round"/>'
        +'<circle cx="'+last[0]+'" cy="'+last[1]+'" r="2.5" fill="'+col+'"/>'
        +'</svg></div></div>';
    };

    let html='<div class="plan-stat-grid">';
    FIELDS.forEach(f=>{
      const v=last[f.key];
      // 복부지방률(ab)은 선택 입력이라 비어 있을 수 있다 — 그대로 toFixed를 부르면
      // forEach 전체가 죽어 체성분 카드가 한 장도 안 그려졌다. 값 없는 지표는 건너뛴다.
      if(v==null||v===''||(typeof v==='number'&&isNaN(v)))return;
      const p=pct(f,v);
      const vStr=f.key==='ab'?(+v).toFixed(2):v;
      html+='<div class="plan-stat-card"'+(f.wide?' style="grid-column:1/-1"':'')+'>'+
        '<div class="plan-stat-lbl">'+f.lbl+'</div>'+
        '<div class="plan-stat-vals"><span class="plan-stat-cur">'+vStr+'</span><span class="plan-stat-unit">'+f.unit+'</span><span class="plan-stat-sep">→</span><span class="plan-stat-tgt">'+(f.key==='wt'?IB_GOALS.wtMin+'–'+IB_GOALS.wtMax:f.goal)+(f.unit==='%'?'%':'')+(f.unit==='kg'?'kg':'')+'</span></div>'+
        '<div class="plan-stat-bar"><div class="plan-stat-fill" style="width:'+p+'%;background:'+f.col+'"></div></div>'+
        '<div class="plan-stat-sub">'+f.sub(v)+'</div>'+
        spark(f.key,f.col)+
        '</div>';
    });
    const J=GOAL_MODEL.judge(+last.wt,+last.bf,last.sm==null?null:+last.sm);
    html='<div class="goal-chk">'+J.cond.map(c=>'<div class="gchk '+(c.ok?'ok':'no')+'"><span class="gk">'+c.k+'</span><span class="gv">'+c.v+'</span><span class="gm">'+c.m+'</span></div>').join('')+'</div><div class="ib-signal">최근 인바디의 단일 측정값입니다. 체중 유지 여부는 아침 체중 7일 평균, 허리둘레, 운동 기록을 함께 확인하세요.</div>'+html;
    // 선택 지표(허리둘레·내장지방): 기록된 항목만 카드 표시. 스파크라인은 해당 값이 있는 측정만 사용
    const optSpark=(key,col)=>{
      const vals=this._log.filter(e=>e[key]!=null).slice(-8).map(e=>e[key]);
      if(vals.length<2)return'';
      const mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||.001;
      const W=200,H=28,pad=4,step=(W-pad*2)/(vals.length-1);
      const pts=vals.map((v,i)=>(pad+i*step).toFixed(1)+','+(H-pad-(v-mn)/rng*(H-pad*2)).toFixed(1));
      const lastPt=pts[pts.length-1].split(',');
      return'<div class="ib-spark-wrap"><div class="ib-spark-lbl">최근 '+vals.length+'회 추세</div><div class="ib-spark"><svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline points="'+pts.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="1.8" stroke-linejoin="round"/><circle cx="'+lastPt[0]+'" cy="'+lastPt[1]+'" r="2.5" fill="'+col+'"/></svg></div></div>';
    };
    const OPT_FIELDS=[
      {key:'waist',lbl:'허리둘레',unit:'cm',col:'#8B5E3C',sub:()=> '같은 위치·조건의 추세 참고'},
      {key:'ab',lbl:'복부지방률',unit:'',col:'#BA7517',sub:()=> '인바디 출력값 · 참고 지표'},
      {key:'vf',lbl:'내장지방레벨',unit:'',col:'#A03C3C',sub:()=> '같은 기기의 추세 참고'},
      {key:'pa',lbl:'위상각',unit:'°',col:'#6B4FA0',sub:()=> '측정 조건과 함께 기록'},
      {key:'bmr',lbl:'기초대사량',unit:'kcal',col:'#5B8A2A',sub:()=> '기기의 추정값 · 섭취 열량과 다름'}
    ];
    OPT_FIELDS.forEach(f=>{
      const withVal=this._log.filter(e=>e[f.key]!=null);
      if(!withVal.length)return;
      const v=withVal[withVal.length-1][f.key];
      html+='<div class="plan-stat-card">'
        +'<div class="plan-stat-lbl">'+f.lbl+'</div>'
        +'<div class="plan-stat-vals"><span class="plan-stat-cur">'+v+'</span><span class="plan-stat-unit">'+f.unit+'</span>'
        +(f.goal?'<span class="plan-stat-sep">→</span><span class="plan-stat-tgt">'+f.goal+f.unit+'</span>':'')
        +'</div>'
        +'<div class="plan-stat-sub">'+f.sub(v)+'</div>'
        +optSpark(f.key,f.col)
        +'</div>';
    });
    html+='</div>';
    box.innerHTML=html;
    if(note){const d=new Date(last.date+'T12:00:00');note.textContent='📅 최근 측정: '+d.toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'})+' · '+log.length+'회 누적';}
    this._renderAdvice(log);
    this.renderRecomp(log);
    this.renderProjection();
  },
  // ── 리컴프 누적 재해석 ────────────────────────────────────────────────────
  // 기존 trendAdvice는 '최근 2주' 한 줄뿐이라, 체중이 제자리면 전체가 정체처럼 읽힌다.
  // 첫 측정 대비 누적으로 근육/지방을 분리해 보여주면 '체중 변화 0'이 성과로 읽힌다.
  renderRecomp(log){
    const el=document.getElementById('inbody-recomp');if(!el)return;
    log=log||this._log||[];
    if(log.length<2){el.innerHTML='';return;}
    const a=log[0],b=log[log.length-1];
    const days=Math.round((new Date(b.date+'T12:00:00')-new Date(a.date+'T12:00:00'))/864e5);
    if(days<7){el.innerHTML='';return;}
    const fm=e=>(e.wt!=null&&e.bf!=null)?e.wt*e.bf/100:null;
    const dWt=b.wt-a.wt, dSm=(b.sm!=null&&a.sm!=null)?b.sm-a.sm:null;
    const fmA=fm(a),fmB=fm(b), dFm=(fmA!=null&&fmB!=null)?fmB-fmA:null;
    const dWaist=(b.waist!=null&&a.waist!=null)?b.waist-a.waist:null;
    const sg=(v,d)=>(v>0?'+':(v<0?'−':''))+Math.abs(v).toFixed(d);
    let chips='<span class="rc-chip">체중 <b>'+sg(dWt,1)+'kg</b></span>';
    if(dSm!=null)chips+='<span class="rc-chip'+(dSm>0.1?' good':'')+'">근육 <b>'+sg(dSm,1)+'kg</b></span>';
    if(dFm!=null)chips+='<span class="rc-chip'+(dFm<-0.1?' good':'')+'">지방 <b>'+sg(dFm,1)+'kg</b></span>';
    if(dWaist!=null)chips+='<span class="rc-chip'+(dWaist<-0.5?' good':'')+'">허리 <b>'+sg(dWaist,1)+'cm</b></span>';
    // 핵심 문구 — 체중계가 못 보여주는 변화량을 명시한다
    let verdict;
    if(dSm!=null&&dFm!=null&&dSm>0.2&&dFm<-0.3&&Math.abs(dWt)<0.8)
      verdict='체중은 <b>'+sg(dWt,1)+'kg</b>로 거의 정지지만, 근육 '+sg(dSm,1)+'kg · 지방 '+sg(dFm,1)+'kg — <b>체중계가 못 보여주는 변화</b>입니다. 리컴프가 정상 작동 중입니다.';
    else if(dSm!=null&&dFm!=null&&dSm>0.2&&dFm<-0.3)
      verdict='근육과 지방이 <b>동시에 반대 방향</b>으로 움직였습니다 — 리컴프 성공 구간입니다.';
    else if(dFm!=null&&dFm<-0.3&&(dSm==null||dSm<=0.2))
      verdict='지방은 줄고 있으나 근육이 함께 늘지 않았습니다 — 단백질·수면·볼륨 중 어디가 부족한지 점검하세요.';
    else if(dSm!=null&&dSm<-0.3)
      verdict='근육이 감소했습니다 — 적자폭이 과하거나 회복(수면)이 부족한 신호입니다.';
    else verdict='아직 방향을 판단할 만한 변화폭이 아닙니다.';
    el.innerHTML='<div class="ib-recomp"><div class="rc-hd">🔄 누적 '+days+'일 · '+log.length+'회 측정</div>'
      +'<div class="rc-chips">'+chips+'</div><div class="rc-verdict">'+verdict+'</div>'
      +(log.length<4?'<div class="rc-note">측정 '+log.length+'회 기준 — 4회 이상 누적되면 신뢰도가 올라갑니다.</div>':'')
      +'</div>';
  },
  trendAdvice(log){
    if(!log||log.length<2)return null;const b=log[log.length-1];
    const a=log.slice(0,-1).reverse().find(x=>(new Date(b.date+'T12:00:00')-new Date(x.date+'T12:00:00'))/864e5>=12);
    if(!a)return null;const dw=(b.wt-a.wt).toFixed(1),sm=b.sm!=null&&a.sm!=null?(b.sm-a.sm).toFixed(1):null;
    return {type:'recomp',msg:_esc(a.date)+' 대비 체중 '+dw+'kg'+(sm!==null?' · 골격근량 '+sm+'kg':'')+'. 수분·측정 조건의 영향이 있어 단독으로 근육 증감이나 정체를 확정하지 않습니다.'};
  },
  _renderAdvice(log){
    const el=document.getElementById('inbody-advice');if(!el)return;
    const a=this.trendAdvice(log||this._log||[]);
    el.innerHTML=a?'<div class="ib-advice '+a.type+'">'+a.msg+'</div>':'';
  },
  renderProjection(){
    const box=document.getElementById('inbody-projection');if(!box)return;
    box.innerHTML='<div class="prj-card"><div class="prj-hd">'+TRAINING_PLAN.end+' 참고 목표</div><div class="prj-row"><b>기본</b><span>'+IB_GOALS.wtMin+'–'+IB_GOALS.wtMax+'kg 유지 · 골격근량 약 37kg · 체지방률 23–24%</span></div><div class="prj-row"><b>도전</b><span>골격근량 약 37.5kg · 체지방률 22–23%</span></div><div class="prj-note">개인 회복 속도에 따라 달라지는 계획값입니다. 인바디 추세를 직선으로 연장한 도달일 예측은 사용하지 않습니다.</div></div>';
  },
  openModal(){
    const today=_todayKey();
    document.getElementById('ib-date').value=today;
    ['wt','sm','bf','ab','waist','vf','pa','bmr'].forEach(k=>document.getElementById('ib-'+k).value='');
    document.getElementById('inbody-modal').classList.add('open');
  },
  closeModal(){document.getElementById('inbody-modal').classList.remove('open');},
  async save(){
    const date=document.getElementById('ib-date').value;
    const wt=parseFloat(document.getElementById('ib-wt').value);
    const sm=parseFloat(document.getElementById('ib-sm').value);
    const bf=parseFloat(document.getElementById('ib-bf').value);
    const ab=parseFloat(document.getElementById('ib-ab').value);
    if(!date||!(wt>0)||!(sm>0)||!(bf>0&&bf<=100)){alert('측정일·체중·골격근량·체지방률을 확인해 주세요.');return;}
    const waist=parseFloat(document.getElementById('ib-waist').value);
    const vf=parseFloat(document.getElementById('ib-vf').value);
    await this.load();
    const entry={date,wt,sm,bf};if(!isNaN(ab))entry.ab=ab;
    if(!isNaN(waist))entry.waist=waist; // 선택: 줄자 허리둘레
    if(!isNaN(vf))entry.vf=vf;          // 선택: 내장지방레벨 (목표 ≤10)
    const pa=parseFloat(document.getElementById('ib-pa').value);
    const bmr=parseFloat(document.getElementById('ib-bmr').value);
    if(!isNaN(pa))entry.pa=pa;          // 선택: 위상각
    if(!isNaN(bmr))entry.bmr=bmr;       // 선택: 기초대사량
    const idx=this._log.findIndex(e=>e.date===date);
    if(idx>=0)this._log[idx]=entry;
    else{this._log.push(entry);this._log.sort((a,b)=>a.date.localeCompare(b.date));}
    const old=await window.storage.get('inbody_dirty');const queue=old?JSON.parse(old.value):{};
    queue[date]=entry;DataSync.noteLocal('inbody',date);
    SafeStore.transaction({inbody_log:JSON.stringify(this._log),inbody_dirty:JSON.stringify(queue)},[],true);
    this.closeModal();this.render();ExLog._syncSoon();ExLog.renderSyncStatus();


  }
};
document.addEventListener('DOMContentLoaded',async()=>{
  // [26.09-c] LibApp.render()를 시작 목록에서 뺐다 — 도감 탭 라벨(onclick)이 첫 진입 때 부른다.
  //   시작하자마자 198장을 만들 이유가 없다. 운동 탭 첫 화면이 그만큼 빨리 뜬다.
  await InBody.load();await ExLog.init();PlanApp.init();MuscleMap.init();InBody.render();
  // 홈화면 바로가기(manifest shortcuts) 진입 처리 — ?tab=p(분석) / ?action=inbody(인바디 입력)
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('tab')==='p'){const r=document.getElementById('tp');if(r)r.checked=true;}
    if(q.get('action')==='inbody'){const r=document.getElementById('tb');if(r)r.checked=true;setTimeout(()=>{try{InBody.openModal();}catch(_){}},400);}
  }catch(_){}
});
