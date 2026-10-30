const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',serviceWorkers:'block'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.clock.install({time:new Date('2026-10-30T10:00:00Z')});
  const seed={training_config_v1:{start:'2026-10-12',end:'2026-12-31',weightMin:83.5,weightMax:84},deload_v1:{start:'2026-10-29'},block_v1:{start:'2026-09-01'},inbody_log:[{date:'2026-10-24',wt:82,sm:38.1,bf:19.9,ab:0.89}]};
  await p.addInitScript(seed=>{if(localStorage.getItem('seed'))return;for(const[k,v]of Object.entries(seed))localStorage.setItem(k,JSON.stringify(v));localStorage.setItem('seed','1');},seed);
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.ReferenceHistory?.ready);
  const base=await p.evaluate(async()=>{
   await InBody.render();PlanApp.renderPhase();
   const rows=date=>Object.fromEntries(TRAINING_PLAN.cycle.map(d=>[d,AppFeatures.templateRoutine(d,date).map(r=>({id:GymInventory.find(r.name).id,sets:r.sets}))]));
   return {early:rows('2026-10-19'),today:rows('2026-10-30'),late:rows('2026-12-30'),goals:IB_GOALS,end:TRAINING_PLAN.end,pass:GOAL_MODEL.judge(82,19.9,38.1),fail:GOAL_MODEL.judge(84,20.1,37.9),missing:GOAL_MODEL.judge(84,null,null),removed:[TRAINING_PLAN.phase,TRAINING_PLAN.schedule,ExLog.startDeload,ExLog.deloadDay,ExLog.startBlock,PlanApp.renderBlock].every(x=>x===undefined)};
  });
  assert.deepEqual(base.early,base.today);assert.deepEqual(base.late,base.today);assert(base.removed);
  assert.deepEqual(base.goals,{wt:84,sm:38,bf:20,ab:0.9});assert.equal(base.end,'2026-12-31');
  assert(base.pass.cond.every(x=>x.ok));assert(base.fail.cond.every(x=>!x.ok));assert(base.missing.cond.every(x=>!x.ok));assert.equal(base.pass.cond.length,2);
  assert.deepEqual(Object.values(base.today).map(rows=>rows.reduce((n,r)=>n+r.sets,0)),[10,11,10,11,10,11]);
  assert(base.today['Push A'].some(r=>r.id==='standing-lateral-raise-machine'));
  assert(base.today['Pull A'].some(r=>r.id==='rear-delt-fly-machine'));
  assert(base.today['Push B'].some(r=>r.id==='pec-deck-fly'));
  assert.equal(base.today['Legs B'].find(r=>r.id==='barbell-rdl').sets,2);
  assert.equal(await p.locator('#block-chip,#block-deload-note,.tr-deload').count(),0);
  assert.equal(await p.locator('#inbody-cards .plan-stat-card').first().locator('.plan-stat-bar').count(),0);
  assert((await p.locator('#inbody-projection').textContent()).includes('84kg · 달성 판정에서 제외'));

  // Existing user choices and recorded two-set day plans remain intact across the new defaults.
  const preservation=await p.evaluate(async()=>{
   const name=id=>GymInventory.available.find(e=>e.id===id).name;
   const old=name('db-lateral'),next=name('standing-lateral-raise-machine'),custom=name('cable-rear');
   ExLog.plan={'Push A':{swap:{[old]:custom},config:{[old]:{sets:4,min:10,max:16}}},'Push B':{rm:[name('decline-chest-fly')]}};
   const original=JSON.stringify(ExLog.plan),mapped=AppFeatures.templateRoutine('Push A').find(r=>r.original===next);
   const removed=!AppFeatures.templateRoutine('Push B').some(r=>r.name===name('pec-deck-fly'));
   ExLog.plan['Push A'].swap[next]=old;ExLog.plan['Push A'].config[next]={sets:5,min:8,max:12};
   const explicit=AppFeatures.templateRoutine('Push A').find(r=>r.original===next);
   ExLog.plan=JSON.parse(original);
   const frozen={...mapped,original:old,name:old,sets:2,baseSets:3},date='2026-10-29';
   ExLog.data={[date]:{day:'Push A',exercises:[{name:old,sets:[{_id:'original-set',weight:10,reps:15}]}],routineSnapshots:{'Push A':{day:'Push A',capturedAt:'2026-10-29T10:00:00Z',source:'recorded',rows:[frozen]}}}};
   const before=JSON.stringify(ExLog.data),snapshot=AppFeatures.routine('Push A',date);
   ExLog.refresh();await PlanApp.renderTrends();ExLog.markDirty(date);await ExLog.save();const backup=await Backup._collect();
   return {mapped,removed,explicit,frozen,snapshot,planUnchanged:original===JSON.stringify(ExLog.plan),recordsUnchanged:before===JSON.stringify(ExLog.data),stored:JSON.parse(backup['wl_v2:2026-10'])[date],oldSettings:[backup.deload_v1,backup.block_v1]};
  });
  assert.equal(preservation.mapped.sets,4);assert.equal(preservation.mapped.min,10);assert(preservation.removed);
  assert.equal(preservation.explicit.sets,5);assert(preservation.explicit.name.includes('덤벨'));
  assert.deepEqual(preservation.snapshot,[preservation.frozen]);assert(preservation.planUnchanged&&preservation.recordsUnchanged);
  assert.equal(preservation.stored.exercises[0].sets[0]._id,'original-set');assert(preservation.oldSettings.every(Boolean));

  const editing=await p.evaluate(async()=>{
   const name=id=>GymInventory.available.find(e=>e.id===id).name,old=name('db-lateral'),next=name('standing-lateral-raise-machine');
   ExLog.date='2026-10-29';
   ExLog.plan['Push A'].swap[next]=next;
   WorkoutTools.swap={date:ExLog.date,day:'Push A',old,name:name('cable-rear'),original:old};await WorkoutTools.applySwap('permanent');
   const oldSlotSwap=AppFeatures.templateRoutine('Push A').find(r=>r.original===next).name===name('cable-rear');
   InterfaceTools.change={action:'remove',date:ExLog.date,day:'Push A',name:old,original:old};await InterfaceTools.applyChange(true);
   const oldSlotRemoved=!AppFeatures.templateRoutine('Push A').some(r=>r.original===next);
   ExLog.plan={'Push A':{add:[old]}};ExLog.data={};ExLog.date='2026-10-30';WorkoutTools.capture('Push A');
   InterfaceTools.change={action:'remove',date:ExLog.date,day:'Push A',name:old,original:old};await InterfaceTools.applyChange(true);
   const keptNew=AppFeatures.templateRoutine('Push A').some(r=>r.name===next),removedExtra=!ExLog.plan['Push A'].add.includes(old);
   ExLog.plan={'Push A':{rm:[old,next]}};ExLog.data={};
   InterfaceTools.change={action:'add',date:ExLog.date,day:'Push A',name:next};await InterfaceTools.applyChange(true);
   return {oldSlotSwap,oldSlotRemoved,keptNew,removedExtra,restored:AppFeatures.templateRoutine('Push A').some(r=>r.name===next)};
  });
  assert.deepEqual(editing,{oldSlotSwap:true,oldSlotRemoved:true,keptNew:true,removedExtra:true,restored:true});

  const sequence=await p.evaluate(()=>{
   const name=GymInventory.available.find(e=>e.id==='hammer-incline').name,session=(day,sets=[])=>({day,exercises:sets.length?[{name,sets}]:[]});
   ExLog.plan={};ExLog.data={'2026-10-26':session('Push A',[{weight:20,reps:10}]),'2026-10-27':{...session('REST'),cardio:[{type:'걷기',min:30}]},'2026-10-28':session('Pull A',[{weight:10,reps:10,warmup:true}])};
   const next=ExLog.dayType('2026-10-30'),gap=ExLog.dayType('2026-11-04');
   ExLog.data={...ExLog.data,'2026-10-30':session('Legs B')};const manual=ExLog.dayType('2026-10-30');
   const updated={...ExLog.data,'2026-10-29':session('Pull A',[{weight:20,reps:10}])};delete updated['2026-10-30'];ExLog.data=updated;const afterPull=ExLog.dayType('2026-10-30');
   // Only saved plans count toward weekly plan totals; warmups and unsaved-day work stay distinct.
   const row={...AppFeatures.templateRoutine('Push A')[0],sets:3};
   ExLog.data={'2026-10-26':session('Push A',[{weight:20,reps:10}]),'2026-10-29':{...session('Push A',[{weight:10,reps:10,warmup:true},{weight:20,reps:10},{weight:20,reps:10}]),routineSnapshots:{'Push A':{day:'Push A',capturedAt:'2026-10-29T10:00:00Z',source:'recorded',rows:[row]}}}};
   ExLog.date='2026-10-30';ExLog.refresh();
   return {next,gap,manual,afterPull,weekly:AppFeatures.weekly(),suggestion:ExLog.suggestTarget(name).html};
  });
  assert.deepEqual([sequence.next,sequence.gap,sequence.manual,sequence.afterPull],['Pull A','Pull A','Legs B','Legs A']);
  assert.equal(sequence.weekly.sessions,1);assert.equal(sequence.weekly.total,3);assert.equal(sequence.weekly.matched,2);assert.equal(sequence.weekly.unplannedSets,1);assert.equal(sequence.weekly.unknown,1);
  assert(!/디로드|55%|최대 2세트/.test(sequence.suggestion));

  // A non-Monday date is valid for a sequential plan; legacy bounds survive only as backup data.
  await p.locator('.lbl-b').click();await p.locator('#training-config-form [name=start]').fill('2026-10-20');
  await p.locator('#training-config-form button').click();await p.waitForFunction(()=>window.ReferenceHistory?.ready&&TRAINING_PLAN.start==='2026-10-20');
  const restored=await p.evaluate(async()=>{const values=await Backup._collect();SafeBackup.validate(JSON.stringify({app:'fit-tracker',version:2,data:values}));return JSON.parse(values.training_config_v1);});
  assert.deepEqual(restored,{...seed.training_config_v1,start:'2026-10-20'});
  for(const width of [320,390,768]){
   await p.setViewportSize({width,height:844});
   for(const tab of ['.lbl-w','.lbl-b']){await p.locator(tab).click();await p.clock.runFor(100);const overflow=await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,JSON.stringify({width,tab,overflow}));}
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: original goals, weight reference only, uncapped working sets, inert legacy deload, preserved records/slot overrides/snapshots, sequential PPL, snapshot-only weekly totals, date preferences and mobile layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
