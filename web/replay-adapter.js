/* Offline replay adapter. It never runs a solver or sends a network request. */
(function () {
  'use strict';
  const fixtures = window.FIELDWORK_FIXTURES;
  if (!fixtures?.metadata || !fixtures?.scenarios) throw new Error('Offline replay data is missing. Rebuild Fieldwork.html.');
  const clone = value => JSON.parse(JSON.stringify(value));
  const session = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const priorities = new Set(['balanced', 'acres', 'cost', 'buffer']);
  let sequence = 0, latest = null, createdAt = 0, approval = null;

  function rank(plans, priority) {
    if (priority === 'balanced') {
      const maxAcres = Math.max(1, ...plans.map(p => p.acres));
      const maxBuffer = Math.max(1, ...plans.map(p => p.min_rain_buffer_minutes));
      const minCost = Math.min(...plans.map(p => p.estimated_cost));
      const score = p => 0.5 * p.acres / maxAcres + 0.25 * minCost / p.estimated_cost + 0.25 * p.min_rain_buffer_minutes / maxBuffer;
      plans.sort((a, b) => score(b) - score(a));
    } else {
      const key = {acres:'acres', cost:'estimated_cost', buffer:'min_rain_buffer_minutes'}[priority];
      plans.sort((a, b) => priority === 'cost' ? a[key] - b[key] : b[key] - a[key]);
    }
    plans.forEach((plan, index) => {plan.rank = index + 1;});
  }

  function replan(body) {
    const scenario = body.scenario || 'baseline', priority = body.priority || 'balanced';
    if (!Object.hasOwn(fixtures.scenarios, scenario) || !priorities.has(priority)) throw new Error('Choose one of the five recorded scenarios and a supported ranking.');
    if (body.update && String(body.update).trim()) throw new Error('The offline edition replays scenario presets only. Custom updates need the local solver edition.');
    const result = clone(fixtures.scenarios[scenario]);
    result.run_id = `replay-${session}-${++sequence}`;
    result.priority = priority;
    result.replay = true;
    result.recorded_solve_seconds = result.solve_seconds;
    result.recorded_at = fixtures.captured_at;
    result.recorded_solver_source_sha256 = fixtures.solver_source_sha256;
    result.approval_ttl_seconds = 300;
    rank(result.plans, priority);
    result.plans.forEach((plan, index) => {plan.id = `${result.run_id}-plan-${index + 1}`;});
    result.ranking_explanation = priority === 'balanced'
      ? 'Recorded alternatives, ranked with 50% relative acreage, 25% relative cost and 25% relative rain buffer.'
      : {acres:'Recorded alternatives ranked by total acreage, highest first.', cost:'Recorded alternatives ranked by estimated cost, lowest first.', buffer:'Recorded alternatives ranked by minimum rain buffer, largest first.'}[priority];
    result.warnings = ['Offline replay: these plans were generated and validated in advance. No new optimization or live data retrieval happens in this edition.', ...(result.warnings || [])];
    latest = clone(result);
    createdAt = performance.now();
    approval = null;
    return result;
  }

  function approve(body) {
    if (!latest || latest.run_id !== body.run_id) throw new Error('This replay run is stale. Choose the scenario again before approving.');
    if (performance.now() - createdAt > 300000) throw new Error('This replay run has expired. Choose the scenario again before approving.');
    const plan = latest.plans.find(item => item.id === body.plan_id);
    if (!plan) throw new Error('That plan does not belong to this replay run.');
    if (approval) {
      if (approval.plan_id !== body.plan_id) throw new Error('Another plan is already approved in this replay. Choose the scenario again to change it.');
      return clone(approval);
    }
    approval = {
      run_id: latest.run_id, plan_id: plan.id, local_only: true, dispatched: false,
      status: 'approved_locally', plan: clone(plan), synthetic: true, replay: true,
      message: 'Approved in this offline replay only. No messages, live updates or equipment tasks were sent.',
    };
    return clone(approval);
  }

  window.FIELDWORK_REPLAY = {
    version: 1,
    async request(path, body = {}) {
      if (path === '/api/demo') {
        const metadata = clone(fixtures.metadata);
        metadata.replay = true;
        metadata.assumptions.unshift('Offline replay edition: prerecorded, validated solver results. No Python, local server, internet connection, fresh solving or installed farm hardware is needed to view this file.');
        return metadata;
      }
      if (path === '/api/replan') return replan(body);
      if (path === '/api/approve') return approve(body);
      if (path === '/api/parse') return {
        parser: 'offline-replay', updates: [], requires_confirmation: false,
        warnings: ['Custom text updates are not supported in the offline replay. Choose a recorded scenario or use the local solver edition.'],
      };
      throw new Error('This action is not available in the offline replay edition.');
    },
  };

  function labelReplay() {
    document.title = 'Fieldwork · Offline 3D replay';
    const pill = document.querySelector('.demo-pill');
    if (pill) {pill.replaceChildren(document.createElement('span'), document.createTextNode('Offline replay'));}
    const note = document.querySelector('#runtime-note');
    if (note) note.textContent = 'Offline edition: prerecorded OR-Tools plans. No live data or fresh solving.';
    const custom = document.querySelector('.message-input');
    if (custom) custom.hidden = true;
    const download = document.querySelector('#hardware-note a[download]');
    if (download) download.hidden = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', labelReplay, {once:true});
  else labelReplay();
})();
