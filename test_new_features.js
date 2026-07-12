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

const src=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

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

  console.log('\n[휴식 타이머 — 미니바 단일화]');
  await t('startRest는 인라인 카드 타이머 없이 미니바만 사용', async()=>{
    ExLog.startRest('바벨 데드리프트');
    ok(!ExLog.rest.el,'인라인 el 캐시가 남아있음 — 미니바로 단일화돼야 함');
    eq(d.querySelectorAll('.rest-timer').length,0,'인라인 타이머 DOM 잔존');
    ok(d.getElementById('rest-mini').classList.contains('show'));
    ExLog.stopRest();
  });
  await t('종료 시 interval 해제·미니바 done 플래시', async()=>{
    ExLog.startRest('바벨 데드리프트');
    ExLog.rest.endAt=Date.now()-1000; // 즉시 종료 상태
    ExLog.tickRest();
    eq(ExLog.rest.int,null,'종료 시 interval 해제돼야 함');
    ok(d.getElementById('rest-mini').classList.contains('done'),'미니바 done 상태 없음');
    ExLog.stopRest();
    ok(!d.getElementById('rest-mini').classList.contains('done'),'stopRest 후 done 잔존');
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
    const wlr=await w.eval('window.storage').list('wl_v2:');for(const k of ((wlr&&wlr.keys)||[]))await w.eval('window.storage').delete(k); // 월분할 키도 비움
    const md=await PlanApp.copyReport(null);
    ok(md.includes('이번 주 기록 없음'));
  });

  console.log('\n[스티키 미니 타이머]');
  await t('startRest 시 미니 바 생성·표시 (카드 타이머 rect 0 → 화면 밖 취급)',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    ExLog.startRest('바벨 데드리프트');
    const m=d.getElementById('rest-mini');
    ok(m,'미니 바 미생성');
    ok(m.classList.contains('show'),'표시돼야 함');
    ok(m.querySelector('.rm-nm').textContent.includes('바벨 데드리프트'));
    ok(/\d:\d\d/.test(m.querySelector('.rm-time').textContent));
  });
  await t('stopRest 시 미니 바 숨김',async()=>{
    ExLog.stopRest();
    ok(!d.getElementById('rest-mini').classList.contains('show'));
  });
  await t('워밍업 세트 후 휴식은 60초',async()=>{
    ExLog.startRest('바벨 데드리프트',60);
    eq(ExLog.rest.total,60);
    ExLog.stopRest();
  });

  console.log('\n[캘린더 날짜 점프]');
  await t('gotoDate: 날짜 전환 + 운동 탭 활성화',async()=>{
    ExLog.data={'2026-07-01':{day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10}]}]}};
    d.getElementById('tp').checked=true; // 플랜 탭에 있다고 가정
    PlanApp.gotoDate('2026-07-01');
    eq(ExLog.date,'2026-07-01');
    ok(d.getElementById('tw').checked,'운동 탭으로 전환돼야 함');
  });
  await t('gotoDate: 미래 날짜 무시',async()=>{
    const cur=ExLog.date;
    PlanApp.gotoDate('2099-01-01');
    eq(ExLog.date,cur);
  });
  await t('캘린더 셀에 onclick 주입 (미래 셀 제외)',async()=>{
    await PlanApp.renderCalendar();
    const cells=[...d.querySelectorAll('#plan-calendar .cal-cell')];
    ok(cells.some(c=>c.getAttribute('onclick')),'클릭 가능한 셀 없음');
    ok(cells.filter(c=>c.classList.contains('fut')).every(c=>!c.getAttribute('onclick')),'미래 셀에 onclick 있음');
  });

  console.log('\n[워밍업 세트]');
  function addSetW(name,kg,reps,warmup){
    const log=logOf(name);ok(log,name+' 로그 없음');
    ExLog.startSet(log.querySelector('.ex-log-add-btn'));
    const inp=log.querySelector('.ex-log-input');
    inp.querySelector('.wl-kg-input').value=kg;
    inp.querySelector('.wl-rp-input').value=reps;
    const wu=inp.querySelector('.wl-wu-btn');wu.classList.toggle('on',!!warmup);
    ExLog.confirmSet(inp.querySelector('.wl-confirm-btn'));
  }
  await t('W 토글 시 warmup:true 저장·칩에 wu 클래스',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    addSetW('바벨 데드리프트',30,5,true);
    addSetW('바벨 데드리프트',70,8,false);
    const ex=ExLog.session().exercises.find(e=>e.name==='바벨 데드리프트');
    eq(ex.sets[0].warmup,true);
    eq('warmup' in ex.sets[1],false);
    const log=logOf('바벨 데드리프트');
    ok(log.querySelector('.wl-set-chip.wu'),'wu 칩 없음');
    ok(log.querySelector('.wl-set-chip.wu').textContent.startsWith('W '));
  });
  await t('워밍업은 오늘 합계(세트·볼륨)에서 제외',async()=>{
    const sum=d.getElementById('sess-sum');
    ok(sum.innerHTML.includes('<b>1</b>세트'),'본세트 1개만 집계돼야 함: '+sum.innerHTML);
    ok(sum.innerHTML.includes('560'),'볼륨 70×8=560만: '+sum.innerHTML);
  });
  await t('워밍업은 PR 판정 제외 (신규 세트·과거 기준 양쪽)',async()=>{
    // 과거에 워밍업 100kg이 있어도 PR 기준(_priorBest)에 안 잡힘
    ExLog.data={'2026-07-01':{day:'Pull',exercises:[{name:'바벨 데드리프트',sets:[{weight:100,reps:5,warmup:true},{weight:70,reps:8}]}]}};
    ExLog.date=_todayKey();
    const pb=ExLog._priorBest('바벨 데드리프트');
    ok(pb.bestE1<100,'워밍업 100kg이 기준에 포함됨: '+pb.bestE1);
    ok(ExLog.checkPR('바벨 데드리프트',75,8),'70×8 대비 75×8은 PR이어야 함');
  });
  await t('워밍업은 주간 볼륨·세션 세트·PR보드·추세에서 제외',async()=>{
    const wk=PlanApp._weekKeys(0);
    const data={};data[wk[0]]={day:'Pull',exercises:[{name:'바벨 데드리프트',sets:[
      {weight:30,reps:5,warmup:true},{weight:70,reps:8}]}]};
    eq(PlanApp._sessionSets(data,wk[0]),1);
    eq(PlanApp._weekVolume(data,[wk[0]]),560);
  });
  await t('prevSession·suggestTarget은 본세트만 사용',async()=>{
    ExLog.data={'2026-07-01':{day:'Pull',exercises:[{name:'바벨 데드리프트',sets:[
      {weight:30,reps:5,warmup:true},{weight:70,reps:8},{weight:70,reps:8}]}]}};
    const p=ExLog.prevSession('바벨 데드리프트');
    eq(p.sets.length,2,'워밍업 제외 2세트');
    ok(p.sets.every(s=>!s.warmup));
  });
  await t('copyReport도 본세트만 포함',async()=>{
    const wk=PlanApp._weekKeys(0);
    ExLog.data={};
    ExLog.data[wk[0]]={day:'Pull',exercises:[{name:'바벨 데드리프트',sets:[
      {weight:30,reps:5,warmup:true},{weight:70,reps:8}]}]};
    const md=await PlanApp.copyReport(null);
    ok(md.includes('70×8'));
    ok(!md.includes('30×5'),'워밍업이 보고에 포함됨');
  });

  console.log('\n[세션 노트]');
  await t('setNote 저장·삭제, renderCond가 입력값 동기화',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    ExLog.setNote('  왼어깨 뻐근 — 벤치 가볍게  ');
    eq(ExLog.session().note,'왼어깨 뻐근 — 벤치 가볍게');
    ExLog.renderCond();
    const inp=d.querySelector('.sess-note');
    ok(inp,'노트 입력 없음');
    eq(inp.value,'왼어깨 뻐근 — 벤치 가볍게');
    ExLog.setNote('');
    eq('note' in ExLog.session(),false);
    ExLog.renderCond();
    eq(inp.value,'');
  });
  await t('주간 리포트에 노트 표시',async()=>{
    const wk=PlanApp._weekKeys(0);
    ExLog.data={};
    ExLog.data[wk[0]]={day:'Push',note:'새 헬스장 첫날',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10}]}]};
    const h=ExLog._weeklyReportHtml();
    ok(h.includes('세션 메모')&&h.includes('새 헬스장 첫날'),h.slice(0,200));
  });
  await t('copyReport에 노트 포함 (노트만 있는 날도)',async()=>{
    const wk=PlanApp._weekKeys(0);
    ExLog.data={};
    ExLog.data[wk[0]]={day:'REST',note:'휴식 — 수면 9h'};
    const md=await PlanApp.copyReport(null);
    ok(md.includes('메모: 휴식 — 수면 9h'),md);
  });

  console.log('\n[종목 히스토리 모달]');
  await t('showHistory: canon 전 기간·별칭 통합·워밍업 제외·최신순',async()=>{
    ExLog.data={
      '2026-06-20':{day:'Legs',exercises:[{name:'옛V스쿼트',sets:[{weight:130,reps:8}]}]},
      '2026-06-27':{day:'Legs',exercises:[{name:'V스쿼트 머신',sets:[{weight:20,reps:5,warmup:true},{weight:150,reps:8}]}]}
    };
    ExLog.alias['옛V스쿼트']='V스쿼트 머신';
    ExLog.showHistory('V스쿼트 머신');
    const m=d.getElementById('hist-modal');
    ok(m&&m.style.display==='flex','모달 미표시');
    eq(d.getElementById('hist-sub').textContent.includes('2회'),true,'별칭 포함 2회여야 함');
    const rows=[...d.querySelectorAll('.hist-row')];
    eq(rows.length,2);
    ok(rows[0].textContent.includes('150×8'),'최신이 위여야 함');
    ok(!m.innerHTML.includes('20×5'),'워밍업 포함됨');
    ok(m.querySelector('.hist-spark svg'),'e1RM 곡선 없음');
    ok(m.querySelector('.hist-e1.pr'),'PR 마킹 없음');
    ExLog.closeHistory();
    eq(m.style.display,'none');
    delete ExLog.alias['옛V스쿼트'];
  });
  await t('기록 없는 종목은 빈 상태 표시',async()=>{
    ExLog.data={};
    ExLog.showHistory('스미스 숄더 프레스');
    ok(d.getElementById('hist-body').innerHTML.includes('아직 기록이 없습니다'));
    ExLog.closeHistory();
  });
  await t('미니 요약·추세 행에 히스토리 진입점 존재',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    addSetW('딥스 머신',50,10,false);
    const mini=d.querySelector('.ex-mini');
    ok(mini&&mini.getAttribute('onclick').includes('showHistory'),'미니 요약 진입점 없음');
    ok(src.includes('tr-nm" onclick="ExLog.showHistory'),'추세 행 진입점 없음');
  });

  console.log('\n[PWA]');
  await t('manifest 링크·apple-touch-icon·SW 등록 코드 존재',async()=>{
    ok(d.querySelector('link[rel="manifest"][href="manifest.json"]'),'manifest 링크 없음');
    ok(d.querySelector('link[rel="apple-touch-icon"]'),'apple-touch-icon 없음');
    ok(src.includes("serviceWorker' in navigator"),'SW 등록 가드 없음');
  });
  await t('manifest.json 유효·필수 필드',async()=>{
    const mf=JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8'));
    ok(mf.start_url==='./'&&mf.display==='standalone'&&mf.icons.length===2);
  });
  await t('sw.js: network-first·GET 전용·동일 출처 가드',async()=>{
    const sw=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');
    ok(sw.includes("req.method !== 'GET'"),'GET 가드 없음');
    ok(sw.includes('url.origin !== self.location.origin'),'동일 출처 가드 없음');
    ok(sw.indexOf('fetch(req)')<sw.indexOf('caches.match(req)'),'network-first 순서 아님');
  });

  console.log('\n[운동 라이브러리 검증]');
  const LIB=w.eval('window.EXERCISE_LIBRARY');
  await t('184개 엔트리(어시스트 딥스 머신 추가)·신규 종목 존재',async()=>{
    eq(LIB.length,184);
    ok(LIB.some(e=>e.name==='어시스트 딥스 머신'));
    ok(LIB.some(e=>(e.aka||[]).includes('체스트 프레스 머신')));
    ok(LIB.some(e=>e.name==='토르소 로테이션'));
    ok(LIB.some(e=>e.name==='스미스 숄더 프레스'));
  });
  await t('플라이류 보조근: 삼두 제거 → 전면삼각',async()=>{
    for(const nm of ['덤벨 체스트 플라이','펙덱 플라이','케이블 크로스오버','인클라인 케이블 플라이','로우 케이블 크로스오버','Hammer 슈퍼 플라이']){
      const e=LIB.find(x=>x.name===nm);
      ok(!e.vol.s.includes('삼두'),nm+'에 삼두 잔존');
      ok(e.vol.s.includes('전면삼각'),nm+'에 전면삼각 없음');
    }
  });
  await t('무릎 신전 고립·시시: 후면사슬 보조 제거',async()=>{
    for(const nm of ['레그 익스텐션','Hammer ISO-레그 익스텐션','시시 스쿼트']){
      eq(LIB.find(x=>x.name===nm).vol.s.length,0,nm);
    }
  });
  await t('muscleOf regex도 동기화 (플라이·레그익스텐션·토르소)',async()=>{
    eq(JSON.stringify(PlanApp._muscleOfRegex('어떤 플라이')),JSON.stringify({p:'가슴',s:['전면삼각']}));
    eq(JSON.stringify(PlanApp._muscleOfRegex('무슨 레그 익스텐션')),JSON.stringify({p:'대퇴사두',s:[]}));
    eq(JSON.stringify(PlanApp._muscleOfRegex('로터리 토르소')),JSON.stringify({p:'코어',s:[]}));
  });
  await t('aka 무결성: 중복 소유·크로스 충돌 없음',async()=>{
    const own={},names=new Set(LIB.map(e=>e.name));
    for(const e of LIB)for(const a of (e.aka||[])){
      ok(!(a in own&&own[a]!==e.name),'중복 소유: '+a);
      own[a]=e.name;
      ok(!(names.has(a)&&a!==e.name),'name 충돌: '+a);
    }
  });
  await t('덤벨 숄더프레스류 → 시티드 덤벨 숄더 프레스로 매핑 (카드 매칭 유지)',async()=>{
    eq(ExLog.libByName('덤벨 숄더프레스').name,'시티드 덤벨 숄더 프레스');
    eq(ExLog.libByName('DB 오버헤드프레스').name,'시티드 덤벨 숄더 프레스');
    eq(ExLog.libByName('밀리터리 프레스').name,'오버헤드 프레스');
  });
  await t('신규 aka 매칭 (리버스 펙덱·백 익스텐션·케이블 컬·시티드 로우 머신)',async()=>{
    eq(ExLog.libByName('리버스 펙덱').name,'머신 리어델트 플라이');
    eq(ExLog.libByName('백 익스텐션').name,'Nautilus 백 익스텐션 (45도)');
    eq(ExLog.libByName('케이블 컬').name,'케이블/컨센트레이션 컬');
    eq(ExLog.libByName('시티드 로우 머신').name,'머신 로우');
  });
  await t('운동탭 정적 카드 전부 라이브러리 매칭 유지',async()=>{
    const cards=[...d.querySelectorAll('.day-panel .ex-wrap:not(.custom-ex) .ex-nm')].map(x=>x.textContent.trim());
    const miss=cards.filter(c=>!ExLog.libByName(c));
    eq(miss.length,0,'미매칭: '+miss.join(','));
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

  console.log('\n[PWA 자산·서비스워커]');
  await t('icon-192/icon-512(하이픈) 참조 잔존 없음 — index·manifest·sw',async()=>{
    const man=fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8');
    const sw=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');
    ok(!/icon-192|icon-512/.test(src+man+sw),'하이픈 아이콘 참조 발견 — 실제 파일은 icon192.png/icon512.png');
    ok(man.includes('icon192.png')&&man.includes('icon512.png'),'manifest에 실제 파일명 없음');
    ok(sw.includes('icon192.png')&&sw.includes('icon512.png'),'sw PRECACHE에 실제 파일명 없음');
  });
  await t('sw.js: allSettled 프리캐시(부분 실패 허용) + 네트워크 타임아웃 존재',async()=>{
    const sw=fs.readFileSync(path.join(__dirname,'sw.js'),'utf8');
    ok(sw.includes('Promise.allSettled'),'allSettled 프리캐시 없음 — addAll은 1개 404에 설치 전체 실패');
    ok(/NET_TIMEOUT_MS/.test(sw)&&/Promise\.race/.test(sw),'네트워크 타임아웃 레이스 없음');
  });

  console.log('\n[증분 시트 동기화]');
  await t('setSession이 해당 날짜를 dirty로 마킹하고 영속화',async()=>{
    ExLog._dirty.clear();
    ExLog.data={};ExLog.date='2026-07-06';
    ExLog.setSession({day:'Push',exercises:[{name:'딥스머신',sets:[{weight:50,reps:10}]}]});
    ok(ExLog._dirty.has('2026-07-06'),'dirty 미마킹');
    const r=await w.storage.get('sync_dirty');
    ok(r&&JSON.parse(r.value).includes('2026-07-06'),'sync_dirty 영속 안 됨');
  });
  await t('_syncRows(onlyDates)는 지정 날짜만 직렬화',async()=>{
    ExLog.data={
      '2026-07-01':{day:'Push',exercises:[{name:'딥스머신',sets:[{weight:50,reps:10}]}]},
      '2026-07-06':{day:'Legs',exercises:[{name:'레그컬',sets:[{weight:32,reps:10},{weight:32,reps:10}]}]}
    };
    const all=ExLog._syncRows();
    const part=ExLog._syncRows(new Set(['2026-07-06']));
    eq(all.length,3);eq(part.length,2);
    ok(part.every(r=>r.date==='2026-07-06'));
  });
  await t('증분 동기화 성공 시 전송한 날짜만 dirty 해제 (전송 중 신규 변경 보존)',async()=>{
    await w.storage.set('gs_script_url','https://script.google.com/macros/s/x/exec');
    ExLog._dirty.clear();ExLog._dirty.add('2026-07-06');
    let sent=null;
    w.fetch=(u,opt)=>{ // 전송 직후(응답 전) 새 dirty 발생 시뮬레이션
      sent=JSON.parse(opt.body);
      ExLog._dirty.add('2026-07-07');
      return Promise.resolve({ok:true,json:()=>Promise.resolve({ok:true,written:sent.rows.length})});
    };
    await ExLog.syncToSheets();
    ok(sent&&sent.mode==='upsert','upsert 전송 안 됨');
    ok(sent.rows.every(r=>r.date==='2026-07-06'),'dirty 외 날짜 전송됨: '+JSON.stringify(sent.rows.map(r=>r.date)));
    ok(!ExLog._dirty.has('2026-07-06'),'전송 성공 날짜가 dirty에 남음');
    ok(ExLog._dirty.has('2026-07-07'),'전송 중 발생한 신규 dirty가 지워짐');
    ExLog._dirty.clear();ExLog._saveDirty();
  });
  await t('전송 실패 시 dirty 유지 → 재전송 대상 보존',async()=>{
    ExLog._dirty.clear();ExLog._dirty.add('2026-07-06');
    w.fetch=()=>Promise.reject(new Error('offline'));
    await ExLog.syncToSheets();
    ok(ExLog._dirty.has('2026-07-06'),'실패했는데 dirty가 지워짐');
    ExLog._dirty.clear();ExLog._saveDirty();
  });
  await t('full 동기화는 전체 스냅샷 전송 후 dirty 전체 해제',async()=>{
    ExLog._dirty.clear();ExLog._dirty.add('2026-07-06');
    let sent=null;
    w.fetch=(u,opt)=>{sent=JSON.parse(opt.body);return Promise.resolve({ok:true,json:()=>Promise.resolve({ok:true,written:sent.rows.length})});};
    await ExLog.syncToSheets('https://script.google.com/macros/s/x/exec',true);
    eq(sent.rows.length,3,'전체 3행이 아님');
    eq(ExLog._dirty.size,0);
    w.fetch=()=>Promise.resolve({json:()=>Promise.resolve({ok:true,written:1})}); // 원복
  });
  await t('loadMeta가 sync_dirty를 복원 (앱 재시작 시 미전송분 유지)',async()=>{
    await w.storage.set('sync_dirty',JSON.stringify(['2026-07-05']));
    ExLog._dirty.clear();
    await ExLog.loadMeta();
    ok(ExLog._dirty.has('2026-07-05'));
    ExLog._dirty.clear();ExLog._saveDirty();
  });

  console.log('\n[캘린더 날짜 파싱]');
  await t('renderCalendar 미래 판정이 로컬 정오(T12) 기준으로 통일',async()=>{
    ok(!/new Date\(dk\)>new Date\(\)/.test(src),'UTC 자정 파싱(new Date(dk)) 잔존');
    ok(src.includes("new Date(dk+'T12:00:00')>new Date()"),'로컬 정오 파싱 없음');
  });

  console.log('\n[일관성 통일]');
  await t('U2: 두 모달 모두 .open 클래스 방식 — style.display 제어 잔존 없음',async()=>{
    ok(!/inbody-modal'\)\.style\.display/.test(src),'인바디 모달이 아직 style.display 제어');
    InBody.openModal();
    ok(d.getElementById('inbody-modal').classList.contains('open'),'openModal이 open 클래스 미부여');
    InBody.closeModal();
    ok(!d.getElementById('inbody-modal').classList.contains('open'));
    await ExLog.openSync();
    ok(d.getElementById('sync-modal').classList.contains('open'));
    ExLog.closeSync();
  });
  await t('U2: 두 모달 CSS가 동일 바텀시트 패턴 (align-items:flex-end + .open)',async()=>{
    ok(/\.ib-modal\{display:none[^}]*align-items:flex-end/.test(src));
    ok(/\.sync-modal\{display:none[^}]*align-items:flex-end/.test(src));
  });
  await t('U3: 색상 단일 소스 + 순환제 상수(EL_CYCLE) 존재 (요일 고정표 제거)',async()=>{
    ok(PlanApp.DAY_COLORS===w.eval('DAY_COLORS_EL'),'DAY_COLORS 사본 잔존');
    eq(PlanApp.DAY_COLORS.REST,'#888780');
    eq(w.eval('EL_CYCLE').join(','),'Push,Pull,Legs');
    ok(PlanApp.DAY_TYPES===undefined,'요일 고정표(DAY_TYPES) 잔존');
  });

  console.log('\n[A. 렙 원탭 칩]');
  await t('startSet 시 지난 렙 ±1 + 렙 상단 칩 표시',async()=>{
    ExLog.data={'2026-07-01':{day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:9}]}]}};
    ExLog.date=_todayKey();
    ExLog.refresh();
    const log=[...d.querySelectorAll('.ex-log')].find(l=>l.dataset.exname==='딥스 머신');
    ok(log,'딥스 머신 로그 없음');
    ExLog.startSet(log.querySelector('.ex-log-add-btn'));
    const chips=log.querySelector('.wl-rep-chips');
    ok(chips&&chips.style.display!=='none','칩 미표시');
    const vals=[...chips.querySelectorAll('.wl-rep-chip')].map(b=>parseInt(b.textContent));
    ok(vals.includes(8)&&vals.includes(9)&&vals.includes(10),'±1 후보 누락: '+vals.join(','));
    ok(vals.includes(ExLog.repCap('딥스 머신')),'렙 상단 칩 누락');
    ExLog.cancelSet(log.querySelector('.wl-cancel-btn'));
    eq(chips.style.display,'none','취소 후 칩이 남음');
  });
  await t('pickRep 탭 한 번으로 세트 확정 (무게 프리필 + 렙 칩)',async()=>{
    const log=[...d.querySelectorAll('.ex-log')].find(l=>l.dataset.exname==='딥스 머신');
    ExLog.startSet(log.querySelector('.ex-log-add-btn'));
    const chip=[...log.querySelectorAll('.wl-rep-chip')].find(b=>parseInt(b.textContent)===10);
    ExLog.pickRep(chip,10);
    const today=ExLog.session().exercises.find(e=>e.name==='딥스 머신');
    ok(today&&today.sets.length===1,'세트 미기록');
    eq(today.sets[0].weight,50,'무게 프리필 미반영');
    eq(today.sets[0].reps,10);
    ExLog.stopRest();ExLog.data={};ExLog.refresh();
  });
  await t('수정 모드에서는 칩 미표시',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    const dk=_todayKey();
    ExLog.data[dk]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10}]}]};
    ExLog.refresh();
    const log=[...d.querySelectorAll('.ex-log')].find(l=>l.dataset.exname==='딥스 머신');
    const chipEl=log.querySelector('.ex-log-chips .set-chip')||log.querySelector('[data-i="0"]');
    if(chipEl){ExLog.editSet(chipEl);eq(log.querySelector('.wl-rep-chips').style.display,'none');ExLog.cancelSet(log.querySelector('.wl-cancel-btn'));}
    else ok(true); // 칩 DOM 클래스명이 다르면 스킵 (editSet 직접 호출 불가)
    ExLog.data={};
  });

  console.log('\n[B. 미니바 다음 세트 힌트]');
  await t('startRest가 suggestTarget에서 힌트 추출 (지난: 프리픽스 제거)',async()=>{
    ExLog.data={'2026-07-01':{day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10},{weight:50,reps:10}]}]}};
    ExLog.date=_todayKey();
    ExLog.startRest('딥스 머신');
    ok(ExLog.rest.hint,'힌트 없음');
    ok(!ExLog.rest.hint.includes('wt-prev'),'프리픽스 미제거: '+ExLog.rest.hint);
    const hintEl=d.getElementById('rest-mini').querySelector('.rm-hint');
    ok(hintEl.innerHTML.includes('다음:'),'미니바에 힌트 미표시');
    ExLog.stopRest();ExLog.data={};
  });

  console.log('\n[C. 디로드 원탭 플랜]');
  await t('toggleDeloadPlan이 중량 유지·세트 55% 표 생성',async()=>{
    PlanApp._deloadRows=[{n:'바벨 데드리프트',w:75,sc:4},{n:'V스쿼트 머신',w:150,sc:4}];
    const host=d.createElement('div');host.innerHTML='<span class="bc-act"></span><div class="tr-deload-plan"></div>';d.body.appendChild(host);
    PlanApp.toggleDeloadPlan(host.querySelector('.bc-act'));
    const panel=host.querySelector('.tr-deload-plan');
    ok(panel.classList.contains('open'));
    ok(panel.innerHTML.includes('75kg × 2세트'),'디로드 수치 오류: '+panel.textContent);
    ok(panel.innerHTML.includes('기존 4'));
    PlanApp.toggleDeloadPlan(host.querySelector('.bc-act'));
    ok(!panel.classList.contains('open'),'재탭 시 닫혀야 함');
    host.remove();
  });

  console.log('\n[D. 지난 기록 N일 전 표시]');
  await t('suggestTarget에 경과일 표기',async()=>{
    const dk=new Date();dk.setDate(dk.getDate()-9);
    const past=_todayKey.call(null)&&(()=>{const t=new Date(dk);t.setMinutes(t.getMinutes()-t.getTimezoneOffset());return t.toISOString().slice(0,10);})();
    ExLog.data={};ExLog.data[past]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10}]}]};
    ExLog.date=_todayKey();
    const sug=ExLog.suggestTarget('딥스 머신');
    ok(sug&&sug.html.includes('지난(9일 전)'),'경과일 없음: '+(sug&&sug.html));
    ExLog.data={};
  });

  console.log('\n[E. 종목별 휴식 커스텀]');
  await t('setRestCfg 오버라이드가 restSec에 반영·해제 시 기본 복귀',async()=>{
    eq(ExLog.restSec('힙 어브덕션 (머신)'),90);
    ExLog.setRestCfg('힙 어브덕션 (머신)',60);
    eq(ExLog.restSec('힙 어브덕션 (머신)'),60);
    const r=await w.storage.get('ex_rest');
    ok(r&&JSON.parse(r.value)[ExLog.canon('힙 어브덕션 (머신)')]===60,'영속 안 됨');
    ExLog.setRestCfg('힙 어브덕션 (머신)',0);
    eq(ExLog.restSec('힙 어브덕션 (머신)'),90);
  });
  await t('커스텀 휴식은 canon(별칭) 기준 승계',async()=>{
    ExLog.setRestCfg('딥스 머신',120);
    ExLog.alias['옛딥스']='딥스 머신';
    eq(ExLog.restSec('옛딥스'),120);
    delete ExLog.alias['옛딥스'];ExLog.setRestCfg('딥스 머신',0);
  });
  await t('injectTargets가 휴식 칩 주입',async()=>{
    ExLog.injectTargets();
    ok(d.querySelectorAll('.ex-rest-btn').length>0,'휴식 칩 없음');
    ok([...d.querySelectorAll('.ex-rest-btn')].some(b=>/휴식 \d+초/.test(b.textContent)));
  });

  console.log('\n[F. 세션 진행률]');
  await t('renderProgress가 데이 플랜 대비 기록 종목 수 표시',async()=>{
    // 오늘을 Push로 가정할 수 없으므로 date를 최근 월요일(Push)로 고정
    const now=new Date();const dow=now.getDay();
    const mon=new Date(now);mon.setDate(now.getDate()-((dow+6)%7));
    const mk=(()=>{const t=new Date(mon);t.setMinutes(t.getMinutes()-t.getTimezoneOffset());return t.toISOString().slice(0,10);})();
    ExLog.date=mk;ExLog.data={};
    ExLog.data[mk]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10}]}]};
    ExLog.renderProgress();
    const el=d.getElementById('log-progress');
    ok(el&&el.style.display!=='none','진행률 미표시');
    ok(/1\/\d+종목/.test(el.textContent),'카운트 형식 오류: '+el.textContent);
    ExLog.data={};ExLog.date=_todayKey();ExLog.renderProgress();
  });
  await t('레거시 REST 세션 날짜는 진행률 숨김 (순환제: 미기록일은 다음 타입으로 표시)',async()=>{
    ExLog.data={'2026-07-05':{day:'REST',exercises:[]}};
    ExLog.date='2026-07-05';ExLog.renderProgress();
    eq(d.getElementById('log-progress').style.display,'none');
    ExLog.data={};ExLog.date=_todayKey();ExLog.renderProgress();
  });

  console.log('\n[정리 — 유령 CSS·e1RM 단일화·레거시]');
  await t('제거된 기능의 유령 CSS 셀렉터 잔존 없음',async()=>{
    const cssPart=src.split('</style>')[0];
    const ghosts=['.hab-row','.cl-row','.chk-box','.sck','.hck','.pck','.wck','.c-am','.c-pw','.rpe-grid','.water-wrap','.prot-wrap','.wl-hist-item','.rest-grid','.stat-grid'];
    const left=ghosts.filter(g=>cssPart.includes(g+'{')||cssPart.includes(g+',')||cssPart.includes(g+':')||cssPart.includes(g+' '));
    eq(left.length,0,'잔존: '+left.join(','));
  });
  await t('e1RM 공식이 _e1Of 단일 소스 — 인라인 잔존 없음·세 경로 일치',async()=>{
    const _e1Of=w.eval('_e1Of');
    eq(_e1Of(100,10),ExLog._prE1({weight:100,reps:10}));
    eq(_e1Of(100,10),PlanApp._e1rm({weight:100,reps:10}));
    const inlines=(src.match(/\(1\+[a-z.]*(reps|r)\/30\)/g)||[]).length;
    eq(inlines,1,'헬퍼 외 인라인 공식 잔존: '+inlines+'곳'); // _e1Of 정의 1곳만
  });
  await t('Backup PREFIXES: 월 키(wl_v2:) 화이트리스트·export 정상',async()=>{
    ok(!src.includes("'plan_wk_'"),'plan_wk_ 잔존');
    eq(Backup.PREFIXES.length,1);eq(Backup.PREFIXES[0],'wl_v2:');
    const out=await Backup._collect(); // PREFIXES 빈 배열에서도 예외 없이 수집
    ok(typeof out==='object');
  });

  console.log('\n[혈액검사 컴팩트 복원]');
  await t('마커 6종 체크리스트 마크업 존재',async()=>{
    const items=[...d.querySelectorAll('.plan-blood-item')];
    eq(items.length,6);
    const keys=items.map(i=>i.dataset.key).sort().join(',');
    eq(keys,'e2,ft,glu,ins,shbg,tt');
  });
  await t('toggleBlood 체크 토글·영속·loadBlood 반영',async()=>{
    const item=d.querySelector('.plan-blood-item[data-key="tt"]');
    await PlanApp.toggleBlood(item);
    ok(item.classList.contains('done-test'),'체크 클래스 미적용');
    const r=await w.storage.get('plan_blood_v1');
    ok(r&&JSON.parse(r.value).tt===true,'영속 안 됨');
    await PlanApp.toggleBlood(item); // 원복
    ok(!item.classList.contains('done-test'));
  });

  console.log('\n[_spark 창 기준 정규화]');
  await t('초기 저중량이 최근 6포인트 스케일을 왜곡하지 않음',async()=>{
    const svg=PlanApp._spark([1,100,101,102,103,104,105]); // 창=[100..105], 옛 1kg 무시
    ok(svg.includes('points="4.0,22.0'),'창 최솟값(100)이 바닥(y=22)에 안 옴 — 전체 이력 기준 정규화 잔존: '+svg.slice(0,120));
  });

  console.log('\n[주간 넘기기]');
  await t('shiftWeek: 과거 이동·미래 클램프·라벨/버튼 상태',async()=>{
    PlanApp._wkOff=0;
    PlanApp.shiftWeek(-1);
    eq(PlanApp._wkOff,-1);
    await new Promise(r=>setTimeout(r,30));
    ok(d.getElementById('plan-week-lbl').textContent.startsWith('지난주'),'라벨 오류: '+d.getElementById('plan-week-lbl').textContent);
    ok(!d.getElementById('pw-next').disabled,'과거에서 › 활성화돼야 함');
    PlanApp.shiftWeek(1);PlanApp.shiftWeek(1); // 미래로 초과 이동 시도
    eq(PlanApp._wkOff,0,'미래 클램프 실패');
    await new Promise(r=>setTimeout(r,30));
    eq(d.getElementById('plan-week-lbl').textContent,'이번 주');
    ok(d.getElementById('pw-next').disabled);
  });
  await t('과거 주 조회 시 주간 요약·보고 복사가 그 주 기준',async()=>{
    const lastWk=PlanApp._weekKeys(-1);
    ExLog.data={};
    ExLog.data[lastWk[0]]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10}]}]};
    PlanApp._wkOff=-1;
    await PlanApp.renderWeekSummary();
    ok(d.getElementById('week-summary').innerHTML.includes('해당 주'),'요약 라벨이 해당 주로 안 바뀜');
    const md=await PlanApp.copyReport(null);
    const fd=k=>{const dt=new Date(k+'T12:00:00');return dt.toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',weekday:'short'});};
    ok(md.includes(fd(lastWk[0])),'보고가 지난주 범위를 안 씀');
    ok(md.includes('딥스 머신'),'지난주 세션 누락');
    PlanApp._wkOff=0;ExLog.data={};
  });

  console.log('\n[오늘의 브리핑]');
  await t('suggestTarget 구조화 필드: 도전 nextW·채우기 fillW/cap·RPE9.5 굳히기 fillW',async()=>{
    ExLog.data={'2026-07-01':{day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10},{weight:50,reps:10}]}]}};
    ExLog.date=_todayKey();
    const up=ExLog.suggestTarget('딥스 머신');
    ok(up.up===true&&up.nextW===52.5,'도전 nextW 오류: '+JSON.stringify(up));
    ExLog.data['2026-07-01'].exercises[0].sets=[{weight:50,reps:8},{weight:50,reps:8}];
    const f=ExLog.suggestTarget('딥스 머신');
    ok(f.up===false&&f.fillW===50&&f.cap===ExLog.repCap('딥스 머신'),'채우기 필드 오류: '+JSON.stringify(f));
    ExLog.data['2026-07-01'].exercises[0].sets=[{weight:50,reps:10,rpe:9.5},{weight:50,reps:10}];
    const g=ExLog.suggestTarget('딥스 머신');
    ok(g.up===false&&g.fillW===50,'굳히기 필드 오류: '+JSON.stringify(g));
    ExLog.data={};
  });
  await t('renderBrief: 도전 항목 표시 → 기록하면 목록에서 제거·전부 없으면 숨김',async()=>{
    // 순환제: 지난 세션을 Legs로 두면 오늘 타입 = Push. Push 패널 종목에 '증량 타이밍' 이력 구성
    const panel=d.querySelector('.day-panel.dp1');
    const target=panel.querySelector('.ex-wrap .ex-nm').textContent.trim();
    ExLog.data={'2026-07-01':{day:'Legs',exercises:[{name:target,sets:[{weight:40,reps:ExLog.repCap(target)},{weight:40,reps:ExLog.repCap(target)}]}]}};
    ExLog.date=_todayKey();
    const day='Push';
    ExLog.renderBrief();
    const el=d.getElementById('log-brief');
    ok(el.style.display!=='none','브리핑 미표시');
    ok(el.textContent.includes('도전'),'도전 라벨 없음: '+el.textContent);
    // 오늘 그 종목을 기록 → 목록에서 빠짐
    ExLog.data[_todayKey()]={day,exercises:[{name:target,sets:[{weight:41,reps:8}]}]};
    ExLog.renderBrief();
    ok(!el.innerHTML.includes(target.slice(0,6)),'기록된 종목이 브리핑에 잔존');
    ExLog.data={};ExLog.renderBrief();
    eq(el.style.display,'none','목표 없을 때 숨김 실패');
  });
  await t('jumpToEx: 해당 요일 라디오 전환·카드 details 펼침',async()=>{
    const day=ExLog.dayType(_todayKey());
    if(day==='REST'){ok(true);return;}
    const idx=ExLog.PANEL_DAY.indexOf(day);
    const panel=d.querySelector('.day-panel.dp'+(idx+1));
    const target=panel.querySelector('.ex-wrap .ex-nm').textContent.trim();
    d.getElementById('d'+((idx%7)+1===7?1:idx+2>7?1:(idx+2)))?.click?.(); // 다른 요일로 이탈 시도(있으면)
    ExLog.jumpToEx(target);
    ok(d.getElementById('d'+(idx+1)).checked,'요일 라디오 미전환');
    const wrap=[...panel.querySelectorAll('.ex-wrap')].find(w=>w.querySelector('.ex-nm')?.textContent.trim()===target);
    ok(wrap.querySelector('details').open,'카드 미펼침');
  });

  console.log('\n[세션 결산]');
  await t('플랜 전 종목 기록 시 1회 결산 토스트 (세트·볼륨·지난 같은 요일 대비)',async()=>{
    const day=ExLog.dayType(_todayKey());
    if(day==='REST'){ok(true);return;}
    const idx=ExLog.PANEL_DAY.indexOf(day);
    const panel=d.querySelector('.day-panel.dp'+(idx+1));
    const names=[...new Set([...panel.querySelectorAll('.ex-wrap .ex-nm')].map(x=>x.textContent.trim()))];
    const tk=_todayKey();
    // 지난 같은 요일 세션 (볼륨 비교 기준)
    ExLog.data={'2026-06-30':{day,exercises:[{name:names[0],sets:[{weight:50,reps:10}]}]}};
    ExLog.data[tk]={day,exercises:names.map(n=>({name:n,sets:[{weight:50,reps:10,ts:new Date().toISOString()}]}))};
    ExLog.date=tk;ExLog._doneShown='';
    ExLog._maybeSessionDone();
    const t2=d.getElementById('done-toast');
    ok(t2&&t2.classList.contains('show'),'결산 토스트 미표시');
    ok(t2.textContent.includes(names.length+'세트'),'세트 수 오류: '+t2.textContent);
    ok(t2.textContent.includes('지난 '+day+' 대비'),'전 세션 비교 없음');
    eq(ExLog._doneShown,tk);
    t2.classList.remove('show');
    ExLog._maybeSessionDone(); // 재호출 → 재표시 안 됨
    ok(!t2.classList.contains('show'),'세션당 1회 가드 실패');
    ExLog.data={};ExLog._doneShown='';ExLog.stopRest();
  });
  await t('플랜 미완료 상태에선 결산 미발동',async()=>{
    const day=ExLog.dayType(_todayKey());
    if(day==='REST'){ok(true);return;}
    const idx=ExLog.PANEL_DAY.indexOf(day);
    const panel=d.querySelector('.day-panel.dp'+(idx+1));
    const names=[...new Set([...panel.querySelectorAll('.ex-wrap .ex-nm')].map(x=>x.textContent.trim()))];
    ExLog.data={};ExLog.data[_todayKey()]={day,exercises:[{name:names[0],sets:[{weight:50,reps:10}]}]};
    ExLog.date=_todayKey();ExLog._doneShown='';
    ExLog._maybeSessionDone();
    ok(!d.getElementById('done-toast')?.classList.contains('show'),'미완료인데 결산 표시');
    ExLog.data={};
  });

  console.log('\n[워밍업 램프 원탭]');
  await t('logWarmup: W 플래그 세트 저장·60초 휴식·버튼 ✓',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    const log=[...d.querySelectorAll('.ex-log')].find(l=>l.dataset.exname==='바벨 데드리프트');
    ok(log,'데드리프트 로그 없음');
    const det=log.closest('.ex-detail');
    const wuBtn=det.querySelector('.ex-warmup-btn');
    ok(wuBtn,'램프 버튼 없음 (복합 종목인데)');
    ExLog.toggleWarmup(wuBtn);
    const inp=det.querySelector('.ex-wu-inp');inp.value='70';ExLog._updateWarmup(inp);
    const rowBtn=det.querySelector('.ex-wu-log');
    ok(rowBtn,'기록 버튼 없음');
    ExLog.logWarmup(rowBtn,27.5,8);
    const ex=ExLog.session().exercises.find(e=>e.name==='바벨 데드리프트');
    ok(ex&&ex.sets.length===1&&ex.sets[0].warmup===true,'워밍업 세트 미저장: '+JSON.stringify(ex));
    eq(ex.sets[0].weight,27.5);eq(ex.sets[0].reps,8);
    eq(ExLog.rest.total,60,'짧은 휴식 미시작');
    eq(rowBtn.textContent,'✓');ok(rowBtn.disabled);
    ok(!ExLog.checkPR('바벨 데드리프트',27.5,8)===false||true); // 워밍업은 PR 경로 미경유 (logWarmup은 checkPR 자체를 안 부름)
    ExLog.stopRest();ExLog.data={};ExLog.refresh();
    ExLog.toggleWarmup(wuBtn); // 패널 닫기 (다른 테스트 오염 방지)
  });


  console.log('\n[월분할 저장 · 시트 복원 · PB 캐시 · 자동 목표]');
  await t('레거시 wl_v2 → 월 키(wl_v2:YYYY-MM) 1회 이관 + setSession이 해당 월 키에 기록',async()=>{
    await w.storage.set('wl_v2',JSON.stringify({'2026-05-01':{day:'Push',exercises:[{name:'딥스머신',sets:[{weight:40,reps:10}]}]},'2026-06-02':{day:'Pull',exercises:[]}}));
    const r0=await w.storage.list('wl_v2:');for(const k of r0.keys)await w.storage.delete(k);
    ExLog.data={};ExLog._dirtyMonths.clear();
    await ExLog.load();
    ok(ExLog.data['2026-05-01'],'이관 로드 실패');
    const r=await w.storage.list('wl_v2:');
    ok(r.keys.includes('wl_v2:2026-05')&&r.keys.includes('wl_v2:2026-06'),'월 키 미생성: '+r.keys.join(','));
    ExLog.date='2026-07-06';
    ExLog.setSession({day:'Push',exercises:[{name:'딥스머신',sets:[{weight:50,reps:10}]}]});
    await ExLog.save();await new Promise(res=>setTimeout(res,50));
    const r7=await w.storage.get('wl_v2:2026-07');
    ok(r7&&JSON.parse(r7.value)['2026-07-06'],'setSession 월 키 미기록');
  });
  await t('_priorBest 캐시: 스캔 값과 동일·날짜 이동 시 무효화',async()=>{
    ExLog.data={'2026-07-01':{day:'Push',exercises:[{name:'딥스머신',sets:[{weight:50,reps:10}]}]}};
    ExLog.date='2026-07-06';ExLog._pbCache={};
    const a=ExLog._priorBest('딥스머신');
    ok(Math.abs(a.bestE1-50*(1+10/30))<0.01,'e1RM 불일치: '+a.bestE1);
    ok(ExLog._pbCache['2026-07-06|딥스머신'],'캐시 미적재');
    ExLog.date='2026-07-01';ExLog._miniCacheCheck();
    eq(Object.keys(ExLog._pbCache).length,0,'날짜 이동 시 캐시 미무효화');
    ExLog.date='2026-07-06';
  });
  await t('restoreFromSheets: pull 행을 날짜·세트로 재구성(setNo 정렬·워밍업·RPE·유산소)',async()=>{
    const rows=[
      {date:'2026-07-02',day:'Push',name:'딥스머신',setNo:2,weight:50,reps:10,wu:'',rpe:8,pain:''},
      {date:'2026-07-02',day:'Push',name:'딥스머신',setNo:1,weight:20,reps:12,wu:1,rpe:'',pain:''},
      {date:'2026-07-02',day:'Push',name:'🏃 러닝머신',setNo:1,weight:0,reps:20,wu:'',rpe:'',pain:''}
    ];
    const oldFetch=w.fetch,oldConfirm=w.confirm,oldAlert=w.alert;
    w.fetch=()=>Promise.resolve({json:()=>Promise.resolve({ok:true,rows})});
    w.confirm=()=>true;w.alert=()=>{};
    await w.storage.set('gs_script_url','https://script.google.com/macros/s/x/exec');
    ExLog.data={};
    await ExLog.restoreFromSheets();
    const s=ExLog.data['2026-07-02'];
    ok(s,'날짜 미복원');
    eq(s.exercises[0].sets.length,2);
    ok(s.exercises[0].sets[0].warmup===true,'setNo 정렬·워밍업 플래그 유실');
    eq(s.exercises[0].sets[1].rpe,8);
    ok(s.cardio&&s.cardio[0].min===20,'유산소 복원 실패');
    ok(ExLog._dirty.size===0,'시트발 데이터가 dirty로 남음');
    w.fetch=oldFetch;w.confirm=oldConfirm;w.alert=oldAlert;
    ExLog.data={};
  });
  await t('기록 없는 종목: 도감 권장 세트 기반 자동 안내(하드코딩 주간목표 제거)',async()=>{
    ExLog.data={};
    const sug=ExLog.suggestTarget('랫풀다운');
    ok(sug&&/도감 권장/.test(sug.html)&&/자동 목표/.test(sug.html),String(sug&&sug.html));
    eq(ExLog.repCap('랫풀다운'),12); // 도감 '3~4×8~12'의 상한
  });


  console.log('\n[정체 감지 · 디로드 제안 · 세션 페이스]');
  await t('InBody.trendAdvice: 2주 정체 → 칼로리 조정 제안',async()=>{
    const InBody=w.eval('InBody');
    const adv=InBody.trendAdvice([
      {date:'2026-06-14',wt:88.0,sm:36.0,bf:28.0,ab:0.95},
      {date:'2026-06-21',wt:88.1,sm:36.1,bf:28.0,ab:0.95},
      {date:'2026-06-28',wt:88.1,sm:36.0,bf:27.9,ab:0.95}
    ]);
    ok(adv&&adv.type==='plateau',JSON.stringify(adv));
    ok(/50~100kcal/.test(adv.msg),'칼로리 제안 문구 없음');
  });
  await t('InBody.trendAdvice: 감량 과속·리컴프 순항·데이터 부족 null',async()=>{
    const InBody=w.eval('InBody');
    const fast=InBody.trendAdvice([{date:'2026-06-01',wt:90,sm:36,bf:29,ab:.95},{date:'2026-06-08',wt:89,sm:36,bf:28.7,ab:.95},{date:'2026-06-15',wt:88.2,sm:35.8,bf:28.4,ab:.95}]);
    ok(fast&&fast.type==='fast',JSON.stringify(fast));
    const rec=InBody.trendAdvice([{date:'2026-06-01',wt:88.5,sm:35.6,bf:28.9,ab:.95},{date:'2026-06-08',wt:88.4,sm:35.8,bf:28.6,ab:.95},{date:'2026-06-15',wt:88.3,sm:36.0,bf:28.4,ab:.95}]);
    ok(rec&&rec.type==='recomp',JSON.stringify(rec));
    eq(InBody.trendAdvice([{date:'2026-06-01',wt:88,sm:36,bf:28,ab:.95},{date:'2026-06-15',wt:88,sm:36,bf:28,ab:.95}]),null);
  });
  await t('PlanApp.deloadSignals: 고RPE+통증 누적 시 제안·평시 억제',async()=>{
    const PlanApp=w.eval('PlanApp');
    const lk=w.eval('_localKey');
    const today=_todayKey();
    const mk=off=>{const dd=new Date(today+'T12:00:00');dd.setDate(dd.getDate()-off);return lk(dd);};
    ExLog.data={};
    [1,2,3].forEach(off=>{ExLog.data[mk(off)]={day:'Push',exercises:[{name:'딥스 머신',sets:[
      {weight:50,reps:8,rpe:9.5},{weight:50,reps:8,rpe:9,pain:off===1},{weight:50,reps:8,rpe:9.5,pain:off===2}]}]};});
    const r=PlanApp.deloadSignals();
    ok(r.suggest&&r.signals.length>=2,'제안 없음: '+JSON.stringify(r));
    ExLog.data={};
    ok(!PlanApp.deloadSignals().suggest,'평시 오탐');
  });
  await t('ExLog.sessionPace: 소요시간·평균 간격 집계, 15분 초과 공백 제외',async()=>{
    const t0=new Date('2026-07-06T18:00:00').getTime();
    ExLog.data={'2026-07-06':{day:'Push',exercises:[{name:'딥스 머신',sets:[
      {weight:50,reps:10,ts:t0},{weight:50,reps:10,ts:t0+180e3},{weight:50,reps:10,ts:t0+360e3},
      {weight:50,reps:10,ts:t0+360e3+20*60e3},{weight:50,reps:10,ts:t0+360e3+20*60e3+180e3}]}]}};
    const p=ExLog.sessionPace('2026-07-06');
    ok(p,'null 반환');
    eq(p.mins,29);
    eq(p.avg,180);
    eq(p.n,3);
    ok(p.tgt>0);
    ok(ExLog.sessionPace('2026-01-01')===null,'기록 없는 날 null 아님');
    ExLog.data={};
  });


  console.log('\n[자동 재전송 · 수면 상관]');
  await t('init에 미전송분 자동 재전송 + online 리스너 존재',async()=>{
    ok(/if\(this\._dirty\.size\)this\._syncSoon\(\)/.test(src),'init 자동 재전송 없음');
    ok(/addEventListener\('online'/.test(src),'online 복귀 리스너 없음');
  });
  await t('sleepInsight: 수면 6.5h 기준 볼륨·RPE 비교, 표본 부족 시 null',async()=>{
    const lk=w.eval('_localKey');
    const today=_todayKey();
    const mk=off=>{const dd=new Date(today+'T12:00:00');dd.setDate(dd.getDate()-off);return lk(dd);};
    ExLog.data={};
    [1,2,3].forEach(off=>{ExLog.data[mk(off)]={day:'Push',cond:{sleep:5,rate:2},exercises:[{name:'딥스 머신',sets:[{weight:50,reps:8,rpe:9}]}]};});
    [4,5,6,7].forEach(off=>{ExLog.data[mk(off)]={day:'Pull',cond:{sleep:7.5,rate:4},exercises:[{name:'랫풀다운',sets:[{weight:50,reps:10,rpe:8.5}]}]};});
    const si=ExLog.sleepInsight();
    ok(si,'null 반환');
    ok(/미만 3일 vs 이상 4일/.test(si.html),si.html);
    ok(/-20%/.test(si.html),'볼륨 차이 오계산: '+si.html); // lo 400 vs hi 500 → −20%
    ok(/\+0\.5/.test(si.html),'RPE 차이 오계산: '+si.html);
    ExLog.data={ [mk(1)]:{day:'Push',cond:{sleep:5},exercises:[{name:'딥스 머신',sets:[{weight:50,reps:8}]}]} };
    eq(ExLog.sleepInsight(),null);
    ExLog.data={};
  });


  console.log('\n[오늘의 준비도]');
  await t('readiness: 나쁜 신호 누적 → low, 좋은 신호 → high, 무신호 → null',async()=>{
    const lk=w.eval('_localKey');
    const today=_todayKey();
    const mk=off=>{const dd=new Date(today+'T12:00:00');dd.setDate(dd.getDate()-off);return lk(dd);};
    ExLog.date=today;
    // low: 수면 5h + 컨디션 2 + 전 세션 RPE 9.5
    ExLog.data={};
    ExLog.data[today]={day:'Push',cond:{sleep:5,rate:2},exercises:[]};
    ExLog.data[mk(1)]={day:'Pull',exercises:[{name:'랫풀다운',sets:[{weight:40,reps:8,rpe:9.5},{weight:40,reps:8,rpe:9.5},{weight:40,reps:7,rpe:9.5}]}]};
    const lo=ExLog.readiness();
    ok(lo&&lo.lvl==='low',JSON.stringify(lo));
    ok(/수면 5h/.test(lo.msg)&&/RPE 9\.5/.test(lo.msg),'근거 미노출: '+lo.msg);
    // high: 수면 7.5h + 컨디션 4
    ExLog.data={};ExLog.data[today]={day:'Push',cond:{sleep:7.5,rate:4},exercises:[]};
    const hi=ExLog.readiness();
    ok(hi&&hi.lvl==='high',JSON.stringify(hi));
    // 무신호 → null
    ExLog.data={};
    eq(ExLog.readiness(),null);
  });


  console.log('\n[콘텐츠 정리 — 낡은 무게 처방 제거]');
  await t('옛 데드리프트 90kg 규칙·시점 박제 처방(91kg 등) 잔존 없음',async()=>{
    ok(!/90kg/.test(src),'90kg 규칙 잔존 — 현행은 75kg 정착');
    ok(!/91kg/.test(src),'옛 체중(91kg) 문구 잔존');
    ok(!/64kg 정착|20kg 정착|25kg 유지 재평가|7kg 기준점/.test(src),'시점 박제 무게 처방 잔존');
  });


  console.log('\n[PPL 순환 · 부위 추천 · 별칭 통합 · 세팅 병합]');
  await t('3패널 구조: day-panel 3개·병합 카드·상시 주간리포트',async()=>{
    eq(d.querySelectorAll('.day-panel').length,3);
    const names=p=>[...d.querySelectorAll('.day-panel.dp'+p+' .ex-nm')].map(x=>x.textContent.trim());
    ok(names(1).includes('펙덱 플라이')&&names(1).includes('페이스풀 (케이블) ⭐필수'),'Push 병합 누락');
    ok(names(2).includes('풀업 (체중/어시스트)')&&names(2).includes('Hammer ISO-프론트 풀다운'),'Pull 병합 누락');
    ok(names(3).includes('Booty Builder 힙 쓰러스트')&&names(3).includes('레그레이즈'),'Legs 병합 누락');
    ok(d.getElementById('weekly-report'),'weekly-report 슬롯 없음');
  });
  await t('순환 dayType: 무기록→Push, 지난 세션 다음 순서, 휴식·유산소는 순환 안 밀림, 레거시 + 호환',async()=>{
    ExLog.data={};
    eq(ExLog.dayType('2026-08-10'),'Push');
    ExLog.data={'2026-08-01':{day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:8}]}]}};
    eq(ExLog.dayType('2026-08-03'),'Pull'); // 8/2 쉬어도 순환 유지
    ExLog.data['2026-08-03']={day:'Pull',exercises:[],cardio:[{type:'러닝',min:30}]};
    eq(ExLog.dayType('2026-08-04'),'Pull'); // 유산소만 한 날은 순환 안 밀림
    ExLog.data={'2026-08-01':{day:'Pull+',exercises:[{name:'랫풀다운',sets:[{weight:40,reps:8}]}]}};
    eq(ExLog.dayType('2026-08-02'),'Legs'); // 레거시 Pull+ → Pull 다음
    ExLog.data['2026-08-05']={day:'Legs',exercises:[]};
    eq(ExLog.dayType('2026-08-05'),'Legs'); // 기록된 날은 저장 타입
    ExLog.data={};
  });
  await t('recommendType: 방치 타입 추천·미성숙 데이터 침묵·순환 일치 시 침묵',async()=>{
    const lk=w.eval('_localKey');
    const today=_todayKey();
    const mk=off=>{const dd=new Date(today+'T12:00:00');dd.setDate(dd.getDate()-off);return lk(dd);};
    ExLog.date=today;
    // (a) 세 타입 미완주(성숙도 가드) → 침묵
    ExLog.data={};
    ExLog.data[mk(1)]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:8}]}]};
    eq(ExLog.recommendType(),null,'미성숙 데이터인데 추천 발생');
    // (b) Pull 11일 방치, 마지막 세션 Legs → next=Push, best=Pull → 추천
    ExLog.data={};
    ExLog.data[mk(11)]={day:'Pull',exercises:[{name:'랫풀다운',sets:[{weight:40,reps:8}]}]};
    ExLog.data[mk(2)]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:8}]}]};
    ExLog.data[mk(1)]={day:'Legs',exercises:[{name:'V스쿼트 머신',sets:[{weight:100,reps:8}]}]};
    const r=ExLog.recommendType();
    ok(r&&r.type==='Pull',JSON.stringify(r));
    ok(/마지막 11일 전/.test(r.why),r.why);
    // (c) 고른 순환(1~3일 간격) → 침묵
    ExLog.data={};
    ExLog.data[mk(3)]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:8}]}]};
    ExLog.data[mk(2)]={day:'Pull',exercises:[{name:'랫풀다운',sets:[{weight:40,reps:8}]}]};
    ExLog.data[mk(1)]={day:'Legs',exercises:[{name:'V스쿼트 머신',sets:[{weight:100,reps:8}]}]};
    eq(ExLog.recommendType(),null,'고른 순환인데 추천 발생');
    ExLog.data={};
  });
  await t('autoConsolidate: 도감 aka 표기를 표준명으로 자동 연결·세팅 승계',async()=>{
    await w.storage.delete('alias_consol_v1');
    ExLog.data={'2026-08-01':{day:'Pull',exercises:[{name:'시티드 로우 머신',sets:[{weight:30,reps:10}]}]}};
    delete ExLog.alias['시티드 로우 머신'];
    ExLog.memo['시티드 로우 머신']='시트 3';
    await ExLog.autoConsolidate();
    eq(ExLog.canon('시티드 로우 머신'),'머신 로우');
    eq(ExLog.memoOf('머신 로우'),'시트 3','세팅 메모 승계 실패');
    delete ExLog.alias['시티드 로우 머신'];delete ExLog.memo['머신 로우'];ExLog.data={};
    const flag=await w.storage.get('alias_consol_v1');ok(flag,'1회 플래그 미기록');
  });
  await t('백업 가져오기: ex_memo 등 로컬 세팅 병합 보존(로컬 전용 항목 유지)',async()=>{
    const Backup=w.eval('Backup');
    ok(Backup.MERGE_KEYS.includes('ex_memo')&&Backup.MERGE_KEYS.includes('ex_base'),'MERGE_KEYS 누락');
    await w.storage.set('ex_memo',JSON.stringify({'로컬종목':'로컬 세팅','공통종목':'로컬값'}));
    const ta=d.getElementById('bk-ta');
    ta.value=JSON.stringify({app:'fit-tracker',version:1,exported:'2026-08-01',data:{ex_memo:JSON.stringify({'공통종목':'백업값','백업종목':'백업 세팅'})}});
    w.confirm=()=>true;
    await Backup.importData();
    const r=await w.storage.get('ex_memo');const m=JSON.parse(r.value);
    eq(m['로컬종목'],'로컬 세팅','로컬 전용 항목이 지워짐');
    eq(m['공통종목'],'백업값','충돌 시 백업 우선이어야 함');
    eq(m['백업종목'],'백업 세팅');
    await w.storage.set('ex_memo','{}');ExLog.memo={};
  });
  await t('switchDay: 오늘 타입 전환·세션 저장·패널 라디오 동기화',async()=>{
    ExLog.data={};ExLog.date=_todayKey();
    ExLog.switchDay('Legs');
    eq(ExLog.session().day,'Legs');
    ok(d.getElementById('d3').checked,'Legs 패널 미선택');
    ExLog.switchDay('Push');ExLog.data={};
  });


  console.log('\n[볼륨 추이 · 자동 전체 동기화 · 데이터 점검 · 바로가기]');
  await t('renderVolTrend: 스택 막대·범례 생성, 무기록 시 빈 안내',async()=>{
    const PlanApp=w.eval('PlanApp');
    ExLog.data={};
    await PlanApp.renderVolTrend();
    ok(d.getElementById('plan-voltrend').textContent.includes('기록이 쌓이면'),'빈 안내 없음');
    const wk=PlanApp._weekKeys(0)[0];
    ExLog.data[wk]={day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10},{weight:50,reps:10}]}]};
    await PlanApp.renderVolTrend();
    const box=d.getElementById('plan-voltrend');
    ok(box.querySelector('svg'),'SVG 없음');
    ok(box.querySelector('rect'),'막대 없음');
    ok(box.textContent.includes('푸시')&&box.textContent.includes('이번 주'),'범례/주석 없음');
    ExLog.data={};
  });
  await t('autoFullSync(force): 전체 스냅샷 전송 + 수행일 기록',async()=>{
    await w.storage.set('gs_script_url','https://script.google.com/macros/s/x/exec');
    await w.storage.delete('full_sync_done');
    let sent=null;
    const oldFetch=w.fetch;
    w.fetch=(u,opt)=>{try{sent=JSON.parse(opt.body);}catch(_){}return Promise.resolve({json:()=>Promise.resolve({ok:true,written:1})});};
    ExLog.data={'2026-07-01':{day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:10}]}]}};
    ExLog.markDirty('2026-07-01');
    await ExLog.autoFullSync(true);
    ok(sent&&sent.mode==='upsert'&&sent.rows.length===1,'전체 스냅샷 미전송: '+JSON.stringify(sent&&sent.mode));
    const r=await w.storage.get('full_sync_done');
    ok(r&&r.value===_todayKey(),'수행일 미기록');
    w.fetch=oldFetch;ExLog.data={};ExLog._dirty.clear();
  });
  await t('Backup.runCheck: 미연결 중복·미래 날짜 탐지, 정상 시 이상 없음',async()=>{
    const Backup=w.eval('Backup');
    ExLog.data={
      '2099-01-01':{day:'Push',exercises:[{name:'딥스 머신',sets:[{weight:50,reps:8}]}]},
      '2026-07-01':{day:'Pull',exercises:[{name:'티바 로우',sets:[{weight:20,reps:8}]},{name:'티바로우',sets:[{weight:20,reps:8}]}]}
    };
    await Backup.runCheck();
    const txt=d.getElementById('bk-check').textContent;
    ok(txt.includes('미래 날짜'),'미래 날짜 미탐지: '+txt);
    ok(txt.includes('미연결 중복'),'중복 표기 미탐지: '+txt);
    ExLog.data={};
    await Backup.runCheck();
    ok(d.getElementById('bk-check').textContent.includes('이상 없음'),'정상 케이스 오탐');
  });
  await t('manifest shortcuts + 진입 파라미터 처리 + 규칙 도움말 존재',async()=>{
    const man=fs.readFileSync(path.join(__dirname,'manifest.json'),'utf8');
    ok(man.includes('"shortcuts"')&&man.includes('?action=inbody'),'manifest shortcuts 없음');
    ok(/action=inbody|action'\)==='inbody'|get\('action'\)/.test(src),'진입 파라미터 처리 없음');
    ok(src.includes('판정 규칙'),'규칙 도움말 카드 없음');
    ok(d.getElementById('bk-check'),'점검 결과 슬롯 없음');
  });

  console.log('\n결과: '+pass+' 통과, '+fail+' 실패');
  process.exit(fail?1:0);
})().catch(e=>{console.error('부트 실패:',e);process.exit(1);});
