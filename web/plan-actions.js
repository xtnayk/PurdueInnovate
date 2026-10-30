/* Deterministic differences between an approved fleet plan and a proposed solver plan.
 * activeSnapshot is the active object {plan, run_id, ...}, or null; not the full job store.
 * completedIds are day-level field IDs. They never appear in operational actions or counts.
 * heldIds stay in the planned route but cannot be the next actionable field.
 * This helper describes changes only. It never approves, dispatches, or mutates a plan.
 */
(function (root) {
  'use strict';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.length > 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const plural = (count, singular, multiple = `${singular}s`) => `${count} ${count === 1 ? singular : multiple}`;
  const byStart = (a, b) => a.start - b.start || a.end - b.end || a.field_id.localeCompare(b.field_id);

  // Object key order is irrelevant, while ordered route arrays remain significant.
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!object(value)) return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonical(value[key]);
      return result;
    }, {});
  }

  function build({meta, result, plan, activeSnapshot = null, completedIds = [], heldIds = []} = {}) {
    if (!object(meta) || !Array.isArray(meta.rigs) || !Array.isArray(meta.fields)) {
      throw new Error('The field and sprayer roster is required to compare plans.');
    }
    if (!object(result) || !text(result.run_id) || !object(plan) || !text(plan.id)) {
      throw new Error('A proposed plan and its planning run are required to describe changes.');
    }
    if (activeSnapshot !== null && (!object(activeSnapshot) || !object(activeSnapshot.plan))) {
      throw new Error('activeSnapshot must be an active plan object with a plan property, or null.');
    }
    const rigs = new Map(meta.rigs.map(rig => [rig.id, rig]));
    const fields = new Set(meta.fields.map(field => field.id));
    if (rigs.size !== meta.rigs.length || fields.size !== meta.fields.length ||
        meta.rigs.some(rig => !text(rig.id)) || meta.fields.some(field => !text(field.id))) {
      throw new Error('The field and sprayer roster must contain unique IDs.');
    }
    if (!Array.isArray(completedIds) && !(completedIds instanceof Set)) throw new Error('Completed fields must be supplied as field IDs.');
    const completed = new Set(completedIds);
    if ([...completed].some(id => !fields.has(id))) throw new Error('A completed field is not in the field roster.');
    if (!Array.isArray(heldIds) && !(heldIds instanceof Set)) throw new Error('Held fields must be supplied as field IDs.');
    const held = new Set(heldIds);
    if ([...held].some(id => !fields.has(id))) throw new Error('A held field is not in the field roster.');

    function remainingJobs(candidate, description) {
      if (!object(candidate) || !Array.isArray(candidate.schedule)) throw new Error(`${description} must contain a job schedule.`);
      const seen = new Set();
      for (const job of candidate.schedule) {
        if (!object(job) || !fields.has(job.field_id) || !rigs.has(job.rig_id) || seen.has(job.field_id)) {
          throw new Error(`${description} must assign known fields to known sprayers without duplicate fields.`);
        }
        if (!Number.isFinite(job.start) || !Number.isFinite(job.end) || job.end <= job.start) {
          throw new Error(`${description} contains invalid planned work times.`);
        }
        seen.add(job.field_id);
      }
      return candidate.schedule.filter(job => !completed.has(job.field_id)).slice().sort(byStart);
    }

    const before = activeSnapshot ? remainingJobs(activeSnapshot.plan, 'The approved plan') : [];
    const after = remainingJobs(plan, 'The proposed plan');
    const oldAssignment = new Map(before.map(job => [job.field_id, job.rig_id]));
    const newAssignment = new Map(after.map(job => [job.field_id, job.rig_id]));
    const counts = {
      added: after.filter(job => !oldAssignment.has(job.field_id)).length,
      removed: before.filter(job => !newAssignment.has(job.field_id)).length,
      reassigned: after.filter(job => oldAssignment.has(job.field_id) && oldAssignment.get(job.field_id) !== job.rig_id).length,
    };
    const crewById = new Map((meta.crew || []).map(person => [person.id, person.name]));
    const actions = meta.rigs.map(rig => {
      const previous = before.filter(job => job.rig_id === rig.id);
      const next = after.filter(job => job.rig_id === rig.id);
      const previousIds = new Set(previous.map(job => job.field_id));
      const nextIds = new Set(next.map(job => job.field_id));
      const crews = [...new Set(next.map(job => job.crew_name || crewById.get(job.crew_id) || rig.crew_name || '').filter(Boolean))];
      return {
        rig_id: rig.id,
        rig_name: rig.name || rig.id,
        crew_name: crews.length ? crews.join(', ') : rig.crew_name || crewById.get(rig.crew_id) || '',
        previous_first: previous.find(job => !held.has(job.field_id))?.field_id || null,
        next_first: next.find(job => !held.has(job.field_id))?.field_id || null,
        added_fields: next.filter(job => !previousIds.has(job.field_id)).map(job => job.field_id),
        removed_fields: previous.filter(job => !nextIds.has(job.field_id)).map(job => job.field_id),
        held_fields: next.filter(job => held.has(job.field_id)).map(job => job.field_id),
        jobs: clone(next).map(job => held.has(job.field_id) ? {...job, on_hold:true} : job),
        changed: JSON.stringify(canonical(previous)) !== JSON.stringify(canonical(next)),
      };
    });
    const changed = actions.filter(action => action.changed).length;
    const working = actions.filter(action => action.jobs.length).length;
    const completionNote = completed.size ? ` ${plural(completed.size, 'completed field')} excluded from the remaining work.` : '';
    let summary;
    if (!activeSnapshot) {
      summary = `Assign ${plural(after.length, 'field')} across ${working} of ${plural(meta.rigs.length, 'sprayer')}.${completionNote}`;
    } else if (!changed) {
      summary = `No changes to the remaining field queues.${completionNote}`;
    } else {
      summary = `${changed} of ${plural(meta.rigs.length, 'sprayer')} ${changed === 1 ? 'has' : 'have'} queue changes: ${plural(counts.added, 'field')} added, ${plural(counts.removed, 'field')} removed, and ${plural(counts.reassigned, 'field')} reassigned between sprayers.${completionNote}`;
    }
    return {
      run_id: result.run_id,
      plan_id: plan.id,
      title: plan.name ? `Review plan: ${plan.name}` : 'Review the proposed fleet plan',
      summary,
      actions,
      counts,
      completed_count: completed.size,
    };
  }

  const api = {build};
  root.FieldworkPlanActions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
