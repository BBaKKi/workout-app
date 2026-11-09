const IB_GOALS={...TRAINING_PLAN.goals};
const GOAL_MODEL={
  fatOf:(wt,bf)=>wt*bf/100,lbmOf:(wt,bf)=>wt*(1-bf/100),
  judge(wt,bf,sm){return {cond:[
    {k:'체지방률 '+IB_GOALS.bf+'% 이하',ok:Number.isFinite(bf)&&bf<=IB_GOALS.bf,v:Number.isFinite(bf)?bf.toFixed(1)+'%':'—',m:'같은 조건에서 측정한 추세와 함께 확인'},
    {k:'골격근량 '+IB_GOALS.sm+'kg 이상',ok:Number.isFinite(sm)&&sm>=IB_GOALS.sm,v:Number.isFinite(sm)?sm.toFixed(1)+'kg':'—',m:'수분 변동과 운동 수행을 함께 확인'}]};}
};
const Backup={
  KEYS:['retired_links_v7','exercise_favorites_v1','plan_v3','routine_profile','brand_coef','ex_load','deload_v1','inbody_dirty','sync_dirty','sync_del','sync_last_ok','plan_v2','inbody_log','plan_blood_v1','gs_script_url','ex_alias','block_v1','last_backup','ex_base','ex_memo','ex_rest','dl_grip_start'],
  PREFIXES:['wl_v2:'], // 운동 기록 월 키 (wl_v2:YYYY-MM) — 단일 키(wl_v2)는 내보내지 않음(이관 후 낡은 사본이라 백업 부풀림 방지)
  MERGE_KEYS:['ex_memo','ex_base','ex_rest','ex_alias','brand_coef','ex_load'], // 가져오기 시 덮어쓰기 대신 병합 — 로컬에서 저장한 세팅 메모·기본무게·휴식·별칭이 지워지지 않게
  async restoreSnapshot(){try{const r=await window.storage.get('restore_backup');if(!r){this._msg('복원 전 백업이 없습니다.');return;}document.getElementById('bk-ta').value=r.value;this._msg('복원 전 백업을 열었습니다. 파일 저장 또는 가져오기를 선택하세요.');}catch(e){this._msg('복원 전 백업을 열지 못했어요. '+e.message,true);}},
  _allowed(k){return this.KEYS.includes(k)||k==='wl_v2'/*레거시 백업 파일 가져오기 호환*/||this.PREFIXES.some(p=>k.startsWith(p));},
  _msg(t,err){const el=document.getElementById('bk-msg');if(!el)return;el.textContent=t;el.classList.toggle('err',!!err);},
  // ── 데이터 점검: 도감 미매칭·0kg 본세트·미래 날짜 등 이상치 나열 ──
  async runCheck(){
    const el=document.getElementById('bk-check');if(!el)return;
    const out=[];
    try{
      const data=(typeof ExLog!=='undefined'&&ExLog.activeData)||{};
      const today=_todayKey();
      const future=Object.keys(data).filter(k=>k>today&&(data[k].exercises||[]).some(e=>(e.sets||[]).length));
      if(future.length)out.push('📅 미래 날짜 기록: '+future.join(', '));
      const hist=[...new Set(Object.values(data).flatMap(s=>(s.exercises||[]).map(e=>e.name)))];
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
    el.innerHTML=out.length?out.map(o=>'<div class="bk-check-row">'+o+'</div>').join(''):'<div class="bk-check-row ok">✓ 이상 없음 — 기록 형식에 이상이 없습니다</div>';
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
    if(!last){box.innerHTML='<div class="ib-no-data">아직 측정 기록이 없습니다.<br>아래 버튼으로 첫 인바디 수치를 입력하세요.</div>';if(note)note.textContent='';this.renderRecomp([]);return;}

    const FIELDS=[
      {key:'wt',lbl:'체중',unit:'kg',goal:IB_GOALS.wt,col:'#085041',dir:-1,wide:true,
       sub:()=>IB_GOALS.wt+'kg은 참고값 · 체지방률과 골격근량으로 목표 확인'},
      {key:'sm',lbl:'골격근량',unit:'kg',goal:IB_GOALS.sm,col:'#3B6D11',dir:1,
       sub:v=>{const s=(window.RecordCache?.summary()?.firstInbody||log[0])?.sm??v;const d=(v-s).toFixed(1);const r=(IB_GOALS.sm-v).toFixed(1);return(d>=0?'+':'')+d+'kg 변화 · 잔여 +'+Math.max(0,r)+'kg';}},
      {key:'bf',lbl:'체지방률',unit:'%',goal:IB_GOALS.bf,col:'#185FA5',dir:-1,
       sub:v=>{const s=(window.RecordCache?.summary()?.firstInbody||log[0])?.bf??v;const d=(v-s).toFixed(1);const r=(v-IB_GOALS.bf).toFixed(1);return(d<0?d:'+'+d)+'%p 변화 · 잔여 −'+Math.max(0,r)+'%p';}}
    ];

    const pct=(f,v)=>{
      if(f.key==='wt')return null;
      if(f.dir===1?v>=f.goal:v<=f.goal)return 100;
      const start=(window.RecordCache?.summary()?.firstInbody||log[0])?.[f.key]??v,goal=f.goal;
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
        '<div class="plan-stat-vals"><span class="plan-stat-cur">'+vStr+'</span><span class="plan-stat-unit">'+f.unit+'</span><span class="plan-stat-sep">→</span><span class="plan-stat-tgt">'+(f.key==='wt'?'참고 '+f.goal:f.goal)+(f.unit==='%'?'%':'')+(f.unit==='kg'?'kg':'')+'</span></div>'+
        (f.key==='wt'?'':'<div class="plan-stat-bar"><div class="plan-stat-fill" style="width:'+p+'%;background:'+f.col+'"></div></div>')+
        '<div class="plan-stat-sub">'+f.sub(v)+'</div>'+
        spark(f.key,f.col)+
        '</div>';
    });
    const J=GOAL_MODEL.judge(last.wt,last.bf,last.sm);
    html='<div class="goal-chk">'+J.cond.map(c=>'<div class="gchk '+(c.ok?'ok':'no')+'"><span class="gk">'+c.k+'</span><span class="gv">'+c.v+'</span><span class="gm">'+c.m+'</span></div>').join('')+'</div><div class="ib-signal">최근 인바디의 단일 측정값입니다. 같은 조건의 체성분 추세, 아침 체중 7일 평균, 허리둘레와 운동 기록을 함께 확인하세요.</div>'+html;
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
      {key:'ab',lbl:'복부지방률',unit:'',col:'#BA7517',sub:()=> '참고 목표 ≤ '+IB_GOALS.ab.toFixed(2)+' · 같은 조건에서 추세 확인'},
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
    this.renderRecomp(log);
    this.renderProjection();
  },
  // Use an explicit recent window; cache retention must not redefine a lifetime trend.
  renderRecomp(log){
    const el=document.getElementById('inbody-recomp');if(!el)return;
    const t=TrendModel.body(log||this._log||[],_todayKey());
    if(!t){el.innerHTML='';return;}
    const sign=v=>{const n=Math.round(v*10)/10;return (n>0?'+':'')+n.toFixed(1);};
    const row=(label,a,b,unit,deltaUnit=unit)=>'<div class="body-trend-row"><dt>'+label+'</dt><dd>'+a.toFixed(1)+unit+' → <strong>'+b.toFixed(1)+unit+'</strong><small>'+sign(b-a)+deltaUnit+'</small></dd></div>';
    let rows=row('체중',t.first.wt,t.last.wt,'kg')+row('체지방량 · 계산',t.fatStart,t.fat,'kg')+row('체지방률',t.first.bf,t.last.bf,'%','%p');
    if(t.smStart!==null&&t.smLast!==null)rows+=row('골격근량 · 측정',t.smStart,t.smLast,'kg');
    let pair='';
    if(t.previous){const d=sign(t.fatDelta);pair='<p class="body-trend-pair">직전 '+_esc(t.previous.date)+' 대비 체지방량 '+d+'kg. '+(t.last.bf<t.previous.bf&&Math.abs(t.fatDelta)<0.1?'체지방률은 낮아졌지만 계산한 지방량 변화는 0.1kg 미만입니다.':'체지방률과 체중을 함께 계산한 값입니다.')+'</p>';}
    el.innerHTML='<section class="ib-recomp"><div class="rc-hd">최근 측정 비교 · '+t.span+'일 / '+t.count+'회</div><p class="trend-note">'+_esc(t.first.date)+' → '+_esc(t.last.date)+' · 마지막 측정 기준 최근 28일 안의 기록</p><dl class="body-trend-rows">'+rows+'</dl>'+pair+'<p class="rc-note">체지방량 = 체중 × 체지방률 ÷ 100. 수분·식사·운동 시점에 따라 수치가 달라집니다. 골격근량 변화만으로 실제 근육 증감이나 식사 부족을 단정하지 않습니다.'+(t.count<3||t.span<14?' 관찰 기간이 짧아 같은 조건의 측정이 더 필요합니다.':'')+(t.age>14?' 마지막 측정은 '+t.age+'일 전입니다. 현재 상태를 확인하려면 새 측정이 필요합니다.':'')+'</p></section>';
  },
  renderProjection(){
    const box=document.getElementById('inbody-projection');if(!box)return;
    box.innerHTML='<div class="prj-card"><div class="prj-hd">'+TRAINING_PLAN.end+' 목표</div><div class="prj-row"><b>체성분</b><span>골격근량 '+IB_GOALS.sm+'kg 이상 · 체지방률 '+IB_GOALS.bf+'% 이하</span></div><div class="prj-row"><b>체중 참고</b><span>'+IB_GOALS.wt+'kg · 달성 판정에서 제외</span></div><div class="prj-note">설정한 목표이며 도달을 보장하는 예측은 아닙니다. 체지방률이 더 낮거나 골격근량이 더 높아져도 목표 달성으로 표시합니다.</div></div>';
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
