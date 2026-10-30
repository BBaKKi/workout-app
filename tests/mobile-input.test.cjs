const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',serviceWorkers:'block'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-30T10:00:00Z')});await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>InterfaceTools.ready);
  const original=await p.evaluate(()=>AppFeatures.routine('Push A')[0].name);
  assert.equal(await p.locator('.wl-wu-btn').count(),0);
  const firstButton=await p.locator('.af-current .ex-log-add-btn').boundingBox(),nav=await p.locator('.top-nav').boundingBox();
  assert(firstButton.y+firstButton.height<nav.y,'first set action should fit above phone navigation');
  // Real input path: touching every exercise must not finish a 10-set plan.
  for(let i=0;i<4;i++){
   await p.locator('.af-current .ex-log-add-btn').click();await p.locator('.af-current .wl-kg-input').fill('20');await p.locator('.af-current .wl-rp-input').fill('10');await p.locator('.af-current .wl-confirm-btn').click();
   if(i<3)await p.locator('#focus-next').click();
  }
  assert.equal(await p.locator('#done-toast').count(),0);assert((await p.locator('#log-progress').innerText()).includes('4/10본세트'));
  assert.equal(await p.evaluate(()=>AppFeatures.weekly().matched),4);
  // Extra sets of one exercise and old warmups cannot complete missing targets.
  await p.evaluate(()=>{const s=ExLog.session();s.exercises[0].sets.push(...Array.from({length:7},()=>({weight:20,reps:10})));s.exercises[1].sets.push({weight:5,reps:12,warmup:true});ExLog.setSession(s);ExLog.refresh();ExLog._maybeSessionDone();});
  assert.equal(await p.locator('#done-toast').count(),0);assert.equal(await p.evaluate(()=>ExLog.sessionProgress().matched),6);
  await p.evaluate(()=>{const s=ExLog.session();for(const row of AppFeatures.routine('Push A')){const ex=s.exercises.find(e=>e.name===row.name);while(ex.sets.filter(_isWorkSet).length<row.sets)ex.sets.push({weight:20,reps:10});}ExLog.setSession(s);ExLog.refresh();ExLog._maybeSessionDone();});
  assert((await p.locator('#done-toast').innerText()).includes('목표 본세트 완료'));assert.equal(await p.evaluate(()=>ExLog.sessionProgress().matched),10);
  // A legacy warmup remains a warmup when edited through the new working-set-only editor.
  await p.locator('#focus-exercise').selectOption('1');
  await p.locator('.af-current .wl-set-chip[data-i="1"]').click();await p.locator('.af-current .wl-rp-input').fill('14');await p.locator('.af-current .wl-confirm-btn').click();
  assert.equal(await p.evaluate(()=>ExLog.session().exercises[1].sets[1].warmup),true);
  assert.equal(await p.evaluate(()=>ExLog._syncRows().filter(r=>r.wu===1).length),1);
  await p.locator('.af-current .ex-log-add-btn').click();await p.locator('.af-current .wl-rp-input').fill('10');await p.locator('.af-current .wl-confirm-btn').click();
  assert.equal(await p.evaluate(()=>!!ExLog.session().exercises[1].sets.at(-1).warmup),false);
  await p.locator('#undo-set').click();assert.equal(await p.evaluate(()=>ExLog.session().exercises[1].sets[1].warmup),true);
  const progression=await p.evaluate(name=>{
   const data=ExLog.data,date=ExLog.date;
   const session=()=>({day:'Push A',exercises:[{name,sets:[{weight:20,reps:12},{weight:20,reps:12},{weight:20,reps:12,rpe:8}]}]});
   try{ExLog.data={'2026-10-26':session(),'2026-10-28':session()};ExLog.date='2026-10-30';
    const lastOnly=ExLog.suggestTarget(name).up;delete ExLog.data['2026-10-26'].exercises[0].sets[2].rpe;ExLog.markDirty('2026-10-26');const missing=ExLog.suggestTarget(name);
    ExLog.data['2026-10-26']=session();ExLog.data['2026-10-28'].exercises[0].sets[0].rpe=9;ExLog.markDirty('2026-10-28');const hard=ExLog.suggestTarget(name).up;
    return {lastOnly,missing:missing.html,missingUp:missing.up,hard};
   }finally{ExLog.data=data;ExLog.date=date;}
  },original);
  assert.equal(progression.lastOnly,true);assert.equal(progression.missingUp,false);assert(progression.missing.includes('RPE 미입력'));assert.equal(progression.hard,false);
  // Every input, including closed settings/dialogs, has a readable computed font.
  for(const width of [320,390,768]){
   await p.setViewportSize({width,height:844});
   for(const tab of ['tw','tl','tp','tb']){await p.locator('label[for='+tab+']').click();await p.clock.runFor(50);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,tab+' '+width);}
   await p.evaluate(()=>AppFeatures.openEditor('Push A'));
   const small=await p.evaluate(()=>[...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]),select,textarea')].filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>({id:e.id,cls:e.className,size:getComputedStyle(e).fontSize})));
   assert.deepEqual(small,[],width+' input font floor');await p.locator('#routine-editor button[aria-label="닫기"]').click();
  }
  await p.setViewportSize({width:390,height:844});await p.locator('label[for=tw]').click();await p.locator('.af-current .ex-log-add-btn').click();
  for(const selector of ['.wl-kg-input','.wl-rp-input','.wl-rpe-sel']){await p.locator('.af-current '+selector).focus();assert.equal(await p.evaluate(()=>visualViewport.scale),1);}
  assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).touchAction),'manipulation');
  assert(!/user-scalable=no|maximum-scale=1/.test(await p.locator('meta[name=viewport]').getAttribute('content')));
  const preserved=await p.evaluate(async()=>{await ExLog.save();return JSON.stringify(await Backup._collect());});assert(preserved.includes('warmup'));
  assert.deepEqual(errors,[]);
  console.log('PASS: working-set-only input, legacy warmup edit/sync/backup, true per-exercise completion, last-set RPE, mobile font floor, no viewport overflow, first-screen action and retained pinch zoom (physical iOS keyboard not emulated)');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
