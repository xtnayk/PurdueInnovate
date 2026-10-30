#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const FleetStore = require('../web/fleet-store.js');

function memory() {
  const values = new Map();
  return {getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), values};
}
const metadata = {date: '2026-05-21', fields: [1, 2, 3, 4].map(i => ({id: `F0${i}`, name: `Field 0${i}`, acres: i * 10})),
  rigs: [1, 2, 3, 4].map(i => ({id: `R${i}`, name: `Rig ${i}`, crew_name: `Crew ${i}`}))};
const job = (id, rig, start) => ({field_id: id, rig_id: rig, start, end: start + 20, acres: metadata.fields.find(f => f.id === id).acres});
const plan = {id: 'p1', name: 'Test plan', schedule: [job('F02', 'R1', 540), job('F01', 'R1', 500), job('F03', 'R2', 500)]};
const run = {run_id: 'run1', scenario: 'storm', conditions: {rain_time: 840}};
const make = (storage = memory(), meta = metadata) => new FleetStore({metadata: meta, storage});
const checks = [];
function check(name, fn) { fn(); checks.push(name); }

check('requires a dated fleet roster', () => assert.throws(() => new FleetStore(), /dated/));
check('unapproved fields cannot be changed', () => assert.throws(() => make().transition('F01', 'in_progress'), /active approved/));
check('uses chronological priority, not incoming array order', () => {
  const store = make(); store.activate(plan, run);
  assert.throws(() => store.transition('F02', 'in_progress'), /first queued/);
  store.transition('F01', 'in_progress');
  assert.equal(store.snapshot().records.F01.status, 'in_progress');
});
check('only one job per rig can be in progress, while other rigs may work', () => {
  const store = make(); store.activate(plan, run); store.transition('F01', 'in_progress');
  assert.throws(() => store.transition('F02', 'in_progress'), /already has/);
  store.transition('F03', 'in_progress');
  assert.equal(Object.values(store.snapshot().records).filter(r => r.status === 'in_progress').length, 2);
});
check('held first job permits the next job; resume restores queue order', () => {
  const store = make(); store.activate(plan, run); store.transition('F01', 'held'); store.transition('F02', 'in_progress');
  store.transition('F02', 'held'); store.transition('F01', 'queued'); store.transition('F01', 'in_progress');
  assert.equal(store.snapshot().records.F01.status, 'in_progress');
});
check('completion requires starting a job and records timestamps', () => {
  const store = make(); store.activate(plan, run);
  assert.throws(() => store.transition('F01', 'done'), /Cannot change/);
  store.transition('F01', 'in_progress'); store.transition('F01', 'done');
  assert.deepEqual(store.completedIds(), ['F01']);
  assert.ok(store.snapshot().records.F01.started_at); assert.ok(store.snapshot().records.F01.completed_at);
});
check('duplicate completion is idempotent', () => {
  const store = make(); store.activate(plan, run); store.transition('F01', 'in_progress'); store.transition('F01', 'done');
  const before = store.snapshot(); store.transition('F01', 'done');
  assert.deepEqual(store.snapshot(), before); assert.equal(store.completedIds().length, 1);
});
check('snapshot and activation inputs cannot mutate stored records', () => {
  const store = make(), candidate = structuredClone(plan), inputRun = structuredClone(run); store.activate(candidate, inputRun);
  candidate.schedule[0].start = 0; inputRun.conditions.rain_time = 0;
  const snapshot = store.snapshot(); snapshot.records.F01.status = 'done'; snapshot.active.plan.schedule[0].start = 9;
  assert.equal(store.snapshot().records.F01.status, 'queued'); assert.equal(store.snapshot().active.conditions.rain_time, 840);
  assert.equal(store.snapshot().active.plan.schedule[0].start, 540);
});
check('active work blocks plan replacement but same-plan retries are safe', () => {
  const store = make(); store.activate(plan, run); store.transition('F01', 'in_progress');
  store.activate(plan, run);
  assert.throws(() => store.activate({...plan, id: 'p2'}, {...run, run_id: 'run2'}), /Complete or hold/);
});
check('new plans retain completed history and held states', () => {
  const store = make(); store.activate(plan, run); store.transition('F01', 'in_progress'); store.transition('F01', 'done');
  store.transition('F02', 'held');
  store.activate({id: 'p2', schedule: [job('F01', 'R4', 600), job('F02', 'R3', 600), job('F04', 'R2', 600)]}, {run_id: 'run2'});
  assert.deepEqual(store.completedIds(), ['F01']); assert.equal(store.snapshot().records.F01.rig_id, 'R1');
  assert.equal(store.snapshot().records.F02.status, 'held'); assert.equal(store.snapshot().records.F02.rig_id, 'R3');
  assert.equal(store.snapshot().records.F04.status, 'queued');
  assert.throws(() => store.transition('F03', 'in_progress'), /active approved/);
});
check('completion survives even when the next plan omits that field', () => {
  const store = make(); store.activate(plan, run); store.transition('F01', 'in_progress'); store.transition('F01', 'done');
  store.activate({id: 'p2', schedule: [job('F04', 'R4', 600)]}, {run_id: 'run2'});
  assert.deepEqual(store.completedIds(), ['F01']); assert.throws(() => store.transition('F01', 'queued'), /active approved/);
});
check('reopening a completion clears its count and uses approved assignment', () => {
  const store = make(); store.activate(plan, run); store.transition('F01', 'in_progress'); store.transition('F01', 'done');
  store.activate({id: 'p2', schedule: [job('F01', 'R4', 600)]}, {run_id: 'run2'}); store.transition('F01', 'queued');
  assert.deepEqual(store.completedIds(), []); assert.equal(store.snapshot().records.F01.rig_id, 'R4');
  assert.equal(store.snapshot().records.F01.completed_at, null); assert.equal(store.snapshot().events.at(-1).action, 'reopen');
});
check('reload restores active plan, statuses and history', () => {
  const storage = memory(), store = make(storage); store.activate(plan, run); store.transition('F01', 'in_progress'); store.transition('F01', 'done');
  assert.deepEqual(make(storage).snapshot(), store.snapshot());
});
check('separate workdays do not share completion status', () => {
  const storage = memory(), store = make(storage); store.activate(plan, run); store.transition('F01', 'in_progress'); store.transition('F01', 'done');
  const tomorrow = make(storage, {...metadata, date: '2026-05-22'});
  assert.deepEqual(tomorrow.completedIds(), []); assert.equal(tomorrow.snapshot().active, null);
});
check('separate farm configurations retain isolated work logs on the same day', () => {
  const storage=memory(), first=make(storage,{...metadata,profile_id:'farm-a-revision1'});
  first.activate(plan,run);first.transition('F01','in_progress');first.transition('F01','done');
  for(const profile_id of ['farm-b-revision1','farm-a-revision2',undefined]){
    const other=make(storage,{...metadata,profile_id});
    assert.deepEqual(other.completedIds(),[]);assert.equal(other.snapshot().active,null);
  }
  assert.deepEqual(make(storage,{...metadata,profile_id:'farm-a-revision1'}).completedIds(),['F01']);
});
check('stale tabs cannot overwrite newer job status', () => {
  const storage = memory(), first = make(storage); first.activate(plan, run);
  const second = make(storage); first.transition('F01', 'in_progress');
  assert.throws(() => second.transition('F01', 'held'), /another tab/);
  assert.equal(second.snapshot().records.F01.status, 'in_progress');
  second.transition('F01', 'done');
  assert.throws(() => first.transition('F02', 'in_progress'), /another tab/);
  assert.deepEqual(first.completedIds(), ['F01']);
});
check('malformed storage is preserved and falls back to an explicit session log', () => {
  const storage = memory(), empty = make(storage); storage.setItem(empty.key, 'not JSON');
  const store = make(storage); assert.ok(store.persistenceWarning); store.activate(plan, run); store.transition('F01', 'held');
  assert.equal(storage.getItem(empty.key), 'not JSON'); assert.equal(store.snapshot().records.F01.status, 'held');
});
check('corrupt semantic data is rejected on reload', () => {
  const storage = memory(), store = make(storage); store.activate(plan, run);
  const saved = store.snapshot(); saved.records.F01.status = 'done'; saved.records.F01.completed_at = null;
  storage.setItem(store.key, JSON.stringify(saved));
  const restored = make(storage); assert.ok(restored.persistenceWarning); assert.deepEqual(restored.completedIds(), []);
});
check('saved active assignments must match the approved schedule', () => {
  const storage = memory(), store = make(storage); store.activate(plan, run);
  const saved = store.snapshot(); saved.records.F01.rig_id = 'R4';
  storage.setItem(store.key, JSON.stringify(saved));
  assert.ok(make(storage).persistenceWarning);
});
check('quota and denied access errors preserve working session and show a warning', () => {
  const denied = make({getItem() {throw new Error('blocked');}, setItem() {}});
  denied.activate(plan, run); assert.ok(denied.persistenceWarning);
  const quota = make({getItem() {return null;}, setItem() {throw new Error('quota');}});
  quota.activate(plan, run); quota.transition('F01', 'in_progress');
  assert.equal(quota.snapshot().records.F01.status, 'in_progress'); assert.ok(quota.persistenceWarning);
});
check('invalid plans never replace the active plan', () => {
  const store = make(); store.activate(plan, run); const before = store.snapshot();
  for (const schedule of [[job('F01', 'R1', 500), job('F01', 'R2', 540)], [{...job('F01', 'R1', 500), rig_id: 'R99'}], [{...job('F01', 'R1', 500), acres: 99}]]) {
    assert.throws(() => store.activate({id: 'bad', schedule}, {run_id: 'bad'}));
    assert.deepEqual(store.snapshot(), before);
  }
});
// Fleet dashboard copy follows custom profile capacity.
const fleetContext = require('node:vm').createContext({window:{}});
require('node:vm').runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../web/fleet-dashboard.js'),'utf8'),fleetContext);
check('fleet preview uses the actual queue count and safely renders custom names', () => {
  const root={innerHTML:'',addEventListener(){}},view=new fleetContext.window.FieldworkFleetDashboard(root);
  const custom={date:'2026-10-30',fields:[],rigs:[{id:'R1',name:'Blue <Sprayer>'},{id:'R2',name:'Gold'}]};
  view.render({meta:custom,snapshot:{records:{}},draftPlan:{id:'draft',name:'Draft',schedule:[]}});
  assert.match(root.innerHTML,/The 2 queues follow the selected solver plan/);
  assert.match(root.innerHTML,/Blue &lt;Sprayer&gt;/);assert.doesNotMatch(root.innerHTML,/<Sprayer>|four queues/);
  view.render({meta:custom,snapshot:{records:{}}});assert.match(root.innerHTML,/Your 2-sprayer fleet/);
  view.render({meta:{...custom,rigs:custom.rigs.slice(0,1)},snapshot:{records:{}},draftPlan:{id:'draft',name:'Draft',schedule:[]}});
  assert.match(root.innerHTML,/The sprayer queue follows/);
});
console.log(`${checks.length} fleet-store checks passed.\n${checks.map(name => `✓ ${name}`).join('\n')}`);
