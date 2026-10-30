#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const {build} = require('../web/plan-actions.js');
const meta = {
  rigs: [1,2,3,4].map(i => ({id:`R${i}`, name:`Rig ${i}`, crew_name:`Operator ${i}`})),
  fields: [1,2,3,4,5].map(i => ({id:`F0${i}`, acres:40})),
  crew: [{id:'C5', name:'Reserve Operator'}],
};
const job = (field, rig, start, other = {}) => ({field_id:field, rig_id:rig, start, end:start+30, acres:40, crew_name:`Operator ${rig.slice(1)}`, travel_minutes:10, ...other});
const proposed = schedule => ({id:'proposal', name:'Protect acreage', schedule});
const active = schedule => ({run_id:'approved-run', plan:{id:'approved', schedule}});
const compare = (schedule, previous = null, completedIds = [], heldIds = []) => build({meta, result:{run_id:'new-run'}, plan:proposed(schedule), activeSnapshot:previous, completedIds, heldIds});
const tests = [];
const test = (name, fn) => {fn(); tests.push(name);};
const freeze = obj => {Object.freeze(obj); for (const value of Object.values(obj)) if (value && typeof value === 'object' && !Object.isFrozen(value)) freeze(value); return obj;};

test('new plan assigns every remaining field and retains all four sprayers', () => {
  const diff = compare([job('F02','R1',560), job('F01','R1',500), job('F03','R3',540)]);
  assert.deepEqual(diff.counts,{added:3,removed:0,reassigned:0});
  assert.deepEqual(diff.actions.map(a => a.rig_id), ['R1','R2','R3','R4']);
  assert.deepEqual(diff.actions[0].jobs.map(j => j.field_id), ['F01','F02']);
  assert.equal(diff.actions[0].next_first,'F01'); assert.equal(diff.actions[0].previous_first,null);
  assert.equal(diff.actions[1].changed,false); assert.equal(diff.actions[1].next_first,null);
  assert.match(diff.summary,/Assign 3 fields across 2 of 4 sprayers/);
  assert.equal(diff.run_id,'new-run'); assert.equal(diff.plan_id,'proposal');
});
test('reassignment is separate from global additions and removals', () => {
  const diff = compare([job('F01','R2',510), job('F03','R3',500)], active([job('F01','R1',500),job('F02','R2',560)]));
  assert.deepEqual(diff.counts,{added:1,removed:1,reassigned:1});
  assert.deepEqual(diff.actions[0].removed_fields,['F01']);
  assert.deepEqual(diff.actions[1].added_fields,['F01']);
  assert.deepEqual(diff.actions[1].removed_fields,['F02']);
  assert.equal(diff.actions[0].previous_first,'F01'); assert.equal(diff.actions[0].next_first,null);
  assert.equal(diff.actions[1].previous_first,'F02'); assert.equal(diff.actions[1].next_first,'F01');
});
test('completed fields never become additions, removals or reassignment actions', () => {
  const diff = compare([job('F01','R2',510),job('F02','R1',540)], active([job('F01','R1',500),job('F02','R1',540)]), ['F01','F01','F05']);
  assert.deepEqual(diff.counts,{added:0,removed:0,reassigned:0}); assert.equal(diff.completed_count,2);
  assert.equal(diff.actions[0].next_first,'F02'); assert.equal(diff.actions[0].previous_first,'F02');
  assert.equal(diff.actions.some(a => a.changed),false);
  assert.equal(diff.actions[1].jobs.length,0); assert.match(diff.summary,/2 completed fields excluded/);
});
test('changed planned times are visible even when field membership is identical', () => {
  const diff = compare([job('F01','R1',520)], active([job('F01','R1',500)]));
  assert.deepEqual(diff.counts,{added:0,removed:0,reassigned:0}); assert.equal(diff.actions[0].changed,true);
});
test('changed operator, travel or application rules alter the rig action', () => {
  for (const update of [{crew_name:'Replacement operator'},{travel_minutes:20},{rainfast_minutes:120}]) {
    const diff = compare([job('F01','R1',500,update)], active([job('F01','R1',500)]));
    assert.equal(diff.actions[0].changed,true);
  }
  const diff = compare([job('F01','R1',500,{crew_name:'Replacement operator'})], active([job('F01','R1',500)]));
  assert.equal(diff.actions[0].crew_name,'Replacement operator');
});
test('field order changes are reflected in previous and next first fields', () => {
  const diff = compare([job('F02','R1',500),job('F01','R1',550)], active([job('F01','R1',500),job('F02','R1',550)]));
  assert.equal(diff.actions[0].previous_first,'F01'); assert.equal(diff.actions[0].next_first,'F02');
  assert.equal(diff.actions[0].changed,true); assert.deepEqual(diff.actions[0].added_fields,[]);
});
test('array order and object key order do not invent route changes', () => {
  const first = job('F01','R1',500), second = job('F02','R1',550);
  const shuffled = Object.fromEntries(Object.entries(first).reverse());
  const diff = compare([second,shuffled],active([first,second]));
  assert.equal(diff.actions.some(a => a.changed),false); assert.match(diff.summary,/No changes/);
});
test('empty proposed routes remove prior remaining jobs', () => {
  const diff = compare([],active([job('F01','R1',500),job('F02','R3',550)]));
  assert.deepEqual(diff.counts,{added:0,removed:2,reassigned:0});
  assert.equal(diff.actions[0].next_first,null); assert.equal(diff.actions[2].next_first,null);
  assert.equal(diff.actions[1].changed,false);
});
test('an entirely completed route is unchanged operationally', () => {
  const diff = compare([],active([job('F01','R1',500)]),new Set(['F01']));
  assert.deepEqual(diff.counts,{added:0,removed:0,reassigned:0}); assert.equal(diff.actions[0].changed,false);
});
test('held first fields remain in the route but are skipped by first-field actions', () => {
  const before = [job('F01','R1',500),job('F02','R1',550)];
  const after = [job('F01','R1',520),job('F03','R1',560)];
  const diff = compare(after,active(before),[],['F01']);
  assert.equal(diff.actions[0].previous_first,'F02'); assert.equal(diff.actions[0].next_first,'F03');
  assert.deepEqual(diff.actions[0].held_fields,['F01']);
  assert.deepEqual(diff.actions[0].jobs.map(j => j.field_id),['F01','F03']);
  assert.equal(diff.actions[0].jobs[0].on_hold,true); assert.equal(diff.actions[0].jobs[1].on_hold,undefined);
  assert.equal(after[0].on_hold,undefined); assert.equal(diff.actions[0].changed,true);
  assert.deepEqual(diff.counts,{added:1,removed:1,reassigned:0});
});
test('all-held routes have no actionable first field while timing changes remain visible', () => {
  const diff = compare([job('F01','R1',520)],active([job('F01','R1',500)]),[],new Set(['F01']));
  assert.equal(diff.actions[0].previous_first,null); assert.equal(diff.actions[0].next_first,null);
  assert.equal(diff.actions[0].changed,true); assert.deepEqual(diff.actions[0].held_fields,['F01']);
  assert.equal(diff.actions[0].jobs.length,1); assert.equal(diff.actions[0].jobs[0].on_hold,true);
  assert.deepEqual(diff.counts,{added:0,removed:0,reassigned:0});
});
test('completed fields stay excluded even if also listed as held', () => {
  const diff = compare([job('F01','R1',500)],null,['F01'],['F01']);
  assert.equal(diff.actions[0].next_first,null); assert.deepEqual(diff.actions[0].held_fields,[]);
  assert.deepEqual(diff.actions[0].jobs,[]);
});
test('frozen inputs stay intact and returned job records are isolated', () => {
  const input = freeze({meta:structuredClone(meta),result:{run_id:'new'},plan:proposed([job('F01','R1',500,{detail:{nested:'source'}})]),activeSnapshot:active([]),completedIds:[]});
  const before = JSON.stringify(input), diff = build(input);
  diff.actions[0].jobs[0].detail.nested='edited'; diff.actions[0].jobs[0].start=0;
  assert.equal(JSON.stringify(input),before); assert.equal(build(input).actions[0].jobs[0].detail.nested,'source');
});
test('the active snapshot contract rejects a full store wrapper', () => {
  assert.throws(() => compare([],{active:active([])}),/activeSnapshot/);
});
test('malformed and duplicate assignments cannot produce misleading action cards', () => {
  assert.throws(() => compare([job('F01','R1',500),job('F01','R2',600)]),/duplicate/);
  assert.throws(() => compare([job('F01','R9',500)]),/known/);
  assert.throws(() => compare([job('F99','R1',500)]),/known/);
  assert.throws(() => compare([job('F01','R1',500,{end:400})]),/times/);
  assert.throws(() => compare([],null,['F99']),/completed field/);
  assert.throws(() => compare([],null,[],['F99']),/held field/);
});
// Incident feed and response presentation are covered by test_incident_ui.cjs.
console.log(`${tests.length} plan-action checks passed.\n${tests.map(name => `✓ ${name}`).join('\n')}`);
