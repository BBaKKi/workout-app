/* Read-only comparisons. Equal recorded conditions do not prove equal technique. */
(function(){
 'use strict';
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'));
 const days=(a,b)=>(Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000;
 const finite=Number.isFinite;
 window.TrendModel={
  workSets(sets){return (sets||[]).filter(s=>!s.warmup&&finite(s.reps)&&s.reps>0&&finite(s.weight)&&s.weight>=0);},
  compare(previous,current){
   const base={tone:'neutral',comparable:false};
   if(!previous)return {...base,label:'첫 비교 대기',note:'다음 수행부터 같은 종목의 직전 기록과 비교합니다.'};
   const a=this.workSets(previous.sets),b=this.workSets(current.sets);
   if(!a.length||!b.length)return {...base,label:'비교 기록 부족',note:'유효한 본세트를 기록하면 비교합니다.'};
   if(days(previous.date,current.date)>21)return {...base,label:'공백 후 기록',note:'21일 넘게 떨어진 기록입니다. 바로 증량하기보다 현재 수행 범위를 확인하세요.'};
   if(a.length!==b.length)return {...base,label:'세트 수 변경',note:'본세트 '+a.length+'→'+b.length+'개. 세트 수가 달라 총반복·볼륨만으로 향상을 판정하지 않습니다.'};
   const unit=s=>s.unit||'reps';
   if(a.some((s,i)=>unit(s)!==unit(b[i])))return {...base,label:'기록 단위 변경',note:'횟수·시간·거리 단위가 달라 직접 비교하지 않습니다.'};
   if(a.some((s,i)=>s.weight!==b[i].weight||s.bw!==b[i].bw||s.ew!==b[i].ew))return {...base,label:'중량 구성 변경',note:'세트별 중량 또는 체중·보조 조건이 달라졌습니다. 각 세트의 중량과 반복을 함께 확인하세요.'};
   const units=new Set(b.map(unit));if(units.size!==1)return {...base,label:'기록 단위 혼합',note:'서로 다른 단위가 섞여 있어 합산하지 않습니다.'};
   const u=unit(b[0]),label={reps:'반복',seconds:'시간',meters:'거리'}[u];
   if(!label)return {...base,label:'기록 단위 확인',note:'같은 단위의 기록끼리 비교하세요.'};
   const delta=b.reduce((n,s)=>n+s.reps,0)-a.reduce((n,s)=>n+s.reps,0);
   const ar=a.at(-1).rpe,br=b.at(-1).rpe;
   const effort=finite(ar)&&ar>0&&finite(br)&&br>0?' 마지막 RPE '+ar+'→'+br+'.'+(br>ar?' 체감 강도도 높아졌습니다.':''):' 마지막 RPE가 없으면 같은 여유로 수행했는지는 확인할 수 없습니다.';
   return {comparable:true,tone:delta>0?'positive':'neutral',delta,label:label+(delta>0?' 증가':delta<0?' 감소':' 유지'),note:'같은 기록 중량·'+b.length+'세트에서 총 '+label+' '+(delta>0?'+':'')+Number(delta.toFixed(2))+({reps:'회',seconds:'초',meters:'m'}[u])+'.'+effort};
  },
  body(log,today){
   const rows=(log||[]).filter(e=>validDate(e.date)&&e.date<=today&&finite(e.wt)&&e.wt>0&&finite(e.bf)&&e.bf>0&&e.bf<=100).slice().sort((a,b)=>a.date.localeCompare(b.date));
   const last=rows.at(-1);if(!last)return null;
   const recent=rows.filter(e=>days(e.date,last.date)<=28),first=recent[0],previous=rows.at(-2);
   const fat=e=>e.wt*e.bf/100,sm=e=>finite(e.sm)&&e.sm>0?e.sm:null;
   return {first,last,previous,count:recent.length,span:days(first.date,last.date),age:days(last.date,today),fat:fat(last),fatStart:fat(first),fatDelta:previous?fat(last)-fat(previous):null,smStart:sm(first),smLast:sm(last)};
  }
 };
})();
