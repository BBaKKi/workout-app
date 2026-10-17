const ExLog={
  prescription(name,day){return AppFeatures.prescription(name,day||this.dayType(this.date));},
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
      +(legacy?'기록·기구 설정은 두 루틴에서 함께 사용합니다.':(ph.limited?'유산소 15–20분 × 주 3회부터. 복귀 1주는 월·화·목·토 웨이트.':'상체 운동 후 유산소 20–30분, 주 4회까지. 피로가 남으면 줄이세요.'))+'</small>';
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
    RecordModel.migrateLegacyLinks();
    await this.loadMeta();
    await this.loadBase();
    await this.loadLoadType();
    this.migrateEw();          // 인바디 로드를 기다리므로 await하지 않는다 (첫 화면 지연 방지)
    await this.loadMemo();
    await this.loadRestCfg();

    this.syncPanel(this.dayType(this.date)); // 오늘 타입 패널 자동 선택 (switchDay와 동일 경로)
    document.addEventListener('input',e=>{if(e.target&&e.target.classList&&e.target.classList.contains('wl-kg-input'))this._updateTotalHint(e.target);});
    if(typeof PlanApp!=='undefined'&&PlanApp.renderBlock)PlanApp.renderBlock(); // 메타 로드 후 플랜 블록 카드 동기화
    this.initRoutineUI();
    this.injectBar();
    this.injectLogs();
    this.injectAddBtns();
    this.injectDeleteBtns();
    this.reconcilePanels(); // 정적 카드를 EL_DAY_EX에 맞춘 뒤에 슬롯을 굳힌다 — 둘이 어긋나 있던 원인 제거
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
    AppFeatures.mount();
    DataSync.mount();
    WorkoutTools.mount();
    InterfaceTools.mount();
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

  canon(name){return name;},
  // 도감 표준명과 검색용 동의어로 대체 기구 후보를 찾는다. 기록은 합치지 않는다.
  variantGroup(name){
    const cn=this.canon(name);
    let g=_variantGroupOf(cn);
    if(g.length)return{group:g,cur:cn};
    const e=this.libByName(cn);
    if(e){g=_variantGroupOf(e.name);if(g.length)return{group:g,cur:e.name};}
    return{group:[],cur:cn};
  },
  _histNames(){ // 기록에 등장한 모든 종목명 (최근 등장일 내림차순)
    const seen={};
    for(const dk in this.data)(this.data[dk].exercises||[]).forEach(e=>{if((e.sets||[]).length&&(!seen[e.name]||seen[e.name]<dk))seen[e.name]=dk;});
    return Object.keys(seen).sort((a,b)=>seen[b].localeCompare(seen[a]));
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
  libByName(name){const inventory=GymInventory.find(name);if(inventory)return inventory;const L=window.EXERCISE_LIBRARY||[];return L.find(e=>e.name===name)||L.find(e=>(e.aka||[]).includes(name));},
  _tagBtn(n){return '<button class="wl-picker-tag" onclick="ExLog.addEx(\''+_escJs(n)+'\',this)">'+_esc(n)+'</button>';},

  dbCardInner(e,name){
    const nm=_esc(name||(e&&e.name)||'');
    const tags=e?'<span class="tag t-s">'+_esc(e.sets||'')+'</span><span class="tag t-m">'+_esc(e.mus||'')+'</span>':'';
    const help=e?'':'<div class="exercise-coaching coach-unknown">직접 입력한 운동입니다. 기구 안내와 자세를 확인하고 가벼운 준비 세트부터 시작하세요. 도감에서 운동을 선택하면 상세 가이드를 볼 수 있어요.</div>';
    return '<details class="ex-card"><summary><label class="ck-btn" onclick="event.stopPropagation()"><span class="ck-icon">✓</span></label><div class="ex-info"><div class="ex-nm">'+nm+'</div><div class="ex-meta">'+tags+'</div></div><span class="chev">▾</span></summary><div class="ex-detail">'+help+'</div></details>';
  },
  _addDelBtn(card,name){
    const sm=card.querySelector('summary');if(!sm||card.querySelector('.ex-del-btn'))return;
    const b=document.createElement('button');b.className='ex-del-btn';b.type='button';b.textContent='✕';b.title='이 운동 빼기';
    b.setAttribute('onclick','event.stopPropagation();event.preventDefault();ExLog.removeEx(this)');
    const chev=sm.querySelector('.chev');if(chev)sm.insertBefore(b,chev);else sm.appendChild(b);
  },
  _addSwapBtn(card){
    const sm=card.querySelector('summary');if(!sm||card.querySelector('.ex-swap-btn'))return;
    const b=document.createElement('button');b.className='ex-swap-btn';b.type='button';b.textContent='🔄';b.title='비슷한 운동으로 대체';
    b.setAttribute('onclick','event.stopPropagation();event.preventDefault();ExLog.toggleSwap(this)');
    const del=sm.querySelector('.ex-del-btn');const chev=sm.querySelector('.chev');
    if(del)sm.insertBefore(b,del);else if(chev)sm.insertBefore(b,chev);else sm.appendChild(b);
  },
  // 브랜드 칩 전환 — 같은 동작의 기구 변형으로 제자리 교체.
  // 적용 날짜 범위를 선택한다. 브랜드별 기록과 자동 목표는 서로 독립적으로 유지한다.
  switchBrand(btn,name){return WorkoutTools.chooseSwap(btn,name);},
  toggleLoadType(btn){
    const det=btn.closest('.ex-detail');if(!det)return;
    let panel=det.querySelector('.ex-load-panel');
    if(panel){panel.remove();return;}
    const log=det.querySelector('.ex-log');const name=log?log.dataset.exname:'';
    const cur=this.loadTypeOf(name);
    panel=document.createElement('div');panel.className='ex-load-panel';
    panel.innerHTML='<div class="ex-load-hd">⚖ <b>이 종목의 부하 유형</b> — 자동 목표 방향·PR·추세가 이 설정을 따릅니다. 새 기록에 적용하며 이미 저장한 단위와 부하는 유지됩니다.</div>'
      +['normal','assist','bw','time','distance'].map(t=>'<button type="button" class="ex-load-opt'+(t===cur?' on':'')+'" onclick="ExLog.pickLoadType(this,\''+t+'\')"><b>'+LOAD_LBL[t]+'</b><span>'+(LOAD_DESC[t]||'거리(m)를 기록하고 중량 추정 분석에서는 제외합니다.')+'</span></button>').join('');
    btn.insertAdjacentElement('afterend',panel);
  },
  pickLoadType(el,t){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    if(log)this.setLoadType(log.dataset.exname,t);
    const pan=det.querySelector('.ex-load-panel');if(pan)pan.remove();
    this.refresh();this.injectTargets();
    if(typeof PlanApp!=='undefined'&&PlanApp.renderTrends)PlanApp.renderTrends();
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
    const lib=(window.EXERCISE_LIBRARY||[]).filter(e=>!e.archived);
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
  swapEx(btn,name){return WorkoutTools.chooseSwap(btn,name);},
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
      card.querySelectorAll('.ex-log,.ex-extra,.ex-more,.ex-week-target,.ex-cue,.exercise-actions,.ex-del-btn,.ex-swap-btn').forEach(el=>el.remove());
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
    const idx={};(window.EXERCISE_LIBRARY||[]).filter(e=>!e.archived).forEach(e=>{const mu=(typeof PlanApp!=='undefined'&&PlanApp.muscleOf)?PlanApp.muscleOf(e.name):null;if(mu&&mu.p)(idx[mu.p]=idx[mu.p]||[]).push(e.name);});
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
      // 현재 계획에서 빠진 카드는 숨깁니다.
      // 앞에 남아 있으면 보이지도 않는 카드가 1번 슬롯을 차지한다.
      have.forEach((w,n)=>{ if(!want.includes(n)){ w.style.display='none'; list.appendChild(w); } });
      this._markTiers(panel,day,list);
    });
  },
  _markTiers(panel){AppFeatures.markPhases(panel);},
  _sortDay(panel){AppFeatures.sort(panel);},

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
    return`<div class="ex-log-top"><span class="ex-log-lbl">세트 기록</span><button class="ex-log-add-btn" onclick="ExLog.startSet(this)">＋ 세트</button></div><div class="ex-log-chips"><span class="ex-log-empty">기록 없음</span></div><div class="ex-log-input" style="display:none"><span class="ex-log-sn"></span><input type="number" class="wl-kg-input" placeholder="kg" step="2.5" inputmode="decimal"><span class="wl-set-x">×</span><input type="number" class="wl-rp-input" placeholder="회" inputmode="numeric" onkeydown="if(event.key==='Enter')ExLog.confirmSet(this)"><select class="wl-rpe-sel" title="RPE (선택 — 마지막 세트 체감 강도)"><option value="">RPE</option><option>7</option><option>7.5</option><option>8</option><option>8.5</option><option>9</option><option>9.5</option><option>10</option></select><button class="wl-confirm-btn" onclick="ExLog.confirmSet(this)">세트 저장</button><button aria-label="통증 표시" class="wl-pain-btn" onclick="ExLog.togglePainSet(this)" title="이 세트에서 통증 발생 — 확정 전에 눌러두면 함께 저장됩니다">⚠️</button><button aria-label="세트 삭제" class="wl-del-btn" onclick="ExLog.deleteSet(this)" style="display:none" title="이 세트 삭제">🗑</button><button class="wl-cancel-btn" onclick="ExLog.cancelSet(this)">취소</button></div><div class="wl-rep-chips" style="display:none"></div>`;
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
      cd.innerHTML='<span class="cond-lbl">😴 컨디션</span><span class="cond-dots">'+[1,2,3,4,5].map(n=>'<button type="button" class="cond-dot" data-n="'+n+'" onclick="ExLog.setCond('+n+')">'+n+'</button>').join('')+'</span><input type="number" class="cond-sleep" step="0.5" min="0" max="14" inputmode="decimal" placeholder="수면 h" onchange="ExLog.setSleep(this.value)">';
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
      cr.innerHTML=`<div class="cardio-hd">🏃 유산소</div><div class="cardio-list"></div><button class="cardio-add" onclick="ExLog.toggleCardio(this)">＋ 유산소 기록</button><div class="cardio-form" style="display:none"><select class="cd-type"><option>걷기(LISS)</option><option>인클라인 워킹</option><option>자전거</option><option>러닝</option><option>수영</option><option>기타</option></select><label>시간 (분)<input type="number" class="cd-min" placeholder="분" inputmode="decimal" min="0.1" step="0.1"></label><label>거리 (km·선택)<input type="number" class="cd-km" min="0" step="0.01" inputmode="decimal"></label><label>경사 (%·선택)<input type="number" class="cd-incline" min="0" max="100" step="0.5" inputmode="decimal"></label><button class="cd-ok" onclick="ExLog.saveCardio(this)">기록</button></div>`;
      panel.appendChild(cr);
    });
  },
  toggleCardio(btn){const f=btn.nextElementSibling;f.style.display=f.style.display==='none'?'flex':'none';},
  saveCardio(btn){
    const f=btn.closest('.cardio-form');
    const type=f.querySelector('.cd-type').value;
    const min=Number(f.querySelector('.cd-min').value),km=f.querySelector('.cd-km').value,incline=f.querySelector('.cd-incline').value;
    if(!Number.isFinite(min)||min<=0||min>1440||(km!==''&&(!Number.isFinite(+km)||+km<0||+km>2000))||(incline!==''&&(!Number.isFinite(+incline)||+incline<0||+incline>100))){AppFeatures.announce('유산소 시간·거리·경사 입력 범위를 확인하세요.');return;}
    if(!min){f.querySelector('.cd-min').focus();return;}
    const s=this.session();(s.cardio=s.cardio||[]).push({type,min,...(km!==''?{km:+km}:{}),...(incline!==''?{incline:+incline}:{}),ts:new Date().toISOString()});
    this.setSession(s);
    f.querySelector('.cd-min').value='';f.style.display='none';
    this.refresh();if(this._syncSoon)this._syncSoon();
  },
  delCardio(i){
    const s=this.session();if(!s.cardio)return;
    s.cardio.splice(i,1);this.setSession(s);this.refresh();if(this._syncSoon)this._syncSoon();
  },
  setCond(n){
    const s=this.session();(s.cond=s.cond||{}).rate=n;this.data[this.date]=s;WorkoutTools.touch(this.date);this.renderCond();if(this._syncSoon)this._syncSoon();
  },
  setSleep(v){
    const h=parseFloat(v);if(v!==''&&(!Number.isFinite(h)||h<0||h>24)){AppFeatures.announce('수면은 0–24시간으로 입력하세요.');return;}const s=this.session();
    s.cond=s.cond||{};if(h>0)s.cond.sleep=h;else delete s.cond.sleep;
    this.data[this.date]=s;WorkoutTools.touch(this.date);
  },
  setNote(v){
    const s=this.session();
    const t=String(v||'').trim().slice(0,200);
    if(t)s.note=t;else delete s.note;
    this.data[this.date]=s;WorkoutTools.touch(this.date);
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
    const html=list.map((c,i)=>'<div class="cd-item">'+_esc(c.type)+' <b>'+c.min+'분</b>'+(c.km!=null?' · '+c.km+'km':'')+(c.incline!=null?' · 경사 '+c.incline+'%':'')+'<span class="cd-x" onclick="ExLog.delCardio('+i+')">✕</span></div>').join('');
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
    const L=(window.EXERCISE_LIBRARY||[]).filter(e=>!e.archived);
    picker.innerHTML='<div class="wl-picker-title">'+day+' 운동 추가 · 도감 '+L.length+'종에서</div>'
      +'<button type="button" class="gym-picker-link" onclick="GymInventory.open()">올데이 · 사진 확인 기구 보기 ↗</button>'
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
    const L=(window.EXERCISE_LIBRARY||[]).filter(e=>!e.archived);q=(q||'').trim().toLowerCase();
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
    if(_ri)_ri.placeholder=_lt==='time'?'초':_lt==='distance'?'m':'회';
    if(wi)wi.setAttribute('aria-label','중량 (kg)');
    if(_ri)_ri.setAttribute('aria-label',_lt==='time'?'시간 (초)':_lt==='distance'?'거리 (m)':'반복 횟수');
    inp.querySelector('.wl-rp-input').value='';
    inp.style.display='flex';btn.style.display='none';
    // 반복 선택 칩: 지난 세트 렙 ±1 + 렙 상단(✦) — 숫자 선택 후 별도 저장 (무게는 프리필돼 있으므로 필요 시 먼저 수정)
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
        chips.innerHTML='<span class="wl-rep-chip-lbl">반복 선택</span>'+cand.map(x=>'<button type="button" class="wl-rep-chip'+(x>=cap?' cap':'')+'" onclick="ExLog.pickRep(this,'+x+')">'+x+(x>=cap?'✦':'')+'</button>').join('');
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
    WorkoutTools.saveDraft(log);
    AppFeatures.announce(n+'회 선택됨 · 세트 저장을 눌러 확정하세요.');
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
  _loadMeta(name,w,date=this.date,bwFixed){
    const t=this.loadTypeOf(name);
    if(t==='normal'||t==='time'||t==='distance')return{};
    const bw=Number.isFinite(bwFixed)?bwFixed:this.bwOn(date);
    if(!bw)return{};
    return{ew:this.effW(name,w,date,bw),bw:bw};
  },
  checkPR(name,w,r){
    const prior=this._priorSets(name);if(!prior.length)return false;
    const lt=this.loadTypeOf(name);
    if(lt==='time'||lt==='distance'){                                  // 시간 종목은 초(=reps)가 기록이다
      const compatible=prior.filter(s=>RecordModel.unit(name,s)===RecordModel.unit(name));return compatible.length>0&&r>Math.max.apply(null,compatible.map(s=>s.reps||0));
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
    if(!ex){ex={name:log.dataset.exname,exerciseId:RecordModel.exerciseId(log.dataset.exname),sets:[]};s.exercises.push(ex);}
    if(editIdx!==''&&editIdx!=null&&ex.sets[+editIdx]){
      // 기존 세트 제자리 수정 (휴식 타이머·PR 토스트 없음). ts는 최초 기록 시각, pain 플래그 보존.
      const old=ex.sets[+editIdx];
      ex.sets[+editIdx]=Object.assign({_id:old._id,weight:w,reps:r,unit:RecordModel.unit(log.dataset.exname,old),ts:old.ts||new Date().toISOString()},this._loadMeta(log.dataset.exname,w,this.date,old.bw),painOn?{pain:true}:{},rpe?{rpe}:{},wuOn?{warmup:true}:{});
      this.setSession(s);
      this.cancelSet(el);
      this.refresh();
      this._syncSoon();
      return;
    }
    // 신규 세트 (워밍업은 PR 판정 대상 아님)
    const isPR=wuOn?false:this.checkPR(log.dataset.exname,w,r);
    ex.sets.push(Object.assign({weight:w,reps:r,unit:RecordModel.unit(log.dataset.exname),ts:new Date().toISOString()},this._loadMeta(log.dataset.exname,w),rpe?{rpe}:{},wuOn?{warmup:true}:{},painOn?{pain:true}:{}));
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
  // 과거최고는 '열람일 이외' 날짜의 데이터라 같은 날 안에서는 불변 — 날짜 이동(_miniCacheCheck) 시 무효화.
  _pbCache:{},
  _priorBest(name){
    const cn=this.canon(name); // 루프 밖 1회 계산 (이전에는 날짜×종목 비교마다 재계산)
    const ck=this.date+'|'+cn;
    const hit=this._pbCache[ck];if(hit)return hit;
    let bestE1=-1,bestReps=-1;
    for(const r of this._exFor(cn)){
      if(r.date>=this.date)continue;
      r.ex.sets.forEach(st=>{if(_isWorkSet(st)&&RecordModel.unit(name,st)===RecordModel.unit(name)){if(_ldW(st)>0){const e1=_e1Of(_ldW(st),st.reps);if(e1>bestE1)bestE1=e1;}else if(st.reps>bestReps)bestReps=st.reps;}});
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
    if(window.WorkoutTools?.ready)WorkoutTools.syncPanels();
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
        const body=lt==='distance'?RecordModel.formatSet(ex.name,set):lt==='time'?(set.reps+'초'+(set.weight>0?('+'+set.weight):''))
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
        mb.style.display='';mb.innerHTML=`🔥 이번 주 ${wk}/${RecordModel.plannedDays(this.date)}일 완료 · 누적 ${total}회 운동${goal}`;
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
    if(window.AppFeatures?.ready){AppFeatures.renderFocus();AppFeatures.renderWeekly();}
    if(window.WorkoutTools?.ready){WorkoutTools.restoreDrafts();WorkoutTools.remember();}
    if(window.InterfaceTools?.ready)InterfaceTools.refresh();
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
      str=RecordModel.formatSet(name,top);
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
        let e1=0;sets.forEach(s=>{const v=!this.isTimed(name)&&_ldW(s)>0?_e1Of(_ldW(s),s.reps):0;if(v>e1)e1=v;});
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
    document.getElementById('hist-sub').textContent='전체 기록 '+rows.length+'회 (워밍업 제외 · 이 종목의 기록만)';
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
      const fmt=sets=>sets.map(st=>RecordModel.formatSet(name,st)).join(', ');
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
    h+='<div class="wr-row"><span>운동 일수</span><span class="v">'+sessions+'/'+RecordModel.plannedDays(wkKeys[0]||_todayKey())+'일</span></div>';
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
  isTimed(name){return /플랭크|데드행|파머스 워크/.test(name);},
  // 펌프성(고반복 소근육·둔근 고립) 종목 — 회복 수요가 낮아 기본 휴식 90초
  isPump(name){return /래터럴|레이즈|페이스풀|어브덕션|어덕션|슈러그|카프|종아리|크런치/.test(name);},
  restSec(name){const o=+this.restCfg[this.canon(name)];if(o>0)return o;if(this.isPump(name))return 90;return this.isCompound(name)?180:120;},
  // ── 종목별 휴식시간 오버라이드: 기본(복합 180초/고립 120초 — RPE 회복 우선, 펌프성 종목만 90초 지정)이 안 맞는 종목만 커스텀 (원래 운동명 기준) ──
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
    panel=document.createElement('div');panel.className='ex-base-panel ex-rest-panel';
    panel.innerHTML='<div class="ex-base-hd">⏱ 이 종목의 세트 간 <b>휴식시간</b>을 조정합니다. 비우면 기본('+def+'초)으로 돌아갑니다.</div>'
      +'<div class="ex-base-row"><input type="number" class="ex-rest-inp" step="15" min="15" max="600" inputmode="numeric" placeholder="기본 '+def+'초" value="'+cur+'">'
      +'<button class="ex-base-save" onclick="ExLog.saveRestFromUI(this)">저장</button>'
      +(cur?'<button class="ex-base-clear" onclick="ExLog.clearRestFromUI(this)">기본값</button>':'')+'</div>';
    btn.insertAdjacentElement('afterend',panel);
  },
  saveRestFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setRestCfg(log.dataset.exname,parseFloat(det.querySelector('.ex-rest-inp').value)||0);
    el.closest('.ex-rest-panel').remove();
    this.injectTargets();
  },
  clearRestFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setRestCfg(log.dataset.exname,0);
    el.closest('.ex-rest-panel').remove();
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
  _targetNote(name){const type=this.loadTypeOf(name),e=this.libByName(name);return e?.recordingNote?' · '+_esc(e.recordingNote):type==='assist'?' · 같은 기구에서 보조량을 줄이면 난도가 올라갑니다.':type==='time'?' · 반복 칸은 초, 중량 칸은 추가 중량입니다.':'';},
  suggestTarget(name){
    const prev=this.prevSession(name);
    if(this.loadTypeOf(name)==='distance')return {html:prev?'지난 기록: '+prev.sets.map(st=>RecordModel.formatSet(name,st)).join(' / ')+' · 거리는 m로 기록해요.':'중량과 이동 거리(m)를 기록하세요.',up:false};
    const note=this._targetNote(name);
    const phase=TRAINING_PLAN.phase(this.date);
    if(TRAINING_PLAN.mode==='current'&&phase.limited)return {html:'<b>복귀·적응: 2세트 · 3–4회 여유</b> — 워밍업으로 중량 결정. 자동 증량 보류.',up:false,cap:this.repCap(name)};
    if(!prev){
      const e=this.libByName(this.canon(name))||this.libByName(name);
      const p=this.prescription(name);const rec=p?('루틴 '+p.sets+'×'+p.min+'–'+p.max+' · '):(e&&e.sets?('도감 편성 예시 '+e.sets+' · '):'');
      return{html:rec+'첫 기록을 남기면 자동 목표가 생성됩니다'+note,up:false};
    }
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
      if(hardest>9)return{html:prevLbl+' → '+this._wLbl(lt,lastW)+' 한 번 더 굳히기 (RPE '+hardest+' — 한계 근접)'+note,up:false,fillW:lastW,cap};
      const ease=(hardest>0&&hardest<=8)?' (RPE '+hardest+' 여유)':'';
      if(lt==='assist'){
        // 어시스트는 보조가 줄어드는 것이 증량 — 방향을 반대로 제안한다.
        // [26.09] 기준을 '마지막 세트'가 아니라 '그 세션의 대표 무게(최빈값)'로 바꿨다.
        //   8/25 풀업은 보조 70×3세트 + 60×1세트였는데 마지막 세트만 보면 다음 목표가 57.5가 된다.
        //   마지막 한 세트를 짜낸 것은 새 기준선이 아니라 그 날의 최대치다 — 4세트를 그 무게로 다시 하라는 제안이 되어 버린다.
        //   동률이면 보조가 큰 쪽(= 보수적인 쪽)을 대표로 삼는다.
        const cnt={};sets.forEach(s=>{cnt[s.weight]=(cnt[s.weight]||0)+1;});
        const base=Object.keys(cnt).map(Number).sort((a,b)=>cnt[b]-cnt[a]||b-a)[0];
        if(base<=0)return{html:prevLbl+' → <b>보조 0 달성 — 반복을 더 채우거나 추가 중량 단계로 ⬆</b>'+ease+note,up:true,nextW:0};
        const step=this.stepOf(name);
        const nw=Math.max(0,Math.round((base-Math.max(nx.add,step))*100)/100);
        const baseTxt=(base!==lastW)?(' <span class="wt-var">대표 '+base+'kg 기준('+cnt[base]+'세트)</span>'):'';
        return{html:prevLbl+' → <b>보조 '+nw+'kg 도전 ⬇</b>'+baseTxt+ease+note,up:true,nextW:nw};
      }
      // 한 칸이 현재 무게의 25%를 넘으면 그 기구에서는 무게로 갈 자리가 아니다.
      // 소근육 경량 종목(케이블 래터럴 5.0 → 다음 칸 7.5 = +50%)에서 반복수가 무너지는 구간이라,
      // 무게 대신 한 팔씩(유니래터럴)·세트 추가·템포로 과부하를 만드는 쪽을 제안한다.
      if(lastW>0&&nx.add/lastW>0.25)
        return{html:prevLbl+' → <b>'+this._wLbl(lt,nx.w)+'는 +'+Math.round(nx.add/lastW*100)+'% 점프</b> '
          +'<span class="wt-var">스택 '+nx.step+'kg 단위 — 무게 대신 현재 무게로 반복·자세를 안정시키세요</span>'+ease+note,up:false,fillW:lastW,cap};
      return{html:prevLbl+' → <b>'+this._wLbl(lt,nx.w)+' 도전 ⬆</b> <span class="wt-var">스택 '+nx.step+'kg 단위</span>'+ease+note,up:true,nextW:nx.w};
    }
    return{html:prevLbl+' → '+this._wLbl(lt,lastW)+'로 '+cap+'회 채우기'+note,up:false,fillW:lastW,cap};
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

    this.dataVer++;this._pbCache={};this._stepCache={};
  },
  // 해당 날짜 시점의 체중 — 인바디 기록 중 그 날짜 이전의 가장 최근 값.
  // 세트 저장 시 함께 박아두므로(bw), 나중에 체중이 변해도 과거 e1RM이 흔들리지 않는다.
  bwOn(dateKey){
    const limit=dateKey||_todayKey();
    const daily=Object.values(window.AppFeatures?.weights||{}).filter(x=>!x.deleted&&x.wt>0&&x.date<=limit);
    const rows=[...(InBody._log||[]).filter(x=>x.wt>0&&x.date<=limit),...daily];
    rows.sort((a,b)=>a.date.localeCompare(b.date));
    return rows.length?+rows[rows.length-1].wt:0;
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
  base:{},
  async loadBase(){try{const r=await window.storage.get('ex_base');if(r)this.base=JSON.parse(r.value)||{};}catch(_){}},
  saveBase(){window.storage.set('ex_base',JSON.stringify(this.base)).catch(e=>SafeStore.report(e));},
  baseOf(name){const b=+this.base[this.canon(name)];return b>0?b:0;},
  setBase(name,kg){
    const cn=this.canon(name);
    if(kg>0)this.base[cn]=kg;else delete this.base[cn];
    this.saveBase();
  },
  // ── 종목별 세팅 메모: 시트 높이·핀 번호·발판 위치 등 내 몸에 맞춘 기구 세팅 (원래 운동명 기준) ──
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
    let panel=det.querySelector('.ex-base-panel:not(.ex-rest-panel)');
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
    el.closest('.ex-base-panel').remove();
    this.injectTargets();this.refresh();
  },
  clearBaseFromUI(el){
    const det=el.closest('.ex-detail');const log=det.querySelector('.ex-log');
    this.setBase(log.dataset.exname,0);
    el.closest('.ex-base-panel').remove();
    this.injectTargets();this.refresh();
  },

  // ── 혼합 그립을 선택한 경우의 시작손 메모 ──
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
    return'혼합 그립 사용 시 · '+setNo+'세트 언더그립: <b>'+under+'손</b><span class="grip-note">언더 팔꿈치 완전 신전 유지 · 탭하면 시작손 변경</span>';
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
        badge.innerHTML=sug.html;
      }
      // 기본무게 설정 칩 (모든 종목 — 상태를 라벨에 표시)
      let bb=det.querySelector('.ex-base-btn');
      if(!bb){
        bb=document.createElement('button');bb.className='ex-base-btn';bb.type='button';
        bb.setAttribute('onclick','ExLog.toggleBase(this)');
        const anchorB=det.querySelector('.ex-week-target');
        if(anchorB)det.insertBefore(bb,anchorB.nextSibling);else det.insertBefore(bb,det.firstChild);
      }
      const bkg=this.baseOf(name);
      bb.textContent=bkg?('🏗 기본 '+bkg+'kg · 입력은 ＋원판'):'🏗 기본무게 설정';
      // 세팅 메모 칩 (모든 종목 — 새 헬스장 기구 세팅 기록)
      let mb2=det.querySelector('.ex-memo-btn');
      if(!mb2){
        mb2=document.createElement('button');mb2.className='ex-memo-btn';mb2.type='button';
        mb2.setAttribute('onclick','ExLog.toggleMemo(this)');
        bb.insertAdjacentElement('afterend',mb2);
      }
      const mm=this.memoOf(name);
      mb2.classList.toggle('has',!!mm);
      mb2.textContent=mm?('📝 '+mm):'📝 세팅 메모';
      // 휴식시간 칩 (모든 종목 — 기본값과 다르면 강조)
      let rb=det.querySelector('.ex-rest-btn');
      if(!rb){
        rb=document.createElement('button');rb.className='ex-rest-btn';rb.type='button';
        rb.setAttribute('onclick','ExLog.toggleRestCfg(this)');
        mb2.insertAdjacentElement('afterend',rb);
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
        bb.before(lb);
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
        if(!brow){brow=document.createElement('div');brow.className='ex-brand-row';bb.before(brow);}
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
          }).join('');
        }
      }
      // 통증 이력 경고 (canon 기준 최근 1건 — 재도전 시 상기)
      let pw=det.querySelector('.ex-pain-warn');
      const ph2=this._lastPain(name);
      if(ph2){
        if(!pw){pw=document.createElement('div');pw.className='ex-pain-warn';log.prepend(pw);}
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
          const anchor3=det.querySelector('.ex-week-target');
          if(anchor3)det.insertBefore(gc,anchor3.nextSibling);else det.insertBefore(gc,det.firstChild);
        }
        gc.innerHTML=this._gripChipHtml(name);
      }else if(gc){gc.remove();}
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
    const ROW=(date,day,name,setNo,weight,reps,vol,ts,wu,rpe,pain,setId,meta)=>{
      const k=date+'|'+name+'|'+setNo;if(seen.has(k))return;seen.add(k);
      rows.push({date,day,name,setNo,weight,reps,vol,ts,wu,rpe,pain,setId,meta}); // 필드 순서 고정
    };
    Object.keys(this.data).sort().forEach(date=>{
      if(onlyDates&&!onlyDates.has(date))return;
      const s=this.data[date];if(!s)return;
      (s.exercises||[]).forEach(ex=>{
        if(!ex.sets?.length)return;
        ex.sets.forEach((set,i)=>{
          ROW(date,s.day||'',ex.name,i+1,set.weight,set.reps,Math.round(_ldW(set)*set.reps),set.ts||null,set.warmup?1:'',set.rpe||'',set.pain?1:'',set._id,RecordModel.meta(ex.name,set,ex.exerciseId));
        });
      });
      (s.cardio||[]).forEach((c,i)=>{
        if(!(+c.min>0))return;
        ROW(date,s.day||'','🏃 '+(c.type||'유산소'),i+1,0,+c.min,0,c.ts||null,'','','',c._id,{...(c.km!=null?{km:c.km}:{}),...(c.incline!=null?{incline:c.incline}:{})}); // 유산소도 wu/rpe/pain 빈칸으로 동일 형태
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

