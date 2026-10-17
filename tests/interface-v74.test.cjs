const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((q,r)=>{const f=path.join(root,q.url==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');r.end(fs.readFileSync(f));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',serviceWorkers:'block'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-26T10:00:00Z')});
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>InterfaceTools.ready);
  await p.evaluate(()=>{ExLog.date=_todayKey();ExLog.syncPanel('Push A');ExLog.updateBar();ExLog.injectTargets();ExLog.refresh();});
  assert.equal(await p.locator('.brand-version').innerText(),require('../package.json').version);
  // Simulate a standalone phone's top safe area; the sticky date row must clear it too.
  await p.evaluate(()=>document.documentElement.style.setProperty('--safe-top','24px'));
  assert.equal(await p.locator('.app-brand').evaluate(x=>getComputedStyle(x).paddingTop),'42px');
  assert.equal(await p.locator('.log-date-bar').evaluate(x=>getComputedStyle(x).top),'24px');
  await p.evaluate(()=>document.documentElement.style.removeProperty('--safe-top'));
  const name=await p.locator('.af-current .ex-nm').textContent();
  assert(name.startsWith('올데이 감일 · '));assert.equal(await p.evaluate(n=>ExLog.libByName(n).name,name),name);
  // Saving an actual set starts the dock, without turning the title into a new record key.
  await p.locator('.af-current .ex-log-add-btn').click();
  await p.locator('.af-current .wl-kg-input').fill('20');await p.locator('.af-current .wl-rp-input').fill('10');
  await p.locator('.af-current .wl-confirm-btn').click();
  assert.equal(await p.evaluate(()=>ExLog.session().exercises[0].name),name);
  assert.equal(await p.locator('.rm-toggle').getAttribute('aria-expanded'),'false');assert(!(await p.locator('#rest-controls').isVisible()));
  const before=await p.evaluate(()=>JSON.stringify(ExLog.data));
  for(const width of [320,390,768,1200]){
   await p.setViewportSize({width,height:850});
   for(const tab of ['tw','td','tl','tp','tb']){
    await p.locator('label[for='+tab+']').click();await p.clock.runFor(50);
    assert.equal(await p.locator('label[for='+tab+']').getAttribute('aria-pressed'),'true');
    const boxes=await p.evaluate(()=>{const rect=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};return {nav:rect('.top-nav'),timer:rect('.rest-mini'),overflow:document.documentElement.scrollWidth>innerWidth,w:innerWidth,h:innerHeight};});
    if(boxes.overflow)console.log(await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(x=>{const b=x.getBoundingClientRect();return b.width&&b.right>innerWidth+1}).map(x=>({tag:x.tagName,cls:x.className,id:x.id,text:x.textContent.slice(0,80),right:x.getBoundingClientRect().right})).slice(-20)));assert(!boxes.overflow,tab+' at '+width);assert(boxes.timer.width<=200);assert(boxes.timer.y>boxes.h/2);
    if(width<760)assert(boxes.timer.bottom<boxes.nav.y,'timer must clear bottom navigation');
    else assert(boxes.nav.right<=188,'desktop side navigation');
    await p.locator('.rm-toggle').click();
    const wide=await p.locator('.rest-mini').boundingBox();assert(wide.x>=0&&wide.x+wide.width<=width);
    await p.locator('.rm-toggle').press('Escape');
   }
  }
  assert.equal(await p.evaluate(()=>JSON.stringify(ExLog.data)),before,'navigation and timer must not rewrite exercise records');
  await p.setViewportSize({width:390,height:844});await p.locator('.lbl-w').click();
  await p.locator('.rm-toggle').click();const end=await p.evaluate(()=>ExLog.rest.endAt);
  await p.locator('.rm-btn').first().click();assert.equal(await p.evaluate(()=>ExLog.rest.endAt),end+30000);
  // Reload restores the deadline, not a new full-duration timer.
  const deadline=await p.evaluate(()=>ExLog.rest.endAt);await p.reload();await p.waitForFunction(()=>InterfaceTools.ready);
  assert.equal(await p.evaluate(()=>ExLog.rest.endAt),deadline);assert.equal(await p.locator('.rm-toggle').getAttribute('aria-expanded'),'false');
  // Expired timers extend from now; stale completion cleanup cannot stop a later set.
  await p.evaluate(()=>{ExLog.rest.endAt=Date.now()-5000;ExLog.tickRest();});
  assert(await p.locator('.rest-mini').evaluate(x=>x.classList.contains('done')));
  await p.locator('.rm-toggle').click();await p.locator('.rm-btn').first().click();
  const remaining=await p.evaluate(()=>ExLog.rest.endAt-Date.now());assert(remaining>29000&&remaining<=30000);
  await p.evaluate(n=>{ExLog.rest.endAt=Date.now()-100;ExLog.tickRest();ExLog.startRest(n,5);},name);
  await p.clock.runFor(8100);assert.equal(await p.evaluate(()=>ExLog.rest.name),name);assert(await p.locator('.rest-mini').isVisible());
  assert(await p.locator('.rest-mini').evaluate(x=>x.classList.contains('done')));
  await p.evaluate(n=>ExLog.startRest(n,120),name);
  // A reduced visual viewport while typing leaves the entry area clear.
  await p.locator('.af-current .ex-log-add-btn').click();
  await p.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-300});document.querySelector('.af-current .wl-kg-input').focus();visualViewport.dispatchEvent(new Event('resize'));});
  assert.equal(await p.locator('.rest-mini').evaluate(x=>getComputedStyle(x).visibility),'hidden');
  await p.evaluate(()=>{delete visualViewport.height;document.activeElement.blur();visualViewport.dispatchEvent(new Event('resize'));});
  assert(await p.locator('.rest-mini').isVisible());
  await p.locator('.af-current .wl-cancel-btn').click();
  await p.locator('.af-current .exercise-guide>summary').click();
  assert.equal(await p.locator('.af-current .coach-group').count(),4);
  await p.locator('.af-current .coach-group').nth(2).locator('summary').click();
  await p.locator('.af-current .coach-group').nth(3).locator('summary').click();
  const guide=await p.locator('.af-current .coach-body').innerText();for(const word of ['팔꿈치','수행 순서','근육','멈추고 확인할 신호'])assert(guide.includes(word),word);
  await p.locator('.rm-toggle').click();await p.locator('.rm-end').click();
  assert(!(await p.locator('.rest-mini').isVisible()));assert.equal(await p.evaluate(()=>document.activeElement.htmlFor),'tw');
  assert.equal(await p.evaluate(()=>JSON.stringify(ExLog.data)),before);assert.deepEqual(errors,[]);
  console.log('PASS: mobile dock and desktop navigation, no top-row timer, expansion/Escape/+30/stop, saved deadline resume, stale timeout isolation, keyboard viewport clearance, exact-name records and four-section coaching');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
