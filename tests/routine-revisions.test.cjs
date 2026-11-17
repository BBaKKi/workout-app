// Exercise the production template/snapshot code without needing a browser.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const context={localStorage:{getItem:()=>null},storage:{set:async()=>{throw Error('Unexpected storage write');}},Backup:{KEYS:[]},LibApp:{render(){},_build(){}},ExLog:{date:'2026-11-17',plan:{},activeData:{},savePlan(){}}};
 context.window=context;vm.createContext(context);
 for(const file of ['exercise-library.js','gym-inventory.js','training-plan.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 context.ExLog.libByName=name=>context.GymInventory.find(name);
 context.RecordModel={activeDate:date=>date>=context.TRAINING_PLAN.equipmentDate,activeName:name=>!!context.GymInventory.find(name)};
 vm.runInContext(fs.readFileSync(path.join(root,'app-enhancements.js'),'utf8'),context,{filename:'app-enhancements.js'});
 const name=id=>context.GymInventory.available.find(e=>e.id===id).name;
 const rows=(day,date)=>context.AppFeatures.templateRoutine(day,date);
 return {...context,name,rows};
}
test('historical templates remain stable across both revision boundaries',()=>{
 const c=fixture(),all=date=>plain(c.TRAINING_PLAN.cycle.map(day=>c.rows(day,date).map(r=>[r.name,r.sets,r.min,r.max])));
 assert.deepEqual(all('2026-10-19'),all('2026-11-01'));
 assert.deepEqual(all('2026-11-02'),all('2026-11-16'));
 assert.deepEqual(all('2026-11-17'),all('2026-12-31'));
 assert.deepEqual(all('2026-10-17'),[[],[],[],[],[],[]]);
 assert.equal(c.rows('Push B','2026-11-01').at(-1).name,c.name('cable-overhead'));
 assert.equal(c.rows('Push B','2026-11-16').at(-1).name,c.name('paramount-triceps'));
 assert.equal(c.rows('Push B','2026-11-17').at(-1).name,c.name('cable-overhead'));
 assert(c.rows('Legs B','2026-11-16').some(r=>r.name===c.name('forward-leg-extension')));
});
test('new cycle has 64 sets with hinge before knee flexion, while other sessions stay stable',()=>{
 const c=fixture();
 assert.deepEqual(plain(c.TRAINING_PLAN.cycle.map(d=>c.rows(d).reduce((n,r)=>n+r.sets,0))),[10,11,11,11,10,11]);
 assert.deepEqual(plain(c.rows('Legs B').map(r=>[c.GymInventory.find(r.name).id,r.sets,r.min,r.max])),[
  ['cybex-45-legpress',3,10,15],['booty-loaded-back-extension',2,10,15],['lexco-masterpro-curl',3,10,15],['booty-hip-thrust',2,10,15],['cable-crunch',1,10,15]
 ]);
 for(const day of ['Push A','Pull A','Legs A','Pull B'])assert.deepEqual(plain(c.rows(day,'2026-11-16')),plain(c.rows(day,'2026-11-17')));
 assert.deepEqual(plain(c.TRAINING_PLAN.goals),{wt:84,sm:38,bf:20,ab:0.9});
 assert.equal(c.TRAINING_PLAN.end,'2026-12-31');
 assert.deepEqual(plain(c.TRAINING_PLAN.cardio),{sessions:3,min:20,max:25});
});
test('simply saving old defaults does not give a new hinge three leg-extension sets',()=>{
 const c=fixture(),old=c.name('forward-leg-extension'),next=c.name('booty-loaded-back-extension');
 c.ExLog.plan={'Legs B':{config:{[old]:{sets:3,min:10,max:15}}}};
 const row=c.rows('Legs B').find(r=>r.original===next);
 assert.deepEqual([row.name,row.sets,row.min,row.max],[next,2,10,15]);
 assert.equal(c.rows('Legs B','2026-11-16').find(r=>r.name===old).sets,3);
});
test('genuinely customised old dose stays with its exercise; explicit new dose wins',()=>{
 const c=fixture(),old=c.name('forward-leg-extension'),next=c.name('booty-loaded-back-extension');
 c.ExLog.plan={'Legs B':{config:{[old]:{sets:4,min:8,max:12}}}};
 let row=c.rows('Legs B').find(r=>r.original===next);
 assert.deepEqual([row.name,row.sets,row.min,row.max],[old,4,8,12]);
 c.ExLog.plan['Legs B'].config[next]={sets:2,min:12,max:18};
 row=c.rows('Legs B').find(r=>r.original===next);
 assert.deepEqual([row.name,row.sets,row.min,row.max],[next,2,12,18]);
});
test('explicit swaps, including opting into the new hinge, retain intended prescriptions',()=>{
 const c=fixture(),old=c.name('forward-leg-extension'),next=c.name('booty-loaded-back-extension'),custom=c.name('barbell-rdl');
 c.ExLog.plan={'Legs B':{swap:{[old]:custom},config:{[old]:{sets:2,min:8,max:12}}}};
 let row=c.rows('Legs B').find(r=>r.original===next);
 assert.deepEqual([row.name,row.sets,row.min,row.max],[custom,2,8,12]);
 c.ExLog.plan['Legs B']={swap:{[old]:next},config:{[old]:{sets:3,min:10,max:15}}};
 row=c.rows('Legs B').find(r=>r.original===next);assert.equal(row.sets,2);
 c.ExLog.plan['Legs B'].config[old]={sets:4,min:12,max:15};
 row=c.rows('Legs B').find(r=>r.original===next);assert.equal(row.sets,4);
});
test('removed previous or current slots do not reappear after a revision',()=>{
 const c=fixture(),old=c.name('forward-leg-extension'),next=c.name('booty-loaded-back-extension');
 for(const removed of [old,next]){
  c.ExLog.plan={'Legs B':{rm:[removed]}};
  assert(!c.rows('Legs B').some(r=>r.original===next));
 }
});
test('explicit machine alternatives survive the overhead-machine-overhead cycle',()=>{
 const c=fixture(),old=c.name('paramount-triceps'),next=c.name('cable-overhead'),custom=c.name('cybex-triceps-arm-extension');
 for(const source of [old,next]){
  c.ExLog.plan={'Push B':{swap:{[source]:custom},config:{[source]:{sets:3,min:12,max:18}}}};
  const row=c.rows('Push B').at(-1);
  assert.deepEqual([row.name,row.sets,row.min,row.max],[custom,3,12,18]);
 }
 c.ExLog.plan={'Push B':{swap:{[next]:old}}};
 assert.equal(c.rows('Push B').at(-1).name,old);
 c.ExLog.plan={'Push B':{swap:{[old]:custom,[next]:next}}};
 assert.equal(c.rows('Push B').at(-1).name,next);
 assert.equal(c.TRAINING_PLAN.currentSlot('Push B',next),next);
 assert.equal(c.TRAINING_PLAN.currentSlot('Push B',old),next);
});
test('existing November 2 migrations remain valid after the new revision',()=>{
 const c=fixture(),old=c.name('cable-crunch'),next=c.name('combo-a-abduction');
 c.ExLog.plan={'Legs A':{config:{[old]:{sets:1,min:10,max:15}}}};
 for(const date of ['2026-11-02','2026-11-17']){
  const row=c.rows('Legs A',date).at(-1);assert.deepEqual([row.name,row.sets,row.min,row.max],[next,2,15,20]);
 }
 c.ExLog.plan['Legs A'].config[old].sets=3;
 const row=c.rows('Legs A').at(-1);assert.equal(row.name,old);assert.equal(row.sets,3);
});
test('saved snapshots and original records remain unchanged, including future saved plans',()=>{
 const c=fixture(),saved=plain(c.rows('Legs B','2026-11-16'));
 for(const date of ['2026-11-16','2026-11-17','2026-11-20']){
  c.ExLog.activeData[date]={day:'Legs B',exercises:[{name:c.name('forward-leg-extension'),sets:[{setId:'stable-id',weight:50,reps:12}]}],routineSnapshots:{'Legs B':{day:'Legs B',source:'recorded',capturedAt:'2026-11-16T12:00:00Z',rows:plain(saved)}}};
 }
 const before=JSON.stringify({data:c.ExLog.activeData,plan:c.ExLog.plan});
 for(const date of Object.keys(c.ExLog.activeData)){
  assert.deepEqual(plain(c.AppFeatures.routine('Legs B',date)),saved);
  const copy=c.AppFeatures.routine('Legs B',date);copy[0].sets=99;
 }
 c.rows('Push B');c.rows('Legs B');c.TRAINING_PLAN.preparation('Legs B');
 assert.equal(JSON.stringify({data:c.ExLog.activeData,plan:c.ExLog.plan}),before);
});
