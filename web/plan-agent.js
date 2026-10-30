/* Proposed fleet actions on the planning board. Decisions stay with the manager. */
(function (global) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => new Intl.NumberFormat('en-US', {maximumFractionDigits:1}).format(Number(value) || 0);
  const money = value => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(Number(value) || 0);
  const clock = value => {
    if (!Number.isFinite(value)) return '';
    const hours = Math.floor(value / 60) % 24;
    return `${hours % 12 || 12}:${String(Math.floor(value % 60)).padStart(2,'0')} ${hours < 12 ? 'am' : 'pm'}`;
  };
  const fieldId = value => typeof value === 'string' ? value : value?.field_id || value?.id || '';

  class FieldworkPlanAgent {
    constructor(root, callbacks = {}) {
      this.root = root;
      this.callbacks = callbacks;
      this.data = {};
      this.openRigs = new Set();
      this.planKey = null;
      root.addEventListener('click', event => this.click(event));
      root.addEventListener('toggle', event => {
        const target = event.target;
        if (!target.matches?.('[data-plan-agent-rig]') || !root.contains(target)) return;
        if (target.open) this.openRigs.add(target.dataset.planAgentRig);
        else this.openRigs.delete(target.dataset.planAgentRig);
      }, true);
    }
    fieldName(value) {
      const id = fieldId(value);
      return this.data.meta?.fields?.find(field => field.id === id)?.name || id;
    }
    canApprove() {
      const d = this.data;
      return !!(d.plan && d.proposal && !d.busy && !d.dirty && !d.error && !d.underway && !d.approved);
    }
    render(data = {}) {
      this.data = data;
      const {plan, proposal} = data;
      const key = `${data.result?.run_id || ''}:${plan?.id || ''}`;
      if (key !== this.planKey) {this.openRigs.clear();this.planKey = key;}
      const complete = data.result?.remaining_field_count === 0;
      const ready = !!(plan && proposal && !data.dirty && !data.error);
      const approved = ready && !data.busy && data.approved;
      const status = data.busy ? 'Preparing options' : data.dirty ? 'Refresh needed' : data.error ? 'Needs attention' : approved ? 'Approved by you' : ready ? data.underway ? 'Work is underway' : 'Your approval needed' : complete ? 'All fields complete' : 'Ready to plan';
      const headline = plan ? escape(plan.name || 'Selected plan') : complete ? 'No remaining fields to schedule.' : data.result ? 'No feasible work in these conditions.' : 'Build a plan for today’s fieldwork.';
      const description = data.busy ? 'Reading the current inputs and preparing a proposal. Your approved queues stay in place.' : data.dirty ? 'Inputs or job progress changed. Replan before approving the next move.' : data.error ? 'The last request could not be completed. Review the message below and try again.' : approved ? 'This plan is on the fleet workboard. You can request changes whenever the day changes.' : ready ? 'Review each sprayer’s next move, ask for changes, then approve the plan together.' : complete ? 'Completed work stays in your job history. No new dispatch is needed.' : 'Review the conditions or feedback restrictions, then ask for another plan.';
      const actions = Array.isArray(proposal?.actions) ? proposal.actions : [];
      const progress = [
        {label:'Farm & jobs',done:!!data.meta},
        {label:data.offline ? 'Recorded plans' : 'Feasible plans',done:ready && !data.busy},
        {label:'Your approval',done:approved}
      ];
      this.root.innerHTML = `<section class="plan-agent" aria-labelledby="plan-agent-title" aria-busy="${!!data.busy}">
        <header class="plan-agent-heading"><div><span class="plan-agent-icon" aria-hidden="true">✦</span><div><h2 id="plan-agent-title">Planning agent</h2><p>${escape(description)}</p></div></div><span class="plan-agent-status ${approved ? 'is-approved' : ready && !data.busy && !data.dirty ? 'is-ready' : ''}" role="status">${escape(status)}</span></header>
        <ol class="plan-agent-progress" aria-label="Plan review progress">${progress.map((step,index) => `<li class="${step.done ? 'is-done' : ''}"><span aria-hidden="true">${step.done ? '✓' : index + 1}</span>${step.label}</li>`).join('')}</ol>
        ${data.error ? `<p class="plan-agent-warning" role="alert">${escape(data.error)}</p>` : ''}
        <div class="plan-agent-selection"><div><h3>${headline}</h3>${plan ? `<p>${number(plan.acres)} acres · ${money(plan.estimated_cost)} estimated · ${number(plan.labor_hours)} labor-hours</p>` : ''}</div><button type="button" class="plan-agent-text-button" data-plan-agent-action="compare" ${!data.result?.plans?.length || data.busy ? 'disabled' : ''}>Compare options</button></div>
        ${actions.length ? `<div class="plan-agent-rigs" aria-label="Proposed sprayer actions">${actions.map(action => this.rig(action, ready && !data.busy, approved)).join('')}</div>` : ''}
        ${proposal?.summary ? `<p class="plan-agent-summary">${escape(proposal.summary)}</p>` : ''}
        ${data.underway && !approved ? '<p class="plan-agent-warning">Complete or hold underway jobs before approving a replacement. You can still request a revised proposal.</p>' : ''}
        <footer class="plan-agent-footer"><p>${data.offline ? 'Recorded scenario replay. Custom field or sprayer changes need the local solver.' : 'OR-Tools prepares the schedule. Your approval updates the local fleet workboard.'}<br>No messages or equipment commands are sent.</p><div class="plan-agent-buttons"><button type="button" class="plan-agent-text-button" data-plan-agent-action="replan" ${data.busy ? 'disabled' : ''}>${data.busy ? 'Preparing…' : data.offline ? 'Reload scenario' : 'Replan'}</button><button type="button" class="secondary-button" data-plan-agent-action="feedback" ${data.busy ? 'disabled' : ''}>Request changes</button><button type="button" class="primary-button" data-plan-agent-action="approve" ${this.canApprove() ? '' : 'disabled'}>${approved ? 'Approved locally' : 'Review & approve'}</button></div></footer>
      </section>`;
    }
    rig(action, current, approved) {
      const jobs = Array.isArray(action.jobs) ? action.jobs : [];
      const next = fieldId(action.next_first);
      const first = next ? this.fieldName(next) : jobs.length ? 'Assigned jobs on hold' : 'No field assigned';
      const prior = fieldId(action.previous_first);
      const subtitle = !current ? 'Previous proposal' : approved ? 'Approved next field' : 'Proposed first field';
      return `<details class="plan-agent-rig" data-plan-agent-rig="${escape(action.rig_id)}" ${this.openRigs.has(action.rig_id) ? 'open' : ''}><summary><span class="plan-agent-rig-name">${escape(action.rig_name || action.rig_id)}<span aria-hidden="true">⌄</span></span><small>${subtitle}</small><strong>${escape(first)}</strong></summary><div class="plan-agent-route">${action.crew_name ? `<p>${escape(action.crew_name)}</p>` : ''}${prior && prior !== next ? `<p>Previously first: ${escape(this.fieldName(prior))}</p>` : ''}${jobs.length ? `<ol aria-label="${escape(action.rig_name || action.rig_id)} field order">${jobs.map(job => `<li><strong>${escape(this.fieldName(job))}</strong><span>${escape(clock(job.start))}${job.on_hold ? ' · On hold' : ''}</span></li>`).join('')}</ol>` : '<p>No work assigned in this plan.</p>'}</div></details>`;
    }
    click(event) {
      const button = event.target.closest('[data-plan-agent-action]');
      if (!button || !this.root.contains(button) || button.disabled) return;
      const action = button.dataset.planAgentAction;
      if (this.data.busy || (action === 'approve' && !this.canApprove())) return;
      if (action === 'compare' && !this.data.result?.plans?.length) return;
      const callback = {replan:'onReplan',feedback:'onFeedback',approve:'onApprove',compare:'onCompare'}[action];
      if (callback) this.callbacks[callback]?.();
    }
  }
  global.FieldworkPlanAgent = FieldworkPlanAgent;
  if (typeof module !== 'undefined' && module.exports) module.exports = FieldworkPlanAgent;
})(typeof window !== 'undefined' ? window : globalThis);
