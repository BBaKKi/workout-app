const assert=require('node:assert/strict'),{backend}=require('./backend-harness.cjs');
const date='2026-06-29',workout=[['date','day','name','setNo','weight','reps','vol'],[date,'Push A','press',1,40,10,400]],inbody=[['date','wt','sm','bf'],[date,84,36,25]];
const alias=backend({'운동 기록':workout,InBody:inbody,'인바디기록':[inbody[0]]});
const before=JSON.stringify(alias.db),snap=alias.post({mode:'sync_pull'});assert(snap.ok);assert.equal(snap.workout[0].rows.length,1);assert.equal(snap.inbody[0].entry.wt,84);assert.equal(snap.source.sheets.inbody.name,'InBody');assert.equal(JSON.stringify(alias.db),before);
const diag=alias.post({mode:'sync_diagnose'});assert.equal(diag.source.sheets.workout.rows,1);assert.equal(diag.source.sheets.session.status,'missing');assert.equal(JSON.stringify(alias.db),before);
const entry={...snap.inbody[0].entry,wt:83.5};assert(alias.post({mode:'sync_write',kind:'inbody',items:[{date,expectedRevision:snap.inbody[0].revision,entry}]}).ok);assert.equal(alias.db.InBody.rows[1][1],83.5);assert.equal(alias.db['인바디기록'].rows.length,1);
for(const seed of [
 {'운동기록':[['운동일','name','weight','reps'],[date,'press',40,10]]},
 {'운동기록':[['date','날짜','name','weight','reps'],[date,date,'press',40,10]]},
 {'운동기록':[workout[0],['','Push A','press',1,40,10,400]]},
 {'운동기록':workout,'운동 기록':workout},
 {InBody:inbody,'인바디기록':inbody}
]){
 const b=backend(seed),before=JSON.stringify(b.db),failed=b.post({mode:'sync_pull'});assert.equal(failed.ok,false);assert.equal(JSON.stringify(b.db),before);
 const d=b.post({mode:'sync_diagnose'});assert.equal(d.ok,true);assert(Object.values(d.source.sheets).some(s=>s.status==='error'));assert.equal(JSON.stringify(b.db),before);
 const w=b.post({mode:'sync_write',kind:Object.hasOwn(seed,'InBody')?'inbody':'workout',items:[Object.hasOwn(seed,'InBody')?{date,expectedRevision:'0',entry:snap.inbody[0].entry}:{date,expectedRevision:'0',rows:snap.workout[0].rows}]});assert.equal(w.ok,false);assert.equal(JSON.stringify(b.db),before);
}
const missing=backend({}, {noActive:true});assert.equal(missing.post({mode:'sync_pull'}).ok,false);
const explicit=backend({'운동기록':workout},{noActive:true,spreadsheetId:'configured-id'});assert(explicit.post({mode:'sync_pull'}).ok);
const blocked=backend();assert.equal(blocked.post({mode:'sync_diagnose'},false).ok,false);assert.equal(blocked.accessed(),0);
const dates=backend({'운동기록':[workout[0],[new Date('2026-06-28T15:00:00Z'),...workout[1].slice(1)]]});assert.equal(dates.post({mode:'sync_pull'}).workout[0].date,date);
console.log('PASS: legacy tab aliases, no duplicate destination, malformed/ambiguous/missing-date reads and writes fail closed, read-only diagnostics, auth gate, explicit spreadsheet and sheet timezone');
