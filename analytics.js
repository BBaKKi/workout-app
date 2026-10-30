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
    this.renderSleep();this.renderWeek();this.renderVolume();this.renderVolTrend();this.renderTrends();this.renderWeekSummary();this.renderPRBoard();this.renderCalendar();
    if(window.AppFeatures?.ready)AppFeatures.renderWeekly();
  },
  jumpTo(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},
  // 루틴 설정과 같은 기간을 표시합니다.
  renderPhase(){
    const start=new Date(TRAINING_PLAN.start+'T12:00:00'),end=new Date(TRAINING_PLAN.end+'T12:00:00');
    const pct=Math.max(0,Math.min(100,(Date.now()-start)/(end-start)*100));
    const label=document.getElementById('ph-label'),days=document.getElementById('ph-days'),bar=document.getElementById('ph-prog');
    if(label)label.textContent='연말 목표 · 골격근량 '+IB_GOALS.sm+'kg · 체지방률 '+IB_GOALS.bf+'%';if(days)days.textContent=TRAINING_PLAN.start+'–'+TRAINING_PLAN.end+' · 체지방 감소와 근육 증가';if(bar)bar.style.width=pct+'%';
    const rule=document.getElementById('weight-rule');if(rule)rule.textContent='체중 '+IB_GOALS.wt+'kg은 참고값입니다. 체지방률 '+IB_GOALS.bf+'% 이하·골격근량 '+IB_GOALS.sm+'kg 이상을 목표로 하며, 체중만으로 성공·실패를 판단하지 않습니다.';
  },
  // ── 수면: 지금 이 사람의 최대 제약이 훈련량이 아니라 수면인데, 앱은 기록만 하고 목표도 피드백도 없었다.
  // 볼륨·RPE에는 목표·추세·배너가 다 있으면서 정작 병목 축만 측정에 머물면 행동이 바뀌지 않는다.
  SLEEP_GOAL:7,
  // ── 순환 완주 추적 ─────────────────────────────────────────────────────────
  // KPI를 「순환 완주 8일 이내」로 정해놓고 화면에는 없었다. 8/22~8/30 사이클에서 Legs A가
  // 통째로 빠진 것도 사후에 기록을 뒤져서야 발견했다. 진행 중인 한 바퀴를 실시간으로 보여준다.
  cycleProgress(){
    if(typeof ExLog==='undefined')return null;
    const data=ExLog.activeData||{}, today=_todayKey();
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
    const data=ExLog.activeData||{}, base=new Date(_todayKey()+'T12:00:00');
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
    const G=this.SLEEP_GOAL, data=ExLog.activeData||{}, base=new Date(_todayKey()+'T12:00:00');
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
  async _logData(){try{if(typeof ExLog!=='undefined'&&ExLog.activeData&&Object.keys(ExLog.activeData).length)return ExLog.activeData;}catch(_){}try{
      const l=await window.storage.list('wl_v2:');const out={};
      for(const k of ((l&&l.keys)||[]).sort()){const v=await window.storage.get(k);if(v)Object.assign(out,JSON.parse(v.value)||{});}
      return RecordModel.activeData(out);
    }catch(_){return{};}},
  _weekRange(){
    const now=new Date();const dow=now.getDay();
    const ws=new Date(now);ws.setDate(now.getDate()-(dow===0?6:dow-1));ws.setHours(0,0,0,0);
    const we=new Date(ws);we.setDate(ws.getDate()+6);we.setHours(23,59,59,999);
    return{ws,we};
  },
  _isTimed(n){return /플랭크|데드행|파머스 워크/.test(n||'');},
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
    const goalHtml='<div class="vol-goal"><div class="vol-goal-top"><span class="vol-goal-pct'+(gPct>=100?' hit':'')+'">'+gPct+'%'+(gPct>=100?' 🎉':'')+'</span><span class="vol-goal-sub">6세션 기본 편성 대비 '+(gDone%1?gDone.toFixed(1):gDone)+'/'+gTarget+'세트</span></div><div class="vol-goal-bar"><div class="vol-goal-fill" style="width:'+Math.min(100,gPct)+'%"></div></div></div>';
    const shown=order.filter(m=>!OPT[m]||vol[m]>0);
    const max=Math.max(10,...shown.map(m=>vol[m]));
    box.innerHTML=goalHtml+'<div class="plan-vol-head">이번 주 누적 세트 · 부위별</div>'+shown.map(m=>{
      const v=vol[m];const w=Math.round(v/max*100);const low=PRI[m]&&v<(RECO_TARGET[m]||0);
      const vt=(v%1===0?String(v):v.toFixed(1));
      return '<div class="pv-row"><span class="pv-nm">'+m+(PRI[m]?' ⭐':'')+'</span><div class="pv-track"><div class="pv-fill" style="width:'+w+'%;background:'+COL[m]+'"></div></div><span class="pv-val'+(low?' low':'')+'">'+vt+'</span></div>';
    }).join('')+this._rebalanceHtml(vol)+'<div class="plan-vol-note">주동근 직접 본세트 · 비교 기준은 기본 6세션 편성량이며 한 주 의무량이 아닙니다.</div>'+this._vol4Html(data,order,COL);
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
        return'<div class="v4-row"><span class="v4-nm">'+m+'</span><div class="v4-bars">'+bars+'</div><span class="v4-val">'+v4[m].map(fmt).join(' · ')+' <small>/6세션 '+t+'</small></span></div>';
      }).join('')
      +'<div class="v4-note">막대 4개 = 3주 전 → 이번 주. 진한 색 = 6세션 기본 편성량 이상.</div></div></details>';
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
  // ── 주간 볼륨 추이(8주): 부위 카테고리별 스택 막대 — 볼륨 축적/수행 변화를 한눈에 ──
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
        const cn=(typeof ExLog!=='undefined')?ExLog.canon(ex.name):ex.name; // 원래 종목명별로 독립 집계
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
    let sleepBanner='';
    try{
      const sb=(typeof ExLog!=='undefined'&&ExLog.sleepBottleneck)?ExLog.sleepBottleneck():null;
      if(sb)sleepBanner='<div class="tr-sleep">🛏 <b>회복 병목: 수면</b> — 2주 평균 <b>'+sb.avg.toFixed(1)+'h</b> (이번 주 '+sb.w0.toFixed(1)+'h · 전주 '+sb.w1.toFixed(1)+'h). '
        +'수면 부족은 회복 용량 자체를 낮춰 훈련량을 줄여도 원인이 남습니다. 지금은 증량 페이스보다 <b>수면 복구가 상한</b>입니다.</div>';
    }catch(_){}
    box.innerHTML=sleepBanner+rowsHtml;
  },
  toggleAlt(btn,name){
    const row=btn.closest('.tr-row');const panel=row&&row.querySelector('.tr-alt');if(!panel)return;
    if(panel.classList.contains('open')){panel.classList.remove('open');panel.innerHTML='';return;}
    const mu=this.muscleOf(name);const bucket=mu?mu.p:null;
    const lib=(window.EXERCISE_LIBRARY||[]).filter(e=>!e.archived);
    const self=this;
    const alts=lib.filter(function(e){const m=self.muscleOf(e.name);return m&&m.p===bucket&&e.name!==name;}).slice(0,6);
    if(!alts.length){panel.innerHTML='<div class="tr-alt-empty">같은 부위 대체 종목이 도감에 없습니다.</div>';}
    else{panel.innerHTML='<div class="tr-alt-hd">같은 부위('+(bucket||'')+') 대체 종목 — 반복 정체 시 교체 고려</div>'+alts.map(function(e){return '<div class="tr-alt-row"><span class="tr-alt-nm">'+e.name+'</span><button class="tr-alt-add" onclick="ExLog.addExternal(\''+e.name.replace(/'/g,"\\'")+'\');this.textContent=\'✓ 추가됨\';this.disabled=true">＋추가</button></div>';}).join('');}
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
      +'<div class="ws-cell"><div class="ws-v">'+days+'<span class="ws-u">일</span></div><div class="ws-l">'+(off===0?'이번 주':'해당 주')+' 운동</div></div>'
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
  _fmtSets(sets,name){
    if(name&&sets.some(s=>RecordModel.unit(name,s)!=='reps'))return sets.map(s=>RecordModel.formatSet(name,s)).join(', ');
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
          const e1=!ExLog.isTimed(e.name)&&_ldW(top)>0?' (e1RM '+_e1Of(_ldW(top),top.reps).toFixed(1)+')':'';
          return '  - '+e.name+': '+this._fmtSets(sets,e.name)+e1;
        });
      const cd=(d.cardio||[]).map(c=>c.type+' '+c.min+'분'+(c.km!=null?' · '+c.km+'km':'')+(c.incline!=null?' · 경사 '+c.incline+'%':''));
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
