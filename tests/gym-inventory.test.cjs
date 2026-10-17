const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{backend,TOKEN}=require('./backend-harness.cjs');
const root=path.resolve(__dirname,'..'),cloud=backend(),url='https://script.google.com/macros/s/gym_v7/exec';
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 const errors=[];
 async function page(seed={}){
  const c=await browser.newContext({serviceWorkers:'block',viewport:{width:320,height:780},timezoneId:'Asia/Seoul'});
  await c.addInitScript(values=>{if(!localStorage.getItem('seeded')){for(const [k,v]of Object.entries(values))localStorage.setItem(k,JSON.stringify(v));localStorage.setItem('seeded','1');}},seed);
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://script.google.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(cloud.post(r.request().postDataJSON(),false))}));
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>InterfaceTools.ready);return p;
 }
 async function sync(p){await p.evaluate(async({url,TOKEN})=>{clearTimeout(ExLog._syncTimer);localStorage.setItem('gs_script_url',url);localStorage.setItem('gs_tokens_v5',JSON.stringify({[url]:TOKEN}));await ExLog.syncToSheets(url);if(ExLog.syncMessage)throw new Error(ExLog.syncMessage);},{url,TOKEN});}
 try{
  const oldName='머신 숄더 프레스',oldSession={day:'Push A',exercises:[{name:oldName,sets:[{weight:80,reps:10}]}]};
  const a=await page({'wl_v2:2026-09':{'2026-09-01':oldSession},ex_base:{[oldName]:20},ex_memo:{[oldName]:'옛 짐 좌석 5'},ex_equipment_v1:{[oldName]:{seat:'5'}}});
  await sync(a);await a.evaluate(()=>DataSync.resolve(0,'local'));await sync(a);
  const planBefore=await a.evaluate(()=>JSON.stringify(ExLog.plan));
  const routineBefore=await a.evaluate(()=>JSON.stringify({items:TRAINING_PLAN.items,plans:ExLog.plan,templates:TRAINING_PLAN.cycle.map(d=>WorkoutTools.template(d)),snapshot:ExLog.session().routineSnapshots}));
  await a.locator('.lbl-l').click();await a.waitForFunction(()=>document.querySelectorAll('.lib-card').length===5);
  assert(await a.locator('#gym-photo-info').isVisible());
  await a.locator('.library-filter-panel>summary').click();
  assert.equal(await a.locator('#library-catalog').inputValue(),'allday-gamil');
  await a.locator('#library-equipment').selectOption('브랜드 미확인');assert.equal(await a.locator('.lib-card').count(),2);
  await a.locator('#library-equipment').selectOption('Technogym');assert.equal(await a.locator('.lib-card').count(),1);
  await a.evaluate(()=>GymInventory.select('allday-gamil'));
  const photoNames=await a.evaluate(()=>GymInventory.confirmed.map(e=>e.name));
  for(const photoName of photoNames){
    await a.evaluate(n=>LibApp.goto(n),photoName);await a.locator('.lib-card .exercise-guide>summary').click();
    assert(await a.locator('.lib-card .coach-body').isVisible());
    assert((await a.locator('.lib-card .gym-source').innerText()).includes('.JPEG'));
    assert.equal(await a.locator('.lib-card .gym-source a').count(),0);
    assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  const dip=await a.evaluate(()=>{const e=GymInventory.confirmed.find(e=>e.id==='seated-dip-press');return {type:ExLog.loadTypeOf(e.name),steps:ExerciseCoaching.get(e).steps.join(' '),variant:ExerciseCoaching.get(e).variant};});
  assert.equal(dip.type,'normal');assert(dip.steps.includes('손잡이를 아래로'));assert(!/보조판|몸을 올립니다/.test(dip.steps));assert.deepEqual(dip.variant,[]);
  assert.equal(await a.evaluate(()=>_movePat(GymInventory.confirmed.find(e=>e.id==='decline-chest-fly').name)),'플라이');
  assert.equal(await a.evaluate(()=>_loadGuess('어시스트 딥스 머신')),'assist');
  assert.equal(await a.evaluate(()=>_loadGuess('딥스')),'bw');
  assert.equal(await a.evaluate(()=>JSON.stringify({items:TRAINING_PLAN.items,plans:ExLog.plan,templates:TRAINING_PLAN.cycle.map(d=>WorkoutTools.template(d)),snapshot:ExLog.session().routineSnapshots})),routineBefore);
  await a.locator('#library-catalog').selectOption('general');assert.equal(await a.locator('.lib-card').count(),199);
  await a.locator('#library-catalog').selectOption('allday-gamil-draft');assert.equal(await a.locator('.lib-card').count(),10);
  assert.equal(await a.locator('.gym-notes article').count(),3);assert.equal(await a.locator('.gym-notes .lib-add').count(),0);
  const name=photoNames[0];
  const data=await a.evaluate(()=>({unique:new Set(GymInventory.entries.map(e=>e.name)).size,arrived:GymInventory.entries.filter(e=>e.status==='arrived').length,planned:GymInventory.entries.filter(e=>e.status==='planned').length,types:GymInventory.entries.map(e=>ExLog.loadTypeOf(e.name)),source:GymInventory.drafts.every(e=>e.source.url.startsWith('https://m.blog.naver.com/alldayfitness_tennis/')),known:GymInventory.entries.every(e=>libLookup()[e.name]===ExLog.libByName(e.name))}));
  assert.equal(data.unique,15);assert.equal(data.arrived,2);assert.equal(data.planned,7);assert(data.source&&data.known);assert(data.types.every(t=>t==='normal'));
  await a.locator('#gym-status-filter').selectOption('arrived');assert.equal(await a.locator('.lib-card').count(),2);
  await a.locator('#gym-status-filter').selectOption('all');await a.locator('#library-equipment').selectOption('렉스코');assert.equal(await a.locator('.lib-card').count(),2);
  await a.locator('#library-equipment').selectOption('all');await a.locator('.lib-search').fill('짐레코');await a.waitForFunction(()=>LibApp._items.length===1);assert.equal(await a.locator('.lib-card').count(),1);
  await a.evaluate(()=>LibApp.goto(GymInventory.drafts[0].name));
  assert.equal(await a.locator('#library-catalog').inputValue(),'allday-gamil-draft');
  await a.evaluate(()=>GymInventory.select('allday-gamil-draft'));
  await a.locator('.lib-card summary').first().click();assert((await a.locator('.lib-card .gym-source a').first().getAttribute('href')).endsWith('/223802202158'));
  await a.locator('.gym-notes summary').click();
  assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await a.evaluate(()=>JSON.stringify(ExLog.plan)),planBefore);
  await a.evaluate(n=>LibApp.goto(n),name);
  await a.evaluate(()=>{ExLog.syncPanel('Pull A');ExLog.refresh();});
  const template=await a.evaluate(()=>JSON.stringify(WorkoutTools.template('Pull A')));
  await a.locator('.lib-card .lib-add').first().click();await a.locator('#routine-change-today').click();
  assert.equal(await a.evaluate(()=>JSON.stringify(WorkoutTools.template('Pull A'))),template);
  assert.deepEqual(await a.evaluate(n=>({prior:ExLog._priorSets(n).length,base:ExLog.baseOf(n),memo:ExLog.memoOf(n),equipment:WorkoutTools.equipment[n]||{}}),name),{prior:0,base:0,memo:'',equipment:{}});
  await a.locator('.lbl-w').click();
  const current=a.locator('.day-panel:visible .af-current');
  await current.locator('.ex-log-add-btn').click();assert.notEqual(await current.locator('.wl-kg-input').inputValue(),'80');
  await current.locator('.wl-kg-input').fill('25');await current.locator('.wl-rp-input').fill('9');await current.locator('.wl-confirm-btn').click();
  await a.evaluate(n=>WorkoutTools.openEquipment(n),name);await a.locator('#equipment-form [name=seat]').fill('2');await a.locator('#equipment-form [type=submit]').click();
  await a.evaluate(n=>InterfaceTools.favorite(n),name);await sync(a);
  const b=await page();await sync(b);await b.evaluate(()=>AppFeatures.syncSettings('cloud'));await b.waitForFunction(()=>InterfaceTools.ready);
  const saved=await b.evaluate(({n,oldName})=>({record:ExLog.session().exercises.find(e=>e.name===n),equipment:WorkoutTools.equipment[n],old:WorkoutTools.equipment[oldName],favorite:InterfaceTools.favorites()[n],prior:ExLog._priorSets(n).length,oldPrior:ExLog._priorSets(oldName).length,metadata:ExLog.libByName(n).gym}),{n:name,oldName});
  assert.equal(saved.record.sets[0].weight,25);assert.equal(saved.record.sets[0].reps,9);assert.equal(saved.equipment.seat,'2');assert.equal(saved.old.seat,'5');assert(saved.favorite);assert.equal(saved.oldPrior,1);assert.equal(saved.prior,1);assert.equal(saved.metadata,'allday-gamil');
  const backup=await b.evaluate(async()=>SafeBackup.validate(JSON.stringify({app:'fit-tracker',version:2,data:await Backup._collect()})));assert.equal(JSON.parse(backup.ex_equipment_v1)[name].seat,'2');assert.equal(JSON.parse(backup.exercise_favorites_v1)[name],true);
  assert.deepEqual(await a.evaluate(()=>ExLog.data['2026-09-01'].exercises.map(e=>({name:e.name,sets:e.sets.map(s=>({weight:s.weight,reps:s.reps}))}))),oldSession.exercises);
  await b.reload();await b.waitForFunction(()=>InterfaceTools.ready);await b.evaluate(()=>GymInventory.open());await b.locator('#library-scope').selectOption('favorites');assert.equal(await b.locator('.lib-card').count(),1);
  await b.evaluate(()=>LibApp.goto('레그 익스텐션'));assert.equal(await b.locator('#library-catalog').inputValue(),'general');assert.equal(await b.locator('#library-scope').inputValue(),'all');assert(await b.locator('.lib-card').count()>0);
  assert.deepEqual(errors,[]);
  console.log('PASS: 5 photo guides + preserved 10-machine draft, correct seated-dip load/movement, brand filters, no routine changes, 320px layout, separate old/new history, Sheets sync, backup and restart');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
