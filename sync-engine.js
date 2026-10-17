/* API v7: pull before write, date-level CAS, stable set IDs and deletion tombstones.
 * Portable backups deliberately exclude server baselines and connection secrets.
 */
(function(){
 'use strict';
 const kinds=['weight','inbody','workout','session'];
 const read=(k,f)=>{const v=localStorage.getItem(k);return v===null?f:JSON.parse(v);};
 const copy=x=>JSON.parse(JSON.stringify(x)),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Canonicalize representation only. Array order, exercise names, units and actual values remain significant.
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const numeric=v=>v==null||typeof v==='string'&&!v.trim()?null:Number.isFinite(Number(v))?Number(v):v;
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
   box.innerHTML='<b>'+esc(s.name)+'</b><p>앱 '+esc(document.querySelector('.brand-version')?.textContent||'')+' · 서버 '+esc(this.serverBuild||'확인 전')+'</p>'+
    (/^[A-Za-z0-9_-]+$/.test(s.id)?'<a href="https://docs.google.com/spreadsheets/d/'+s.id+'/edit" target="_blank" rel="noopener noreferrer">연결된 구글 시트 열기 ↗</a>':'')+
    '<div class="sync-source-rows">'+kinds.map(k=>{const d=s.sheets[k]||{},n=Object.values(this.local(k)).filter(r=>!['null','[]'].includes(this.fingerprint(r,k))).length;return '<div><strong>'+this.kindLabel(k)+' · 기기 '+n+'일</strong><span>'+esc(d.error||(d.status==='missing'?'해당 탭 없음':(d.name+' · '+d.rows+'행 / 유효 기록 '+d.activeDates+'일')))+'</span></div>';}).join('')+'</div><p>파일의 탭: '+esc((s.tabs||[]).join(' · '))+'</p><small>진단은 셀을 변경하지 않습니다. 빈 목록은 삭제의 증거가 아닙니다.</small>';
  },
  async inspect(){
   if(this.busy||ExLog._syncP)return;this.busy=true;this.comparisonError='';this.render();
   try{
    const url=await ExLog.getScriptUrl();if(!url)throw new Error('연결 설정에서 URL과 연결키를 먼저 저장하세요.');
    const snapshot=await this.request(url,{mode:'sync_pull'});this.validateSnapshot(snapshot);
    this.currentUrl=url;this.source=snapshot.source;this.serverBuild=snapshot.serverBuild;this.renderDiagnosis();
    const known=this.state(url).sourceId;if(known&&snapshot.source?.id&&known!==snapshot.source.id)throw new Error('연결된 파일이 변경됐습니다. 연결된 구글 시트 링크를 확인하세요.');
    const conflicts=[];
    for(const kind of kinds){const locals=this.local(kind),remote=Object.fromEntries(snapshot[kind].map(r=>[r.date,r]));
     for(const date of new Set([...Object.keys(locals),...Object.keys(remote)])){
      const l=locals[date]||this.empty(date,kind),r=remote[date]||this.empty(date,kind);
      if(this.fingerprint(l,kind)!==this.fingerprint(r,kind))conflicts.push(this.conflict(kind,l,r));
     }
    }
    this.conflicts=conflicts;this.lastComparedAt=new Date().toISOString();ExLog.syncMessage='';
   }catch(e){this.comparisonError=e.message;ExLog.syncMessage=e.message;}
   finally{this.busy=false;this.render();ExLog.renderSyncStatus();}
  },
  differenceLabel(c){
   const empty=kind=>kind==='workout'?'[]':'null';
   if(this.fingerprint(c.local,c.kind)===empty(c.kind))return c.local.revision==='0'?'시트에만 있음':'기기에서 삭제·비움';
   if(c.remote.revision==='0')return '시트에서 읽지 못함';
   if(this.fingerprint(c.remote,c.kind)===empty(c.kind))return '시트에서 삭제·비움';
   return '값 확인 필요';
  },
  differences(local,remote,kind){
   const lh=this.fingerprint(local,kind),rh=this.fingerprint(remote,kind);if(lh===rh)return [];
   if(remote.revision==='0')return ['시트 응답에 이 날짜가 없음 · 연결 파일·탭 확인 또는 최초 업로드 필요'];
   if(['null','[]'].includes(lh))return [local.revision==='0'?'기기에 없는 기록 · 시트에서 가져오기 가능':'기기에 삭제 또는 비어 있는 기록이 있음'];
   if(['null','[]'].includes(rh))return ['시트에 삭제 또는 비어 있는 기록이 있음'];
   const l=JSON.parse(lh),r=JSON.parse(rh);
   if(kind==='workout'){
    const result=[],labels=['운동명·세트 수','세트 번호·순서','요일·운동 분할','중량','횟수·시간·거리','워밍업 표시','RPE','통증 표시','단위·체중·부하 등 기록 정보'];
    labels.forEach((label,i)=>{if(stable(l.map(x=>x[i]))!==stable(r.map(x=>x[i])))result.push(label);});return result;
   }
   if(kind==='session')return ['계획 구성·저장 시각·출처','운동 교체','컨디션·수면·메모'].filter((_,i)=>stable(l[i])!==stable(r[i]));
   const labels=kind==='weight'?['날짜','체중']:['날짜','체중','골격근량','체지방률','복부지방률','허리둘레','내장지방레벨','위상각','기초대사량'];return labels.filter((_,i)=>stable(l[i])!==stable(r[i]));
  },
  report(){
   return {appVersion:document.querySelector('.brand-version')?.textContent||'',serverBuild:this.serverBuild||null,comparedAt:this.lastComparedAt||null,error:this.comparisonError||ExLog.syncMessage||null,
    source:this.source?{id:this.source.id,name:this.source.name,tabs:this.source.tabs,sheets:this.source.sheets}:null,
    local:Object.fromEntries(kinds.map(k=>{const entries=Object.values(this.local(k)).filter(r=>!['null','[]'].includes(this.fingerprint(r,k))),dates=entries.map(r=>r.date).sort();return [k,{days:dates.length,first:dates[0]||null,last:dates.at(-1)||null}];})),
    differences:this.conflicts.map(c=>({kind:c.kind,date:c.date,status:this.differenceLabel(c),fields:this.differences(c.local,c.remote,c.kind)}))};
  },
  async copyReport(){
   const text=JSON.stringify(this.report(),null,2),box=document.getElementById('sync-report-output');
   try{await navigator.clipboard.writeText(text);box.hidden=false;box.textContent='진단 내용을 복사했어요. 연결키·배포 URL·세트별 값·메모 본문은 포함하지 않습니다.';}
   catch(_){box.hidden=false;box.innerHTML='<label>아래 내용을 복사해 주세요<textarea readonly rows="10" aria-label="동기화 진단 내용"></textarea></label>';const input=box.querySelector('textarea');input.value=text;input.select();}
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
  state(url){const s=read('record_sync_v5',{})[url]||{base:{workout:{},weight:{},inbody:{}},initialized:false};s.base.session||={};if(s.comparisonVersion!==2){
   for(const kind of kinds)for(const b of Object.values(s.base[kind]||{})){try{
    const h=JSON.parse(b.hash);if(h===null)continue;
    let record;
    if(kind==='workout')record={rows:h.map(r=>({name:r[0],setNo:r[1],day:r[2],weight:r[3],reps:r[4],wu:r[5],rpe:r[6],pain:r[7],meta:r[8]||{}}))};
    else if(kind==='session')record={entry:{snapshots:h[0],overrides:h[1],context:h[2]}};
    else record={entry:Object.fromEntries((kind==='weight'?['date','wt']:['date','wt','sm','bf','ab','waist','vf','pa','bmr']).map((k,i)=>[k,h[i]]))};
    b.hash=this.fingerprint(record,kind);
   }catch(_){/* Unknown baselines stay intact so an edit cannot become clean by accident. */}}
   s.format7=true;s.comparisonVersion=2;
  }return s;},
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
   if(kind==='workout')return stable((record.rows||[]).map(r=>[r.name,Number(r.setNo),r.day||'',Number(r.weight),Number(r.reps),+!!(+r.wu),Number(r.rpe)||0,+!!(+r.pain),RecordModel.meta(r.name,r.meta||{},r.meta?.exerciseId)]).sort((a,b)=>stable(a).localeCompare(stable(b))));
   const e=record.entry;if(!e||e.deleted)return 'null';
   if(kind==='session'){
    const snapshots=e.snapshots||{},overrides=e.overrides||{},context={cond:e.context?.cond||{},note:e.context?.note||''};
    if(!Object.keys(snapshots).length&&!Object.values(overrides).some(v=>Object.keys(v).length)&&!Object.keys(context.cond).length&&!context.note)return 'null';
    return stable([snapshots,Object.fromEntries(Object.entries(overrides).filter(([,v])=>Object.keys(v).length)),context]);
   }
   const keys=kind==='weight'?['date','wt']:['date','wt','sm','bf','ab','waist','vf','pa','bmr'];return stable(keys.map(k=>k==='date'?e[k]:numeric(e[k])));
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
     // Reading a legacy row must not invent bodyweight/effective-load metadata and make it dirty again.
     e.sets.push({_id:r.setId,weight:+r.weight,reps:+r.reps,ts:r.ts||null,...(r.meta||{}),...(r.wu?{warmup:true}:{}),...(r.rpe?{rpe:+r.rpe}:{}),...(r.pain?{pain:true}:{})});
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
   this.currentUrl=url;this.busy=true;this.comparisonError='';this.render();this.queueWrites={};const originalDirty=new Set(ExLog._dirty);
   try{
    await InBody.load();await this.prepareIds();
    const snapshot=await ExLog.api(url,{mode:'sync_pull'});this.validateSnapshot(snapshot);
    const state=this.state(url),conflicts=[];
    this.serverBuild=snapshot.serverBuild;this.source=snapshot.source||null;
    if(snapshot.source){this.source=snapshot.source;this.serverBuild=snapshot.serverBuild;this.renderDiagnosis();
     if(state.sourceId&&state.sourceId!==snapshot.source.id)throw new Error('같은 배포 URL의 연결 파일이 변경됐습니다. 연결 진단에서 파일을 확인하고 기존 기록 파일로 연결하세요.');
     state.sourceId=snapshot.source.id;
    }
    this.conflicts=conflicts;this.lastComparedAt=new Date().toISOString();
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
   }catch(e){this.comparisonError=e.message;this.log('error','',[],e.message);originalDirty.forEach(d=>ExLog._dirty.add(d));throw e;}
   finally{this.busy=false;this.refreshUI();}
  },
  async resolve(index,choice){
   if(this.busy||ExLog._syncP)return;const c=this.conflicts[index];if(!c)return;
   if(this.comparisonError){ExLog.syncMessage='마지막 비교에 실패했어요. 다시 비교한 뒤 기록을 선택하세요.';ExLog.renderSyncStatus();return;}
   if(choice==='local'&&c.local.revision==='0'){ExLog.syncMessage='기기에 없는 기록으로 시트를 덮어쓰지 않습니다. 시트 기록을 가져오세요.';ExLog.renderSyncStatus();return;}
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
   box.hidden=!this.conflicts.length&&!this.lastComparedAt&&!this.comparisonError;
   const blocked=this.busy||!!this.comparisonError;
   box.innerHTML='<div class="af-card-title">기록 차이 확인 <span class="count-badge">'+this.conflicts.length+'</span></div>'+
    (this.comparisonError?'<p role="alert">최신 비교 실패: '+esc(this.comparisonError)+'<br>아래 결과는 최신이 아닐 수 있어요. 다시 비교한 뒤 선택하세요.</p>':'')+
    (this.lastComparedAt?'<p>마지막 시트 비교 · '+esc(new Date(this.lastComparedAt).toLocaleString())+'</p>':'')+
    '<p>'+(this.conflicts.length?'날짜·종류별 차이이며 중복행 수가 아닙니다. 다른 항목을 확인하고 선택하세요.':'마지막 비교에서 기록 차이가 없습니다.')+'</p><div class="af-tool-row"><button type="button" data-inspect '+(this.busy?'disabled':'')+'>다시 비교 · 읽기 전용</button><button type="button" data-diagnose>연결 진단</button></div>'+
    this.conflicts.slice(0,this.visibleConflicts).map((c,i)=>'<details class="sync-diff"><summary><b>'+esc(c.date)+'</b><span>'+this.kindLabel(c.kind)+'</span><small>'+esc(this.differenceLabel(c))+'</small></summary><p class="sync-diff-reasons"><b>다른 항목</b> · '+esc(this.differences(c.local,c.remote,c.kind).join(' · '))+'</p><div class="af-pref-values"><div><b>이 기기</b><pre>'+esc(this.summary(c.local,c.kind))+'</pre></div><div><b>시트</b><pre>'+esc(this.summary(c.remote,c.kind))+'</pre></div></div><p>선택 전 이 기기의 복구용 백업을 보관합니다.</p><div class="af-tool-row"><button type="button" data-choice="local" data-index="'+i+'" '+(blocked||c.local.revision==='0'?'disabled':'')+'>이 기기 기록을 시트에 저장</button><button type="button" data-choice="cloud" data-index="'+i+'" '+(blocked||c.remote.revision==='0'?'disabled':'')+'>시트 기록 적용</button></div></details>').join('')+
    (this.conflicts.length>this.visibleConflicts?'<button type="button" data-more>다음 8건 보기</button>':'');
  },
  refreshUI(){this.render();if(AppFeatures.ready){AppFeatures.renderWeights();ExLog.refresh();ExLog.injectTargets();PlanApp.renderAnalysis(true);InBody.render();ExLog.renderSyncStatus();}},
  mount(){
   const diagnostics=document.createElement('section');diagnostics.className='af-card';diagnostics.innerHTML='<details id="connection-details"><summary>시트 연결 확인</summary><p>기록이 없다고 나오면 실제로 연결된 파일과 읽기 상태를 확인하세요.</p><div class="af-tool-row"><button type="button" id="diagnose-sync">연결 진단 · 읽기 전용</button><button type="button" id="inspect-sync">다시 비교 · 읽기 전용</button><button type="button" id="copy-sync-report">진단 내용 복사</button></div><div id="sync-diagnosis" hidden role="status"></div><div id="sync-report-output" hidden role="status"></div></details>';document.getElementById('daily-weight').before(diagnostics);document.getElementById('diagnose-sync').onclick=()=>this.diagnose();document.getElementById('inspect-sync').onclick=()=>this.inspect();document.getElementById('copy-sync-report').onclick=()=>this.copyReport();
   const box=document.createElement('section');box.id='record-conflicts';box.className='af-card';box.hidden=true;diagnostics.after(box);box.addEventListener('click',e=>{const btn=e.target.closest('[data-choice]');if(btn)this.resolve(+btn.dataset.index,btn.dataset.choice);if(e.target.closest('[data-inspect]'))this.inspect();if(e.target.closest('[data-more]')){this.visibleConflicts+=8;this.render();}if(e.target.closest('[data-diagnose]')){document.getElementById('connection-details').open=true;diagnostics.scrollIntoView({block:'center'});this.diagnose();}});
   this.render();
   const history=document.createElement('section');history.className='af-card';history.innerHTML='<details><summary>동기화 활동 내역 · 최근 100건</summary><div id="sync-activity"></div></details>';box.after(history);this.renderActivity();
   // A second tab must reload before writing stale in-memory data over another tab.
   window.addEventListener('storage',e=>{if(e.key&&(e.key.startsWith('wl_v2:')||['plan_v3','plan_v2','daily_weight_v1','inbody_log','ex_equipment_v1','ex_base','ex_rest','ex_memo','ex_load','exercise_favorites_v1'].includes(e.key))&&!this.busy){SafeStore.blocked=true;SafeStore.externalChange=true;SafeStore.error='다른 탭에서 기록이 바뀌었어요. 현재 입력을 백업한 뒤 새로고침하세요.';SafeStore.render();}});
  }
 };
})();
