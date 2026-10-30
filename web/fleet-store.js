/* Manual job log for the local Fieldwork prototype. This never dispatches a rig. */
(function (root) {
  'use strict';
  const VERSION = 1;
  const STATES = new Set(['queued', 'in_progress', 'held', 'done']);
  const NEXT = {queued: ['in_progress', 'held'], in_progress: ['done', 'held'], held: ['queued'], done: ['queued']};
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.length > 0;
  const stamp = () => new Date().toISOString();

  class FieldworkFleetStore {
    constructor({metadata, storage} = {}) {
      if (!object(metadata) || !text(metadata.date) || !Array.isArray(metadata.fields) || !Array.isArray(metadata.rigs)) {
        throw new Error('A dated field and fleet roster is required for the job log.');
      }
      this.metadata = clone(metadata);
      this.fields = new Map(metadata.fields.map(field => [field.id, clone(field)]));
      this.rigs = new Map(metadata.rigs.map(rig => [rig.id, clone(rig)]));
      this.day = metadata.date;
      this.key = `fieldwork:fleet:v${VERSION}:${encodeURIComponent(this.day)}${metadata.profile_id ? ':'+encodeURIComponent(metadata.profile_id) : ''}`;
      this.persistenceWarning = null;
      this._raw = null;
      this._state = this._empty();
      try {
        this.storage = storage === undefined ? root.localStorage : storage;
        if (!this.storage || typeof this.storage.getItem !== 'function' || typeof this.storage.setItem !== 'function') {
          throw new Error('Storage unavailable');
        }
        this._raw = this.storage.getItem(this.key);
        if (this._raw !== null) this._state = this._read(this._raw);
      } catch (_error) {
        this.storage = null;
        this.persistenceWarning = 'Saved job tracking is unavailable or unreadable. Changes in this tab will not survive a reload; the previous saved log has not been overwritten.';
      }
    }

    _empty() {
      return {version: VERSION, day: this.day, revision: 0, active: null, records: {}, events: []};
    }

    _validatePlan(plan) {
      if (!object(plan) || !text(plan.id) || !Array.isArray(plan.schedule)) throw new Error('A valid reviewed plan is required.');
      const seen = new Set();
      for (const job of plan.schedule) {
        if (!object(job) || !this.fields.has(job.field_id) || !this.rigs.has(job.rig_id) || seen.has(job.field_id)) {
          throw new Error('Plan jobs must identify known fields and sprayers, without duplicate fields.');
        }
        if (!Number.isFinite(job.start) || !Number.isFinite(job.end) || job.end <= job.start || job.acres !== this.fields.get(job.field_id).acres) {
          throw new Error('Plan jobs must have valid times and the field roster acreage.');
        }
        seen.add(job.field_id);
      }
    }

    _read(raw) {
      const saved = JSON.parse(raw);
      if (!object(saved) || saved.version !== VERSION || saved.day !== this.day || !Number.isSafeInteger(saved.revision) || saved.revision < 0 ||
          !object(saved.records) || !Array.isArray(saved.events)) throw new Error('Invalid saved job log.');
      if (saved.active !== null) {
        if (!object(saved.active) || !text(saved.active.run_id) || !text(saved.active.approved_at)) throw new Error('Invalid saved active plan.');
        this._validatePlan(saved.active.plan);
      }
      const busy = new Set();
      for (const [id, record] of Object.entries(saved.records)) {
        if (!object(record) || id !== record.field_id || !this.fields.has(id) || !this.rigs.has(record.rig_id) || !STATES.has(record.status) ||
            record.acres !== this.fields.get(id).acres || !Number.isFinite(record.start) || !Number.isFinite(record.end) || record.end <= record.start) {
          throw new Error('Invalid saved job record.');
        }
        if (record.status === 'done' && !text(record.completed_at)) throw new Error('Missing completion timestamp.');
        if (record.status === 'in_progress') {
          if (busy.has(record.rig_id) || !text(record.started_at) || !saved.active?.plan.schedule.some(job => job.field_id === id && job.rig_id === record.rig_id)) {
            throw new Error('Invalid in-progress assignment.');
          }
          busy.add(record.rig_id);
        }
      }
      if (saved.active?.plan.schedule.some(job => {
        const record = saved.records[job.field_id];
        return !record || (record.status !== 'done' && (record.rig_id !== job.rig_id || record.start !== job.start || record.end !== job.end));
      })) throw new Error('Missing or inconsistent active job record.');
      if (saved.events.some(event => !object(event) || !text(event.timestamp) || !text(event.action) || !text(event.message))) throw new Error('Invalid job history.');
      return saved;
    }

    _checkFresh() {
      if (!this.storage) return;
      let current;
      try {
        current = this.storage.getItem(this.key);
      } catch (_error) {
        this.storage = null;
        this.persistenceWarning = 'The browser cannot access saved tracking. Changes are kept in this tab only.';
        return;
      }
      if (current === this._raw) return;
      try {
        this._state = current === null ? this._empty() : this._read(current);
        this._raw = current;
      } catch (_error) {
        this.storage = null;
        this.persistenceWarning = 'Another tab changed the saved job log to unreadable data. Changes are kept in this tab only; the saved log has not been overwritten.';
      }
      throw new Error('The job log changed in another tab. Review the refreshed job status, then try again.');
    }

    _commit(next, event) {
      next.revision = this._state.revision + 1;
      const timestamp = stamp();
      next.events.push({id: `${this.day}:${next.revision}`, timestamp, ...event});
      const raw = JSON.stringify(next);
      if (this.storage) {
        try {
          this.storage.setItem(this.key, raw);
          this._raw = raw;
        } catch (_error) {
          this.storage = null;
          this.persistenceWarning = 'The browser could not save the job log. Changes are kept in this tab only and will be lost on reload.';
        }
      }
      this._state = next;
      return this.snapshot();
    }

    snapshot() { return clone(this._state); }

    completedIds() {
      return Object.values(this._state.records).filter(record => record.status === 'done').map(record => record.field_id).sort();
    }

    activate(plan, result) {
      this._checkFresh();
      this._validatePlan(plan);
      if (!object(result) || !text(result.run_id)) throw new Error('A current planning run is required.');
      if (this._state.active?.run_id === result.run_id && this._state.active.plan.id === plan.id) return this.snapshot();
      if (Object.values(this._state.records).some(record => record.status === 'in_progress')) {
        throw new Error('Complete or hold every in-progress job before replacing the active fleet plan.');
      }
      const next = this.snapshot();
      next.active = {plan: clone(plan), run_id: result.run_id, scenario: result.scenario || 'baseline',
        conditions: clone(result.conditions || {}), approved_at: stamp()};
      for (const job of plan.schedule) {
        const old = next.records[job.field_id];
        if (old?.status === 'done') continue;
        const field = this.fields.get(job.field_id), rig = this.rigs.get(job.rig_id);
        next.records[job.field_id] = {...clone(job), field_name: field.name, rig_name: rig.name,
          crew_name: job.crew_name || rig.crew_name || '', status: old?.status === 'held' ? 'held' : 'queued',
          planned_start: job.start, planned_end: job.end, started_at: null, completed_at: null,
          held_at: old?.status === 'held' ? old.held_at : null, updated_at: stamp()};
      }
      return this._commit(next, {action: 'activate', plan_id: plan.id, run_id: result.run_id,
        message: `Activated ${plan.name || 'reviewed plan'} for manual fleet tracking.`});
    }

    transition(fieldId, status) {
      this._checkFresh();
      if (!STATES.has(status)) throw new Error('Choose a supported job status.');
      const job = this._state.active?.plan.schedule.find(item => item.field_id === fieldId);
      const old = this._state.records[fieldId];
      if (!job || !old) throw new Error('Only fields in the active approved plan can be updated.');
      if (old.status === status) return this.snapshot();
      if (!NEXT[old.status].includes(status)) throw new Error(`Cannot change a ${old.status.replace('_', ' ')} job directly to ${status.replace('_', ' ')}.`);
      if (status === 'in_progress') {
        if (Object.values(this._state.records).some(record => record.rig_id === job.rig_id && record.status === 'in_progress')) {
          throw new Error('This sprayer already has an in-progress job. Complete or hold it first.');
        }
        const first = this._state.active.plan.schedule.filter(item => item.rig_id === job.rig_id && this._state.records[item.field_id]?.status === 'queued')
          .sort((a, b) => a.start - b.start || a.end - b.end || a.field_id.localeCompare(b.field_id))[0];
        if (first?.field_id !== fieldId) throw new Error('Start the first queued field for this sprayer, or hold that field before moving on.');
      }
      const next = this.snapshot(), record = next.records[fieldId], timestamp = stamp();
      const previous = record.status;
      // A reopened completion takes the currently approved assignment, while its old assignment remains in history.
      if (previous === 'done' && status === 'queued') {
        const rig = this.rigs.get(job.rig_id);
        Object.assign(record, clone(job), {rig_name: rig.name, crew_name: job.crew_name || rig.crew_name || '',
          planned_start: job.start, planned_end: job.end});
      }
      record.status = status;
      record.updated_at = timestamp;
      if (status === 'in_progress') { record.started_at = timestamp; record.completed_at = null; record.held_at = null; }
      if (status === 'done') { record.completed_at = timestamp; record.held_at = null; }
      if (status === 'held') record.held_at = timestamp;
      if (status === 'queued') { record.started_at = null; record.completed_at = null; record.held_at = null; }
      const action = {in_progress: 'start', done: 'complete', held: 'hold', queued: previous === 'done' ? 'reopen' : 'resume'}[status];
      return this._commit(next, {action, field_id: fieldId, rig_id: record.rig_id, from: previous, to: status,
        message: `${record.field_name || fieldId}: ${status.replace('_', ' ')} on ${record.rig_name || record.rig_id}.`});
    }
  }

  root.FieldworkFleetStore = FieldworkFleetStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = FieldworkFleetStore;
})(typeof window !== 'undefined' ? window : globalThis);
