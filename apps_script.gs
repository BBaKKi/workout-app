/** 운동기록 API v7 — 기존 배포를 '새 버전'으로 업데이트하면 URL을 유지합니다.
 * 기존 열은 이동/삭제하지 않고, 없는 열만 뒤에 추가합니다.
 * POST: authenticated sync_pull / sync_write / settings_get / settings_put. GET: status only.
 * 이전 flag 열과 새 wu/rpe/pain 열, 한글·영문 헤더를 모두 읽습니다.
 */
var API_VERSION = 7;
var SERVER_BUILD = '7.2.0';
var _requestDateZone = null;
var WORKOUT_SHEET = '운동기록';
var INBODY_SHEET = '인바디기록';
var WEIGHT_SHEET = '체중기록';
var SETTINGS_SHEET = '앱설정';
var SESSION_SHEET = '운동세션';
var SESSION_FIELDS = ['date','sessionJson'];
var SESSION_HEADER = ['날짜','세션계획JSON'];
var WEIGHT_FIELDS = ['date','wt','deleted','updatedAt'];
var WEIGHT_HEADER = ['날짜','체중(kg)','삭제','수정시각'];
var SETTINGS_FIELDS = ['prefKey','prefValue','revision','updatedAt'];
var SETTINGS_HEADER = ['설정키','설정값','버전','수정시각'];
var SETTINGS_KEYS = ['plan_v3','plan_v2','routine_profile','ex_base','ex_rest','ex_memo','ex_load','block_v1','deload_v1','training_config_v1','ex_equipment_v1','exercise_favorites_v1'];
var WORKOUT_FIELDS = ['date','day','name','setNo','weight','reps','vol','ts','wu','rpe','pain','setId','deleted','recordMeta'];
var WORKOUT_HEADER = ['날짜','요일','종목','세트','무게(kg)','횟수','볼륨(kg)','기록시각','워밍업','RPE','통증','세트ID','삭제','기록정보JSON'];
var INBODY_FIELDS = ['date','wt','sm','bf','ab','waist','vf','pa','bmr'];
var INBODY_HEADER = ['날짜','체중(kg)','골격근량(kg)','체지방률(%)','복부지방률','허리둘레(cm)','내장지방레벨','위상각','기초대사량'];
var HEADER_ALIASES = {
 recordMeta:['기록정보JSON','recordMeta'],
 sessionJson:['세션계획JSON','sessionJson'],
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
 _requestDateZone=null;
 var b=_parseBody(e),lock;
 try {
  _authorize(b); // Authentication must precede any spreadsheet access or lock acquisition.
  lock=LockService.getScriptLock();lock.waitLock(20000);
  if(b.mode==='sync_pull')return _json(_syncPull());
  if(b.mode==='sync_diagnose')return _json(_diagnose());
  if(b.mode==='sync_write')return _json(_syncWrite(b));
  if(b.mode==='settings_get')return _json(_settingsGet());
  if(b.mode==='settings_put')return _json(_settingsPut(b));
  throw new Error('API v7 앱으로 업데이트하세요. 이전 방식의 전체 업로드·삭제는 차단됩니다.');
 }catch(err){return _json({ok:false,apiVersion:API_VERSION,error:String(err.message||err)});}
 finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function _parseBody(e){try{return JSON.parse(e.postData.contents);}catch(_){return null;}}
function _has(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function _number(v,k,min,max){if(v===''||v===null||v===undefined||!isFinite(Number(v))||Number(v)<min||Number(v)>max)throw new Error(k+' 값이 올바르지 않습니다.');return Number(v);}
function _date(d){if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||isNaN(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw new Error('날짜가 올바르지 않습니다.');return d;}
function _validateKey(r){if(!r||!r.name||typeof r.name!=='string')throw new Error('종목명이 필요합니다.');_date(r.date);var n=_number(r.setNo,'setNo',1,100000);if(n%1)throw new Error('세트 번호는 정수여야 합니다.');}
function _dstr(v){if(!(v instanceof Date))return String(v||'').slice(0,10);if(!_requestDateZone)_requestDateZone=_spreadsheet().getSpreadsheetTimeZone();return Utilities.formatDate(v,_requestDateZone,'yyyy-MM-dd');}
function _key(r){return JSON.stringify([r.date,r.name,Number(r.setNo)]);}
function _headerMap(header){var map={};Object.keys(HEADER_ALIASES).forEach(function(k){var aliases=HEADER_ALIASES[k];for(var i=0;i<header.length;i++)if(aliases.indexOf(String(header[i]).trim())>=0){map[k]=i;break;}});return map;}
function _spreadsheet(){
 var id=PropertiesService.getScriptProperties().getProperty('FIT_SPREADSHEET_ID');
 var ss=id?SpreadsheetApp.openById(id.trim()):SpreadsheetApp.getActiveSpreadsheet();
 if(!ss)throw new Error('연결된 스프레드시트가 없습니다. 기록 파일에서 Apps Script를 열거나 FIT_SPREADSHEET_ID를 설정하세요.');
 return ss;
}
function _sheetAliases(name){
 if(name===WORKOUT_SHEET)return [name,'운동 기록'];
 if(name===INBODY_SHEET)return [name,'InBody','인바디','인바디 기록'];
 if(name===WEIGHT_SHEET)return [name,'체중 기록'];
 return [name];
}
function _resolveSheet(ss,name){
 var aliases=_sheetAliases(name).map(function(n){return n.toLowerCase().replace(/\s/g,'');});
 var candidates=ss.getSheets().filter(function(s){return aliases.indexOf(s.getName().toLowerCase().replace(/\s/g,''))>=0;});
 var populated=candidates.filter(function(s){return s.getLastRow()>1;});
 if(populated.length>1)throw new Error('읽을 탭이 여러 개입니다: '+populated.map(function(s){return s.getName();}).join(', ')+'. 기록을 합치거나 덮어쓰지 않았습니다. 사용할 탭을 확인하세요.');
 return populated[0]||candidates.find(function(s){return s.getName()===name;})||candidates[0]||null;
}
function _requiredFields(name){
 if(name===WORKOUT_SHEET)return ['date','name','weight','reps'];
 if(name===INBODY_SHEET)return ['date','wt','sm','bf'];
 if(name===WEIGHT_SHEET)return ['date','wt'];
 if(name===SESSION_SHEET)return ['date','sessionJson'];
 return ['prefKey','prefValue','revision'];
}
function _table(name,fields,header,write){
 var ss=_spreadsheet(),s=_resolveSheet(ss,name);
 if(!s){if(!write)return null;s=ss.insertSheet(name);}
 var width=s.getLastColumn(),h=width?s.getRange(1,1,1,width).getValues()[0]:[],map=_headerMap(h);
 if(width){
  var missing=_requiredFields(name).filter(function(k){return map[k]===undefined;});
  if(missing.length)throw new Error(s.getName()+' 첫 행의 필수 열을 확인하세요: '+missing.map(function(k){return HEADER_ALIASES[k].join(' / ');}).join(', ')+'. 빈 기록으로 처리하지 않았습니다.');
  Object.keys(map).forEach(function(k){var count=h.filter(function(v){return HEADER_ALIASES[k].indexOf(String(v).trim())>=0;}).length;if(count>1)throw new Error(s.getName()+' 첫 행에 같은 의미의 열이 여러 개입니다: '+k);});
 }
 if(write){fields.forEach(function(k,i){if(map[k]===undefined){map[k]=h.length;h.push(header[i]);}});
  if(h.length!==width){s.getRange(1,width+1,1,h.length-width).setValues([h.slice(width)]);s.setFrozenRows(1);}}
 var n=s.getLastRow(),rows=n>1&&h.length?s.getRange(2,1,n-1,h.length).getValues():[];
 rows.forEach(function(row,i){if(fields.indexOf('date')>=0&&!row[map.date]&&fields.some(function(k){var v=row[map[k]];return v!==undefined&&v!==null&&v!=='';}))throw new Error(s.getName()+' '+(i+2)+'행에 날짜가 없습니다. 해당 행을 건너뛰지 않았습니다.');});
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
 var data={};SETTINGS_KEYS.forEach(function(k){var v=b.data[k]===undefined?null:b.data[k];if(v!==null&&typeof v!=='string')throw new Error('설정 형식이 잘못되었습니다: '+k);if(v!==null&&k!=='routine_profile'){var parsed=JSON.parse(v);if(parsed!==null&&(typeof parsed!=='object'||Array.isArray(parsed)))throw new Error('설정 객체가 필요합니다: '+k);}if(k==='routine_profile'&&v!==null&&v!=='current'&&v!=='legacy')throw new Error('루틴 프로필이 올바르지 않습니다.');data[k]=v;});
 var json=JSON.stringify(data);if(json.length>45000)throw new Error('설정이 시트 셀 저장 한도를 넘습니다. 전체 JSON 백업을 사용하세요.');
 var current=_settingsGet();if(current.revision!==expected){current.conflict=true;return current;}
 var revision=current.revision+1,updatedAt=new Date().toISOString(),t=_table(SETTINGS_SHEET,SETTINGS_FIELDS,SETTINGS_HEADER,true);
 _upsert(t,{prefKey:'preferences',prefValue:json,revision:revision,updatedAt:updatedAt},['prefKey']);
 return {ok:true,apiVersion:API_VERSION,type:'settings',revision:revision,data:data,updatedAt:updatedAt};
}
function _json(o){o.serverBuild=SERVER_BUILD;return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

// Date-level compare-and-swap. Revision is a digest of managed sheet values;
// direct edits to managed cells also change it. Deleted sets are retained as tombstones.
function _digest(v){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(v)).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function _truth(v){return v===true||v===1||v==='1'||v==='true';}
function _legacyId(r){return 'legacy-'+_digest([r.date,r.name,Number(r.setNo)]).slice(0,32);}
function _schema(kind){
 if(kind==='workout')return [WORKOUT_SHEET,WORKOUT_FIELDS,WORKOUT_HEADER];
 if(kind==='weight')return [WEIGHT_SHEET,WEIGHT_FIELDS,WEIGHT_HEADER];
 if(kind==='inbody')return [INBODY_SHEET,INBODY_FIELDS,INBODY_HEADER];
 if(kind==='session')return [SESSION_SHEET,SESSION_FIELDS,SESSION_HEADER];
 throw new Error('지원하지 않는 기록 유형입니다.');
}
function _readKind(kind,write){
 var a=_schema(kind),t=_table(a[0],a[1],a[2],write);if(kind!=='workout'||!t)return t;
 // Old exports may restart setNo for the same exercise on one date. Keep EVERY
 // row, in sheet order, while assigning a unique logical number and stable ID.
 var next=Object.create(null),reservedNumbers=Object.create(null),reservedIds=Object.create(null);
 function group(r){return JSON.stringify([r.date,r.name.indexOf('🏃')===0?'__cardio':r.name]);}
 function idKey(r){return JSON.stringify([r.date,String(r.setId)]);}
 // Reserve ALL persisted identities before generating any missing ones. A row
 // with an ID may appear later after sorting or an interrupted migration.
 // Include tombstones: a deleted ID must not be assigned to a different set.
 t.rows.forEach(function(row){var r=_object(t,row);if(!r.date||!r.name||!r.setId)return;
  var key=group(r);(reservedNumbers[key]||(reservedNumbers[key]=Object.create(null)))[Number(r.setNo)]=true;
  reservedIds[idKey(r)]=true;
 });
 t.rows.forEach(function(row){var r=_object(t,row);if(!r.date||!r.name)return;var key=group(r);
  if(r.setId){next[key]=Math.max(next[key]||0,Number(r.setNo)||0);return;}
  var numbers=reservedNumbers[key]||(reservedNumbers[key]=Object.create(null));
  do{r.setNo=next[key]=(next[key]||0)+1;r.setId=_legacyId(r);}while(numbers[r.setNo]||reservedIds[idKey(r)]);
  numbers[r.setNo]=true;reservedIds[idKey(r)]=true;row._fitNo=r.setNo;row._fitId=r.setId;
  if(write){row[t.map.setNo]=r.setNo;row[t.map.setId]=row._fitId;delete row._fitId;delete row._fitNo;t.migrate=true;}
 });return t;
}
function _cleanRow(r){
 var f=_flags(r);
 return {date:r.date,day:String(r.day||''),name:String(r.name||''),setNo:Number(r.setNo),weight:Number(r.weight)||0,reps:Number(r.reps)||0,vol:Number(r.vol)||0,ts:r.ts instanceof Date?r.ts.toISOString():String(r.ts||''),wu:f.wu,rpe:f.rpe,pain:f.pain,setId:String(r.setId||_legacyId(r)),deleted:_truth(r.deleted),meta:_validateRecordMeta(r.meta||(r.recordMeta?JSON.parse(r.recordMeta):{}))};
}
function _records(t,kind){
 var groups=Object.create(null);
 if(t)t.rows.forEach(function(v,i){var x=_object(t,v);if(!x.date)return;_date(x.date);x._sheetRow=i+2;(groups[x.date]||(groups[x.date]=[])).push(x);});
 var out=Object.create(null);
 Object.keys(groups).forEach(function(date){
  var entries=groups[date];
  if(kind==='workout'){
   var ids=Object.create(null);
   var all=entries.filter(function(x){return x.name;}).map(function(x){
    var r=_cleanRow(x),previous=ids[r.setId];
    if(previous)throw new Error(date+' 세트ID 충돌: '+WORKOUT_SHEET+' '+previous+'행과 '+x._sheetRow+'행의 세트ID가 같습니다. 기록 내용이 중복이라는 뜻은 아닙니다. 해당 두 행의 세트ID와 삭제 표시를 확인하세요.');
    ids[r.setId]=x._sheetRow;return r;
   }).sort(function(a,b){return a.setId.localeCompare(b.setId);});
   out[date]={date:date,revision:_digest(all),deleted:all.every(function(x){return x.deleted;}),rows:all.filter(function(x){return !x.deleted;})};
  }else{
   if(entries.length!==1)throw new Error(date+' '+kind+' 날짜가 시트에서 중복됩니다.');
   var x=entries[0],entry={date:date};
   if(kind==='weight'){entry.deleted=_truth(x.deleted);entry.wt=entry.deleted?null:Number(x.wt);entry.updatedAt=x.updatedAt instanceof Date?x.updatedAt.toISOString():String(x.updatedAt||'');if(!entry.deleted)_number(entry.wt,'wt',20,300);}
   else if(kind==='session'){entry=JSON.parse(x.sessionJson);_validateSession(entry,date);}
   else INBODY_FIELDS.slice(1).forEach(function(k){if(x[k]!==undefined&&x[k]!==''&&x[k]!==null)entry[k]=Number(x[k]);});
   out[date]={date:date,revision:_digest(entry),deleted:!!entry.deleted,entry:entry};
  }
 });return out;
}
function _source(){var ss=_spreadsheet();return {id:ss.getId(),name:ss.getName(),tabs:ss.getSheets().map(function(s){return s.getName();}),sheets:{}};}
function _sheetStatus(t,records){return {name:t?t.sheet.getName():null,status:!t?'missing':records.length?'present':'empty',rows:t?t.rows.filter(function(r){return r.some(function(v){return v!==''&&v!==null;});}).length:0,dates:records.length,activeDates:records.filter(function(r){return !r.deleted;}).length};}
function _syncPull(){
 var out={ok:true,apiVersion:API_VERSION,type:'snapshot',source:_source()};
 ['workout','weight','inbody','session'].forEach(function(kind){var t=_readKind(kind,false);out[kind]=Object.values(_records(t,kind));out.source.sheets[kind]=_sheetStatus(t,out[kind]);});return out;
}
// Read-only diagnosis also reports malformed tabs, without reading tokens or writing cells.
function _diagnose(){
 var out={ok:true,apiVersion:API_VERSION,type:'diagnosis',source:_source()};
 ['workout','weight','inbody','session'].forEach(function(kind){try{var t=_readKind(kind,false);out.source.sheets[kind]=_sheetStatus(t,Object.values(_records(t,kind)));}catch(e){out.source.sheets[kind]={status:'error',error:String(e.message||e)};}});return out;
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
  else if(kind==='session'){_validateSession(x,item.date);item.entry=x;}
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
    x.rows.forEach(function(r){wanted[r.setId]=true;put(byId[r.setId],Object.assign({},r,{recordMeta:JSON.stringify(r.meta||{})}));});
    ix.forEach(function(i){var old=_cleanRow(_object(t,t.rows[i]));if(!wanted[old.setId])put(i,{setId:old.setId,deleted:true});});
   }else{
    var e=kind==='session'?{date:x.date,sessionJson:JSON.stringify(x.entry)}:Object.assign({},x.entry);
    // An omitted optional InBody field means explicitly cleared in API v7.
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

 function _validateSession(entry,date){
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
 function _validateRecordMeta(meta){
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
