const assert=require('node:assert/strict'),{backend}=require('./backend-harness.cjs');
const date='2026-10-12',seed={'운동기록':[['날짜','요일','종목','세트','무게(kg)','횟수','볼륨(kg)','기록시각','비고','사용자 계산'],[date,'Push A','test',1,40,10,400,'','W RPE8 P',{formula:'=E2*F2',value:400}]]};
const b=backend(seed);assert.equal(b.post({mode:'sync_pull'},false).ok,false);assert.equal(b.accessed(),0);assert.equal(b.get().rows,undefined);assert.equal(b.post({mode:'upsert',rows:[]}).ok,false);
let s=b.post({mode:'sync_pull'});assert.equal(s.workout[0].rows[0].wu,1);assert.equal(s.workout[0].rows[0].rpe,8);assert.equal(s.workout[0].rows[0].pain,1);
let old=s.workout[0],row={...old.rows[0],weight:60,vol:600};
let r=b.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:old.revision,rows:[row]}]});assert.equal(r.results[0].status,'ok');let newer=r.results[0].record;
r=b.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:old.revision,rows:[{...row,weight:20}]}]});assert.equal(r.results[0].status,'conflict');assert.equal(r.results[0].record.rows[0].weight,60);
assert.deepEqual(b.db['운동기록'].rows[1][9],{formula:'=E2*F2',value:400});
// Replaying a successful write after losing the acknowledgement is idempotent.
r=b.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:old.revision,rows:[row]}]});assert.equal(r.results[0].status,'ok');
r=b.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:newer.revision,rows:[]}]});assert.equal(r.results[0].record.deleted,true);assert.equal(r.results[0].record.rows.length,0);assert.equal(b.post({mode:'sync_pull'}).workout[0].deleted,true);
r=b.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:newer.revision,rows:[row]}]});assert.equal(r.results[0].status,'conflict');
let w=b.post({mode:'sync_write',kind:'weight',items:[{date,expectedRevision:'0',entry:{date,wt:84,updatedAt:'2026-10-12T01:00:00Z'}}]}).results[0].record;
r=b.post({mode:'sync_write',kind:'weight',items:[{date,expectedRevision:'0',entry:{date,wt:90}}]});assert.equal(r.results[0].status,'conflict');
r=b.post({mode:'sync_write',kind:'weight',items:[{date,expectedRevision:w.revision,entry:{date,deleted:true}}]});assert.equal(r.results[0].record.deleted,true);
assert.equal(b.post({mode:'sync_write',kind:'weight',items:[{date:'2026-02-30',expectedRevision:'0',entry:{date:'2026-02-30',wt:84}}]}).ok,false);
const big=backend(),rows=Array.from({length:1000},(_,i)=>({date,name:'sets',day:'Pull A',setNo:i+1,weight:10,reps:10,vol:100,ts:'',wu:0,rpe:'',pain:0,setId:'set-'+String(i).padStart(8,'0')}));
r=big.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:'0',rows}]});assert.equal(r.ok,true);assert.equal(r.results[0].record.rows.length,1000);assert(big.db['운동기록'].writes<=3); // Header + contiguous managed fields, not 1000 RPCs.
console.log('PASS auth fail-closed, legacy flags, CAS conflicts, idempotent retry, tombstones, formula preservation, input validation and 1000-set batched writes');
const dup=backend({'운동기록':[['date','day','name','setNo','weight','reps','vol'],[date,'Push A','legacy',1,10,10,100],[date,'Push A','legacy',1,20,10,200]]});
const d=dup.post({mode:'sync_pull'}).workout[0];assert.equal(d.rows.length,2);assert.notEqual(d.rows[0].setId,d.rows[1].setId);
const keep=d.rows.find(x=>x.weight===20);const dr=dup.post({mode:'sync_write',kind:'workout',items:[{date,expectedRevision:d.revision,rows:[{...keep,setNo:1}]}]});assert.equal(dr.results[0].record.rows.length,1);assert.equal(dr.results[0].record.rows[0].setId,keep.setId);assert.equal(dr.results[0].record.rows[0].setNo,1);assert.equal(dup.post({mode:'sync_pull'}).workout[0].rows[0].weight,20);
console.log('PASS: repeated legacy set numbers migrate without dropping rows; stable ID survives deletion/reindexing');
const plan={date,snapshots:{'Push A':{day:'Push A',source:'recorded',capturedAt:'2026-10-12T12:00:00Z',rows:[{name:'press',original:'press',sets:2,baseSets:3,min:8,max:12,weight:150,index:0}]}},overrides:{}};
const planResult=b.post({mode:'sync_write',kind:'session',items:[{date,expectedRevision:'0',entry:plan}]});assert.equal(planResult.ok,true);assert.deepEqual(b.post({mode:'sync_pull'}).session[0].entry,plan);
const changed=JSON.parse(JSON.stringify(plan));changed.snapshots['Push A'].rows[0].sets=4;
assert.equal(b.post({mode:'sync_write',kind:'session',items:[{date,expectedRevision:'0',entry:changed}]}).results[0].status,'conflict');
changed.snapshots['Push A'].rows[0].name='<script>x</script>';
assert.equal(b.post({mode:'sync_write',kind:'session',items:[{date,expectedRevision:planResult.results[0].record.revision,entry:changed}]}).ok,false);
assert.equal(b.post({mode:'sync_pull'}).session[0].entry.snapshots['Push A'].rows[0].name,'press');
console.log('PASS: session metadata roundtrip, date-level CAS and invalid snapshot rejection');

