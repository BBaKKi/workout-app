/** 운동기록 API v5 — 기존 배포를 '새 버전'으로 업데이트하면 URL을 유지합니다.
 * 기존 열은 이동/삭제하지 않고, 없는 열만 뒤에 추가합니다.
 * POST: authenticated sync_pull / sync_write / settings_get / settings_put. GET: status only.
 * 이전 flag 열과 새 wu/rpe/pain 열, 한글·영문 헤더를 모두 읽습니다.
 */
var API_VERSION = 5;
var WORKOUT_SHEET = '운동기록';
var INBODY_SHEET = '인바디기록';
var WEIGHT_SHEET = '체중기록';
var SETTINGS_SHEET = '앱설정';
var WEIGHT_FIELDS = ['date','wt','deleted','updatedAt'];
var WEIGHT_HEADER = ['날짜','체중(kg)','삭제','수정시각'];
var SETTINGS_FIELDS = ['prefKey','prefValue','revision','updatedAt'];
var SETTINGS_HEADER = ['설정키','설정값','버전','수정시각'];
var SETTINGS_KEYS = ['plan_v3','plan_v2','routine_profile','ex_base','ex_rest','ex_memo','ex_load','brand_coef','ex_alias','block_v1','deload_v1','training_config_v1'];
var WORKOUT_FIELDS = ['date','day','name','setNo','weight','reps','vol','ts','wu','rpe','pain','setId','deleted'];
var WORKOUT_HEADER = ['날짜','요일','종목','세트','무게(kg)','횟수','볼륨(kg)','기록시각','워밍업','RPE','통증','세트ID','삭제'];
var INBODY_FIELDS = ['date','wt','sm','bf','ab','waist','vf','pa','bmr'];
var INBODY_HEADER = ['날짜','체중(kg)','골격근량(kg)','체지방률(%)','복부지방률','허리둘레(cm)','내장지방레벨','위상각','기초대사량'];
var HEADER_ALIASES = {
 setId:['세트ID','setId'],deleted:['삭제','deleted'],updatedAt:['수정시각','updatedAt'],prefKey:['설정키','prefKey'],prefValue:['설정값','prefValue'],revision:['버전','revision'],
 date:['날짜','date'],day:['요일','day'],name:['종목','name'],setNo:['세트','setNo'],
 weight:['무게(kg)','weight'],reps:['횟수','reps'],vol:['볼륨(kg)','vol'],ts:['기록시각','ts'],
 wu:['워밍업','wu','warmup'],rpe:['RPE','rpe'],pain:['통증','pain'],flag:['비고','flag'],
 wt:['체중(kg)','wt'],sm:['골격근량(kg)','sm'],bf:['체지방률(%)','bf'],ab:['복부지방률','ab'],
 waist:['허리둘레(cm)','허리둘레','waist'],vf:['내장지방레벨','vf'],pa:['위상각','pa'],bmr:['기초대사량','기초대사량(kcal)','bmr']
};
// Set FIT_API_TOKEN (32+ random characters) in Project Settings > Script properties.
// Fail closed until a key is configured. Do not put the key in GitHub or a URL.
function _authorize(b) {
 var token=PropertiesService.getScriptProperties().getProperty('FIT_API_TOKEN');
 if(!token||token.length<32)throw new Error('연결키 미설정: Apps Script의 FIT_API_TOKEN을 설정하세요.');
 if(!b||typeof b.token!=='string'||b.token.length!==token.length)throw new Error('연결키가 올바르지 않습니다.');
 var diff=0;for(var i=0;i<token.length;i++)diff|=token.charCodeAt(i)^b.token.charCodeAt(i);
 if(diff)throw new Error('연결키가 올바르지 않습니다.');
}
function doGet() {return _json({ok:true,alive:true,apiVersion:API_VERSION,authRequired:true});}
function doPost(e) {
 var b=_parseBody(e),lock;
 try {
  _authorize(b); // Authentication must precede any spreadsheet access or lock acquisition.
  lock=LockService.getScriptLock();lock.waitLock(20000);
  if(b.mode==='sync_pull')return _json(_syncPull());
  if(b.mode==='sync_write')return _json(_syncWrite(b));
  if(b.mode==='settings_get')return _json(_settingsGet());
  if(b.mode==='settings_put')return _json(_settingsPut(b));
  throw new Error('API v5 앱으로 업데이트하세요. 이전 방식의 전체 업로드·삭제는 차단됩니다.');
 }catch(err){return _json({ok:false,apiVersion:API_VERSION,error:String(err.message||err)});}
 finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function _parseBody(e){try{return JSON.parse(e.postData.contents);}catch(_){try{return {mode:e.parameter.mode||'upsert',rows:JSON.parse(e.parameter.rows)};}catch(__){return null;}}}
function _has(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function _number(v,k,min,max){if(v===''||v===null||v===undefined||!isFinite(Number(v))||Number(v)<min||Number(v)>max)throw new Error(k+' 값이 올바르지 않습니다.');return Number(v);}
function _date(d){if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||isNaN(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw new Error('날짜가 올바르지 않습니다.');return d;}
function _validateKey(r){if(!r||!r.name||typeof r.name!=='string')throw new Error('종목명이 필요합니다.');_date(r.date);var n=_number(r.setNo,'setNo',1,100000);if(n%1)throw new Error('세트 번호는 정수여야 합니다.');}
function _dstr(v){return v instanceof Date?Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd'):String(v||'').slice(0,10);}
function _key(r){return JSON.stringify([r.date,r.name,Number(r.setNo)]);}
function _headerMap(header){var map={};Object.keys(HEADER_ALIASES).forEach(function(k){var aliases=HEADER_ALIASES[k];for(var i=0;i<header.length;i++)if(aliases.indexOf(String(header[i]).trim())>=0){map[k]=i;break;}});return map;}
function _table(name,fields,header,write){
 var ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName(name);
 if(!s){if(!write)return null;s=ss.insertSheet(name);}
 var width=s.getLastColumn(),h=width?s.getRange(1,1,1,width).getValues()[0]:[],map=_headerMap(h);
 if(write){fields.forEach(function(k,i){if(map[k]===undefined){map[k]=h.length;h.push(header[i]);}});
  if(h.length!==width){s.getRange(1,width+1,1,h.length-width).setValues([h.slice(width)]);s.setFrozenRows(1);}}
 var n=s.getLastRow(),rows=n>1&&h.length?s.getRange(2,1,n-1,h.length).getValues():[];
 return {sheet:s,fields:fields,header:h,map:map,rows:rows};
}
function _object(t,row){var out={};Object.keys(t.map).forEach(function(k){out[k]=row[t.map[k]];});if(out.date)out.date=_dstr(out.date);if(row._fitId){out.setId=row._fitId;out.setNo=row._fitNo;}return out;}
function _flags(r){
 var f=String(r.flag||''),m=f.match(/RPE\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
 var truth=function(v){return v===true||v===1||v==='1'||v==='true'||v==='W'||v==='P';};
 return {wu:_has(r,'wu')&&r.wu!==''?+truth(r.wu):(/(?:^|[\s,;|])W(?:$|[\s,;|])/.test(f)?1:0),
 rpe:_has(r,'rpe')&&r.rpe!==''?Number(r.rpe)||'':(m?Number(m[1]):''),
 pain:_has(r,'pain')&&r.pain!==''?+truth(r.pain):(/(?:^|[\s,;|])P(?:$|[\s,;|])/.test(f)?1:0)};
}
function _flagString(r){return [r.wu?'W':'',r.rpe?'RPE'+r.rpe:'',r.pain?'P':''].filter(Boolean).join(' ');}
function _workout(r){
 var x={date:r.date,day:r.day||'',name:r.name,setNo:Number(r.setNo),weight:Number(r.weight),reps:Number(r.reps),vol:r.vol!=null?Number(r.vol):Math.round(r.weight*r.reps),ts:r.ts||new Date().toISOString()};
 // 이전 클라이언트가 보내지 않은 항목은 보존하고, 명시적인 빈칸은 해제로 처리합니다.
 if(_has(r,'flag')||_has(r,'wu')||_has(r,'rpe')||_has(r,'pain')){
  var f=_flags(r);x.wu=f.wu;x.rpe=f.rpe;x.pain=f.pain;x.flag=_flagString(f);
 }
 return x;
}
function _upsert(t,x,keys){
 var at=-1;for(var i=0;i<t.rows.length;i++){var o=_object(t,t.rows[i]);if(keys.every(function(k){return String(o[k])===String(x[k]);})){at=i;break;}}
 var existed=at>=0;if(!existed){at=t.rows.length;t.rows.push(Array(t.header.length).fill(''));}
 Object.keys(x).forEach(function(k){if(t.map[k]!==undefined)t.rows[at][t.map[k]]=x[k]===null?'':x[k];});
 _flushManaged(t,at,at,Object.keys(x));return existed;
}
function _settingsGet(){
 var t=_table(SETTINGS_SHEET,SETTINGS_FIELDS,SETTINGS_HEADER,false),row=t&&t.rows.map(function(v){return _object(t,v);}).filter(function(v){return v.prefKey==='preferences';})[0];
 return {ok:true,apiVersion:API_VERSION,type:'settings',revision:row?Number(row.revision):0,data:row?JSON.parse(row.prefValue):{},updatedAt:row?row.updatedAt:null};
}
function _settingsPut(b){
 var expected=_number(b.expectedRevision,'expectedRevision',0,1000000000);if(expected%1)throw new Error('버전은 정수여야 합니다.');
 if(!b.data||Array.isArray(b.data)||typeof b.data!=='object')throw new Error('설정 객체가 필요합니다.');
 var data={};SETTINGS_KEYS.forEach(function(k){var v=b.data[k];if(v!==null&&typeof v!=='string')throw new Error('설정 형식이 잘못되었습니다: '+k);if(v!==null&&k!=='routine_profile'){var parsed=JSON.parse(v);if(parsed!==null&&(typeof parsed!=='object'||Array.isArray(parsed)))throw new Error('설정 객체가 필요합니다: '+k);}if(k==='routine_profile'&&v!==null&&v!=='current'&&v!=='legacy')throw new Error('루틴 프로필이 올바르지 않습니다.');data[k]=v;});
 var json=JSON.stringify(data);if(json.length>45000)throw new Error('설정이 시트 셀 저장 한도를 넘습니다. 전체 JSON 백업을 사용하세요.');
 var current=_settingsGet();if(current.revision!==expected){current.conflict=true;return current;}
 var revision=current.revision+1,updatedAt=new Date().toISOString(),t=_table(SETTINGS_SHEET,SETTINGS_FIELDS,SETTINGS_HEADER,true);
 _upsert(t,{prefKey:'preferences',prefValue:json,revision:revision,updatedAt:updatedAt},['prefKey']);
 return {ok:true,apiVersion:API_VERSION,type:'settings',revision:revision,data:data,updatedAt:updatedAt};
}
function _json(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

// Date-level compare-and-swap. Revision is a digest of managed sheet values;
// direct edits to managed cells also change it. Deleted sets are retained as tombstones.
function _digest(v){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(v)).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function _truth(v){return v===true||v===1||v==='1'||v==='true';}
function _legacyId(r){return 'legacy-'+_digest([r.date,r.name,Number(r.setNo)]).slice(0,32);}
function _schema(kind){
 if(kind==='workout')return [WORKOUT_SHEET,WORKOUT_FIELDS,WORKOUT_HEADER];
 if(kind==='weight')return [WEIGHT_SHEET,WEIGHT_FIELDS,WEIGHT_HEADER];
 if(kind==='inbody')return [INBODY_SHEET,INBODY_FIELDS,INBODY_HEADER];
 throw new Error('지원하지 않는 기록 유형입니다.');
}
function _readKind(kind,write){
 var a=_schema(kind),t=_table(a[0],a[1],a[2],write);if(kind!=='workout'||!t)return t;
 // Old exports may restart setNo for the same exercise on one date. Keep EVERY
 // row, in sheet order, while assigning a unique logical number and stable ID.
 var next=Object.create(null);
 t.rows.forEach(function(row){var r=_object(t,row);if(!r.date||!r.name)return;var key=JSON.stringify([r.date,r.name.indexOf('🏃')===0?'__cardio':r.name]);
  if(r.setId){next[key]=Math.max(next[key]||0,Number(r.setNo)||0);return;}
  r.setNo=next[key]=(next[key]||0)+1;row._fitNo=r.setNo;row._fitId=_legacyId(r);
  if(write){row[t.map.setNo]=r.setNo;row[t.map.setId]=row._fitId;delete row._fitId;delete row._fitNo;t.migrate=true;}
 });return t;
}
function _cleanRow(r){
 var f=_flags(r);
 return {date:r.date,day:String(r.day||''),name:String(r.name||''),setNo:Number(r.setNo),weight:Number(r.weight)||0,reps:Number(r.reps)||0,vol:Number(r.vol)||0,ts:r.ts instanceof Date?r.ts.toISOString():String(r.ts||''),wu:f.wu,rpe:f.rpe,pain:f.pain,setId:String(r.setId||_legacyId(r)),deleted:_truth(r.deleted)};
}
function _records(t,kind){
 var groups=Object.create(null);
 if(t)t.rows.forEach(function(v){var x=_object(t,v);if(!x.date)return;_date(x.date);(groups[x.date]||(groups[x.date]=[])).push(x);});
 var out=Object.create(null);
 Object.keys(groups).forEach(function(date){
  var entries=groups[date];
  if(kind==='workout'){
   var all=entries.filter(function(x){return x.name;}).map(_cleanRow).sort(function(a,b){return a.setId.localeCompare(b.setId);});
   var ids=Object.create(null);all.forEach(function(x){if(ids[x.setId])throw new Error(date+' 중복 세트가 있습니다. 시트에서 중복 행을 확인하세요.');ids[x.setId]=true;});
   out[date]={date:date,revision:_digest(all),deleted:all.every(function(x){return x.deleted;}),rows:all.filter(function(x){return !x.deleted;})};
  }else{
   if(entries.length!==1)throw new Error(date+' '+kind+' 날짜가 시트에서 중복됩니다.');
   var x=entries[0],entry={date:date};
   if(kind==='weight'){entry.deleted=_truth(x.deleted);entry.wt=entry.deleted?null:Number(x.wt);entry.updatedAt=x.updatedAt instanceof Date?x.updatedAt.toISOString():String(x.updatedAt||'');if(!entry.deleted)_number(entry.wt,'wt',20,300);}
   else INBODY_FIELDS.slice(1).forEach(function(k){if(x[k]!==undefined&&x[k]!==''&&x[k]!==null)entry[k]=Number(x[k]);});
   out[date]={date:date,revision:_digest(entry),deleted:!!entry.deleted,entry:entry};
  }
 });return out;
}
function _syncPull(){
 var out={ok:true,apiVersion:API_VERSION,type:'snapshot'};
 ['workout','weight','inbody'].forEach(function(kind){out[kind]=Object.values(_records(_readKind(kind,false),kind));});return out;
}
function _emptyRecord(date,kind){return kind==='workout'?{date:date,revision:'0',deleted:true,rows:[]}:{date:date,revision:'0',deleted:true,entry:null};}
function _comparable(record,kind){
 if(kind!=='workout')return record.entry;
 return record.rows.slice().sort(function(a,b){return a.setId.localeCompare(b.setId);});
}
function _validateItem(item,kind){
 _date(item.date);if(typeof item.expectedRevision!=='string')throw new Error('기준 버전이 필요합니다.');
 if(kind==='workout'){
  if(!Array.isArray(item.rows)||item.rows.length>1000)throw new Error('하루 운동 배열은 최대 1000세트입니다.');
  var ids=Object.create(null),keys=Object.create(null);
  item.rows=item.rows.map(function(r){
   if(r.date!==item.date)throw new Error('운동 날짜가 일치하지 않습니다.');_validateKey(r);
   if(r.name.length>200||/[<>]/.test(r.name))throw new Error('종목명 형식이 올바르지 않습니다.');
   _number(r.weight,'weight',0,100000);_number(r.reps,'reps',0,100000);_number(r.vol,'vol',0,1e12);
   if(r.rpe!==''&&r.rpe!==null&&r.rpe!==undefined)_number(r.rpe,'rpe',0,10);
   if(typeof r.setId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(r.setId)||ids[r.setId]||keys[_key(r)])throw new Error('세트 ID 또는 번호가 중복되거나 잘못되었습니다.');
   ids[r.setId]=true;keys[_key(r)]=true;r.deleted=false;return _cleanRow(r);
  });
 }else{
  var x=item.entry;if(!x||x.date!==item.date)throw new Error('기록 날짜가 일치하지 않습니다.');
  if(kind==='weight'){if(!x.deleted)_number(x.wt,'wt',20,300);item.entry={date:x.date,wt:x.deleted?null:Number(x.wt),deleted:!!x.deleted,updatedAt:String(x.updatedAt||'')};}
  else{var e={date:x.date};['wt','sm','bf'].forEach(function(k){e[k]=_number(x[k],k,.01,k==='bf'?100:500);});['ab','waist','vf','pa','bmr'].forEach(function(k){if(x[k]!==''&&x[k]!=null)e[k]=_number(x[k],k,0,10000);});item.entry=e;}
 }
}
function _syncWrite(b){
 var kind=b.kind;_schema(kind);
 if(!Array.isArray(b.items)||b.items.length>100)throw new Error('요청은 최대 100일입니다.');
 var seen=Object.create(null);b.items.forEach(function(x){_validateItem(x,kind);if(seen[x.date])throw new Error('요청 날짜 중복');seen[x.date]=true;});
 var t=_readKind(kind,false),current=_records(t,kind),accepted=[],results=[];
 b.items.forEach(function(x){
  var r=current[x.date]||_emptyRecord(x.date,kind),desired=kind==='workout'?{rows:x.rows}:{entry:x.entry};
  if(JSON.stringify(_comparable(r,kind))===JSON.stringify(_comparable(desired,kind))){results.push({status:'ok',record:r});return;}
  if(x.expectedRevision!==r.revision){results.push({status:'conflict',record:r});return;}
  accepted.push(x);
 });
 if(accepted.length){
  t=_readKind(kind,true);
  var index=Object.create(null),min=t.migrate?0:t.rows.length,max=t.migrate?t.rows.length-1:-1;
  t.rows.forEach(function(v,i){var x=_object(t,v);if(x.date)(index[x.date]||(index[x.date]=[])).push(i);});
  function put(at,x){if(at===undefined){at=t.rows.length;t.rows.push(Array(t.header.length).fill(''));}Object.keys(x).forEach(function(k){if(t.map[k]!==undefined)t.rows[at][t.map[k]]=x[k]==null?'':x[k];});min=Math.min(min,at);max=Math.max(max,at);return at;}
  accepted.forEach(function(x){
   var ix=index[x.date]||[];
   if(kind==='workout'){
    var byId=Object.create(null),wanted=Object.create(null);ix.forEach(function(i){var r=_cleanRow(_object(t,t.rows[i]));byId[r.setId]=i;});
    x.rows.forEach(function(r){wanted[r.setId]=true;put(byId[r.setId],r);});
    ix.forEach(function(i){var old=_cleanRow(_object(t,t.rows[i]));if(!wanted[old.setId])put(i,{setId:old.setId,deleted:true});});
   }else{
    var e=Object.assign({},x.entry);
    // An omitted optional InBody field means explicitly cleared in API v5.
    if(kind==='inbody')INBODY_FIELDS.forEach(function(k){if(e[k]===undefined)e[k]='';});
    put(ix[0],e);
   }
  });
  if(max>=min)_flushManaged(t,min,max,t.fields);
  var updated=_records(t,kind);accepted.forEach(function(x){results.push({status:'ok',record:updated[x.date]||_emptyRecord(x.date,kind)});});
 }
 return {ok:true,apiVersion:API_VERSION,type:'write',kind:kind,results:results};
}
// Batched writes touch ONLY app-owned columns. User formula columns are never
// round-tripped through getValues/setValues. No O(number-of-sets) remote writes.
function _flushManaged(t,first,last,fields){
 var cols=fields.map(function(k){return t.map[k];}).filter(function(c){return c!==undefined;}).sort(function(a,b){return a-b;});
 var spans=[];cols.forEach(function(c){var s=spans[spans.length-1];if(s&&s[1]+1===c)s[1]=c;else spans.push([c,c]);});
 spans.forEach(function(s){
  var values=t.rows.slice(first,last+1).map(function(row){return Array.from({length:s[1]-s[0]+1},function(_,i){var v=row[s[0]+i];return typeof v==='string'&&v.charAt(0)==='='?"'"+v:(v==null?'':v);});});
  t.sheet.getRange(first+2,s[0]+1,last-first+1,s[1]-s[0]+1).setValues(values);
 });
}
