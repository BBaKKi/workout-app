/* Record identity, units and date calculations shared by recording and analysis.
 * Original exercise names are immutable keys. Display/search synonyms never merge history.
 */
(function () {
  'use strict';
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
  };
  const R = window.RecordModel = {
    activeName(name) {
      return !!window.GymInventory?.find(name) || (typeof name==='string' && name.startsWith('올데이 직접 · ') && name.length>9);
    },
    activeDate(date) { return typeof date==='string' && date>=TRAINING_PLAN.equipmentDate; },
    activeRecord(date,name) { return this.activeDate(date) && this.activeName(name); },
    activeData(data) {
      const result={};
      for(const [date,s] of Object.entries(data||{})){
        if(!this.activeDate(date))continue;
        const exercises=(s.exercises||[]).filter(e=>this.activeName(e.name));
        const routineSnapshots={};
        for(const [day,snap] of Object.entries(s.routineSnapshots||{})){
          const rows=(snap.rows||[]).filter(r=>this.activeName(r.name));
          if(rows.length || !snap.rows?.length)routineSnapshots[day]={...snap,rows};
        }
        // An old-gym-only session must not influence recovery or scheduling either.
        if((s.exercises||[]).length && !exercises.length && !Object.keys(routineSnapshots).length)continue;
        result[date]={...s,exercises,routineSnapshots};
      }
      return result;
    },
    shift(date, days) {
      const d = new Date(date + 'T12:00:00');
      d.setDate(d.getDate() + days);
      return _localKey(d);
    },
    weekDates(date) {
      const offset = (new Date(date + 'T12:00:00').getDay() + 6) % 7;
      const start = this.shift(date, -offset);
      return Array.from({length: 7}, (_, i) => this.shift(start, i));
    },
    plannedDays(date) {
      return this.weekDates(date).filter(d => {
        if (!this.activeDate(d)) return false;
        if (Object.values(ExLog.activeData[d]?.routineSnapshots || {}).some(s => s.rows.some(r => !r.skipped))) return true;
        if (d < TRAINING_PLAN.start || d > TRAINING_PLAN.end) return false;
        return TRAINING_PLAN.cycle.includes(TRAINING_PLAN.schedule(d));
      }).length;
    },
    exerciseId(name) {
      // Injective encoding: no hash collision or fuzzy name matching during migration.
      return 'exercise:' + encodeURIComponent(name);
    },
    unit(name, set) {
      if (set?.unit) return set.unit;
      if (typeof ExLog!=='undefined'&&ExLog.loadTypeOf(name)==='time') return 'seconds';
      // Legacy carries used the repetitions column without a declared unit.
      if (!set && typeof ExLog!=='undefined' && ExLog.loadTypeOf(name)==='distance') return 'meters';
      return 'reps';
    },
    formatSet(name, set) {
      const unit = this.unit(name, set);
      const suffix = {reps:'회', seconds:'초', meters:'m'}[unit];
      return (set.weight ? set.weight + 'kg × ' : '') + set.reps + suffix;
    },
    meta(name, set, exerciseId) {
      const meta = {exerciseId: exerciseId || this.exerciseId(name), unit: this.unit(name, set)};
      for (const k of ['bw', 'ew', 'km', 'incline']) if (Number.isFinite(set[k])) meta[k] = set[k];
      return meta;
    },
    migrateLegacyLinks() {
      const aliases = read('ex_alias', {});
      if (!Object.keys(aliases).length) return;
      const keys = ['ex_memo', 'ex_rest', 'ex_base', 'ex_load', 'ex_equipment_v1'];
      const originals = Object.fromEntries(keys.map(k => [k, read(k, {})]));
      const values = {};
      for (const key of keys) {
        const data = {...originals[key]};
        for (const name of Object.keys(aliases)) {
          let target = name;
          const seen = new Set();
          while (typeof aliases[target] === 'string' && !seen.has(target)) { seen.add(target); target = aliases[target]; }
          if (data[name] == null && originals[key][target] != null) data[name] = originals[key][target];
        }
        values[key] = JSON.stringify(data);
      }
      const history = read('retired_links_v7', {migrations: []});
      history.migrations.push({at: new Date().toISOString(), aliases, settings: originals});
      values.retired_links_v7 = JSON.stringify(history);
      // Preserve the source map and settings before disabling all links.
      SafeStore.transaction(values, ['ex_alias', 'alias_consol_v1']);
    }
  };
})();
