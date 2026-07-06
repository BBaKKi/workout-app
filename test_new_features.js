// 신규 기능 테스트: 세팅 메모 · RPE · 통증 플래그 · Claude 보고 복사 · 휴식 타이머 캐시
// 실행: node test_new_features.js  (기존 test_suite.js와 병행 실행)
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

let pass=0,fail=0;
function t(name,fn){
  return Promise.resolve().then(fn).then(()=>{pass++;console.log('  ✓ '+name);})
    .catch(e=>{fail++;console.log('  ✗ '+name+' — '+e.message);});
}
function eq(a,b,msg){if(a!==b)throw new Error((msg||'')+' expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}
function ok(v,msg){if(!v)throw new Error(msg||'expected truthy');}

async function boot(){
  let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const lib=fs.readFileSync(path.join(__dirname,'exercise-library.js'),'utf8');
  // script src는 jsdom이 로드하지 않으므로 인라인으로 치환해 실행 순서 보장
  html=html.replace('<script src="exercise-library.js"></script>','<script>\n'+lib+'\n</script>');
  const dom=new JSDOM(html,{
    runScripts:'dangerously',
    url:'http://localhost/',
    pretendToBeVisual:true,
    beforeParse(window){
      window.fetch=()=>Promise.resolve({json:()=>Promise.resolve({ok:true,written:1})});
      window.navigator.vibrate=()=>true;
    }
  });
  await new Promise(res=>{
    if(dom.window.document.readyState==='complete')res();
    else dom.window.addEventListener('load',res);
  });
  await new Promise(r=>setTimeout(r,200)); // async init 안정화
  return dom;
}

(async()=>{
  const dom=await boot();
  const w=dom.window,d=w.document;
  // 최상위 const는 window 프로퍼티가 아니므로 같은 realm의 eval로 참조
  const ExLog=w.eval('ExLog'),PlanApp=w.eval('PlanApp'),InBody=w.eval('InBody'),Backup=w.eval('Backup');
  const _todayKey=w.eval('_todayKey');

  console.log('\n[세팅 메모]');
  await t('setMemo/memoOf 저장·조회',async()=>{
    ExLog.setMemo('시티드 레그프레스','시트 4번 · 발판 중앙 한 뼘 위');
    eq(ExLog.memoOf('시티드 레그프레스'),'시트 4번 · 발판 중앙 한 뼘 위');
  });
  await t('메모는 canon(별칭) 기준으로 승계',async()=>{
    ExLog.alias['옛레그프레스']='시티드 레그프레스';
    eq(ExLog.memoOf('옛레그프레스'),'시트 4번 · 발판 중앙 한 뼘 위');
    delete ExLog.alias['옛레그프레스'];
  });
  await t('빈 문자열 저장 시 메모 삭제',async()=>{
    ExLog.setMemo('시티드 레그프레스','');
    eq(ExLog.memoOf('시티드 레그프레스'),'');
  });
  await t('120자 초과 잘림',async()=>{
    ExLog.setMemo('레그컬','a'.repeat(200));
    eq(ExLog.memoOf('레그컬').length,120);
    ExLog.setMemo('레그컬','');
  });
  await t('storage에 ex_memo로 영속',async()=>{
    ExLog.setMemo('딥스머신','시트 3');
    const r=await w.storage.get('ex_memo');
    ok(r&&JSON.parse(r.value)[ExLog.canon('딥스머신')]==='시트 3');
    ExLog.setMemo('딥스머신','');
  });
  await t('injectTargets가 메모 칩을 주입하고 내용 반영',async()=>{
    ExLog.setMemo('시티드 레그프레스','시트 4번');
    ExLog.injectTargets();
    const btns=[...d.querySelectorAll('.ex-memo-btn')];
    ok(btns.length>0,'메모 칩 없음');
    const hit=btns.find(b=>b.textContent.includes('시트 4번'));
    ok(hit,'메모 내용이 칩에 반영 안 됨');
    ok(hit.classList.contains('has'));
    ExLog.setMemo('시티드 레그프레스','');
  });
  await t('Backup KEYS에 ex_memo 포함',async()=>{
    ok(Backup.KEYS.includes('ex_memo'));
  });

  console.log('\n[RPE]');
  // 헬퍼: 특정 종목 log에서 세트 입력 시뮬레이션
  function logOf(name){return [...d.querySelectorAll('.ex-log')].find(l=>l.dataset.exname===name);}
  function addSet(name,kg,reps,rpe){
    const log=logOf(name);ok(log,name+' 로그 없음');
    const btn=log.querySelector('.ex-log-add-btn');
    ExLog.startSet(btn);
    const inp=log.querySelector('.ex-log-input');
    inp.querySelector('.wl-kg-input').value=kg;
    inp.querySelector('.wl-rp-input').value=reps;
    const rs=inp.querySelector('.wl-rpe-sel');if(rs)rs.value=rpe!=null?String(rpe):'';
    ExLog.confirmSet(inp.querySelector('.wl-confirm-btn'));
  }
  await t('RPE 선택 시 세트에 저장, 미선택 시 필드 없음',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    addSet('레그컬 (머신)',32,10,9);
    addSet('레그컬 (머신)',32,10,null);
    const ex=ExLog.session().exercises.find(e=>e.name==='레그컬 (머신)');
    eq(ex.sets[0].rpe,9);
    eq('rpe' in ex.sets[1],false);
  });
  await t('칩에 @RPE 마커 표시',async()=>{
    const log=logOf('레그컬 (머신)');
    ok(log.querySelector('.ex-log-chips').innerHTML.includes('@9'));
  });
  await t('suggestTarget: 렙 상단 채움 + RPE 9.5+ → 굳히기 제안',async()=>{
    ExLog.data={'2026-07-01':{day:'Legs',exercises:[{name:'레그컬 (머신)',sets:[
      {weight:32,reps:12,rpe:9.5},{weight:32,reps:12,rpe:9.5}]}]}};
    ExLog.date=_todayKey();
    const s=ExLog.suggestTarget('레그컬 (머신)');
    ok(s&&!s.up,'up이면 안 됨');
    ok(s.html.includes('굳히기'),'굳히기 문구 없음: '+s.html);
  });
  await t('suggestTarget: 렙 상단 채움 + RPE ≤8 → 증량 제안(여유 표기)',async()=>{
    ExLog.data={'2026-07-01':{day:'Legs',exercises:[{name:'레그컬 (머신)',sets:[
      {weight:32,reps:12,rpe:8},{weight:32,reps:12,rpe:7.5}]}]}};
    const s=ExLog.suggestTarget('레그컬 (머신)');
    ok(s&&s.up,'증량 제안이어야 함');
    ok(s.html.includes('여유'),'여유 표기 없음');
  });
  await t('suggestTarget: RPE 미기록이면 기존 로직 그대로',async()=>{
    ExLog.data={'2026-07-01':{day:'Legs',exercises:[{name:'레그컬 (머신)',sets:[
      {weight:32,reps:12},{weight:32,reps:12}]}]}};
    const s=ExLog.suggestTarget('레그컬 (머신)');
    ok(s&&s.up);
    ok(!s.html.includes('여유')&&!s.html.includes('굳히기'));
  });

  console.log('\n[통증 플래그]');
  await t('편집 모드에서 togglePainSet으로 플래그 토글',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    addSet('바벨 데드리프트',75,8,null);
    const log=logOf('바벨 데드리프트');
    ExLog.refresh();
    const chip=log.querySelector('.wl-set-chip');
    ExLog.editSet(chip);
    const pb=log.querySelector('.wl-pain-btn');
    eq(pb.style.display,'','편집 모드에서 보여야 함');
    ExLog.togglePainSet(pb);
    const ex=ExLog.session().exercises.find(e=>e.name==='바벨 데드리프트');
    eq(ex.sets[0].pain,true);
    ok(pb.classList.contains('on'));
    ExLog.togglePainSet(pb);
    eq('pain' in ex.sets[0],false);
    ExLog.togglePainSet(pb); // 다시 켜서 다음 테스트에 사용
    ExLog.cancelSet(pb);
  });
  await t('편집 저장 시 pain 플래그 보존',async()=>{
    const log=logOf('바벨 데드리프트');
    const chip=log.querySelector('.wl-set-chip');
    ExLog.editSet(chip);
    const inp=log.querySelector('.ex-log-input');
    inp.querySelector('.wl-rp-input').value=9; // 렙만 수정
    ExLog.confirmSet(inp.querySelector('.wl-confirm-btn'));
    const ex=ExLog.session().exercises.find(e=>e.name==='바벨 데드리프트');
    eq(ex.sets[0].pain,true,'수정 후 pain 유실');
    eq(ex.sets[0].reps,9);
  });
  await t('칩에 ⚠️ 마커 표시',async()=>{
    ok(logOf('바벨 데드리프트').querySelector('.ex-log-chips').innerHTML.includes('⚠️'));
  });
  await t('_lastPain: 과거 날짜의 최근 통증 이력 반환 (오늘 제외·canon 기준)',async()=>{
    ExLog.data={
      '2026-06-20':{day:'Pull',exercises:[{name:'바벨 데드리프트',sets:[{weight:80,reps:5,pain:true}]}]},
      '2026-06-27':{day:'Pull',exercises:[{name:'바벨 데드리프트',sets:[{weight:75,reps:8}]}]}
    };
    const h=ExLog._lastPain('바벨 데드리프트');
    ok(h&&h.date==='2026-06-20'&&h.w===80);
  });
  await t('injectTargets가 통증 이력 경고를 주입',async()=>{
    ExLog.injectTargets();
    const warns=[...d.querySelectorAll('.ex-pain-warn')];
    ok(warns.some(x=>x.textContent.includes('80kg')),'80kg 경고 없음');
  });
  await t('통증 이력 없으면 경고 미표시·제거',async()=>{
    ExLog.data={};
    ExLog.injectTargets();
    eq(d.querySelectorAll('.ex-pain-warn').length,0);
  });

  console.log('\n[휴식 타이머]');
  await t('startRest가 활성 엘리먼트를 캐시',async()=>{
    ExLog.startRest('바벨 데드리프트');
    ok(ExLog.rest.el,'el 캐시 없음');
    ok(ExLog.rest.el.classList.contains('active'));
    ExLog.stopRest();
  });
  await t('tickRest는 캐시만 갱신 (다른 로그 무접촉)·종료 시 타이머 해제',async()=>{
    ExLog.startRest('바벨 데드리프트');
    ExLog.rest.endAt=Date.now()-1000; // 즉시 종료 상태
    ExLog.tickRest();
    eq(ExLog.rest.int,null,'종료 시 interval 해제돼야 함');
    ok(ExLog.rest.el.classList.contains('done'));
    ExLog.stopRest();
  });
  await t('Notification 미지원 환경에서도 예외 없음',async()=>{
    ExLog._notifAsked=false;
    ExLog._askNotify(); // window.Notification 없음 → 조용히 통과해야 함
    ok(true);
  });

  console.log('\n[Claude 보고 복사]');
  await t('copyReport가 체성분·세션·합계 섹션 포함 마크다운 생성',async()=>{
    // 이번 주 데이터 구성
    const wk=PlanApp._weekKeys(0);
    ExLog.data={};
    ExLog.data[wk[0]]={day:'Push',cond:{rate:4,sleep:7},exercises:[
      {name:'딥스머신',sets:[{weight:50,reps:10,rpe:8},{weight:50,reps:10},{weight:50,reps:9}]}],
      cardio:[{type:'걷기(LISS)',min:30}]};
    ExLog.data[wk[1]]={day:'Pull',exercises:[{name:'바벨 데드리프트',sets:[{weight:72.5,reps:8,pain:true}]}]};
    InBody._log=[
      {date:'2026-06-28',wt:89.0,sm:36.3,bf:28.1,ab:0.96,waist:100.5},
      {date:'2026-07-05',wt:88.6,sm:36.4,bf:27.7,ab:0.95}
    ];
    const md=await PlanApp.copyReport(null);
    ok(md.includes('## 주간 보고'),'헤더 없음');
    ok(md.includes('### 체성분')&&md.includes('허리 100.5'),'체성분 없음');
    ok(md.includes('Δ')&&md.includes('-0.4'),'변화량 없음: '+md);
    ok(md.includes('딥스머신: 50×10@8·10·9'),'세트 압축 포맷 오류: '+md);
    ok(md.includes('e1RM'),'e1RM 없음');
    ok(md.includes('⚠️'),'통증 마커 없음');
    ok(md.includes('유산소: 걷기(LISS) 30분'),'유산소 없음');
    ok(md.includes('### 주간 합계')&&md.includes('컨디션 평균 4.0/5'),'합계 없음');
  });
  await t('_fmtSets: 무게 변화 시 그룹 분리·맨몸 표기',async()=>{
    eq(PlanApp._fmtSets([{weight:100,reps:10},{weight:100,reps:10},{weight:105,reps:8}]),'100×10·10, 105×8');
    eq(PlanApp._fmtSets([{weight:0,reps:12},{weight:0,reps:11}]),'맨몸 12·11');
  });
  await t('빈 주간에도 예외 없이 생성',async()=>{
    ExLog.data={};
    await w.eval('window.storage').set('wl_v2','{}'); // _logData의 storage 폴백까지 비움
    const md=await PlanApp.copyReport(null);
    ok(md.includes('이번 주 기록 없음'));
  });

  console.log('\n[회귀 스모크]');
  await t('기존 기능: 기본무게·별칭·prevSession 정상',async()=>{
    ExLog.setBase('벤치프레스 (스미스)',20);
    eq(ExLog.baseOf('벤치프레스 (스미스)'),20);
    ExLog.setBase('벤치프레스 (스미스)',0);
    ExLog.data={'2026-07-01':{day:'Push',exercises:[{name:'딥스머신',sets:[{weight:50,reps:10}]}]}};
    const p=ExLog.prevSession('딥스머신');
    ok(p&&p.date==='2026-07-01');
  });
  await t('refresh·injectTargets 전체 실행 예외 없음',async()=>{
    ExLog.refresh();ExLog.injectTargets();ok(true);
  });

  console.log('\n결과: '+pass+' 통과, '+fail+' 실패');
  process.exit(fail?1:0);
})().catch(e=>{console.error('부트 실패:',e);process.exit(1);});
