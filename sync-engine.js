/* API v7: pull before write, date-level CAS, stable set IDs and deletion tombstones.
 * Portable backups deliberately exclude server baselines and connection secrets.
 */
(function(){
 'use strict';
 const kinds=['weight','inbody','workout','session'];
 const read=(k,f)=>{const v=localStorage.getItem(k);return v===null?f:JSON.parse(v);};
 const copy=x=>JSON.parse(JSON.stringify(x)),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const D=window.DataSync={conflicts:[],busy:false,visibleConflicts:8,
  kindLabel(kind){return {workout:'운동',weight:'체중',inbody:'인바디',session:'당일 계획'}[kind]||kind;},
  async diagnose(){
   const box=document.getElementById('sync-diagnosis');box.hidden=false;box.textContent='시트를 읽어 연결 상태를 확인하고 있어요…';
   try{const url=localStorage.getItem('gs_script_url');if(!url)throw new Error('연결 설정에서 URL과 연결키를 먼저 저장하세요.');
    const result=await this.request(url,{mode:'sync_diagnose'});if(result.type!=='diagnosis'||!result.source)throw new Error('Apps Script 7.2.0 이상을 새 버전으로 배포하세요.');
    this.source=result.source;this.serverBuild=result.serverBuild;this.renderDiagnosis();
   }catch(e){box.textContent=e.message;}
  },
  renderDiagnosis(){
   const s=this.source,box=document.getElementById('sync-diagnosis');if(!s||!box)return;box.hidden=false;
   box.innerHTML='<b>'+esc(s.name)+'</b><p>서버 '+esc(this.serverBuild||'')+' · 연결된 파일을 직접 확인하세요.</p>'+
    (/^[A-Za-z0-9_-]+$/.test(s.id)?'<a href="https://docs.google.com/spreadsheets/d/'+s.id+'/edit" target="_blank" rel="noopener noreferrer">연결된 구글 시트 열기 ↗</a>':'')+
    '<div class="sync-source-rows">'+kinds.map(k=>{const d=s.sheets[k]||{};return '<div><strong>'+this.kindLabel(k)+'</strong><span>'+esc(d.error||(d.status==='missing'?'해당 탭 없음':(d.name+' · '+d.rows+'행 / 유효 기록 '+d.activeDates+'일')))+'</span></div>';}).join('')+'</div><p>파일의 탭: '+esc((s.tabs||[]).join(' · '))+'</p><small>진단은 셀을 변경하지 않습니다. 빈 목록은 삭제의 증거가 아닙니다.</small>';
  },
  activity:read('sync_activity_v1',[]),
  log(action,kind,dates,note=''){
   if(!dates.length&&!note)return;this.activity.unshift({at:new Date().toISOString(),action,kind,dates:[...new Set(dates)],note});this.activity=this.activity.slice(0,100);window.storage.set('sync_activity_v1',JSON.stringify(this.activity)).catch(e=>SafeStore.report(e));this.renderActivity();
  },
  renderActivity(){const box=document.getElementById('sync-activity');if(!box)return;const labels={sent:'시트에 저장',received:'시트에서 수신',conflict:'선택 대기',local:'이 기기 기록 적용',cloud:'시트 기록 적용',error:'동기화 실패',settings:'설정 동기화'};box.innerHTML=this.activity.length?this.activity.map(e=>'<div class="sync-activity"><time>'+esc(new Date(e.at).toLocaleString())+'</time><b>'+esc(labels[e.action]||e.action)+' · '+esc({workout:'운동',weight:'체중',inbody:'인바디',session:'당일 계획',settings:'루틴·기구 설정'}[e.kind]||'')+'</b><div>'+esc((e.dates||[]).join(', '))+'</div>'+esc(e.note)+'</div>').join(''):'아직 동기화 내역이 없어요.';},
  validUrl(url){try{const u=new URL(url);return u.origin==='https://script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)&&!u.search&&!u.hash;}catch(_){return false;}},
  token(url){return read('gs_tokens_v5',{})[url]||'';},
  async request(url,body){
   if(!this.validUrl(url))throw new Error('Apps Script의 /exec 배포 URL을 입력하세요.');
   const token=this.token(url);if(!token)throw new Error('연결키를 입력하세요. 구름 버튼에서 설정할 수 있어요.');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
   try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({...body,token}),signal:controller.signal,redirect:'follow'});
    if(!r.ok)throw new Error('서버 응답 '+r.status);const j=await r.json();
    if(!j||j.ok!==true)throw new Error(j?.error||'저장 확인 응답이 없습니다.');
    if(j.apiVersion!==7)throw new Error('Apps Script API v7를 새 버전으로 배포하세요.');return j;
   }finally{clearTimeout(timer);}
  },
  state(url){const s=read('record_sync_v5',{})[url]||{base:{workout:{},weight:{},inbody:{}},initialized:false};s.base.session||={};if(!s.format7){for(const kind of ['workout','session'])for(const b of Object.values(s.base[kind]||{})){try{const h=JSON.parse(b.hash);if(kind==='workout'&&Array.isArray(h))h.forEach(row=>{if(row.length===8)row.push(RecordModel.meta(row[0],{}));});if(kind==='session'&&Array.isArray(h)&&h.length===2)h.push({cond:{},note:''});b.hash=JSON.stringify(h);}catch(_){}}s.format7=true;}return s;},
  statesWith(url,state){return {...read('record_sync_v5',{}),[url]:state};},
  noteLocal(kind,date){
   const url=localStorage.getItem('gs_script_url');if(!url)return;const state=this.state(url);
   // Only edits made after this device has seen the server can create a known-empty base.
   if(state.initialized&&!state.base[kind][date]){state.base[kind][date]={revision:'0',hash:this.fingerprint(this.empty(date,kind),kind)};window.storage.set('record_sync_v5',JSON.stringify(this.statesWith(url,state))).catch(e=>SafeStore.report(e));}
  },
  uuid(){return crypto.randomUUID();},
  async digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');},
  async prepareIds(){
   const jobs=[];Object.entries(ExLog.data).forEach(([date,s])=>{
    (s.exercises||[]).forEach(e=>{e.exerciseId||=RecordModel.exerciseId(e.name);(e.sets||[]).forEach((st,i)=>{if(!st._id)jobs.push(this.digest([date,e.name,i+1]).then(h=>{st._id='legacy-'+h.slice(0,32);ExLog.markDirty(date);}));});});
    (s.cardio||[]).forEach((c,i)=>{if(!c._id)jobs.push(this.digest([date,'🏃 '+(c.type||'유산소'),i+1]).then(h=>{c._id='legacy-'+h.slice(0,32);ExLog.markDirty(date);}));});
   });await Promise.all(jobs);await ExLog.save();
  },
  assignNewIds(session){(session.exercises||[]).forEach(e=>(e.sets||[]).forEach(s=>{s._id||=this.uuid();}));(session.cardio||[]).forEach(s=>{s._id||=this.uuid();});},
  empty(date,kind){return kind==='workout'?{date,revision:'0',deleted:true,rows:[]}:{date,revision:'0',deleted:true,entry:null};},
  local(kind){
   if(kind==='workout'){
    const map={};ExLog._syncRows().forEach(r=>{(map[r.date]||={date:r.date,rows:[]}).rows.push(r);});
    // Keep empty edited dates so deletion of the last set is transmitted.
    for(const d of ExLog._dirty)map[d]||={date:d,rows:[]};return map;
   }
   if(kind==='session')return Object.fromEntries(Object.entries(ExLog.data).filter(([,s])=>s.routineSnapshots||s.dayOverrides||s.cond||s.note!==undefined).map(([date,s])=>[date,{date,entry:{date,...WorkoutTools.meta(s)}}]));
   if(kind==='weight')return Object.fromEntries(Object.entries(AppFeatures.weights).map(([d,e])=>[d,{date:d,entry:e}]));
   return Object.fromEntries((InBody._log||[]).map(e=>[e.date,{date:e.date,entry:e}]));
  },
  fingerprint(record,kind){
   if(kind==='workout')return JSON.stringify((record.rows||[]).map(r=>[r.name,Number(r.setNo),r.day||'',Number(r.weight),Number(r.reps),+!!(+r.wu),Number(r.rpe)||0,+!!(+r.pain),RecordModel.meta(r.name,r.meta||{},r.meta?.exerciseId)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
   const e=record.entry;if(!e||e.deleted)return 'null';
   if(kind==='session')return JSON.stringify([e.snapshots||{},e.overrides||{},e.context||{cond:{},note:''}]);
   const keys=kind==='weight'?['date','wt']:['date','wt','sm','bf','ab','waist','vf','pa','bmr'];return JSON.stringify(keys.map(k=>e[k]??null));
  },
  isDirty(kind,date,local,base){
   const queued=kind==='workout'?ExLog._dirty.has(date):Object.hasOwn(read(kind==='weight'?'daily_weight_dirty':kind==='session'?'session_dirty_v1':'inbody_dirty',{}),date);
   return queued||!!(base&&base.hash!==this.fingerprint(local,kind));
  },
  acknowledge(kind,date,hash){
   const now=this.local(kind)[date]||this.empty(date,kind);if(this.fingerprint(now,kind)!==hash)return;
   if(kind==='workout')ExLog._dirty.delete(date);
   else{const key=kind==='weight'?'daily_weight_dirty':kind==='session'?'session_dirty_v1':'inbody_dirty',q=this.queueWrites[key]?JSON.parse(this.queueWrites[key]):read(key,{});delete q[date];this.queueWrites[key]=JSON.stringify(q);}
  },
  apply(record,kind){
   const date=record.date;
   if(kind==='workout'){
    const previous=ExLog.data[date]||{},s={...previous,day:record.rows[0]?.day||previous.day||ExLog.dayType(date),exercises:[],cardio:[]};
    for(const r of record.rows.slice().sort((a,b)=>a.setNo-b.setNo)){
     if(r.name.startsWith('🏃')){s.cardio.push({type:r.name.replace(/^🏃\s*/,''),min:+r.reps,ts:r.ts||null,_id:r.setId,...(r.meta||{})});continue;}
     let e=s.exercises.find(e=>e.name===r.name);if(!e){e={name:r.name,exerciseId:r.meta?.exerciseId||RecordModel.exerciseId(r.name),sets:[]};s.exercises.push(e);}
     e.sets.push({_id:r.setId,weight:+r.weight,reps:+r.reps,ts:r.ts||null,...ExLog._loadMeta(r.name,+r.weight,date),...(r.meta||{}),...(r.wu?{warmup:true}:{}),...(r.rpe?{rpe:+r.rpe}:{}),...(r.pain?{pain:true}:{})});
    }
    ExLog.data[date]=s;ExLog.markDirty(date);
   }else if(kind==='session'){
    const s=ExLog.data[date]||{day:Object.keys(record.entry?.snapshots||{})[0]||ExLog.dayType(date),exercises:[]};if(record.entry?.context){s.cond=record.entry.context.cond;s.note=record.entry.context.note;}s.routineSnapshots=record.entry?.snapshots||{};s.dayOverrides=record.entry?.overrides||{};ExLog.data[date]=s;ExLog.markDirty(date);
   }else if(kind==='weight'){
    AppFeatures.weights[date]=record.entry||{date,deleted:true,updatedAt:new Date().toISOString()};
   }else{InBody._log=InBody._log.filter(x=>x.date!==date);if(record.entry)InBody._log.push(record.entry);InBody._log.sort((a,b)=>a.date.localeCompare(b.date));}
  },
  persist(url,state){
   const values={...this.queueWrites,record_sync_v5:JSON.stringify(this.statesWith(url,state)),sync_dirty:JSON.stringify([...ExLog._dirty]),sync_del:JSON.stringify(ExLog._delQ.filter(k=>ExLog._dirty.has(k.date))),inbody_log:JSON.stringify(InBody._log||[]),daily_weight_v1:JSON.stringify(AppFeatures.weights)};
   for(const m of ExLog._dirtyMonths)values['wl_v2:'+m]=JSON.stringify(Object.fromEntries(Object.entries(ExLog.data).filter(([d])=>d.slice(0,7)===m)));
   SafeStore.transaction(values);ExLog._dirtyMonths.clear();ExLog._delQ=JSON.parse(values.sync_del);this.queueWrites={};
  },
  conflict(kind,local,remote){return {url:this.currentUrl,kind,date:remote.date,local:copy(local),remote:copy(remote),localHash:this.fingerprint(local,kind)};},
  validateSnapshot(snapshot){
   if(snapshot.type!=='snapshot')throw new Error('시트 스냅샷 응답이 올바르지 않습니다.');
   for(const kind of kinds){if(!Array.isArray(snapshot[kind]))throw new Error('기록 목록이 없습니다.');const seen=new Set();for(const r of snapshot[kind]){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||typeof r.revision!=='string'||seen.has(r.date))throw new Error('중복되거나 잘못된 서버 날짜입니다.');seen.add(r.date);if(kind==='session'&&r.entry)validateSession(r.entry,r.date);if(kind==='workout'){if(!Array.isArray(r.rows))throw new Error('운동 배열이 없습니다.');r.rows.forEach(x=>{validateRecordMeta(x.meta);if(x.date!==r.date||typeof x.name!=='string'||/[<>]/.test(x.name)||!x.setId)throw new Error('운동 응답 형식이 잘못되었습니다.');});}}}
  },
  async run(url){
   if(SafeStore.error)throw new Error('기기 저장 오류를 먼저 해결하세요.');
   this.currentUrl=url;this.busy=true;this.render();this.queueWrites={};const originalDirty=new Set(ExLog._dirty);
   try{
    await InBody.load();await this.prepareIds();
    const snapshot=await ExLog.api(url,{mode:'sync_pull'});this.validateSnapshot(snapshot);
    const state=this.state(url),conflicts=[];
    if(snapshot.source){this.source=snapshot.source;this.serverBuild=snapshot.serverBuild;this.renderDiagnosis();
     if(state.sourceId&&state.sourceId!==snapshot.source.id)throw new Error('같은 배포 URL의 연결 파일이 변경됐습니다. 연결 진단에서 파일을 확인하고 기존 기록 파일로 연결하세요.');
     state.sourceId=snapshot.source.id;
    }
    for(const kind of kinds){
     const remote=Object.fromEntries(snapshot[kind].map(r=>[r.date,r])),locals=this.local(kind),base=state.base[kind],writes=[],received=[];
     const dates=new Set([...Object.keys(remote),...Object.keys(locals),...Object.keys(base)]);
     for(const date of dates){
      const r=remote[date]||this.empty(date,kind),l=locals[date]||this.empty(date,kind),b=base[date];
      const lh=this.fingerprint(l,kind),rh=this.fingerprint(r,kind),dirty=this.isDirty(kind,date,l,b);
      if(lh===rh){
       // Adopt stable IDs on the first connection without modifying the recorded kg/reps.
       if(kind==='workout'&&r.rows.length)this.apply(r,kind);
       base[date]={revision:r.revision,hash:lh};this.acknowledge(kind,date,lh);
      }else if(!remote[date]&&locals[date]&&b&&b.revision!=='0'){
       // A missing tab/date is not a deletion tombstone. Never erase local history.
       conflicts.push(this.conflict(kind,l,r));
      }else if(b&&b.revision===r.revision&&dirty){
       writes.push({date,expectedRevision:r.revision,...(kind==='workout'?{rows:l.rows}:{entry:l.entry})});
      }else if((b&&!dirty)||(!b&&!locals[date]&&!dirty)){
       this.apply(r,kind);base[date]={revision:r.revision,hash:rh};received.push(date);
      }else conflicts.push(this.conflict(kind,l,r));
     }
     // Read/merge decisions are persisted before network writes, including acknowledged IDs.
     this.persist(url,state);this.log('received',kind,received);
     for(let i=0;i<writes.length;i+=50){
      const sent=writes.slice(i,i+50),hashes=new Map(sent.map(x=>[x.date,this.fingerprint(x,kind)]));
      const response=await ExLog.api(url,{mode:'sync_write',kind,items:sent});
      if(response.type!=='write'||response.kind!==kind||response.results?.length!==sent.length)throw new Error('저장 확인 건수가 일치하지 않습니다.');
      const returned=new Set();
      for(const item of response.results){const r=item.record;if(!r||!hashes.has(r.date)||returned.has(r.date))throw new Error('저장 확인 날짜가 일치하지 않습니다.');returned.add(r.date);
       if(item.status==='conflict'){conflicts.push(this.conflict(kind,this.local(kind)[r.date]||this.empty(r.date,kind),r));continue;}
       if(item.status!=='ok'||typeof r.revision!=='string'||this.fingerprint(r,kind)!==hashes.get(r.date))throw new Error('서버 기록 확인이 일치하지 않습니다.');
       base[r.date]={revision:r.revision,hash:hashes.get(r.date)};this.acknowledge(kind,r.date,hashes.get(r.date));
      }
      this.persist(url,state);this.log('sent',kind,response.results.filter(x=>x.status==='ok').map(x=>x.record.date));
     }
    }
    state.initialized=true;this.persist(url,state);this.conflicts=conflicts;kinds.forEach(k=>this.log('conflict',k,conflicts.filter(c=>c.kind===k).map(c=>c.date)));
    await AppFeatures.syncPreferences(url);AppFeatures.renderSettings();
    await window.storage.set('sync_last_ok',new Date().toISOString());
   }catch(e){this.log('error','',[],e.message);originalDirty.forEach(d=>ExLog._dirty.add(d));throw e;}
   finally{this.busy=false;this.refreshUI();}
  },
  async resolve(index,choice){
   if(this.busy||ExLog._syncP)return;const c=this.conflicts[index];if(!c)return;
   if(choice==='cloud'&&c.remote.revision==='0'){ExLog.syncMessage='시트에 없는 기록은 삭제로 적용하지 않습니다. 연결 진단을 먼저 확인하세요.';ExLog.renderSyncStatus();return;}
   const local=this.local(c.kind)[c.date]||this.empty(c.date,c.kind);
   if(this.fingerprint(local,c.kind)!==c.localHash){ExLog.syncMessage='비교 중 이 기기 기록이 바뀌었어요. 다시 동기화해 비교하세요.';ExLog.renderSyncStatus();return;}
   const url=await ExLog.getScriptUrl();if(c.url&&c.url!==url){ExLog.syncMessage='연결 대상이 바뀌었어요. 다시 동기화해 비교하세요.';ExLog.renderSyncStatus();return;}this.busy=true;this.render();
   try{
    const all=await ExLog.api(url,{mode:'sync_pull'});this.validateSnapshot(all);
    const knownSource=this.state(url).sourceId;if(knownSource&&all.source?.id&&knownSource!==all.source.id)throw new Error('연결된 파일이 변경됐습니다. 기록을 적용하지 않았습니다.');
    const r=all[c.kind].find(x=>x.date===c.date)||this.empty(c.date,c.kind);
    if(r.revision!==c.remote.revision){this.conflicts[index]=this.conflict(c.kind,local,r);throw new Error('비교 중 시트 기록이 바뀌었어요. 최신 내용을 다시 선택하세요.');}
    // Always make a durable recovery copy before resolving a disagreement.
    await ExLog.save();const old=await Backup._collect();await window.storage.set('restore_backup',JSON.stringify({app:'fit-tracker',version:2,data:old,exported:new Date().toISOString()}));
    let chosen=r;
    if(choice==='local'){
     const item={date:c.date,expectedRevision:r.revision,...(c.kind==='workout'?{rows:local.rows}:{entry:local.entry})};
     const j=await ExLog.api(url,{mode:'sync_write',kind:c.kind,items:[item]});const result=j.results?.[0];
     if(!result||result.status!=='ok'){if(result?.record)this.conflicts[index]=this.conflict(c.kind,local,result.record);throw new Error('시트가 다시 변경됐어요. 다시 비교하세요.');}
     chosen=result.record;
    }
    // If the user typed during the request, keep their newer input queued.
    const now=this.local(c.kind)[c.date]||this.empty(c.date,c.kind);
    const state=this.state(url);this.queueWrites={};
    if(this.fingerprint(now,c.kind)===c.localHash){this.apply(chosen,c.kind);this.acknowledge(c.kind,c.date,this.fingerprint(chosen,c.kind));}
    state.base[c.kind][c.date]={revision:chosen.revision,hash:this.fingerprint(chosen,c.kind)};this.persist(url,state);
    this.conflicts.splice(index,1);this.log(choice,c.kind,[c.date]);ExLog.syncMessage='';ExLog._syncSoon();
   }catch(e){ExLog.syncMessage=e.message;}
   finally{this.busy=false;this.refreshUI();}
  },
  async connect(){
   const url=document.getElementById('sync-url-inp').value.trim(),token=document.getElementById('sync-token-inp').value.trim();
   if(!this.validUrl(url)||token.length<32){alert('정확한 /exec 배포 URL과 32자 이상의 연결키를 입력하세요.');return;}
   try{this.conflicts=[];this.render();SafeStore.transaction({gs_script_url:url,gs_tokens_v5:JSON.stringify({...read('gs_tokens_v5',{}),[url]:token})});ExLog.closeSync();await ExLog.syncToSheets(url);}
   catch(e){SafeStore.report(e);}
  },
  summary(record,kind){
   const empty=record.revision==='0'?'해당 날짜의 기록을 받지 못했습니다. 미저장·탭 누락·연결 대상을 확인하세요.':'삭제된 기록 / 빈 세트';
   if(kind==='workout')return record.rows.length?record.rows.map(r=>r.name+' #'+r.setNo+' · '+RecordModel.formatSet(r.name,{weight:+r.weight,reps:+r.reps,...(r.meta||{})})+(r.wu?' (워밍업)':'')+(r.rpe?' · RPE '+r.rpe:'')+(r.pain?' · 통증':'' )).join('\n'):empty;
   if(!record.entry||record.entry.deleted)return empty;
   const e=record.entry;
   if(kind==='session')return [...Object.entries(e.snapshots||{}).flatMap(([day,s])=>[day,...(s.rows||[]).map(r=>'  '+r.name+' · '+r.sets+'세트 × '+r.min+'–'+r.max+(r.skipped?' · 건너뜀':''))]),...Object.entries(e.overrides||{}).flatMap(([day,v])=>Object.entries(v).map(([from,to])=>day+' 교체: '+from+' → '+to)),e.context?.cond?.rate?'컨디션: '+e.context.cond.rate:'',e.context?.cond?.sleep!=null?'수면: '+e.context.cond.sleep+'시간':'',e.context?.note?'메모: '+e.context.note:''].filter(Boolean).join('\n')||'해당 날짜의 계획·메모가 비어 있습니다.';
   const labels={wt:'체중 (kg)',sm:'골격근량 (kg)',bf:'체지방률 (%)',ab:'복부지방률',waist:'허리둘레 (cm)',vf:'내장지방레벨',pa:'위상각',bmr:'기초대사량'};
   return Object.entries(labels).filter(([k])=>e[k]!=null).map(([k,label])=>label+': '+e[k]).join('\n');
  },
  render(){
   const box=document.getElementById('record-conflicts');if(!box)return;
   box.hidden=!this.conflicts.length;
   box.innerHTML='<div class="af-card-title">기록 차이 확인 <span class="count-badge">'+this.conflicts.length+'</span></div><p>날짜·종류별 차이입니다. 중복행 수가 아닙니다. 시트 쪽이 비어 있다면 연결 진단부터 확인하세요.</p><button type="button" data-diagnose>연결 진단 · 읽기 전용</button>'+this.conflicts.slice(0,this.visibleConflicts).map((c,i)=>'<details class="sync-diff"><summary><b>'+esc(c.date)+'</b><span>'+this.kindLabel(c.kind)+'</span><small>'+(c.remote.revision==='0'?'이 기기에만 있음':'양쪽 기록 다름')+'</small></summary><div class="af-pref-values"><div><b>이 기기</b><pre>'+esc(this.summary(c.local,c.kind))+'</pre></div><div><b>시트</b><pre>'+esc(this.summary(c.remote,c.kind))+'</pre></div></div><p>선택 전 이 기기의 복구용 백업을 보관합니다.</p><div class="af-tool-row"><button type="button" data-choice="local" data-index="'+i+'" '+(this.busy?'disabled':'')+'>이 기기 기록을 시트에 저장</button><button type="button" data-choice="cloud" data-index="'+i+'" '+(this.busy||c.remote.revision==='0'?'disabled':'')+'>시트 기록 적용</button></div></details>').join('')+(this.conflicts.length>this.visibleConflicts?'<button type="button" data-more>다음 8건 보기</button>':'');
  },
  refreshUI(){this.render();if(AppFeatures.ready){AppFeatures.renderWeights();ExLog.refresh();ExLog.injectTargets();PlanApp.renderAnalysis(true);InBody.render();ExLog.renderSyncStatus();}},
  mount(){
   const diagnostics=document.createElement('section');diagnostics.className='af-card';diagnostics.innerHTML='<details id="connection-details"><summary>시트 연결 확인</summary><p>기록이 없다고 나오면 실제로 연결된 파일과 읽기 상태를 확인하세요.</p><button type="button" id="diagnose-sync">연결 진단 · 읽기 전용</button><div id="sync-diagnosis" hidden role="status"></div></details>';document.getElementById('daily-weight').before(diagnostics);document.getElementById('diagnose-sync').onclick=()=>this.diagnose();
   const box=document.createElement('section');box.id='record-conflicts';box.className='af-card';box.hidden=true;diagnostics.after(box);box.addEventListener('click',e=>{const btn=e.target.closest('[data-choice]');if(btn)this.resolve(+btn.dataset.index,btn.dataset.choice);if(e.target.closest('[data-more]')){this.visibleConflicts+=8;this.render();}if(e.target.closest('[data-diagnose]')){document.getElementById('connection-details').open=true;diagnostics.scrollIntoView({block:'center'});this.diagnose();}});
   this.render();
   const history=document.createElement('section');history.className='af-card';history.innerHTML='<details><summary>동기화 활동 내역 · 최근 100건</summary><div id="sync-activity"></div></details>';box.after(history);this.renderActivity();
   // A second tab must reload before writing stale in-memory data over another tab.
   window.addEventListener('storage',e=>{if(e.key&&(e.key.startsWith('wl_v2:')||['plan_v3','plan_v2','daily_weight_v1','inbody_log','ex_equipment_v1','ex_base','ex_rest','ex_memo','ex_load','exercise_favorites_v1'].includes(e.key))&&!this.busy){SafeStore.blocked=true;SafeStore.externalChange=true;SafeStore.error='다른 탭에서 기록이 바뀌었어요. 현재 입력을 백업한 뒤 새로고침하세요.';SafeStore.render();}});
  }
 };
})();
