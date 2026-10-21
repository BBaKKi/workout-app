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
  await p.clock.install({time:new Date('2026-11-05T10:00:00Z')});await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>InterfaceTools.ready);return p;
 }
 async function sync(p){await p.evaluate(async({url,TOKEN})=>{clearTimeout(ExLog._syncTimer);localStorage.setItem('gs_script_url',url);localStorage.setItem('gs_tokens_v5',JSON.stringify({[url]:TOKEN}));await ExLog.syncToSheets(url);if(ExLog.syncMessage)throw new Error(ExLog.syncMessage);},{url,TOKEN});}
 try{
  const oldName='머신 숄더 프레스',oldSession={day:'Push A',exercises:[{name:oldName,sets:[{weight:80,reps:10}]}]};
  const a=await page({'wl_v2:2026-09':{'2026-09-01':oldSession},ex_base:{[oldName]:20},ex_memo:{[oldName]:'옛 짐 좌석 5'},ex_equipment_v1:{[oldName]:{seat:'5'}}});
  await sync(a);await a.evaluate(()=>DataSync.resolve(0,'local'));await sync(a);
  const planBefore=await a.evaluate(()=>JSON.stringify(ExLog.plan));
  const routineBefore=await a.evaluate(()=>JSON.stringify({items:TRAINING_PLAN.items,plans:ExLog.plan,templates:TRAINING_PLAN.cycle.map(d=>WorkoutTools.template(d)),snapshot:ExLog.session().routineSnapshots}));
  const transition=await a.evaluate(()=>{
    const saved=JSON.stringify(ExLog.plan),old=WorkoutTools.template('Push A','2026-10-17'),next=WorkoutTools.template('Push A','2026-10-26');
    const oldRows=JSON.parse(JSON.stringify(old));ExLog.data['2026-10-26']={day:'Push A',exercises:[],routineSnapshots:{'Push A':{day:'Push A',source:'recorded',capturedAt:'2026-10-17T10:00:00Z',rows:oldRows}}};
    const frozen=AppFeatures.routine('Push A','2026-10-26');delete ExLog.data['2026-10-26'];
    return {old:old.map(r=>r.name),next:next.map(r=>r.name),frozen:frozen.map(r=>r.name),saved:saved===JSON.stringify(ExLog.plan),valid:Object.values(TRAINING_PLAN.items).flat().every(([n])=>GymInventory.available.some(e=>e.name===n)),limited:WorkoutTools.template('Legs A','2026-10-19').every(r=>r.sets<=2),sources:new Set([...GymInventory.available.flatMap(e=>GymInventory.evidenceFiles(e)),...GymInventory.stations.map(e=>e.photo)]).size};
  });
  assert.deepEqual(transition.old,[]);assert(transition.next.every(n=>n.startsWith('올데이 감일 · ')));assert.deepEqual(transition.frozen,transition.old);assert(transition.saved&&transition.valid&&transition.limited);assert.equal(transition.sources,52);
  await a.locator('.lbl-l').click();await a.waitForFunction(()=>document.querySelectorAll('.lib-card').length===63);
  assert(await a.locator('#gym-photo-info').isVisible());
  await a.locator('.library-filter-panel>summary').click();
  assert.equal(await a.locator('#library-catalog').count(),0);
  await a.locator('#library-equipment').selectOption('브랜드 미확인');assert.equal(await a.locator('.lib-card').count(),await a.evaluate(()=>GymInventory.available.filter(e=>e.brand==='브랜드 미확인').length));
  await a.locator('#library-equipment').selectOption('Technogym');assert.equal(await a.locator('.lib-card').count(),1);
  await a.evaluate(()=>GymInventory.select('allday-gamil'));
  const photoNames=await a.evaluate(()=>GymInventory.confirmed.map(e=>e.name));
  for(const photoName of photoNames){
    await a.evaluate(n=>LibApp.goto(n),photoName);await a.locator('.lib-card .exercise-guide>summary').click();
    assert(await a.locator('.lib-card .coach-body').isVisible());
    assert(/\.jpe?g/i.test(await a.locator('.lib-card .gym-source').innerText()));
    assert.equal(await a.locator('.lib-card .gym-source a').count(),0);
    assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  const dip=await a.evaluate(()=>{const e=GymInventory.confirmed.find(e=>e.id==='seated-dip-press');return {type:ExLog.loadTypeOf(e.name),steps:ExerciseCoaching.get(e).steps.join(' '),variant:ExerciseCoaching.get(e).variant};});
  assert.equal(dip.type,'normal');assert(dip.steps.includes('손잡이를 아래로'));assert(!/보조판|몸을 올립니다/.test(dip.steps));assert.deepEqual(dip.variant,[]);
  for(const id of ['db-calf','cable-rear','cable-overhead','tbar-available']){
    await a.evaluate(id=>LibApp.goto(GymInventory.accessories.find(e=>e.id===id).name),id);
    await a.locator('.lib-card .exercise-guide>summary').click();
    assert((await a.locator('.lib-card .gym-source').innerText()).includes(id.startsWith('cable-')?'IMG_5861.jpeg':'사용자 보유 확인'));
    assert.equal(await a.locator('.lib-card .gym-source a').count(),0);assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.equal(await a.evaluate(()=>_movePat(GymInventory.confirmed.find(e=>e.id==='decline-chest-fly').name)),'플라이');
  assert.equal(await a.evaluate(()=>_loadGuess('어시스트 딥스 머신')),'assist');
  assert.equal(await a.evaluate(()=>_loadGuess('딥스')),'bw');
  const added=await a.evaluate(()=>{
    const byId=id=>GymInventory.available.find(e=>e.id===id);
    return {
      assist:['newtech-assisted-pullup','newtech-assisted-dip'].map(id=>{const e=byId(id);return {type:ExLog.loadTypeOf(e.name),heavy:ExLog.effW(e.name,30,ExLog.date,85),light:ExLog.effW(e.name,20,ExLog.date,85),station:e.stationId,source:e.source.file};}),
      shoulders:['legend-shoulder-press','telju-shoulder-press'].map(id=>{const e=byId(id);return [e.vol.p,_movePat(e.name),ExLog.loadTypeOf(e.name)];}),
      cable:GymInventory.accessories.filter(e=>e.stationId==='drax-cable-station').map(e=>[e.brand,e.status,e.source.file]),
      row:{name:byId('newtech-cable-row').name,files:GymInventory.evidenceFiles(byId('newtech-cable-row'))},
      bench:{name:byId('hammer-horizontal').name,files:GymInventory.evidenceFiles(byId('hammer-horizontal'))},
      counts:[GymInventory.confirmed.length,GymInventory.accessories.length,new Set(GymInventory.available.map(e=>e.id)).size]
    };
  });
  assert.deepEqual(added.assist,Array(2).fill({type:'assist',heavy:55,light:65,station:'newtech-assisted-chin-dip',source:'IMG_5862.jpeg'}));
  assert.deepEqual(added.shoulders,Array(2).fill(['전면삼각','수직 프레스','normal']));
  assert.deepEqual(added.cable,Array(6).fill(['DRAX','confirmed','IMG_5861.jpeg']));
  assert.deepEqual(added.counts,[50,13,63]);
  assert.deepEqual(await a.evaluate(()=>{const e=GymInventory.find('올데이 감일 · 케이블 랫 풀다운');return [e.brand,e.source.file,e.stationId||null];}),['브랜드 미확인','IMG_5842.JPEG',null]);
  assert.deepEqual(added.row,{name:'올데이 감일 · Newtech 케이블 시티드 로우',files:['IMG_5855.JPEG','IMG_5855(1).jpeg','IMG_5860.jpeg']});
  assert.deepEqual(added.bench,{name:'올데이 감일 · Hammer ISO 호라이즌털 벤치프레스',files:['IMG_5805.JPEG','IMG_5865.jpeg']});
  await a.evaluate(()=>GymInventory.select());
  await a.locator('#library-equipment').selectOption('DRAX');assert.equal(await a.locator('.lib-card').count(),6);
  await a.locator('#library-equipment').selectOption('Legend');assert.equal(await a.locator('.lib-card').count(),1);
  await a.locator('#library-equipment').selectOption('Telju');assert.equal(await a.locator('.lib-card').count(),1);
  assert.equal(await a.evaluate(()=>JSON.stringify({items:TRAINING_PLAN.items,plans:ExLog.plan,templates:TRAINING_PLAN.cycle.map(d=>WorkoutTools.template(d)),snapshot:ExLog.session().routineSnapshots})),routineBefore);
  const name=photoNames[0];
  assert.equal(await a.evaluate(()=>new Set(GymInventory.entries.map(e=>e.name)).size),63);
  assert.equal(await a.locator('#gym-status-filter').count(),0);
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
  assert.equal(saved.record.sets[0].weight,25);assert.equal(saved.record.sets[0].reps,9);assert.equal(saved.equipment.seat,'2');assert.equal(saved.old.seat,'5');assert(saved.favorite);assert.equal(saved.oldPrior,0);assert.equal(saved.prior,1);assert.equal(saved.metadata,'allday-gamil');
  const backup=await b.evaluate(async()=>SafeBackup.validate(JSON.stringify({app:'fit-tracker',version:2,data:await Backup._collect()})));assert.equal(JSON.parse(backup.ex_equipment_v1)[name].seat,'2');assert.equal(JSON.parse(backup.exercise_favorites_v1)[name],true);
  assert.deepEqual(await a.evaluate(()=>ExLog.data['2026-09-01'].exercises.map(e=>({name:e.name,sets:e.sets.map(s=>({weight:s.weight,reps:s.reps}))}))),oldSession.exercises);
  await b.reload();await b.waitForFunction(()=>InterfaceTools.ready);await b.evaluate(()=>GymInventory.open());await b.locator('.library-filter-panel>summary').click();await b.locator('#library-scope').selectOption('favorites');assert.equal(await b.locator('.lib-card').count(),1);
  await b.evaluate(()=>LibApp.goto(GymInventory.available.find(e=>e.id==='forward-leg-extension').name));assert.equal(await b.locator('.lib-card').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: 50 photo guides + 13 accessories / retired catalogs removed, correct seated-dip load/movement, brand filters, catalog navigation leaves routines unchanged, 320px layout, separate old/new history, Sheets sync, backup and restart');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
