/* Fleet workboard: approved job queues and manually reported progress, never telemetry. */
(function () {
  'use strict';
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const count = value => new Intl.NumberFormat('en-US', {maximumFractionDigits:1}).format(Number(value) || 0);
  const time = minutes => {
    if (!Number.isFinite(Number(minutes))) return '—';
    const h = Math.floor(minutes / 60) % 24, m = Math.floor(minutes % 60);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  };
  const stamped = value => {
    if (!value || !Number.isFinite(new Date(value).getTime())) return 'Time not recorded';
    return new Date(value).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
  };
  const color = value => /^#[a-f\d]{6}$/i.test(String(value)) ? value : '#287b57';
  const labels = {queued:'Queued', in_progress:'In progress', held:'On hold', done:'Done'};
  const sprayer = '<svg viewBox="0 0 70 38" fill="none" aria-hidden="true"><path d="M19 28V8h22v20M41 16h9l9 12H41M2 16h17M4 13v10M58 16h10M66 13v10" stroke="currentColor" stroke-width="2"/><circle cx="26" cy="29" r="7" fill="currentColor"/><circle cx="51" cy="30" r="6" fill="currentColor"/><path d="M24 12h12v9H24z" fill="currentColor" opacity=".25"/></svg>';

  class FieldworkFleetDashboard {
    constructor(root, callbacks = {}) {
      this.root = root;
      this.callbacks = callbacks;
      this.tab = 'all';
      this.data = null;
      this.lastError = '';
      this.root.addEventListener('click', event => this.click(event));
      this.root.addEventListener('keydown', event => this.keydown(event));
    }
    jobs(rigId) {
      return (this.plan?.schedule || []).filter(j => !rigId || j.rig_id === rigId)
        .slice().sort((a,b) => a.start - b.start || String(a.field_id).localeCompare(String(b.field_id)));
    }
    status(job) {
      const record = this.records[job.field_id];
      return record && (record.status === 'done' || this.active) ? record.status : 'queued';
    }
    field(id) { return this.data.meta.fields.find(f => f.id === id) || {id, name:id}; }
    tabButton(id, label, rig) {
      const jobs = id === 'all' ? this.jobs() : this.jobs(id);
      const remaining = jobs.filter(j => this.status(j) !== 'done').length;
      return `<button type="button" id="fleet-tab-${html(id)}" role="tab" aria-controls="fleet-tab-panel" aria-selected="${this.tab === id}" tabindex="${this.tab === id ? 0 : -1}" data-fleet-tab="${html(id)}" class="fleet-tab ${this.tab === id ? 'is-selected' : ''}" ${rig ? `style="--rig-color:${color(rig.color)}"` : ''}>${rig ? '<i aria-hidden="true"></i>' : ''}<span>${html(label)}</span><small aria-label="${remaining} fields remaining">${remaining}</small></button>`;
    }
    render(data) {
      this.data = data;
      this.active = data.snapshot?.active || null;
      this.plan = this.active?.plan || data.draftPlan || null;
      this.records = data.snapshot?.records || {};
      const rigs = data.meta?.rigs || [];
      if (!data.meta) { this.root.innerHTML = '<p class="fleet-empty">Loading the fleet…</p>'; return; }
      if (this.tab !== 'all' && !rigs.some(r => r.id === this.tab)) this.tab = 'all';
      const allJobs = this.jobs();
      const records = Object.values(this.records);
      const done = records.filter(r => r.status === 'done');
      const activeJobs = allJobs.filter(j => this.status(j) === 'in_progress');
      const queued = allJobs.filter(j => this.status(j) === 'queued');
      const held = allJobs.filter(j => this.status(j) === 'held');
      const total = data.meta.fields.length;
      const doneIds = new Set(done.map(r => r.field_id));
      const scheduled = new Set(allJobs.filter(j => !doneIds.has(j.field_id)).map(j => j.field_id));
      const unassigned = data.meta.fields.filter(f => !doneIds.has(f.id) && !scheduled.has(f.id)).length;
      const percent = total ? Math.min(100, Math.round(done.length / total * 100)) : 0;
      const changed = this.active && data.draftPlan && (this.active.run_id !== data.result?.run_id || this.active.plan.id !== data.draftPlan.id);
      const blockApproval = data.busy || data.dirty || !data.draftPlan || records.some(r => r.status === 'in_progress');
      const saveWarning = data.persistenceWarning ? `<div class="fleet-warning" role="alert">${html(data.persistenceWarning)}</div>` : '';
      const error = this.lastError ? `<div class="fleet-warning" role="alert">${html(this.lastError)}</div>` : '';
      let approval = '';
      if (!this.active) approval = `<div class="fleet-plan-notice"><div><strong>${this.plan ? 'Preview the queues, then approve the plan.' : 'Build a plan to assign the fleet.'}</strong><p>${this.plan ? `Job tracking opens after your approval. ${rigs.length === 1 ? 'The sprayer queue follows' : `The ${rigs.length} queues follow`} the selected solver plan.` : 'Choose conditions on the planning board. Every sprayer will get its own ordered field queue.'}</p></div><button class="primary-button" data-fleet-action="${this.plan ? 'approve' : 'board'}" ${this.plan && blockApproval ? 'disabled' : ''}>${this.plan ? 'Review & approve' : 'Open planning board'}</button></div>`;
      else if (changed || data.dirty) approval = `<div class="fleet-plan-notice fleet-plan-notice--active"><div><strong>Your approved queues are still active.</strong><p>${data.dirty ? 'Inputs changed. Replan and review the replacement before updating this workboard.' : 'The planning board has a different draft. Review it before replacing these queues.'}${records.some(r => r.status === 'in_progress') ? ' Complete or hold in-progress jobs before replacing the plan.' : ''}</p></div><button class="secondary-button" data-fleet-action="${data.dirty ? 'board' : 'approve'}" ${!data.dirty && blockApproval ? 'disabled' : ''}>${data.dirty ? 'Open planning board' : 'Review replacement'}</button></div>`;
      this.root.innerHTML = `<div class="fleet-workboard">
        ${saveWarning}${error}
        <div class="fleet-workboard-header"><div><span class="fleet-plan-label">${this.active ? 'Approved workboard' : 'Selected plan preview'}</span><h3>${html(this.plan?.name || `Your ${rigs.length}-sprayer fleet`)}</h3><p>${this.active ? `Approved ${html(stamped(this.active.approved_at))}` : 'No job has been dispatched.'} <span>•</span> ${html(data.meta.date)} simulated workday</p></div><button class="secondary-button" data-fleet-action="export" ${!this.plan || data.busy ? 'disabled' : ''}>Export ${this.tab === 'all' ? 'fleet' : html(rigs.find(r => r.id === this.tab)?.name || 'rig')} jobs ↓</button></div>
        <div class="fleet-report-row"><span>Something changed in the field?</span><button type="button" class="secondary-button" data-fleet-action="report" ${data.busy ? 'disabled' : ''}>Report an issue${this.tab !== 'all' ? ' · ' + html(rigs.find(r => r.id === this.tab)?.name || this.tab) : ''}</button></div><div class="fleet-progress-strip" aria-label="Fleet job progress"><div class="fleet-completion"><div><strong>${done.length}<span> / ${total}</span></strong><span>fields done today</span></div><div class="fleet-progress-track" role="progressbar" aria-label="Fields completed today" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done.length}"><span style="width:${percent}%"></span></div><small>${count(done.reduce((n,j) => n + Number(j.acres || 0), 0))} acres reported complete</small></div><div><strong>${activeJobs.length}</strong><span>in progress</span></div><div><strong>${queued.length}</strong><span>${this.active ? 'queued' : 'in draft queues'}</span></div><div><strong>${held.length}</strong><span>on hold</span></div><div><strong>${unassigned}</strong><span>not assigned</span></div></div>
        ${approval}
        <div class="fleet-tabs" role="tablist" aria-label="Sprayer queues">${this.tabButton('all', 'All sprayers')}${rigs.map(r => this.tabButton(r.id, r.name, r)).join('')}</div>
        <div id="fleet-tab-panel" class="fleet-tab-panel" role="tabpanel" aria-labelledby="fleet-tab-${html(this.tab)}" tabindex="0">${this.tab === 'all' ? this.overview(rigs) : this.rigPanel(rigs.find(r => r.id === this.tab))}</div>
        ${this.history(done, rigs)}
        <p class="fleet-tracking-note"><strong>Manually reported demo progress.</strong> ${data.persistenceWarning ? 'Browser storage is unavailable; progress may not survive reload.' : 'Saved in this browser for this simulated day; not shared with other devices.'} Playing or scrubbing the 3D preview never marks a field done. Planned times use the demo clock.</p>
      </div>`;
    }
    overview(rigs) {
      return `<div class="fleet-queue-grid">${rigs.map(rig => {
        const jobs = this.jobs(rig.id);
        const done = Object.values(this.records).filter(r => r.status === 'done' && r.rig_id === rig.id).length;
        const remaining = jobs.filter(j => this.status(j) !== 'done');
        const totalToday = done + remaining.length;
        const ongoing = jobs.find(j => this.status(j) === 'in_progress');
        const next = ongoing || jobs.find(j => this.status(j) === 'queued');
        const preview = remaining.slice(0,3);
        const available = (this.active?.conditions || this.data.result?.conditions)?.rig_available_from?.[rig.id];
        return `<article class="fleet-queue-card" style="--rig-color:${color(rig.color)}"><header><div class="fleet-rig-identity"><span class="fleet-rig-drawing">${sprayer}</span><div><h3>${html(rig.name)}</h3><p>${html(rig.crew_name)}</p></div></div><span class="fleet-rig-count">${done}<small> / ${totalToday} done today</small></span></header><div class="fleet-rig-progress" aria-hidden="true"><span style="width:${totalToday ? done / totalToday * 100 : 0}%"></span></div><div class="fleet-next-job"><span>${ongoing ? 'Working now' : next ? 'First field to work' : remaining.length ? 'Waiting on held jobs' : jobs.length ? 'Queue completed' : 'No field assigned'}</span><strong>${next ? html(this.field(next.field_id).name) : remaining.length ? 'Review the hold' : jobs.length ? 'All set for this plan' : 'Available for another plan'}</strong><p>${next ? `${count(next.acres)} acres · planned ${time(next.start)}` : available > (this.data.meta.now || 480) ? `Available from ${time(available)}` : 'Review conditions before assigning more work.'}</p></div><ol class="fleet-queue-preview">${preview.map(j => `<li><span class="fleet-sequence">${jobs.indexOf(j)+1}</span><span>${html(j.field_id)}${this.field(j.field_id).priority ? '<small class="fleet-priority-mark">Priority</small>' : ''}</span><span class="fleet-job-state is-${html(this.status(j))}">${html(labels[this.status(j)] || 'Queued')}</span></li>`).join('') || '<li class="fleet-queue-clear">No remaining fields in this queue.</li>'}</ol><footer><span>${count(jobs.reduce((n,j) => n + Number(j.acres || 0), 0))} acres assigned${remaining.length > 3 ? ` · +${remaining.length - 3} more` : ''}</span><button type="button" class="fleet-open-button" data-fleet-open="${html(rig.id)}">Open ${html(rig.name)} queue <span aria-hidden="true">→</span></button></footer></article>`;
      }).join('')}</div><p class="fleet-order-note">Field order comes from the solver’s route sequence. Priority fields are flagged; timing, travel and application rules also determine which field comes first.</p>`;
    }
    rigPanel(rig) {
      if (!rig) return '';
      const jobs = this.jobs(rig.id);
      const done = Object.values(this.records).filter(r => r.status === 'done' && r.rig_id === rig.id).length;
      const totalToday = done + jobs.filter(j => this.status(j) !== 'done').length;
      const ongoing = jobs.find(j => this.status(j) === 'in_progress');
      const first = jobs.find(j => this.status(j) === 'queued');
      const available = (this.active?.conditions || this.data.result?.conditions)?.rig_available_from?.[rig.id];
      const next = ongoing || first;
      const locked = !this.active || this.data.busy;
      return `<div class="fleet-rig-panel" style="--rig-color:${color(rig.color)}"><div class="fleet-rig-summary"><div class="fleet-rig-summary-title"><span class="fleet-rig-drawing">${sprayer}</span><div><h3>${html(rig.name)} field queue</h3><p>${html(rig.crew_name)} · ${count(rig.acres_per_hour)} acres/hour assumed capacity${available > (this.data.meta.now || 480) ? ` · available from ${time(available)}` : ''}</p></div></div><div class="fleet-rig-summary-progress"><strong>${done} / ${totalToday}</strong><span>fields done today</span></div></div>${next ? `<div class="fleet-next-callout"><i aria-hidden="true"></i><div><strong>${ongoing ? 'Working now' : 'Work this field first'}: ${html(this.field(next.field_id).name)}</strong><p>${count(next.acres)} acres · planned ${time(next.start)}–${time(next.end)} · ${this.field(next.field_id).priority ? 'Priority field' : 'Next in the solver route'}</p></div>${this.active ? this.actions(next, ongoing, first, locked) : '<span class="fleet-draft-tag">Awaiting approval</span>'}</div>` : ''}
        ${jobs.length ? `<div class="fleet-job-table-scroll"><table class="fleet-job-table"><caption class="sr-only">${html(rig.name)} jobs in solver route order</caption><thead><tr><th scope="col">Order</th><th scope="col">Field & priority</th><th scope="col">Planned work</th><th scope="col">Acres</th><th scope="col">Job status</th><th scope="col">Update job</th></tr></thead><tbody>${jobs.map((job,i) => {
          const f = this.field(job.field_id), status = this.status(job), record = this.records[job.field_id];
          return `<tr class="fleet-job-row is-${html(status)}" data-fleet-job-row="${html(job.field_id)}"><td class="fleet-cell-order"><span class="fleet-sequence" aria-label="Stop ${i+1}">${i+1}</span></td><th scope="row" class="fleet-cell-field"><button class="fleet-field-link" data-fleet-inspect="${html(job.field_id)}">${html(f.name)}</button>${f.priority ? '<span class="fleet-priority-mark">Priority</span>' : ''}<small>Window ${time(f.window_start)}–${time(f.window_end)}</small></th><td class="fleet-cell-time" data-label="Planned work">${time(job.start)}–${time(job.end)}<small>${count(job.travel_minutes)} min travel before field</small></td><td class="fleet-cell-acres" data-label="Acres">${count(job.acres)}</td><td class="fleet-cell-status" data-label="Status"><span class="fleet-job-state is-${html(status)}">${html(labels[status] || 'Queued')}</span>${status === 'done' ? `<small>${html(stamped(record?.completed_at))}${record?.rig_id !== job.rig_id ? ` · by ${html(this.data.meta.rigs.find(r => r.id === record.rig_id)?.name || record.rig_id)}` : ''}</small>` : ''}</td><td class="fleet-cell-actions">${this.actions(job, ongoing, first, locked)}</td></tr>`;
        }).join('')}</tbody></table></div>` : `<div class="fleet-empty"><h4>No fields assigned to ${html(rig.name)}.</h4><p>${available > (this.data.meta.now || 480) ? `This rig is unavailable until ${time(available)}. ` : ''}The current plan has no feasible route for this rig. Review the planning board for other options.</p><button class="secondary-button" data-fleet-action="board">Open planning board</button></div>`}
        <p class="fleet-order-note">Start the first queued field, then mark it done to advance. Hold a job when it cannot proceed; held jobs stay visible. Order and planned times are from the selected solver route, not live navigation.</p></div>`;
    }
    actions(job, ongoing, first, locked) {
      const status = this.status(job);
      const button = (label, next, disabled = false, primary = false) => `<button type="button" class="fleet-job-action ${primary ? 'is-primary' : ''}" data-fleet-field="${html(job.field_id)}" data-fleet-status="${next}" ${locked || disabled ? 'disabled' : ''}>${label}</button>`;
      if (!this.active) return '<span class="fleet-draft-tag">Draft</span>';
      if (status === 'done') return button('Reopen', 'queued');
      if (status === 'in_progress') return `<span class="fleet-row-actions">${button('Mark done', 'done', false, true)}${button('Hold', 'held')}</span>`;
      if (status === 'held') return button('Resume queue', 'queued');
      return `<span class="fleet-row-actions">${button('Start job', 'in_progress', !!ongoing || first?.field_id !== job.field_id, true)}${button('Hold', 'held')}</span>`;
    }
    history(done, rigs) {
      const shown = done.filter(r => this.tab === 'all' || r.rig_id === this.tab).sort((a,b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
      return `<details class="fleet-history" ${shown.length ? 'open' : ''}><summary><span>Completed jobs${this.tab !== 'all' ? ` · ${html(rigs.find(r => r.id === this.tab)?.name || this.tab)}` : ''}</span><strong>${shown.length} fields</strong></summary>${shown.length ? `<div class="fleet-history-list">${shown.map(r => `<div><span class="fleet-history-check" aria-hidden="true">✓</span><strong>${html(this.field(r.field_id).name)}</strong><span>${html(rigs.find(x => x.id === r.rig_id)?.name || r.rig_id)} · ${count(r.acres)} acres</span><time>${html(stamped(r.completed_at))}</time></div>`).join('')}</div>` : '<p>No fields reported complete yet. Completed jobs stay in this day’s log when you change plans.</p>'}</details>`;
    }
    selectTab(tab, focus = true) {
      this.tab = tab;
      this.render(this.data);
      if (focus) this.root.querySelector(`#fleet-tab-${CSS.escape(tab)}`)?.focus();
    }
    invoke(name, ...args) {
      this.lastError = '';
      try {
        const value = this.callbacks[name]?.(...args);
        if (value && typeof value.catch === 'function') value.catch(error => { this.lastError = error.message || String(error); this.render(this.data); });
      } catch (error) { this.lastError = error.message || String(error); this.render(this.data); }
    }
    click(event) {
      const button = event.target.closest('button');
      if (!button || !this.root.contains(button) || button.disabled) return;
      if (button.dataset.fleetTab) this.selectTab(button.dataset.fleetTab);
      else if (button.dataset.fleetOpen) this.selectTab(button.dataset.fleetOpen);
      else if (button.dataset.fleetInspect) this.invoke('onInspect', button.dataset.fleetInspect);
      else if (button.dataset.fleetStatus) this.invoke('onTransition', button.dataset.fleetField, button.dataset.fleetStatus);
      else if (button.dataset.fleetAction === 'approve') this.invoke('onApprove');
      else if (button.dataset.fleetAction === 'board') this.invoke('onReturnBoard');
      else if (button.dataset.fleetAction === 'report') this.invoke('onReport', this.tab === 'all' ? null : this.tab);
      else if (button.dataset.fleetAction === 'export') this.invoke('onExport', this.tab === 'all' ? null : this.tab);
    }
    keydown(event) {
      const tab = event.target.closest('[data-fleet-tab]');
      if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const ids = ['all', ...(this.data?.meta.rigs || []).map(r => r.id)];
      const index = ids.indexOf(tab.dataset.fleetTab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
      event.preventDefault();
      this.selectTab(ids[next]);
    }
  }
  window.FieldworkFleetDashboard = FieldworkFleetDashboard;
})();
