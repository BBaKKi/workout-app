const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',serviceWorkers:'block'}),errors=[];
  p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-11-06T10:00:00Z')});
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>InterfaceTools.ready);
  const before=await p.evaluate(()=>JSON.stringify({plan:ExLog.plan,data:ExLog.data,templates:TRAINING_PLAN.cycle.map(d=>WorkoutTools.template(d))}));
  await p.locator('.lbl-l').click();
  assert(await p.locator('#library-type').isVisible(),'equipment type must not be hidden in optional filters');
  assert.equal(await p.locator('.library-filter-panel').evaluate(e=>e.open),false);
  for(const [type,count]of [['cable',13],['barbell',8],['smith',8]]){
   await p.locator('#library-type').selectOption(type);
   assert.equal(await p.locator('.lib-card').count(),count);
   assert(await p.evaluate(type=>LibApp._items.every(e=>e.equipmentType===type),type));
  }
  await p.locator('.lib-chip[data-c=legs]').click();assert.equal(await p.locator('.lib-card').count(),5);
  await p.locator('.lib-chip[data-c=small]').click();assert.deepEqual(await p.evaluate(()=>LibApp._items.map(e=>e.id)),['smith-calf']);
  await p.locator('#library-type').selectOption('cable');assert.equal(await p.locator('.lib-card').count(),6);
  await p.locator('.library-type-field button').click();
  await p.locator('.lib-search').fill('스미스머신');await p.clock.runFor(150);assert.equal(await p.locator('.lib-card').count(),8);
  await p.locator('.library-type-field button').click();
  await p.locator('#library-type').selectOption('cable');
  await p.locator('.library-filter-panel>summary').click();await p.locator('#library-equipment').selectOption('Newtech');
  assert.deepEqual(await p.evaluate(()=>LibApp._items.map(e=>e.id)),['newtech-cable-row']);
  await p.locator('#library-type').selectOption('smith');assert.equal(await p.locator('.lib-card').count(),0);
  await p.locator('.lib-empty button').click();assert.equal(await p.locator('.lib-card').count(),88);
  assert.deepEqual(await p.evaluate(()=>[InterfaceTools.equipmentType,InterfaceTools.equipment,LibApp.cat,LibApp.q]),['all','all','all','']);
  const names=await p.evaluate(()=>['smith-bench','barbell-bench','hammer-horizontal'].map(id=>EXERCISE_LIBRARY.find(e=>e.id===id).name));
  for(const id of ['cable-pallof','barbell-deadlift','smith-split-squat','smith-bench']){
   await p.evaluate(id=>LibApp.goto(EXERCISE_LIBRARY.find(e=>e.id===id).name),id);
   assert.equal(await p.locator('.lib-card .coach-action-row:visible').count(),6);
   for(const width of [320,390,768,1200]){
    await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,id+' at '+width);
   }
  }
  const smith=await p.evaluate(()=>EXERCISE_LIBRARY.filter(e=>e.equipmentType==='smith').map(e=>({type:ExLog.loadTypeOf(e.name),base:ExLog.baseOf(e.name),files:GymInventory.evidenceFiles(e),status:e.status,note:e.equipmentNote,canonical:ExLog.canon(e.name),name:e.name})));
  for(const e of smith){assert.equal(e.type,'normal');assert.equal(e.base,0);assert.deepEqual(e.files,[]);assert.equal(e.status,'reported');assert(e.note.includes('미확인'));assert.equal(e.canonical,e.name);}
  assert.equal(await p.evaluate(()=>JSON.stringify({plan:ExLog.plan,data:ExLog.data,templates:TRAINING_PLAN.cycle.map(d=>WorkoutTools.template(d))})),before,'browsing must not rewrite plans or records');
  // Record through the actual library -> today-only -> set entry flow.
  await p.setViewportSize({width:390,height:844});
  await p.evaluate(n=>{ExLog.syncPanel('Push A');ExLog.refresh();LibApp.goto(n);},names[0]);
  await p.locator('.lib-add').click();await p.locator('#routine-change-today').click();
  await p.locator('.lbl-w').click();
  assert.equal(await p.locator('.day-panel:visible .af-current .ex-log').getAttribute('data-exname'),names[0]);
  await p.locator('.day-panel:visible .af-current .ex-log-add-btn').click();
  await p.locator('.day-panel:visible .af-current .wl-kg-input').fill('20');await p.locator('.day-panel:visible .af-current .wl-rp-input').fill('10');
  await p.locator('.day-panel:visible .af-current .wl-confirm-btn').click();
  assert.deepEqual(await p.evaluate(n=>ExLog.session().exercises.find(e=>e.name===n).sets.map(s=>[s.weight,s.reps]),names[0]),[[20,10]]);
  await p.reload();await p.waitForFunction(()=>InterfaceTools.ready);
  assert.deepEqual(await p.evaluate(n=>ExLog.session().exercises.find(e=>e.name===n).sets.map(s=>[s.weight,s.reps]),names[0]),[[20,10]]);
  assert(!(await p.evaluate(n=>WorkoutTools.template('Push A').some(r=>r.name===n),names[0])),'today-only addition must not alter the base routine');
  // Similar movement and search names must not merge machine/freeweight histories.
  const histories=await p.evaluate(names=>{
   ExLog.data['2026-11-05']={day:'Push A',exercises:names.map((name,i)=>({name,sets:[{weight:[20,40,60][i],reps:10}]}))};
   return names.map(n=>ExLog.prevSession(n)?.sets.map(s=>s.weight));
  },names);
  assert.deepEqual(histories,[[20],[40],[60]]);
  assert.deepEqual(errors,[]);
  console.log('PASS: equipment discoverability, combined filters/reset, 19 new guides, Smith provenance/weight defaults, separate histories, add/log/reload and 320–1200px');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
