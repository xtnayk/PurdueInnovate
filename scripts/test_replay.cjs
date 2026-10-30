#!/usr/bin/env node
'use strict';

// Standalone adapter regression checks. No browser, server or network is used.
// Run from any directory: node /path/to/PurdueInnovate/scripts/test_replay.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'web/demo-fixtures.json'), 'utf8'));
let now = 0;
const context = {
  window: {FIELDWORK_FIXTURES: fixtures},
  performance: {now: () => now},
  document: {readyState: 'loading', addEventListener() {}},
  console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'web/replay-adapter.js'), 'utf8'), context, {
  filename: 'replay-adapter.js',
});
const api = context.window.FIELDWORK_REPLAY;
const passed = [];

async function check(name, test) {
  await test();
  passed.push(name);
}

async function main() {
  await check('metadata exposes the 40-field prerecorded edition', async () => {
    const metadata = await api.request('/api/demo');
    assert.equal(metadata.fields.length, 40);
    assert.equal(metadata.rigs.length, 4);
    assert.equal(metadata.crew.length, 6);
    assert.equal(metadata.replay, true);
    assert.match(metadata.assumptions[0], /prerecorded/i);
  });

  await check('metadata responses do not mutate stored fixtures', async () => {
    const metadata = await api.request('/api/demo');
    const originalAcres = metadata.fields[0].acres;
    metadata.fields[0].acres = 99999;
    assert.equal((await api.request('/api/demo')).fields[0].acres, originalAcres);
  });

  const runIds = new Set();
  const planIds = new Set();
  for (const scenario of ['baseline', 'storm', 'breakdown', 'wet', 'wind']) {
    for (const [priority, key, ascending] of [
      ['acres', 'acres', false],
      ['cost', 'estimated_cost', true],
      ['buffer', 'min_rain_buffer_minutes', false],
    ]) {
      await check(`${scenario}: ${priority} ranking uses actual values and unique IDs`, async () => {
        const run = await api.request('/api/replan', {scenario, priority});
        assert.equal(run.replay, true);
        assert.equal(run.scenario, scenario);
        assert.equal(run.priority, priority);
        assert.equal(run.plans.length, 3);
        assert.equal(runIds.has(run.run_id), false);
        runIds.add(run.run_id);
        for (const [index, plan] of Array.from(run.plans).entries()) {
          assert.equal(planIds.has(plan.id), false);
          assert.equal(plan.rank, index + 1);
          planIds.add(plan.id);
        }
        // Array.from produces a host-realm array for strict comparison.
        const values = Array.from(run.plans, plan => plan[key]);
        assert.deepEqual(values, [...values].sort((a, b) => ascending ? a - b : b - a));
        assert.equal(run.recorded_solve_seconds, fixtures.scenarios[scenario].solve_seconds);
        assert.match(run.warnings[0], /no new optimization/i);
      });
    }
  }

  const old = await api.request('/api/replan', {scenario: 'storm', priority: 'balanced'});
  const current = await api.request('/api/replan', {scenario: 'wet'});
  await check('a newer replay invalidates approval of the old run', async () => {
    await assert.rejects(() => api.request('/api/approve', {
      run_id: old.run_id, plan_id: old.plans[0].id,
    }), /stale/i);
  });

  let approved;
  await check('approval uses an isolated stored plan and never dispatches', async () => {
    const originalAcres = current.plans[0].acres;
    current.plans[0].acres = 99999;
    approved = await api.request('/api/approve', {
      run_id: current.run_id, plan_id: current.plans[0].id,
    });
    assert.equal(approved.plan.acres, originalAcres);
    assert.equal(approved.local_only, true);
    assert.equal(approved.dispatched, false);
    assert.equal(approved.replay, true);
  });

  await check('same-plan approval retries are idempotent and isolated', async () => {
    approved.plan.acres = 99999;
    const retry = await api.request('/api/approve', {
      run_id: current.run_id, plan_id: current.plans[0].id,
    });
    assert.equal(retry.plan_id, approved.plan_id);
    assert.notEqual(retry.plan.acres, 99999);
    assert.equal(retry.status, 'approved_locally');
  });

  await check('another plan cannot replace an existing approval in the same run', async () => {
    await assert.rejects(() => api.request('/api/approve', {
      run_id: current.run_id, plan_id: current.plans[1].id,
    }), /already approved/i);
  });

  await check('approval expires after five minutes', async () => {
    const run = await api.request('/api/replan', {scenario: 'storm'});
    now += 300001;
    await assert.rejects(() => api.request('/api/approve', {
      run_id: run.run_id, plan_id: run.plans[0].id,
    }), /expired/i);
  });

  await check('custom text cannot masquerade as freshly solved replay input', async () => {
    await assert.rejects(() => api.request('/api/replan', {
      scenario: 'storm', update: 'field 14 wet',
    }), /presets only/i);
  });

  await check('the offline parser returns no invented interpretation', async () => {
    const parsed = await api.request('/api/parse', {text: 'field 14 wet'});
    assert.equal(parsed.updates.length, 0);
    assert.equal(parsed.requires_confirmation, false);
    assert.equal(parsed.parser, 'offline-replay');
    assert.match(parsed.warnings[0], /not supported/i);
  });

  await check('unknown scenarios are rejected', async () => {
    await assert.rejects(() => api.request('/api/replan', {scenario: 'bogus'}), /recorded scenarios/i);
  });

  assert.equal(passed.length, 25);
  console.log(`PASS: ${passed.length} portable adapter checks; no browser, server or network access used.`);
}

main().catch(error => {
  console.error(`FAIL after ${passed.length} successful checks.`);
  console.error(error);
  process.exitCode = 1;
});
