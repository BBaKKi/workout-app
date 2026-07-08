/***** 운동기록 + 인바디 동기화 Apps Script (upsert + export 버전) *****
 *
 * [재발 방지 핵심]
 *   코드 교체 후 반드시: 배포 > 배포 관리 > 기존 배포 연필(편집) > 버전 "새 버전" > 배포
 *   → URL 그대로 유지 + 새 코드 실행. "새 배포"를 누르면 URL이 바뀌므로 주의.
 *
 * [이번 수정 이유]
 *   push 단방향이라 로컬(localStorage)이 지워지면 기록이 앱에서만 사라졌음.
 *   → doGet에 mode=export 추가: 시트 전체를 JSON으로 반환 → 앱의 "시트에서 불러오기"가
 *     (날짜·종목·세트) 키로 로컬에 없는 것만 채움. 시트가 진짜 원본, 로컬은 캐시가 됨.
 *   → '비고' 열 추가: 워밍업(W)·RPE·통증(P) 플래그 왕복용. 이 플래그가 없으면 복원 시
 *     워밍업 세트가 본세트로 둔갑해 볼륨·PR·추세 집계를 오염시킴.
 *     기존 행은 비고가 빈칸이어도 무방(본세트로 취급 — 기존과 동일).
 *
 * [시트 구성]
 *   - 운동기록  : 날짜/요일/종목/세트/무게/횟수/볼륨/기록시각/비고
 *   - 인바디기록 : 날짜/체중/골격근량/체지방률/복부지방률
 *********************************************/

var WORKOUT_SHEET  = '운동기록';
var INBODY_SHEET   = '인바디기록';
var WORKOUT_HEADER = ['날짜','요일','종목','세트','무게(kg)','횟수','볼륨(kg)','기록시각','비고'];
var INBODY_HEADER  = ['날짜','체중(kg)','골격근량(kg)','체지방률(%)','복부지방률'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return _json({ok:false,error:'busy'}); }

  try {
    var body = _parseBody(e);
    if (!body) return _json({ok:false,error:'parse error'});

    // ── 인바디 단건 저장 ──────────────────────────────────────
    if (body.inbody) {
      var ibSheet = _getSheet(INBODY_SHEET, INBODY_HEADER);
      _upsertInbody(ibSheet, body.inbody);
      return _json({ok:true, type:'inbody'});
    }

    // ── 명시적 삭제 요청(별도 액션일 때만 행 제거) ───────────────
    if (body.mode === 'delete' && body.keys) {
      var wkSheetD = _getSheet(WORKOUT_SHEET, WORKOUT_HEADER);
      var n = _deleteWorkoutRows(wkSheetD, body.keys);
      return _json({ok:true, deleted:n, mode:'delete'});
    }

    // ── 운동기록 upsert (기본 동작 — 시트를 절대 통째로 비우지 않음) ──
    var rows = body.rows || [];
    rows = _dedupe(rows);
    var wkSheet = _getSheet(WORKOUT_SHEET, WORKOUT_HEADER);
    var result = _upsertWorkout(wkSheet, rows);

    // 새 배포 표식: 클라이언트가 written·mode 두 키로 옛 배포 여부를 판별
    return _json({ok:true, written:result.updated+result.added, added:result.added, updated:result.updated, mode:'upsert'});

  } catch (err) {
    return _json({ok:false, error:String(err)});
  } finally {
    lock.releaseLock();
  }
}

// GET: 배포 확인용 + mode=export(시트 → 앱 복원용 전체 덤프. 시트 수정 없음)
function doGet(e) {
  if (e && e.parameter && e.parameter.mode === 'export') return _exportAll();
  var n = Math.max(0, _getSheet(WORKOUT_SHEET, WORKOUT_HEADER).getLastRow() - 1);
  return _json({ok:true, alive:true, dataRows:n});
}

// 시트 전체를 앱이 병합할 수 있는 JSON으로 반환.
// 날짜는 yyyy-MM-dd 문자열, 기록시각은 ISO 문자열로 정규화(시트가 Date 객체로 돌려주는 것 방지).
function _exportAll() {
  var tz = Session.getScriptTimeZone();
  var wk = _getSheet(WORKOUT_SHEET, WORKOUT_HEADER);
  var rows = [];
  var last = wk.getLastRow();
  if (last > 1) {
    var vals = wk.getRange(2,1,last-1,WORKOUT_HEADER.length).getValues();
    for (var i=0;i<vals.length;i++){
      var v = vals[i];
      if (!v[2]) continue; // 종목 없는 빈 행 방어
      rows.push({
        date: _dstr(v[0], tz), day: String(v[1]||''), name: String(v[2]), setNo: +v[3]||0,
        weight: +v[4]||0, reps: +v[5]||0,
        ts: (v[7] instanceof Date) ? v[7].toISOString() : (v[7] ? String(v[7]) : null),
        flag: String(v[8]||'')   // 옛 행(8열 시절)은 빈 문자열 → 본세트로 복원(기존과 동일)
      });
    }
  }
  var ib = _getSheet(INBODY_SHEET, INBODY_HEADER);
  var inbody = [];
  var l2 = ib.getLastRow();
  if (l2 > 1) {
    var iv = ib.getRange(2,1,l2-1,INBODY_HEADER.length).getValues();
    for (var j=0;j<iv.length;j++){
      var w = iv[j];
      if (!w[0]) continue;
      inbody.push({date:_dstr(w[0],tz), wt:+w[1]||null, sm:+w[2]||null, bf:+w[3]||null, ab:(w[4]!==''&&w[4]!=null)?+w[4]:null});
    }
  }
  return _json({ok:true, mode:'export', rows:rows, inbody:inbody});
}

