/* A new release waits until the user saves and chooses to activate it. */
if('serviceWorker' in navigator){
 let reloading=false;
 function offer(reg){
  if(!reg.waiting||document.getElementById('app-update'))return;
  const button=document.createElement('button');button.id='app-update';button.className='app-update';button.textContent='새 버전 준비됨 · 저장 후 업데이트';
  button.onclick=async()=>{try{
   const editing=[...document.querySelectorAll('.ex-log-input')].some(el=>el.style.display==='flex');
   if(editing){alert('입력 중인 세트를 먼저 확정하거나 취소하세요.');return;}
   if(SafeStore.error)throw new Error('저장 오류를 먼저 해결하세요.');await ExLog.save();await ExLog.savePlan();
   reloading=true;reg.waiting?.postMessage({type:'ACTIVATE'});
  }catch(e){alert(e.message);}};document.body.appendChild(button);
 }
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)location.reload();});
 window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});offer(reg);reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offer(reg);});});}catch(_){/* Logging remains available if offline installation cannot complete. */}});
}
