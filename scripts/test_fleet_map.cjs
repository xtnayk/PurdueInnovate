/* Run: node scripts/test_fleet_map.cjs
 * Exercise the shipped map's deterministic replay model without tiles, DOM or a browser.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const FleetMap = require('../web/fleet-map.js');

function fixture() {
  const metadata = {
    now: 480,
    workday: { start: 480, end: 1080 },
    rigs: [{ id: 'R1' }, { id: 'R2' }, { id: 'R3' }, { id: 'R4' }],
    fields: [
      { id: 'F1', x: 10, y: 20, acres: 40 },
      { id: 'F2', x: 30, y: 40, acres: 60 },
    ],
  };
  const conditions = { rig_available_from: { R1: 480, R2: 840 } };
  const plan = {
    schedule: [
      { rig_id: 'R1', field_id: 'F1', start: 500, end: 560, travel_minutes: 10 },
      { rig_id: 'R1', field_id: 'F2', start: 590, end: 630, travel_minutes: 5 },
    ],
    return_trips: [{ rig_id: 'R1', minutes: 8, arrival: 638 }],
  };
  return { metadata, conditions, plan, state: (time, id = 'R1') => FleetMap.rigState(metadata, plan, conditions, id, time) };
}

test('travel lasts the planned duration and waits until the field window opens', () => {
  const { state } = fixture();
  const departure = state(480), halfway = state(485), arrival = state(490);
  assert.equal(departure.status, 'travel');
  assert.equal(halfway.status, 'travel');
  assert.equal(halfway.x, (departure.x + arrival.x) / 2);
  assert.equal(halfway.y, (departure.y + arrival.y) / 2);
  assert.equal(arrival.status, 'waiting');
  assert.equal(state(499).status, 'waiting');
  assert.equal(arrival.fieldId, 'F1');
});

test('job boundaries select the correct field and status', () => {
  const { state } = fixture();
  for (const [time, status, field] of [
    [500, 'spraying', 'F1'], [559, 'spraying', 'F1'],
    [560, 'travel', 'F2'], [564, 'travel', 'F2'],
    [565, 'waiting', 'F2'], [589, 'waiting', 'F2'],
    [590, 'spraying', 'F2'], [629, 'spraying', 'F2'],
    [630, 'returning', null], [637, 'returning', null], [638, 'complete', null],
  ]) {
    assert.equal(state(time).status, status, `status at ${time}`);
    assert.equal(state(time).fieldId, field, `field at ${time}`);
  }
});

test('spraying moves inside the assigned field, including across passes', () => {
  const { state } = fixture();
  assert.notDeepEqual(state(505), state(510));
  assert.notEqual(state(505).y, state(525).y);
  for (const time of [500, 505, 510, 525, 540, 559]) {
    const rig = state(time);
    assert.ok(rig.x > 6.5 && rig.x < 13.5, 'inside field X bounds');
    assert.ok(rig.y > 16.5 && rig.y < 23.5, 'inside field Y bounds');
  }
});

test('the final job returns to the yard over its scheduled return duration', () => {
  const { state } = fixture();
  const departure = state(630), halfway = state(634);
  assert.equal(halfway.status, 'returning');
  assert.equal(halfway.x, (departure.x + 50) / 2);
  assert.equal(halfway.y, (departure.y + 50) / 2);
  assert.equal(state(637).status, 'returning');
  assert.equal(state(638).status, 'complete');
});

test('an unavailable rig stays unavailable until its declared availability', () => {
  const { state } = fixture();
  for (const time of [480, 600, 839]) assert.equal(state(time, 'R2').status, 'unavailable');
  assert.equal(state(840, 'R2').status, 'idle');
  assert.equal(state(1080, 'R2').status, 'idle');
});

test('all four rigs have finite positions even with an empty or absent plan', () => {
  const { metadata, conditions } = fixture();
  for (const plan of [null, { schedule: [], return_trips: [] }]) {
    for (const rig of metadata.rigs) {
      const state = FleetMap.rigState(metadata, plan, conditions, rig.id, 900);
      assert.equal(state.status, 'idle');
      assert.equal(state.fieldId, null);
      assert.ok(Number.isFinite(state.x) && Number.isFinite(state.y));
    }
  }
});

test('zero field coordinates remain zero rather than falling back to the yard', () => {
  const { metadata, plan, conditions } = fixture();
  metadata.fields[0].x = 0;
  metadata.fields[0].y = 0;
  const state = FleetMap.rigState(metadata, plan, conditions, 'R1', 500);
  assert.ok(state.x < 0 && state.x > -3.5);
  assert.ok(state.y < 0 && state.y > -3.5);
  assert.equal(state.status, 'spraying');
});

test('jobs are visited by start time regardless of the input array order', () => {
  const { plan, state } = fixture();
  plan.schedule.reverse();
  assert.equal(state(510).fieldId, 'F1');
  assert.equal(state(610).fieldId, 'F2');
});

test('a replan cannot replay equipment departure before the current planning time', () => {
  const { metadata, state } = fixture();
  metadata.now = 485;
  assert.equal(state(484).status, 'unavailable');
  assert.equal(state(485).status, 'travel');
  assert.equal(state(494).status, 'travel');
  assert.equal(state(495).status, 'waiting');
});

test('scrubbing does not mutate authoritative planning data', () => {
  const { metadata, conditions, plan, state } = fixture();
  const before = JSON.stringify({ metadata, conditions, plan });
  for (const time of [1080, 480, 600, 500, 638, 490]) {
    for (const rig of metadata.rigs) state(time, rig.id);
  }
  assert.equal(JSON.stringify({ metadata, conditions, plan }), before);
});

test('time clamps to custom workdays and reports preview completion without committing jobs', () => {
  const { plan } = fixture();
  const map = Object.create(FleetMap.prototype);
  const changes = [];
  Object.assign(map, { metadata: { workday: { start: 600, end: 1200 } }, plan, map: null,
    options: { onTimeChange: (time, snapshot) => changes.push({ time, snapshot }) },
    states: [{ id: 'R1', x: 10, y: 20, status: 'spraying', fieldId: 'F2' }] });
  map.setTime(0);
  assert.equal(map.time, 600);
  assert.equal(map.getSnapshot().completed, 1);
  map.setTime(2000);
  assert.equal(map.time, 1200);
  assert.equal(map.getSnapshot().completed, 2);
  map.setTime(NaN);
  assert.equal(map.time, 600);
  const snapshot = map.getSnapshot();
  assert.equal(snapshot.illustrative, true);
  assert.equal(snapshot.scheduled, 2);
  snapshot.rigs[0].x = 999;
  assert.equal(map.states[0].x, 10, 'snapshots cannot modify internal rig state');
  assert.equal(changes.length, 3);
  assert.equal(plan.schedule[0].status, undefined, 'replay does not mark actual jobs complete');
});

test('Fit fields closes the popup, cancels following, and requests a fresh fit', () => {
  const map = Object.create(FleetMap.prototype);
  const select = { value: 'R1' }, calls = [];
  Object.assign(map, { followRig: 'R1', pendingFit: false,
    container: { querySelector: () => select },
    map: { closePopup: () => calls.push('close') },
    resize: () => calls.push('resize') });
  assert.equal(map.resetView(), map);
  assert.equal(map.followRig, null);
  assert.equal(select.value, '');
  assert.equal(map.pendingFit, true);
  assert.deepEqual(calls, ['close', 'resize']);
});

test('disabled tiles and hidden views cannot create network tile layers', () => {
  const map = Object.create(FleetMap.prototype);
  Object.assign(map, { map: {}, geography: {}, tilesStarted: false, allowTiles: false,
    _visible: () => true, L: { tileLayer: () => assert.fail('must not create tile requests') } });
  map._startTiles();
  assert.equal(map.tilesStarted, false);
  map.allowTiles = true;
  map._visible = () => false;
  map._startTiles();
  assert.equal(map.tilesStarted, false);
  map._visible = () => true;
  map.geography = null;
  map._startTiles();
  assert.equal(map.tilesStarted, false, 'even an enabled tile preference cannot place unlocated fields on streets');
});

function geographicFixture() {
  const data = fixture();
  const geography = {
    depot: [40.5, -87.05], center: [40.5, -87.05], source: 'Test farmland', attribution: 'Test source',
    fields: {
      F1: { center: [40.511, -87.05], boundary: [[40.51,-87.055],[40.514,-87.055],[40.514,-87.053],[40.512,-87.053],[40.512,-87.045],[40.51,-87.045]] },
      F2: { center: [40.52, -87.04], boundary: [[40.515,-87.045],[40.525,-87.045],[40.525,-87.035],[40.515,-87.035]] },
    },
  };
  return { ...data, geography, geographicState: time => FleetMap.geographicRigState(data.metadata,data.plan,data.conditions,'R1',time,geography) };
}

test('only complete demo geographic data enables sourced field placement', () => {
  const { metadata, geography } = geographicFixture();
  assert.equal(FleetMap.geographyFor(metadata, geography), geography);
  assert.equal(FleetMap.geographyFor({ ...metadata, input_source: 'farmer_profile' }, geography), null);
  assert.equal(FleetMap.geographyFor(metadata, null), null);
  const partial = structuredClone(geography);
  delete partial.fields.F2;
  assert.equal(FleetMap.geographyFor(metadata, partial), null);
  const invalid = structuredClone(geography);
  invalid.fields.F1.boundary[0] = [NaN, -87];
  assert.equal(FleetMap.geographyFor(metadata, invalid), null);
  const flat = structuredClone(geography);
  flat.fields.F1.boundary = [[40,-87],[41,-86],[42,-85]];
  assert.equal(FleetMap.geographyFor(metadata, flat), null, 'a zero-area polygon is not a field');
});

test('geographic travel uses actual yard and field positions at the planned times', () => {
  const { geography, geographicState: state } = geographicFixture();
  assert.deepEqual(FleetMap.latLng(state(480)), geography.depot);
  const origin = state(480), halfway = state(485), arrival = state(490);
  assert.equal(halfway.lat, (origin.lat + arrival.lat) / 2);
  assert.equal(halfway.lng, (origin.lng + arrival.lng) / 2);
  assert.ok(FleetMap.insideBoundary(FleetMap.latLng(arrival), geography.fields.F1.boundary));
  assert.deepEqual(state(499), arrival);
  const departure = state(630), returning = state(634);
  assert.equal(returning.lat, (departure.lat + geography.depot[0]) / 2);
  assert.equal(returning.lng, (departure.lng + geography.depot[1]) / 2);
  assert.deepEqual(FleetMap.latLng(state(638)), geography.depot);
});

test('every geographic spraying sample stays inside a concave mapped boundary', () => {
  const { geography, geographicState: state } = geographicFixture();
  const positions = new Set();
  for (let time = 500; time < 560; time += .1) {
    const position = FleetMap.latLng(state(time));
    assert.ok(FleetMap.insideBoundary(position, geography.fields.F1.boundary), `inside at ${time}`);
    positions.add(JSON.stringify(position));
  }
  assert.ok(positions.size > 500, 'sprayer moves within the sourced field');
});

test('geographic rendering does not alter planning coordinates, acreage, times or source polygons', () => {
  const { metadata, geography, plan, conditions, geographicState: state } = geographicFixture();
  const before = JSON.stringify({ metadata, geography, plan, conditions });
  for (let time = 480; time <= 700; time += 3) state(time);
  assert.equal(JSON.stringify({ metadata, geography, plan, conditions }), before);
});

test('custom profiles remove street tiles and geographic attribution instead of showing false locations', () => {
  const { metadata, geography } = geographicFixture();
  const map = Object.create(FleetMap.prototype), calls = [], label = {}, statusNode = {};
  const existing = global.FIELDWORK_DEMO_GEOGRAPHY;
  global.FIELDWORK_DEMO_GEOGRAPHY = geography;
  try {
    Object.assign(map, { tilesEnabled: true, statusNode,
      container: { querySelector: () => label }, canvas: { setAttribute: () => {} },
      map: { removeLayer: () => calls.push('remove tiles'), attributionControl: {
        addAttribution: value => calls.push(['add', value]), removeAttribution: value => calls.push(['remove', value]),
      } },
    });
    map._setGeography(metadata);
    assert.equal(map.allowTiles, true);
    assert.equal(map.geography, geography);
    assert.match(map.geometryAttribution, /Test source/);
    map.tiles = {}; map.tilesStarted = true;
    map._setGeography({ ...metadata, input_source: 'farmer_profile' });
    assert.equal(map.allowTiles, false);
    assert.equal(map.geography, null);
    assert.equal(map.tilesStarted, false);
    assert.ok(calls.includes('remove tiles'));
    assert.match(statusNode.textContent, /Schematic layout only/);
    assert.match(label.textContent, /Locations not supplied/);
  } finally { global.FIELDWORK_DEMO_GEOGRAPHY = existing; }
});

test('the shipped demo uses 40 sourced farmland polygons with all spray samples inside them', () => {
  const geography = require('../web/demo-geography.js');
  const ids = Array.from({ length: 40 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`);
  assert.deepEqual(Object.keys(geography.fields).sort(), ids);
  assert.match(geography.attribution, /OpenStreetMap contributors/);
  assert.equal(geography.license, 'Open Database License (ODbL) 1.0');
  assert.equal(new Set(Object.values(geography.fields).map(field => field.source_id)).size, 40);
  assert.equal(FleetMap.geographyFor({ fields: ids.map(id => ({ id })) }, geography), geography);
  const before = JSON.stringify(geography);
  for (const id of ids) {
    const field = geography.fields[id];
    assert.match(field.source_id, /^way\/\d+$/);
    assert.ok(FleetMap.insideBoundary(field.center, field.boundary), `${id} has an interior representative point`);
    for (let step = 0; step <= 600; step++) {
      const position = FleetMap.latLng(FleetMap.geographicSprayPoint(field, step / 600));
      assert.ok(FleetMap.insideBoundary(position, field.boundary), `${id} stays inside its sourced boundary at sample ${step}`);
    }
  }
  assert.equal(JSON.stringify(geography), before);
});