function _dstr(d, tz){ return (d instanceof Date) ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(d).slice(0,10); }

/* ── 내부 헬퍼 ───────────────────────────────────────────── */

function _parseBody(e) {
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch(_) {}
  }
  if (e && e.parameter && e.parameter.rows) {
    try { return {mode: e.parameter.mode||'upsert', rows: JSON.parse(e.parameter.rows)}; } catch(_) {}
  }
  return null;
}

function _getSheet(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1,1,1,header.length).setValues([header]);
    _styleHeader(sheet, header.length);
  } else {
    var cur = sheet.getRange(1,1,1,header.length).getValues()[0];
    if (cur.join('|') !== header.join('|')) {
      sheet.getRange(1,1,1,header.length).setValues([header]);
      _styleHeader(sheet, header.length);
    }
  }
  return sheet;
}

function _styleHeader(sheet, cols) {
  var r = sheet.getRange(1,1,1,cols);
  r.setFontWeight('bold').setFontColor('#FFFFFF')
   .setBackground('#085041').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

// (날짜·종목·세트번호) 기준 중복 제거 — 같은 요청 내 마지막 값 우선
function _dedupe(rows) {
  var map={}, order=[];
  rows.forEach(function(r){
    var key=[r.date,r.name,r.setNo].join('');
    if(!(key in map)) order.push(key);
    map[key]=r;
  });
  return order.map(function(k){return map[k];});
}

function _keyOf(date,name,setNo){ return [date,name,setNo].join(''); }

// 시트의 기존 행을 키→행번호 맵으로 읽음
function _readWorkoutIndex(sheet) {
  var last = sheet.getLastRow();
  var idx = {};
  if (last < 2) return idx;
  var vals = sheet.getRange(2,1,last-1,WORKOUT_HEADER.length).getValues();
  for (var i=0;i<vals.length;i++){
    var d = vals[i][0];
    var dateStr = (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(d);
    idx[_keyOf(dateStr, vals[i][2], vals[i][3])] = i+2; // 실제 시트 행번호
  }
  return idx;
}

// upsert: 같은 (날짜·종목·세트)면 그 행만 갱신, 없으면 끝에 추가. 시트의 다른 기존 행은 절대 건드리지 않음.
function _upsertWorkout(sheet, rows) {
  if (!rows.length) return {added:0, updated:0};
  var idx = _readWorkoutIndex(sheet);
  var added=0, updated=0;
  var appendBuf=[];
  rows.forEach(function(r){
    var key = _keyOf(r.date, r.name, r.setNo);
    var ts = r.ts ? new Date(r.ts) : new Date(); // 클라이언트 기록시각 우선, 없을 때만 now()
    var rowVals = [
      r.date, r.day||'', r.name, r.setNo,
      r.weight, r.reps,
      (r.vol!=null ? r.vol : Math.round((r.weight||0)*(r.reps||0))),
      ts,
      String(r.flag||'')   // 비고: W(워밍업)·RPE·P(통증) — 앱 _setFlag/_parseFlag와 쌍
    ];
    if (key in idx) {
      sheet.getRange(idx[key],1,1,WORKOUT_HEADER.length).setValues([rowVals]);
      updated++;
    } else {
      appendBuf.push(rowVals);
      added++;
    }
  });
  if (appendBuf.length) {
    sheet.getRange(sheet.getLastRow()+1,1,appendBuf.length,WORKOUT_HEADER.length).setValues(appendBuf);
  }
  return {added:added, updated:updated};
}

// 명시적 삭제: keys = [{date,name,setNo}, ...]
function _deleteWorkoutRows(sheet, keys) {
  var idx = _readWorkoutIndex(sheet);
  var rowsToDelete = [];
  keys.forEach(function(k){
    var key = _keyOf(k.date, k.name, k.setNo);
    if (key in idx) rowsToDelete.push(idx[key]);
  });
  rowsToDelete.sort(function(a,b){return b-a;}); // 아래에서부터 지워야 행번호 안 꼬임
  rowsToDelete.forEach(function(r){ sheet.deleteRow(r); });
  return rowsToDelete.length;
}

// 인바디: 같은 날짜면 해당 행 덮어쓰기, 없으면 추가 후 날짜순 정렬
function _upsertInbody(sheet, entry) {
  var last = sheet.getLastRow();
  var found = -1;
  if (last > 1) {
    var dates = sheet.getRange(2,1,last-1,1).getValues();
    for (var i=0; i<dates.length; i++) {
      var d = dates[i][0];
      var dateStr = (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(d).slice(0,10);
      if (dateStr === String(entry.date).slice(0,10)) { found = i+2; break; }
    }
  }
  var row = [entry.date, entry.wt, entry.sm, entry.bf, entry.ab!=null?entry.ab:''];
  if (found > 0) {
    sheet.getRange(found,1,1,INBODY_HEADER.length).setValues([row]);
  } else {
    sheet.getRange(last+1,1,1,INBODY_HEADER.length).setValues([row]);
    if (sheet.getLastRow() > 2) sheet.getRange(2,1,sheet.getLastRow()-1,INBODY_HEADER.length).sort(1);
  }
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
