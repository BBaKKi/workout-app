const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
const TOKEN='test-only-token-0123456789-0123456789';
class Sheet{
 constructor(rows=[]){this.rows=structuredClone(rows);this.writes=0;}
 getLastRow(){return this.rows.length}getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))}
 getRange(r,c,n=1,m=1){const s=this;return {getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>{const v=s.rows[r-1+i]?.[c-1+j]??'';return v&&typeof v==='object'&&v.formula?v.value:v;})),setValues(v){s.writes++;v.forEach((a,i)=>{s.rows[r-1+i]||=[];a.forEach((val,j)=>s.rows[r-1+i][c-1+j]=val)});return this;}};}setFrozenRows(){}
}
function backend(seed={},options={}){
 const db=Object.fromEntries(Object.entries(seed).map(([k,v])=>{const s=new Sheet(v);s.getName=()=>k;return [k,s]}));let accessed=0;
 const spreadsheet={getSpreadsheetTimeZone:()=>options.timezone||'Asia/Seoul',getId:()=>options.id||'test-spreadsheet',getName:()=>options.name||'테스트 기록',getSheets:()=>Object.values(db),getSheetByName:n=>db[n]||null,insertSheet:n=>{const s=db[n]=new Sheet();s.getName=()=>n;return s;}};
 const ctx={Date,console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='FIT_API_TOKEN'?TOKEN:options.spreadsheetId||null})},SpreadsheetApp:{getActiveSpreadsheet:()=>{accessed++;return options.noActive?null:spreadsheet;},openById:id=>{accessed++;if(id!==options.spreadsheetId)throw new Error('Unknown spreadsheet');return spreadsheet;}},LockService:{getScriptLock:()=>({waitLock(){},hasLock(){return true},releaseLock(){}})},Session:{getScriptTimeZone:()=> 'Asia/Seoul'},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,text)=>[...crypto.createHash(algorithm).update(text).digest()],formatDate:(d,zone)=>d.toLocaleDateString('en-CA',{timeZone:zone})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../apps_script.gs'),'utf8'),ctx);
 return {db,accessed:()=>accessed,post:(b,authenticated=true)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(authenticated?{...b,token:TOKEN}:b)}}).text),get:()=>JSON.parse(ctx.doGet({parameter:{mode:'export'}}).text)};
}
module.exports={backend,TOKEN};
