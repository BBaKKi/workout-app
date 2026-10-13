/* Pure data validation, shared with the Apps Script copy and backup importer. */
(function(root){
 function validateSession(entry,date){
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x), bad=()=>{throw new Error('세션 계획 형식 오류');};
  const name=s=>{if(typeof s!=='string'||!s.trim()||s.length>200||/[<>]/.test(s))bad();};
  const tree=x=>{if(!x||typeof x!=='object')return;for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k))bad();tree(x[k]);}};
  const days=['Push A','Pull A','Legs A','Push B','Pull B','Legs B'];
  if(!obj(entry)||entry.date!==date||JSON.stringify(entry).length>45000)bad();tree(entry);
  if(!obj(entry.snapshots)||!obj(entry.overrides))bad();
  for(const [day,s] of Object.entries(entry.snapshots)){
   if(!days.includes(day)||!obj(s)||s.day!==day||!Array.isArray(s.rows)||s.rows.length>150||!['recorded','reconstructed'].includes(s.source)||typeof s.capturedAt!=='string')bad();
   const names=new Set(),originals=new Set();
   s.rows.forEach(r=>{if(!obj(r))bad();name(r.name);name(r.original);if(names.has(r.name)||originals.has(r.original))bad();names.add(r.name);originals.add(r.original);
    ['sets','baseSets','min','max','weight','index'].forEach(k=>{if(!Number.isFinite(r[k])||r[k]<0)bad();});
    if(!Number.isInteger(r.sets)||r.sets<1||r.sets>20||!Number.isInteger(r.baseSets)||r.baseSets<1||r.baseSets>20||!Number.isInteger(r.min)||!Number.isInteger(r.max)||r.min<1||r.max<r.min||r.max>1000)bad();
    if(r.skipped!==undefined&&typeof r.skipped!=='boolean')bad();
   });
  }
  for(const [day,v] of Object.entries(entry.overrides)){if(!days.includes(day)||!obj(v))bad();Object.entries(v).forEach(([a,b])=>{name(a);name(b);});}
  if(entry.context!==undefined){
   const c=entry.context;if(!obj(c)||!obj(c.cond)||typeof c.note!=='string'||c.note.length>200)bad();
   if(c.cond.rate!==undefined&&(!Number.isInteger(c.cond.rate)||c.cond.rate<1||c.cond.rate>5))bad();
   if(c.cond.sleep!==undefined&&(!Number.isFinite(c.cond.sleep)||c.cond.sleep<0||c.cond.sleep>24))bad();
  }
  return entry;
 }
 function validateRecordMeta(meta){
  if(meta==null)return {};
  const bad=()=>{throw new Error('기록 단위·부하 정보 형식 오류');};
  if(typeof meta!=='object'||Array.isArray(meta)||JSON.stringify(meta).length>5000)bad();
  for(const [key,v] of Object.entries(meta)){
   if(key==='exerciseId'){if(typeof v!=='string'||!v.startsWith('exercise:')||v.length>2000)bad();}
   else if(key==='unit'){if(!['reps','seconds','meters'].includes(v))bad();}
   else if(['bw','ew','km','incline'].includes(key)){if(!Number.isFinite(v)||v<0||v>({bw:500,ew:100500,km:2000,incline:100}[key]))bad();}
   else bad();
  }
  return meta;
 }
 root.validateSession=validateSession;
 root.validateRecordMeta=validateRecordMeta;
})(typeof window==='undefined'?globalThis:window);
