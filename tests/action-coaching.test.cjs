const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-26T10:00:00Z')});
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>InterfaceTools.ready);
  const unchanged=await p.evaluate(()=>JSON.stringify({plan:TRAINING_PLAN,custom:ExLog.plan,records:ExLog.data}));
  const guides=await p.evaluate(()=>EXERCISE_LIBRARY.map(e=>({id:e.id,execution:e.execution,html:ExerciseCoaching.html(e),cat:e.cat,groups:e.libraryGroups})));
  assert.equal(guides.length,64);assert.equal(new Set(guides.map(e=>e.id)).size,64);
  for(const e of guides){
   assert.deepEqual(Object.keys(e.execution),['grip','brace','drive','feel','watch']);
   for(const [key,text]of Object.entries(e.execution)){assert(text.length>=15&&text.length<=130,e.id+' '+key+' must stay concise');assert(e.html.includes('data-cue="'+key+'"'));}
   assert.equal((e.html.match(/class="coach-action-row /g)||[]).length,5);
   assert(e.html.indexOf('coach-action')<e.html.indexOf('<details class="exercise-guide"'));
  }
  await p.locator('.lbl-l').click();await p.waitForFunction(()=>document.querySelectorAll('.lib-card').length===64);
  for(const cat of ['push','pull','legs','core','small']){
   await p.locator('.lib-chip[data-c='+cat+']').click();
   const expected=guides.filter(e=>e.cat===cat||e.groups.includes(cat));
   assert(expected.length>0,cat+' must not be an empty category');
   assert.equal(await p.locator('.lib-card').count(),expected.length);
   assert.equal(await p.locator('.lib-chip[data-c='+cat+']').getAttribute('aria-pressed'),'true');
   assert.equal(await p.locator('.lib-chip[aria-pressed=true]').count(),1);
  }
  assert.equal(await p.locator('.lib-card').count(),12);assert(await p.locator('#lib-category-note').isVisible());
  assert((await p.locator('#lib-category-note').innerText()).includes('중복 집계하지'));
  assert.deepEqual(await p.evaluate(()=>LibApp._items.map(e=>e.id).sort()),['seated-dip-press','paramount-triceps','db-lateral','db-curl','db-hammer','db-calf','cable-rear','cable-pushdown','cable-overhead','cable-facepull','newtech-assisted-dip','cybex-arm-curl'].sort());
  await p.locator('.lib-search').fill('암컬');await p.clock.runFor(150);
  assert.equal(await p.locator('.lib-card').count(),1);
  await p.locator('.lib-card>summary').click();
  await p.clock.runFor(50);await p.locator('.lib-card .coach-notice').waitFor({state:'visible'});
  assert(await p.locator('.lib-card .coach-notice').isVisible());
  assert((await p.locator('.lib-card .coach-notice').innerText()).includes('모순'));
  assert((await p.locator('.lib-card [data-cue=drive]').innerText()).includes('어깨 쪽으로'));
  assert.equal(await p.locator('.lib-card .coach-action-row:visible').count(),5);
  assert(!(await p.locator('.lib-card .coach-body').isVisible()));
  const curl=await p.evaluate(()=>{const e=EXERCISE_LIBRARY.find(e=>e.id==='cybex-arm-curl');return {name:e.name,cat:e.cat,type:ExLog.loadTypeOf(e.name),source:e.source.file};});
  assert.deepEqual(curl,{name:'올데이 감일 · Cybex 바이셉스 암컬',cat:'pull',type:'normal',source:'IMG_5866.jpeg'});
  // The same curl remains in Pull; secondary grouping never duplicates an entry.
  await p.locator('.lib-chip[data-c=pull]').click();assert.equal(await p.locator('.lib-card').count(),1);
  assert(!(await p.locator('#lib-category-note').isVisible()));
  await p.evaluate(()=>GymInventory.select());
  assert.equal(await p.locator('.lib-chip[data-c=all]').getAttribute('aria-pressed'),'true');
  await p.locator('.library-filter-panel>summary').click();await p.locator('#library-equipment').selectOption('Cybex');
  await p.locator('.lib-chip[data-c=small]').click();assert.equal(await p.locator('.lib-card').count(),1);
  // Both workout cards and library cards use the same five-cue renderer.
  await p.locator('.lbl-w').click();assert.equal(await p.locator('.af-current .coach-action-row').count(),5);
  await p.locator('.lbl-l').click();await p.clock.runFor(100);
  for(const id of ['cybex-arm-curl','newtech-cable-row','hammer-front-lat','cybex-hack','newtech-assisted-dip','db-lateral']){
   await p.evaluate(id=>LibApp.goto(EXERCISE_LIBRARY.find(e=>e.id===id).name),id);
   assert.equal(await p.locator('.lib-card .coach-action-row:visible').count(),5);
   await p.locator('.lib-card .exercise-guide>summary').click();
   for(const width of [320,390,768,1200]){
    await p.setViewportSize({width,height:850});
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,id+' at '+width);
   }
  }
  assert.equal(await p.evaluate(()=>JSON.stringify({plan:TRAINING_PLAN,custom:ExLog.plan,records:ExLog.data})),unchanged);
  const escaped=await p.evaluate(()=>{const e=structuredClone(EXERCISE_LIBRARY.find(e=>e.id==='cybex-arm-curl'));e.execution.grip='<img src=x onerror=alert(1)>';e.executionNotice.text='<script>bad()</script>';return ExerciseCoaching.html(e);});
  assert(!escaped.includes('<img'));assert(!escaped.includes('<script>'));assert(escaped.includes('&lt;img'));
  assert.deepEqual(errors,[]);
  console.log('PASS: 64 concise five-cue guides, 12 overlapping small-muscle entries, Cybex label warning, brand/search filters, no duplicate records, 320–1200px and escaped content');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
