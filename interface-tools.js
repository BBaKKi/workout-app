/* Scoped routine actions and small, explicit UI integrations. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const copy = x => JSON.parse(JSON.stringify(x));
  const I = window.InterfaceTools = {
    ready: false, filter: 'all', equipment: 'all',
    favorites() { try { return JSON.parse(localStorage.getItem('exercise_favorites_v1')) || {}; } catch (_) { return {}; } },
    async favorite(name) {
      const values = this.favorites();
      if (values[name]) delete values[name]; else values[name] = true;
      await window.storage.set('exercise_favorites_v1', JSON.stringify(values));
      LibApp.render();
      AppFeatures.announce(values[name] ? '즐겨찾기에 추가했어요.' : '즐겨찾기를 해제했어요.');
    },
    filterExercises(items) {
      const favorites = this.favorites(), recent = new Map();
      for (const [date, session] of Object.entries(ExLog.data)) {
        for (const e of session.exercises || []) if (e.sets.length && (!recent.has(e.name) || recent.get(e.name) < date)) recent.set(e.name, date);
      }
      const result = items.filter(e => (this.filter !== 'favorites' || favorites[e.name]) && (this.filter !== 'recent' || recent.has(e.name)) && (this.equipment === 'all' || e.brand === this.equipment || e.name.toLowerCase().includes(this.equipment.toLowerCase())));
      if (this.filter === 'recent') result.sort((a,b) => recent.get(b.name).localeCompare(recent.get(a.name)));
      return result;
    },
    chooseAdd(name, el) {
      name = String(name || '').trim();
      const panel = el.closest('.day-panel');
      if (!panel || !name || name.length > 200 || /[<>"']/.test(name)) return;
      const day = ExLog.panelDayOf(panel);
      if (AppFeatures.routine(day).some(r => r.name === name)) { AppFeatures.announce('이미 목록에 있는 운동이에요.'); return; }
      this.change = {action:'add', date:ExLog.date, day, name};
      this.openChange();
    },
    chooseRemove(btn) {
      const wrap = btn.closest('.ex-wrap'), panel = btn.closest('.day-panel');
      const name = wrap?.querySelector('.ex-nm')?.textContent.trim();
      if (!panel || !name) return;
      const day = ExLog.panelDayOf(panel), row = AppFeatures.routine(day).find(r => r.name === name);
      if (!row) return;
      this.change = {action:'remove', date:ExLog.date, day, name, original:row.original};
      this.openChange();
    },
    openChange() {
      const c = this.change;
      $('#routine-change-title').textContent = c.name;
      $('#routine-change-note').textContent = c.date + (c.action === 'add' ? '에 운동을 추가해요. 적용 범위를 선택하세요.' : '의 운동을 건너뛰어요. 이미 입력한 기록은 보존됩니다.');
      $('#routine-change-today').textContent = c.action === 'add' ? '오늘 계획에만 추가' : '오늘만 건너뛰기';
      $('#routine-change-permanent').textContent = c.action === 'add' ? '앞으로의 루틴에도 추가' : '앞으로의 루틴에서도 제외';
      $('#routine-change').showModal();
    },
    async applyChange(permanent) {
      const c = this.change;
      if (!c || c.date !== ExLog.date) { $('#routine-change').close(); return; }
      const snapshot = WorkoutTools.capture(c.day), plan = ExLog.planFor(c.day);
      if (c.action === 'add') {
        const existing = snapshot.rows.find(r => r.name === c.name);
        if (existing) existing.skipped = false;
        else {
          const defaults = AppFeatures.defaults(c.day, c.name);
          snapshot.rows.push({original:c.name, name:c.name, index:snapshot.rows.length, ...defaults, baseSets:defaults.sets, ...AppFeatures.priority(c.name)});
        }
        if (permanent) {
          plan.rm = (plan.rm || []).filter(n => n !== c.name);
          if (!TRAINING_PLAN.exercisesFor(c.day,c.date).includes(c.name) && !(plan.add || []).includes(c.name)) (plan.add ||= []).push(c.name);
        }
        AppFeatures.selected[c.day] = c.name;
      } else {
        const row = snapshot.rows.find(r => r.original === c.original);
        if (row) row.skipped = true;
        if (permanent) {
          if (TRAINING_PLAN.exercisesFor(c.day,c.date).includes(c.original)) { if (!(plan.rm || []).includes(c.original)) (plan.rm ||= []).push(c.original); }
          else plan.add = (plan.add || []).filter(n => n !== c.original);
        }
      }
      snapshot.rows.sort((a,b) => a.weight-b.weight || a.index-b.index);
      WorkoutTools.touch(c.date);
      if (permanent) await ExLog.savePlan();
      $('#routine-change').close();
      document.querySelectorAll('.ex-add-picker').forEach(el => el.style.display = 'none');
      ExLog.refresh(); ExLog.injectTargets();
      AppFeatures.announce(permanent ? '이 날짜와 앞으로의 루틴에 적용했어요.' : '이 날짜의 계획에만 적용했어요.');
    },
    restoreSkipped(original) {
      const day = AppFeatures.activeDay(), row = ExLog.session().routineSnapshots?.[day]?.rows.find(r => r.original === original);
      if (!row) return;
      row.skipped = false; WorkoutTools.touch(ExLog.date); AppFeatures.selected[day] = row.name;
      ExLog.refresh(); ExLog.injectTargets();
    },
    refresh() {
      if (!this.ready) return;
      const day = AppFeatures.activeDay();
      const skipped = (ExLog.session().routineSnapshots?.[day]?.rows || []).filter(r => r.skipped);
      const box = $('#skipped-exercises');
      box.hidden = !skipped.length;
      box.replaceChildren();
      if (skipped.length) {
        const title = document.createElement('span');title.textContent = '이 날짜에 건너뛴 운동';box.append(title);
        skipped.forEach(r => {const b=document.createElement('button');b.type='button';b.textContent=r.name+' · 다시 포함';b.onclick=()=>this.restoreSkipped(r.original);box.append(b);});
      }
      // Keep destructive and infrequent actions away from set entry.
      document.querySelectorAll('.ex-wrap').forEach(w => {
        const detail = w.querySelector('.ex-detail');if(!detail)return;
        let actions=w.querySelector('.exercise-actions');
        if(!actions){actions=document.createElement('details');actions.className='exercise-actions';
         const summary=document.createElement('summary');summary.textContent='운동 변경';actions.append(summary);detail.append(actions);}
        for (const [selector, label] of [['.ex-swap-btn','대체 운동 선택'],['.ex-del-btn','건너뛰기·루틴에서 제외']]) {
          const b=w.querySelector(selector);if(b){b.textContent=label;b.setAttribute('aria-label',label);actions.append(b);}
        }
        let settings=w.querySelector('.exercise-settings');
        if(!settings){settings=document.createElement('details');settings.className='exercise-settings';settings.innerHTML='<summary>기구·중량·휴식 설정</summary><div class="exercise-settings-body"></div>';detail.append(settings);}
        const body=settings.querySelector('.exercise-settings-body');
        for(const selector of ['.equipment-button','.ex-load-btn','.ex-brand-row','.ex-base-btn','.ex-memo-btn','.ex-rest-btn','.ex-grip-chip']){const control=detail.querySelector(selector);if(control&&control.parentElement!==body)body.append(control);}
      });
      document.querySelectorAll('.ex-log-input').forEach(form => {
        for (const [selector, title] of [['.wl-kg-input','중량 (kg)'],['.wl-rp-input','반복·시간·거리']]) {
          const input=form.querySelector(selector);if(!input||input.parentElement.classList.contains('set-field'))continue;
          const label=document.createElement('label');label.className='set-field';label.textContent=title;
          input.before(label);label.append(input);
        }
        const log=form.closest('.ex-log'),edit=log.dataset.editIdx;
        const set=edit!==''&&edit!=null?WorkoutTools.sets(ExLog.date,log.dataset.exname)[+edit]:null;
        const unit=RecordModel.unit(log.dataset.exname,set);
        const repetitions=form.querySelector('.wl-rp-input');
        repetitions.parentElement.firstChild.textContent={reps:'반복 (회)',seconds:'시간 (초)',meters:'거리 (m)'}[unit];
        repetitions.setAttribute('aria-label',{reps:'반복 횟수',seconds:'시간 초',meters:'거리 미터'}[unit]);
      });
      document.querySelectorAll('.wl-set-chip').forEach(chip=>{
        chip.tabIndex=0;chip.setAttribute('role','button');chip.setAttribute('aria-label',chip.textContent+' 수정');
        chip.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chip.click();}};
      });
      $('#session-context').hidden = false;
      const cond = ExLog.session().cond || {};
      for (const [id,value] of [['context-rate',cond.rate||''],['context-sleep',cond.sleep??''],['context-note',ExLog.session().note||'']]) {
        const input=$('#'+id);if(document.activeElement!==input)input.value=value;
      }
    },
    resume(last) {
      ExLog.date=last.date;ExLog.updateBar();ExLog.syncPanel(last.day);
      AppFeatures.selected=copy(last.selected||{});AppFeatures.focusDate=last.day+'|'+last.date;
      ExLog.refresh();ExLog.injectTargets();$('#resume-offer')?.remove();
    },
    mount() {
      const dialog=document.createElement('dialog');dialog.id='routine-change';dialog.className='af-dialog';dialog.setAttribute('aria-labelledby','routine-change-title');
      dialog.innerHTML='<h3 id="routine-change-title"></h3><p id="routine-change-note"></p><div class="af-tool-row"><button id="routine-change-today" type="button"></button><button id="routine-change-permanent" type="button"></button><button type="button" id="routine-change-cancel">취소</button></div>';
      document.body.append(dialog);
      $('#routine-change-today').onclick=()=>this.applyChange(false);$('#routine-change-permanent').onclick=()=>this.applyChange(true);$('#routine-change-cancel').onclick=()=>dialog.close();
      const skipped=document.createElement('div');skipped.id='skipped-exercises';skipped.className='af-card';$('.af-tools').after(skipped);
      const context=document.createElement('details');context.id='session-context';context.className='af-card';
      context.innerHTML='<summary>컨디션·수면·메모</summary><div class="af-fields"><label>컨디션<select id="context-rate"><option value="">미입력</option><option value="1">1 · 매우 낮음</option><option value="2">2 · 낮음</option><option value="3">3 · 보통</option><option value="4">4 · 좋음</option><option value="5">5 · 매우 좋음</option></select></label><label>수면 (시간)<input id="context-sleep" type="number" inputmode="decimal" min="0" max="24" step="0.5"></label></div><label>운동 메모<input id="context-note" maxlength="200" type="text" placeholder="오늘 운동에서 기억할 점"></label><p>이 날짜의 기록과 함께 동기화됩니다.</p>';
      $('#weekly-report').before(context);
      $('#context-rate').onchange=e=>{if(e.target.value)ExLog.setCond(+e.target.value);else{const s=ExLog.session();s.cond||={};delete s.cond.rate;ExLog.data[ExLog.date]=s;WorkoutTools.touch(ExLog.date);}this.refresh();};
      $('#context-sleep').onchange=e=>{ExLog.setSleep(e.target.value);this.refresh();};$('#context-note').onchange=e=>ExLog.setNote(e.target.value);
      if (WorkoutTools.offeredResume) {
        const last=WorkoutTools.offeredResume,offer=document.createElement('div');offer.id='resume-offer';offer.className='af-card';
        const text=document.createElement('span');text.textContent=last.date+'에 저장 전 입력이 있어요. 오늘 날짜로 시작했어요.';
        const resume=document.createElement('button');resume.textContent='이전 입력 이어하기';resume.onclick=()=>this.resume(last);
        const close=document.createElement('button');close.textContent='오늘 운동하기';close.onclick=()=>offer.remove();offer.append(text,resume,close);$('.af-tools').before(offer);
      }
      const filters=document.createElement('div');filters.className='library-filters';
      filters.innerHTML='<label>목록<select id="library-scope"><option value="all">전체 운동</option><option value="favorites">즐겨찾기</option><option value="recent">최근 사용</option></select></label><label>기구·브랜드<select id="library-equipment"><option value="all">전체</option>'+['Hammer','Watson','Nautilus','Booty Builder','덤벨','바벨','케이블'].map(n=>'<option>'+n+'</option>').join('')+'</select></label>';
      const filterDetails=document.createElement('details');filterDetails.className='library-filter-panel';filterDetails.innerHTML='<summary>도감·기구 필터</summary>';filterDetails.append(filters);$('#lib-list').before(filterDetails);$('#library-scope').onchange=e=>{this.filter=e.target.value;LibApp.render();};$('#library-equipment').onchange=e=>{this.equipment=e.target.value;LibApp.render();};
      document.querySelectorAll('.top-nav label,.day-sel label').forEach(label=>{
        label.tabIndex=0;label.setAttribute('role','button');
        label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();label.click();}};
      });
      $('#swap-scope').setAttribute('aria-labelledby','swap-title');$('#equipment-dialog').setAttribute('aria-labelledby','equipment-title');
      // Place optional analysis below immediate results.
      const analysis=$('.tab-p .plan-wrap');
      analysis.append($('#weekly-report'));
      analysis.insertAdjacentHTML('afterbegin','<div class="page-heading"><span class="page-kicker">YOUR PROGRESS</span><h1>기록의 흐름</h1><p>이번 주의 수행과 꾸준히 쌓인 변화를 확인하세요.</p></div>');
      $('.tab-b .plan-wrap').insertAdjacentHTML('afterbegin','<div class="page-heading"><span class="page-kicker">MY WORKOUT NOTE</span><h1>나의 관리</h1><p>몸의 변화, 기록 백업, 시트 연결을 한곳에서.</p></div>');
      for(const selector of ['#sec-sleep','#sec-block']){const heading=analysis.querySelector(selector);if(heading){const card=heading.nextElementSibling;analysis.append(heading);if(card)analysis.append(card);}}
      const nav=$('.top-nav');
      const resize=()=>document.documentElement.style.setProperty('--mobile-nav-height',nav.getBoundingClientRect().height+'px');
      new ResizeObserver(resize).observe(nav);resize();
      const updateNavigation=()=>document.querySelectorAll('.top-nav label').forEach(label=>label.setAttribute('aria-pressed',String(document.getElementById(label.htmlFor).checked)));
      document.querySelectorAll('.tab-r').forEach(r=>r.addEventListener('change',()=>{updateNavigation();window.scrollTo({top:0,behavior:'instant'});}));updateNavigation();
      // Leave the input area clear when the on-screen keyboard reduces the viewport.
      const keyboard=()=>{
        const vv=window.visualViewport,active=document.activeElement;
        const editing=active?.matches('input:not([type=radio]):not([type=checkbox]),textarea,select');
        document.body.classList.toggle('keyboard-open',!!(editing&&vv&&innerHeight-vv.height>140));
      };
      window.visualViewport?.addEventListener('resize',keyboard);
      document.addEventListener('focusin',keyboard);document.addEventListener('focusout',()=>requestAnimationFrame(keyboard));
      GymInventory.mount();
      this.ready=true;this.refresh();
    }
  };
})();
