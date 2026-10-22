const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',serviceWorkers:'block'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-11-05T10:00:00Z')});
  const name='올데이 감일 · Hammer ISO 인클라인 프레스',old='Hammer ISO-인클라인 프레스';
  const row={name:old,original:old,index:0,weight:100,phase:'early',label:'초반',sets:9,baseSets:9,min:8,max:12};
  await p.addInitScript(({name,old,row})=>{
   if(localStorage.getItem('seed'))return;localStorage.setItem('seed','1');
   localStorage.setItem('routine_profile','legacy');localStorage.setItem('plan_v3',JSON.stringify({'Push A':{add:[old],swap:{[name]:old}}}));
   localStorage.setItem('wl_v2:2026-10',JSON.stringify({'2026-10-17':{day:'Push A',note:'과거 기준',exercises:[{name,sets:[{weight:999,reps:12}]}]}}));
   localStorage.setItem('wl_v2:2026-11',JSON.stringify({
    '2026-11-03':{day:'Push A',exercises:[{name:old,sets:[{weight:888,reps:12}]}]},
    '2026-11-04':{day:'Push A',exercises:[{name,sets:[{weight:20,reps:10}]},{name:old,sets:[{weight:888,reps:12}]}]},
    '2026-11-05':{day:'Push A',exercises:[{name:old,sets:[{weight:888,reps:12}]}],routineSnapshots:{'Push A':{day:'Push A',capturedAt:'2026-10-12T10:00:00Z',source:'recorded',rows:[row]}}}
   }));
   localStorage.setItem('workout_undo_v1',JSON.stringify([{date:'2026-10-17',name,before:[],after:[{weight:999,reps:12}],label:'과거 삭제'}]));
   localStorage.setItem('workout_drafts_v1',JSON.stringify({[JSON.stringify(['2026-10-17','Push A',name])]:{kg:'999',reps:'12',updatedAt:Date.now()}}));
   localStorage.setItem('inbody_log',JSON.stringify([{date:'2026-09-01',wt:88,sm:37,bf:26}]));
  },{name,old,row});
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>ReferenceHistory.ready);
  const original=await p.evaluate(()=>JSON.stringify(ExLog.data));
  const state=await p.evaluate(async({name,old})=>({
   catalog:EXERCISE_LIBRARY.length,mode:TRAINING_PLAN.mode,plan:AppFeatures.templateRoutine('Push A').map(r=>r.name),
   oldLookup:ExLog.libByName(old),prior:ExLog.prevSession(name),index:ExLog._priorSets(name),
   raw:Object.keys(ExLog.data),active:Object.keys(ExLog.activeData),analysis:await PlanApp._logData(),archive:ReferenceHistory.rows(),body:InBody._log
  }),{name,old});
  assert.equal(state.catalog,64);assert.equal(state.mode,'current');assert.equal(state.oldLookup,undefined);
  assert(state.plan.every(n=>n.startsWith('올데이 감일 · ')));assert.equal(state.plan[0],name);
  assert.equal(state.prior.date,'2026-11-04');assert.equal(state.prior.sets[0].weight,20);assert.equal(state.index.length,1);
  assert.deepEqual(state.active,['2026-11-04']);assert.equal(state.analysis['2026-11-04'].exercises.length,1);
  assert.equal(state.archive.length,4);assert.equal(state.body[0].date,'2026-09-01');
  assert.equal(await p.locator('#routine-profile,#library-catalog,#gym-draft-info').count(),0);
  await p.evaluate(()=>WorkoutTools.undoLast());assert.equal(await p.evaluate(()=>JSON.stringify(ExLog.data)),original);
  // Restored old plans and same-date old records are retained, while a new plan can be recorded.
  await p.evaluate(()=>{ExLog.syncPanel('Push A');ExLog.refresh();});
  await p.locator('.af-current .ex-log-add-btn').click();await p.locator('.af-current .wl-kg-input').fill('22.5');await p.locator('.af-current .wl-rp-input').fill('10');await p.clock.runFor(100);assert.equal(await p.locator('.af-current .wl-kg-input').inputValue(),'22.5');assert.equal(await p.locator('.af-current .wl-rp-input').inputValue(),'10');assert(await p.locator('.af-current .wl-rp-input').evaluate(e=>e===document.activeElement));await p.locator('.af-current .wl-confirm-btn').click();
  const saved=await p.evaluate(({name,old})=>({raw:ExLog.data['2026-11-05'],active:ExLog.activeData['2026-11-05'],prior:ExLog._priorSets(old),body:InBody._log}),{name,old});
  assert.equal(saved.raw.exercises.find(e=>e.name===old).sets[0].weight,888);assert.equal(saved.raw.routineSnapshots['Push A'].rows.find(r=>r.name===old).sets,9);
  assert.equal(saved.active.exercises.length,1);assert.equal(saved.active.exercises[0].sets[0].weight,22.5);assert(saved.active.routineSnapshots['Push A'].rows.every(r=>r.name!==old));assert.equal(saved.prior.length,0);
  const preserved=await p.evaluate(()=>JSON.stringify(ExLog.data));
  // Archived dates show only a reader. Direct editor entry and stale undo/draft cannot modify them.
  await p.evaluate(()=>{ExLog.date='2026-10-17';ExLog.updateBar();ExLog.refresh();ExLog.setSleep('2');ExLog.setNote('overwrite');WorkoutTools.capture('Push A');});
  assert(await p.locator('#archived-date').isVisible());assert.equal(await p.locator('.day-panel:visible,.af-tools:visible,#session-context:visible').count(),0);
  assert.equal(await p.evaluate(()=>JSON.stringify(ExLog.data)),preserved);
  await p.locator('#reference-all').click();assert(await p.locator('#reference-history').isVisible());
  await p.locator('#reference-search').fill('과거 기준');assert.equal(await p.locator('#reference-list .reference-day').count(),1);
  await p.locator('#reference-list .reference-day>summary').click();assert((await p.locator('#reference-list').innerText()).includes('999kg'));
  assert.equal(await p.locator('#reference-list button,#reference-list input').count(),0);
  // The archive stays in backups and raw synchronization rows.
  const backup=await p.evaluate(async()=>{const b=await Backup._collect();return {stored:JSON.parse(b['wl_v2:2026-10']),rows:ExLog._syncRows()};});
  assert.equal(backup.stored['2026-10-17'].exercises[0].sets[0].weight,999);assert(backup.rows.some(r=>r.date==='2026-10-17'));
  for(const width of [320,390,768,1200]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await p.reload();await p.waitForFunction(()=>ReferenceHistory.ready);assert.equal(await p.evaluate(()=>EXERCISE_LIBRARY.length),64);assert.equal(await p.evaluate(()=>TRAINING_PLAN.mode),'current');
  await p.locator('.lbl-w').click();await p.locator('.lbl-d2').click();assert.equal(await p.evaluate(()=>ExLog.session().day),'Pull A');await p.evaluate(()=>ExLog.updateBar());assert.equal(await p.evaluate(()=>AppFeatures.activeDay()),'Pull A');
  const routine=await p.evaluate(()=>Object.fromEntries(TRAINING_PLAN.cycle.map(day=>[day,AppFeatures.templateRoutine(day,'2026-11-05').map(r=>({id:ExLog.libByName(r.name).id,sets:r.sets}))])));
  assert.deepEqual(routine['Push A'].map(r=>r.id),['hammer-incline','db-lateral','technogym-pure-chest-press','cable-pushdown']);assert.equal(routine['Legs B'].reduce((n,r)=>n+r.sets,0),12);
  assert.equal(Object.values(routine).flat().filter(r=>r.id==='db-calf').length,0);
  assert.equal(Object.values(routine).flat().filter(r=>r.id==='cable-rear').reduce((n,r)=>n+r.sets,0),6);
  for(const day of ['Legs A','Legs B'])assert(routine[day].some(r=>r.id==='lexco-masterpro-curl'));
  const adaptation=await p.evaluate(()=>({
   routines:Object.fromEntries(['Legs A','Push B'].map(day=>[day,AppFeatures.templateRoutine(day,'2026-10-22').map(r=>({id:ExLog.libByName(r.name).id,sets:r.sets}))])),
   core:TRAINING_PLAN.prescription(GymInventory.available.find(e=>e.id==='cable-crunch').name,'Legs A','2026-10-22'),
   targets:TRAINING_PLAN.targets('2026-11-05')
  }));
  assert.equal(adaptation.routines['Legs A'].reduce((n,r)=>n+r.sets,0),7);
  assert.equal(adaptation.routines['Push B'].reduce((n,r)=>n+r.sets,0),10);
  assert(Object.values(adaptation.routines).flat().every(r=>r.sets<=2));assert.equal(adaptation.core.sets,1);
  assert.equal(adaptation.targets['대퇴사두'],12);assert.equal(adaptation.targets['종아리']||0,0);
  const progression=await p.evaluate(()=>{
   const saved=JSON.parse(JSON.stringify(ExLog.data)),date=ExLog.date;
   const name=GymInventory.available.find(e=>e.id==='db-lateral').name;
   const session=rpe=>({day:'Push A',exercises:[{name,sets:Array.from({length:3},()=>({weight:10,reps:20,rpe,pain:false}))}]});
   try{
    ExLog.date='2026-11-05';ExLog.data={'2026-11-03':session(7)};
    const single=ExLog.suggestTarget(name).up;
    ExLog.data['2026-11-01']=session(undefined);const missing=ExLog.suggestTarget(name).up;
    ExLog.data['2026-11-01']=session(7);const repeated=ExLog.suggestTarget(name).up;
    ExLog.data['2026-11-03']=session(8);const hard=ExLog.suggestTarget(name).up;
    return {single,missing,repeated,hard};
   }finally{ExLog.data=saved;ExLog.date=date;}
  });
  assert.deepEqual(progression,{single:false,missing:false,repeated:true,hard:false});
  assert.deepEqual(errors,[]);console.log('PASS: All Day-only upgrade, stale profile/plan rejection, archive read-only, unchanged old rows/snapshots, mixed-session projection, recommendations/analysis isolation, body history retained, backup/sync inclusion and mobile layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
