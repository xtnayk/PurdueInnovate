/* Run: node scripts/test_simulation.cjs
 * These tests exercise the shipped replay model without a browser or GPU.
 * They deliberately use the real Fieldwork3D prototype; no copied motion logic.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const context = vm.createContext({ window: {} });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'web', 'simulation.js'), 'utf8'),
  context,
  { filename: 'web/simulation.js' },
);
const Fieldwork3D = context.window.Fieldwork3D;

function fixture() {
  // Constructor requires WebGL. The deterministic replay calculations do not.
  const simulation = Object.create(Fieldwork3D.prototype);
  simulation.metadata = { now: 480 };
  simulation.conditions = { rig_available_from: { R1: 480, R2: 840 } };
  simulation.fields = new Map([
    ['F1', { p: { x: 10, z: 20 }, w: 10, d: 12 }],
    ['F2', { p: { x: 30, z: 40 }, w: 10, d: 12 }],
  ]);
  simulation.rigs = new Map([
    ['R1', { userData: { index: 0 } }],
    ['R2', { userData: { index: 1 } }],
  ]);
  simulation.plan = {
    schedule: [
      { rig_id: 'R1', field_id: 'F1', start: 500, end: 560, travel_minutes: 10 },
      { rig_id: 'R1', field_id: 'F2', start: 590, end: 630, travel_minutes: 5 },
    ],
    return_trips: [{ rig_id: 'R1', minutes: 8, arrival: 638 }],
  };
  return simulation;
}

test('rig travels for the scheduled duration and waits until its spray window', () => {
  const simulation = fixture();
  const departure = simulation._rigState('R1', 480);
  const midway = simulation._rigState('R1', 485);
  const arrival = simulation._rigState('R1', 490);
  assert.equal(departure.status, 'travel');
  assert.equal(departure.x, 0);
  assert.equal(departure.z, 0);
  assert.equal(midway.status, 'travel');
  assert.equal(midway.x, arrival.x / 2);
  assert.equal(midway.z, arrival.z / 2);
  assert.equal(arrival.status, 'waiting');
  assert.equal(simulation._rigState('R1', 499).status, 'waiting');
  assert.equal(arrival.fieldId, 'F1');
});

test('spraying starts and ends at exact job boundaries and moves within the field', () => {
  const simulation = fixture();
  assert.equal(simulation._rigState('R1', 500).status, 'spraying');
  assert.equal(simulation._rigState('R1', 559).status, 'spraying');
  const early = simulation._rigState('R1', 505);
  const later = simulation._rigState('R1', 510);
  assert.notEqual(early.x, later.x);
  for (const time of [500, 505, 510, 525, 540, 559]) {
    const state = simulation._rigState('R1', time);
    assert.ok(state.x >= 5 && state.x <= 15, 'rig stays inside field X bounds');
    assert.ok(state.z >= 14 && state.z <= 26, 'rig stays inside field Z bounds');
    assert.equal(state.fieldId, 'F1');
  }
  assert.equal(simulation._rigState('R1', 560).status, 'travel');
  assert.equal(simulation._rigState('R1', 564).status, 'travel');
  assert.equal(simulation._rigState('R1', 565).status, 'waiting');
  assert.equal(simulation._rigState('R1', 589).status, 'waiting');
  assert.equal(simulation._rigState('R1', 590).status, 'spraying');
  assert.equal(simulation._rigState('R1', 590).fieldId, 'F2');
});

test('a finished route returns to the yard before becoming complete', () => {
  const simulation = fixture();
  const departure = simulation._rigState('R1', 630);
  const midway = simulation._rigState('R1', 634);
  assert.equal(departure.status, 'returning');
  assert.equal(midway.status, 'returning');
  assert.equal(midway.x, departure.x / 2);
  assert.equal(midway.z, departure.z / 2);
  assert.equal(midway.fieldId, null);
  assert.equal(simulation._rigState('R1', 637).status, 'returning');
  assert.equal(simulation._rigState('R1', 638).status, 'complete');
});

test('a broken rig remains unavailable until its declared availability time', () => {
  const simulation = fixture();
  for (const time of [480, 600, 839]) {
    assert.equal(simulation._rigState('R2', time).status, 'unavailable');
  }
  assert.equal(simulation._rigState('R2', 840).status, 'idle');
  assert.equal(simulation._rigState('R2', 1080).status, 'idle');
});

test('scrubbing in either direction never changes authoritative planning data', () => {
  const simulation = fixture();
  const original = JSON.stringify({
    plan: simulation.plan, metadata: simulation.metadata, conditions: simulation.conditions,
  });
  for (const time of [1080, 480, 600, 500, 638, 490]) {
    simulation._rigState('R1', time);
    simulation._rigState('R2', time);
  }
  assert.equal(JSON.stringify({
    plan: simulation.plan, metadata: simulation.metadata, conditions: simulation.conditions,
  }), original);
});

test('an empty or absent plan leaves available rigs idle', () => {
  const simulation = fixture();
  for (const plan of [null, { schedule: [], return_trips: [] }]) {
    simulation.plan = plan;
    for (const time of [480, 600, 1080]) {
      const state = simulation._rigState('R1', time);
      assert.equal(state.status, 'idle');
      assert.equal(state.fieldId, null);
      assert.ok(Number.isFinite(state.x) && Number.isFinite(state.z));
    }
    assert.equal(simulation._rigState('R2', 600).status, 'unavailable');
  }
});

function drawableFixture(workday) {
  const simulation=fixture();
  simulation.metadata.workday=workday;
  Object.assign(simulation,{available:true,destroyed:false,time:480,cameraState:{},options:{},container:{offsetParent:{}},speed:40,playing:false});
  simulation._update=()=>{};simulation._camera=()=>{};simulation.renderer={render(){}};
  return simulation;
}
test('custom workday clamps scrubbing to its start and end instead of demo hours', () => {
  const simulation=drawableFixture({start:600,end:1200});
  simulation.renderFrame({time:480});assert.equal(simulation.time,600);
  simulation.renderFrame({time:1170});assert.equal(simulation.time,1170);
  simulation.renderFrame({time:1300});assert.equal(simulation.time,1200);
  simulation.renderFrame({time:NaN});assert.equal(simulation.time,600);
});
test('missing or invalid workday retains the original demo scrub range', () => {
  for(const workday of [undefined,{start:900,end:800},{start:'invalid',end:1200}]) {
    const simulation=drawableFixture(workday);
    simulation.renderFrame({time:0});assert.equal(simulation.time,480);
    simulation.renderFrame({time:1400});assert.equal(simulation.time,1080);
  }
});
test('changing profile clamps existing replay time even before graphics load', () => {
  const simulation=fixture();simulation.available=false;simulation.time=480;
  simulation.setData({workday:{start:660,end:960}},null);
  assert.equal(simulation.time,660);
  simulation.time=1100;simulation.setData({workday:{start:660,end:960}},null);
  assert.equal(simulation.time,960);
});
test('unavailable graphics preserve shared scrub time and emit the clamped value', () => {
  const simulation=fixture();
  simulation.available=false;simulation.time=480;
  simulation.metadata.workday={start:600,end:1200};
  const emitted=[];
  simulation.options={onTimeChange:(time,snapshot)=>emitted.push([time,snapshot.time])};
  for(const [requested,expected] of [[720,720],[480,600],[1300,1200],[NaN,600]]) {
    simulation.setTime(requested);
    assert.equal(simulation.time,expected);
    assert.deepEqual(emitted.at(-1),[expected,expected]);
  }
});
test('playback continues beyond 6pm and ends once at the custom end time', () => {
  context.document={hidden:false};context.requestAnimationFrame=()=>1;
  const simulation=drawableFixture({start:600,end:1200});
  let ended=0;simulation.options.onPlaybackEnd=()=>ended++;
  simulation.playing=true;simulation.time=1080;simulation.previousFrame=1000;
  simulation._tick(1100);assert.equal(simulation.time,1084);assert.equal(simulation.playing,true);assert.equal(ended,0);
  simulation.time=1199;simulation._tick(1200);assert.equal(simulation.time,1200);assert.equal(simulation.playing,false);assert.equal(ended,1);
  simulation._tick(1300);assert.equal(ended,1);
});
test('rigs cannot leave before the custom workday even if metadata now is earlier', () => {
  const simulation=fixture();simulation.metadata.workday={start:600,end:1200};
  assert.equal(simulation._rigState('R1',599).status,'unavailable');
});