// A persisted legacy ID below a blank ID row must never be generated twice.
// Different repetitions/loads are real sets, even if the migration state is mixed.
const crypto=require('node:crypto'),june='2026-06-29',machine='press';
const legacyId=n=>'legacy-'+crypto.createHash('sha256').update(JSON.stringify([june,machine,n])).digest('hex').slice(0,32);
const mixedHeader=['date','day','name','setNo','weight','reps','vol','setId','deleted','formula'];
for(const order of ['blank-first','existing-first']){
 const blank=[june,'Push A',machine,2,40,9,360,'',false,{formula:'=E2*F2',value:360}],existing=[june,'Push A',machine,1,20,10,200,legacyId(1),false,''];
 const mixed=backend({'운동기록':[mixedHeader,...(order==='blank-first'?[blank,existing]:[existing,blank])]});
 const before=JSON.stringify(mixed.db['운동기록'].rows),first=mixed.post({mode:'sync_pull'});assert.equal(first.ok,true);assert.equal(mixed.get().serverBuild,'7.2.0');
 assert.equal(JSON.stringify(mixed.db['운동기록'].rows),before); // Read must not mutate the actual sheet.
 const day=first.workout[0];assert.equal(day.rows.length,2);assert.equal(new Set(day.rows.map(x=>x.setId)).size,2);assert.equal(new Set(day.rows.map(x=>x.setNo)).size,2);
 assert.equal(day.rows.find(x=>x.weight===20).setId,legacyId(1));assert.equal(day.rows.find(x=>x.weight===40).setId,legacyId(2));
 assert.deepEqual(mixed.post({mode:'sync_pull'}),first); // Stable before persisted migration.
 const updated=day.rows.map(x=>x.weight===40?{...x,reps:11,vol:440}:x);
 const write=mixed.post({mode:'sync_write',kind:'workout',items:[{date:june,expectedRevision:day.revision,rows:updated}]});assert.equal(write.ok,true);assert.equal(write.results[0].status,'ok');assert.equal(mixed.db['운동기록'].rows.length,3);
 assert.deepEqual(mixed.db['운동기록'].rows[order==='blank-first'?1:2][9],{formula:'=E2*F2',value:360});
 const after=mixed.post({mode:'sync_pull'}).workout[0];assert.equal(after.rows.find(x=>x.weight===40).setId,legacyId(2));assert.equal(after.rows.find(x=>x.weight===40).reps,11);
 const stale=mixed.post({mode:'sync_write',kind:'workout',items:[{date:june,expectedRevision:day.revision,rows:day.rows}]});assert.equal(stale.results[0].status,'conflict');
}
// A tombstone's identity may refer to its original number after later reindexing.
const tomb=backend({'운동기록':[mixedHeader,[june,'Push A',machine,1,30,10,300,'',false,''],[june,'Push A',machine,1,20,10,200,legacyId(2),true,'']]});
const tombRead=tomb.post({mode:'sync_pull'});assert.equal(tombRead.ok,true);assert.equal(tombRead.workout[0].rows.length,1);assert.equal(tombRead.workout[0].rows[0].setId,legacyId(3));
// Truly stored duplicate IDs are not silently merged or reassigned. Include exact
// physical sheet row numbers so the user can inspect them without deleting sets.
const collision=backend({'운동기록':[mixedHeader,[june,'Push A',machine,1,20,10,200,'set-shared-0001',false,''],Array(10).fill(''),[june,'Push A','another press',2,50,8,400,'set-shared-0001',true,'']]});
const collisionBefore=JSON.stringify(collision.db['운동기록'].rows),failure=collision.post({mode:'sync_pull'});assert.equal(failure.ok,false);assert(failure.error.includes('2행과 4행'));assert(failure.error.includes('세트ID 충돌'));assert.equal(JSON.stringify(collision.db['운동기록'].rows),collisionBefore);
console.log('PASS: mixed legacy-ID migration in both row orders, existing IDs/tombstones/formulas preserved, repeatable reads, CAS conflicts and precise stored-ID collision diagnostics');
