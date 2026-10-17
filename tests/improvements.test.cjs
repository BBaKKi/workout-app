const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{backend,TOKEN}=require('./backend-harness.cjs');
const root=path.resolve(__dirname,'..'),url='https://script.google.com/macros/s/improvements_v7/exec';
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 const errors=[];
 async function page(seed={},cloud=backend()){
  const ctx=await browser.newContext({serviceWorkers:'block',timezoneId:'Asia/Seoul',viewport:{width:390,height:844}});
  await ctx.addInitScript(values=>{if(!localStorage.getItem('test-seeded')){Object.entries(values).forEach(([k,v])=>localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v)));localStorage.setItem('test-seeded','1');}},seed);
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://script.google.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(cloud.post(r.request().postDataJSON(),false))}));
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.InterfaceTools?.ready);return p;
 }
 async function sync(p){await p.evaluate(async url=>{clearTimeout(ExLog._syncTimer);await ExLog.syncToSheets(url);if(ExLog.syncMessage)throw new Error(ExLog.syncMessage);},url);}
 async function connect(p){await p.evaluate(({url,TOKEN})=>{localStorage.setItem('gs_script_url',url);localStorage.setItem('gs_tokens_v5',JSON.stringify({[url]:TOKEN}));},{url,TOKEN});await sync(p);}
 try{
  // Upgrade a linked installation without modifying raw records or losing settings.
  const seed={ex_alias:{'머신 A':'머신 B','머신 B':'머신 C'},ex_memo:{'머신 C':'좌석 4'},ex_rest:{'머신 C':150},ex_base:{'머신 C':20},ex_load:{'머신 C':'assist'},'wl_v2:2026-09':{'2026-09-01':{day:'Pull A',exercises:[{name:'머신 A',sets:[{weight:10,reps:8}]},{name:'머신 C',sets:[{weight:30,reps:12}]}]}}};
  const old=await page(seed);
  const migrated=await old.evaluate(()=>({names:ExLog.data['2026-09-01'].exercises.map(e=>e.name),alias:localStorage.getItem('ex_alias'),canon:ExLog.canon('머신 A'),memo:ExLog.memoOf('머신 A'),base:ExLog.baseOf('머신 A'),rest:ExLog.restSec('머신 A'),a:ExLog._priorSets('머신 A').length,c:ExLog._priorSets('머신 C').length,backup:!!localStorage.getItem('retired_links_v7'),links:document.querySelectorAll('.ex-alias-btn').length}));
  assert.deepEqual(migrated,{names:['머신 A','머신 C'],alias:null,canon:'머신 A',memo:'좌석 4',base:20,rest:150,a:1,c:1,backup:true,links:0});
  const check=await old.evaluate(async()=>{await Backup.runCheck();return document.getElementById('bk-check').textContent;});
  assert(!check.includes('점검 중 오류'));assert(check.includes('도감 미매칭'));
  await old.reload();await old.waitForFunction(()=>InterfaceTools.ready);assert.equal(await old.evaluate(()=>localStorage.getItem('ex_alias')),null);
  // Same raw spelling always keeps its own stable ID; similar names are not linked.
  assert.notEqual(await old.evaluate(()=>RecordModel.exerciseId('T바 로우')),await old.evaluate(()=>RecordModel.exerciseId('T-바 로우')));
  console.log('PASS: linked-installation migration preserves names, sets, per-exercise settings and recovery copy; no links return after restart');

  const cloud=backend(),a=await page({},cloud);await connect(a);
  await a.evaluate(()=>{ExLog.syncPanel('Push A');ExLog.refresh();});
  const cardActions=await a.evaluate(()=>{
   const name=WorkoutTools.template('Push A')[0].name,wrap=ExLog.buildCardEl(name);
   document.querySelector('.dp1 .ex-list').append(wrap);ExLog.injectDeleteBtns();InterfaceTools.refresh();
   const result={menus:wrap.querySelectorAll('.exercise-actions').length,remove:wrap.querySelectorAll('.ex-del-btn').length,swap:wrap.querySelectorAll('.ex-swap-btn').length,summaryActions:wrap.querySelector('summary').querySelectorAll('button').length};
   wrap.remove();return result;
  });
  assert.deepEqual(cardActions,{menus:1,remove:1,swap:1,summaryActions:0});
  assert.equal(await a.evaluate(()=>{ExLog.ltype['거리 기록 테스트']='distance';const unit=RecordModel.unit('거리 기록 테스트');delete ExLog.ltype['거리 기록 테스트'];return unit;}),'meters');
  const template=await a.evaluate(()=>JSON.stringify(WorkoutTools.template('Push A')));
  await a.evaluate(()=>ExLog.addExternal('파머스 워크'));await a.locator('#routine-change-today').click();
  assert.equal(await a.evaluate(()=>JSON.stringify(WorkoutTools.template('Push A'))),template);
  assert.equal(await a.evaluate(()=>AppFeatures.routine('Push A').some(r=>r.name==='파머스 워크')),true);
  await a.locator('.dp1 .af-current .ex-log-add-btn').click();
  await a.locator('.dp1 .af-current .wl-kg-input').fill('20');await a.locator('.dp1 .af-current .wl-rp-input').fill('30');
  await a.locator('.dp1 .af-current .wl-confirm-btn').click();
  const carry=await a.evaluate(()=>ExLog.session().exercises.find(e=>e.name==='파머스 워크').sets[0]);assert.equal(carry.unit,'meters');
  assert.equal(await a.evaluate(()=>_ldW(ExLog.session().exercises.find(e=>e.name==='파머스 워크').sets[0])),0);
  await a.evaluate(()=>ExLog.removeEx(document.querySelector('.dp1 .af-current .ex-del-btn')));await a.locator('#routine-change-today').click();
  assert.equal(await a.evaluate(()=>AppFeatures.routine('Push A').some(r=>r.name==='파머스 워크')),false);
  assert.equal(await a.evaluate(()=>ExLog.session().exercises.find(e=>e.name==='파머스 워크').sets.length),1);
  assert.equal(await a.evaluate(()=>JSON.stringify(WorkoutTools.template('Push A'))),template);
  await a.evaluate(()=>{ExLog.setCond(4);ExLog.setSleep('7.5');ExLog.setNote('기구 대기로 한 종목 건너뜀');});await sync(a);
  const b=await page({},cloud);await connect(b);
  const received=await b.evaluate(()=>({context:WorkoutTools.meta(ExLog.session()).context,carry:ExLog.session().exercises.find(e=>e.name==='파머스 워크').sets[0],skipped:ExLog.session().routineSnapshots['Push A'].rows.find(r=>r.name==='파머스 워크').skipped}));
  assert.deepEqual(received.context,{cond:{rate:4,sleep:7.5},note:'기구 대기로 한 종목 건너뜀'});assert.equal(received.carry.unit,'meters');assert.equal(received.skipped,true);
  await a.evaluate(()=>{ExLog.setNote('');ExLog.setSleep('');});await sync(a);await sync(b);assert.equal(await b.evaluate(()=>ExLog.session().note),'');assert.equal(await b.evaluate(()=>ExLog.session().cond.sleep),undefined);
  await a.evaluate(()=>InterfaceTools.restoreSkipped('파머스 워크'));assert.equal(await a.evaluate(()=>AppFeatures.routine('Push A').some(r=>r.name==='파머스 워크')),true);
  await a.evaluate(()=>ExLog.addExternal('덤벨 컨센트레이션 컬'));await a.locator('#routine-change-permanent').click();assert.equal(await a.evaluate(()=>WorkoutTools.template('Push A').some(r=>r.name==='덤벨 컨센트레이션 컬')),true);
  // Choosing a repetition count no longer commits a set.
  await a.locator('.dp1 .af-current .ex-log-add-btn').click();await a.locator('.dp1 .af-current .wl-kg-input').fill('10');await a.locator('.dp1 .af-current .wl-rep-chip').first().click();
  assert.equal(await a.evaluate(()=>ExLog.session().exercises.find(e=>e.name==='덤벨 컨센트레이션 컬')?.sets.length||0),0);
  await a.locator('.dp1 .af-current .wl-confirm-btn').click();assert.equal(await a.evaluate(()=>ExLog.session().exercises.find(e=>e.name==='덤벨 컨센트레이션 컬').sets.length),1);
  // Cardio distance/incline survives a complete Sheets round trip.
  await a.locator('.dp1 .cardio-add').click();await a.locator('.dp1 .cd-min').fill('20.5');await a.locator('.dp1 .cd-km').fill('2.1');await a.locator('.dp1 .cd-incline').fill('5');await a.locator('.dp1 .cd-ok').click();await sync(a);await sync(b);
  assert.deepEqual(await b.evaluate(()=>{const c=ExLog.session().cardio[0];return {min:c.min,km:c.km,incline:c.incline};}),{min:20.5,km:2.1,incline:5});
  await a.evaluate(()=>InterfaceTools.favorite('랫풀다운'));await sync(a);assert.equal(JSON.parse(cloud.post({mode:'settings_get'}).data.exercise_favorites_v1)['랫풀다운'],true);
  await a.locator('.lbl-l').click();await a.evaluate(()=>GymInventory.select('general'));await a.locator('.library-filter-panel>summary').click();await a.locator('#library-scope').selectOption('favorites');assert.equal(await a.locator('.lib-card').count(),1);assert((await a.locator('.lib-card').innerText()).includes('랫풀다운'));
  await a.evaluate(async()=>{const values=await Backup._collect();SafeBackup.validate(JSON.stringify({app:'fit-tracker',version:2,data:values}));});
  console.log('PASS: scoped add/skip/restore, preserved recorded sets, context sync/clear, distance/cardio metadata, explicit set save and favorites backup/sync');

  const defects=await page();
  const regression=await defects.evaluate(async()=>{
   InBody._log=[{date:'2026-09-01',wt:70},{date:'2026-10-01',wt:90}];
   DataSync.apply({date:'2026-09-01',rows:[{name:'어시스트 딥스 머신',setNo:1,setId:'regression-set',weight:20,reps:10,day:'Push A'}]},'workout');
   const st=ExLog.data['2026-09-01'].exercises[0].sets[0];
   const url='https://script.google.com/macros/s/regression_v7/exec';localStorage.setItem('gs_script_url',url);AppFeatures.savePrefState(url,{revision:1,base:AppFeatures.snapshot()});ExLog._dirty.clear();ExLog._delQ=[];localStorage.setItem('session_dirty_v1',JSON.stringify({[ExLog.date]:true}));await AppFeatures.renderSyncStatus();
   const status=document.getElementById('sync-status').textContent;
   const dates=RecordModel.weekDates(_todayKey()),[monday,tuesday]=dates,row={...WorkoutTools.template('Push A',tuesday)[0],sets:2};
   ExLog.data={[monday]:{day:'Push A',exercises:[{name:row.name,sets:[{weight:20,reps:10},{weight:20,reps:10}]}]},[tuesday]:{day:'Push A',exercises:[],routineSnapshots:{'Push A':{day:'Push A',capturedAt:new Date().toISOString(),source:'recorded',rows:[row]}}}};
   const weekly=AppFeatures.weekly(tuesday);
   return {st,status,weekly,planned:RecordModel.plannedDays('2026-10-12'),beforeFirstWeight:ExLog.bwOn('2020-01-01')};
  });
  assert.equal(regression.st.bw,70);assert.equal(regression.st.ew,50);assert.equal(regression.beforeFirstWeight,0);assert(regression.status.includes('전송 대기 1건'));assert.equal(regression.weekly.matched,0);assert.equal(regression.weekly.unplannedSets,2);assert.equal(regression.planned,4);
  const yesterday=await defects.evaluate(()=>RecordModel.shift(_todayKey(),-1));
  const resume=await page({workout_resume_v1:{date:yesterday,day:'Push A',selected:{}}});assert.equal(await resume.evaluate(()=>ExLog.date===_todayKey()),true);
  const draftName=await resume.evaluate(date=>WorkoutTools.template('Push A',date)[0].name,yesterday);
  const draft=await page({workout_resume_v1:{date:yesterday,day:'Push A',selected:{'Push A':draftName}},workout_drafts_v1:{[JSON.stringify([yesterday,'Push A',draftName])]:{kg:'25',reps:'8',rpe:'',updatedAt:Date.now()}}});
  assert.equal(await draft.evaluate(()=>ExLog.date===_todayKey()),true);await draft.locator('#resume-offer button').first().click();assert.equal(await draft.evaluate(()=>ExLog.date),yesterday);assert.equal(await draft.locator('.dp1 .af-current .wl-kg-input').inputValue(),'25');
  console.log('PASS: past-date bodyweight, zero unknown weight, metadata-only pending state, dated weekly matching, phase target and opt-in historical draft resume');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
