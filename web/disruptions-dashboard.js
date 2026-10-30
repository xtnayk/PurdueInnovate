/* Fleet-reported incidents. Viewing and suggestions never dispatch equipment. */
(function (global) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => new Intl.NumberFormat('en-US', {maximumFractionDigits:1}).format(Number(value) || 0);
  const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value) || 0);
  const fieldId = value => typeof value === 'string' ? value : value?.field_id || value?.id || '';
  const statuses = {new:'Needs review',reviewing:'In review',response_approved:'Response approved',resolved:'Resolved'};
  const typeNames = {breakdown:'Equipment',wet:'Field access',storm:'Weather',wind:'Wind'};
  const icons = {
    storm:'<path d="M6 15a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 1 9H6Zm1 3-1 3m6-3-1 3m6-3-1 3"/>',
    breakdown:'<path d="M5 16V5h10v11m0-6h4l3 6M1 12h4m15 0h3M5 19h-2m5 0h7m4 0h3"/><circle cx="7" cy="18" r="3"/><circle cx="17" cy="18" r="3"/>',
    wet:'<path d="M12 2c-2 4-6 8-6 12a6 6 0 0 0 12 0c0-4-4-8-6-12Zm-2 17c-2-1-2-3-2-4M2 23h20"/>',
    wind:'<path d="M2 7h13a3 3 0 1 0-3-3M2 12h18a3 3 0 1 0-3-3M2 17h11a3 3 0 1 1-3 3"/>'
  };
  const icon = type => `<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[type] || icons.breakdown}</svg>`;
  const stamp = value => {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : 'Time not recorded';
  };
  class FieldworkDisruptionsDashboard {
    constructor(root, callbacks = {}) {
      this.root=root;this.callbacks=callbacks;this.data={};this.lastError='';this.filter='open';
      root.addEventListener('click',event=>this.click(event));
    }
    fieldName(value) {
      const id=fieldId(value);
      return this.data.meta?.fields?.find(field=>field.id===id)?.name || id || 'No field assigned';
    }
    status(incident) {return this.data.incidentStatus?.[incident.status] || statuses[incident.status] || 'Needs review';}
    render(data={}) {
      this.data=data;
      const warning=data.persistenceWarning||data.incidentPersistenceWarning;
      this.root.innerHTML=`<div class="disruption-workspace">${warning?`<p class="disruption-error" role="status">${escape(warning)}</p>`:''}${data.selectedIncident?this.detail(data.selectedIncident):this.feed()}</div>`;
    }
    feed() {
      const incidents=Array.isArray(this.data.incidents)?this.data.incidents:[];
      const open=incidents.filter(item=>item.status!=='resolved');
      const visible=incidents.filter(item=>this.filter==='all'||(this.filter==='resolved'?item.status==='resolved':item.status!=='resolved'));
      return `<div class="incident-feed-heading"><div><h2>Reports from the field</h2><p>See what changed. Open a report for the agent’s suggested response.</p></div><button type="button" class="secondary-button" data-disruption-action="report" ${this.data.busy?'disabled':''}>Report an issue</button></div>
        <div class="incident-connection"><span class="incident-connection-dot" aria-hidden="true"></span><strong>Demo reports</strong><span>No live fleet connection</span></div>
        <div class="incident-feed-toolbar"><div class="incident-filters" role="group" aria-label="Filter disruption reports">${[['open',`Open (${open.length})`],['all',`All (${incidents.length})`],['resolved','Resolved']].map(([value,label])=>`<button type="button" data-incident-filter="${value}" aria-pressed="${this.filter===value}" class="${this.filter===value?'is-selected':''}">${label}</button>`).join('')}</div><span>${open.length?`${open.length} open ${open.length===1?'report':'reports'}`:'No open reports'}</span></div>
        ${this.data.error||this.lastError?`<p class="disruption-error" role="alert">${escape(this.data.error||this.lastError)}</p>`:''}
        <div class="incident-list" aria-label="Disruption reports">${visible.length?visible.map(item=>this.row(item)).join(''):`<div class="incident-empty"><span aria-hidden="true">✓</span><h3>${this.filter==='resolved'?'No resolved reports yet.':'No reports to review.'}</h3><p>${this.filter==='resolved'?'Issues appear here after someone marks them resolved.':'Fleet issues will appear here when reported. You can enter an issue to try the workflow.'}</p></div>`}</div>
        <p class="disruption-footnote">Reports in this prototype are entered manually or supplied as demo examples. A live fleet feed is not connected. Opening a report prepares a suggestion; only your approval can update the fleet plan.</p>`;
    }
    row(item) {
      const resolved=item.status==='resolved';
      const meta=[item.source||'Fleet report',stamp(item.reported_at)];
      return `<button type="button" class="incident-row ${resolved?'is-resolved':''}" data-disruption-action="open" data-incident-id="${escape(item.id)}" ${this.data.busy?'disabled':''} aria-label="Open ${escape(item.title || typeNames[item.type] || 'disruption report')}"><span class="incident-type-icon is-${escape(Object.hasOwn(typeNames,item.type)?item.type:'breakdown')}">${icon(item.type)}</span><span class="incident-row-content"><span class="incident-row-top"><strong>${escape(item.title || typeNames[item.type] || 'Disruption report')}</strong><span class="incident-status is-${escape(Object.hasOwn(statuses,item.status)?item.status:'new')}">${escape(this.status(item))}</span></span><span class="incident-row-message">${escape(item.message || 'Open this report to review the details.')}</span><span class="incident-row-meta">${meta.map(escape).join(' · ')}${item.simulated?' · Simulated report':''}</span></span><span class="incident-row-arrow" aria-hidden="true">›</span></button>`;
    }
    detail(incident) {
      const data=this.data;
      const error=data.error||this.lastError;
      const ready=data.phase==='ready'&&!data.dirty&&!data.busy&&!error;
      const approved=data.phase==='approved'&&!data.dirty&&!error;
      const reviewing=data.busy||data.phase==='analyzing';
      const resolved=incident.status==='resolved';
      const recordedApproval=incident.status==='response_approved';
      const hasPlans=!!data.result?.plans?.length;
      const openReportCount=(data.incidents||[]).filter(item=>item.status!=='resolved').length;
      const underway=Object.values(data.activeSnapshot?.records||{}).some(record=>record.status==='in_progress');
      const canApprove=ready&&hasPlans&&data.selectedPlan&&data.proposal&&!underway&&!resolved;
      const stateLabel=reviewing?'Preparing suggestion':resolved?'Report resolved':error?'Needs attention':data.dirty?'Suggestion needs refresh':approved||recordedApproval&&!ready?'Response approved':ready?'Your decision needed':'Review this report';
      return `<div class="incident-detail-nav"><button type="button" class="incident-back" data-disruption-action="back">← All disruptions</button><span class="incident-status is-${escape(Object.hasOwn(statuses,incident.status)?incident.status:'new')}">${escape(this.status(incident))}</span></div>
        <article class="incident-report"><div class="incident-report-heading"><span class="incident-type-icon is-${escape(Object.hasOwn(typeNames,incident.type)?incident.type:'breakdown')}">${icon(incident.type)}</span><div><span class="incident-report-type">${escape(typeNames[incident.type]||'Fleet report')}</span><h2>${escape(incident.title||'Disruption report')}</h2></div></div><blockquote>${escape(incident.message||'No further details were included.')}</blockquote><div class="incident-report-meta"><span>Reported by <strong>${escape(incident.source||'Fleet crew')}</strong></span><time>${escape(stamp(incident.reported_at))}</time><span>${incident.simulated?'Simulated report':'Manually entered report'} · No live fleet connection</span></div></article>
        <section class="disruption-agent-panel" aria-labelledby="disruption-agent-title"><div class="disruption-agent-heading"><div><span class="disruption-agent-mark" aria-hidden="true">✦</span><div><h3 id="disruption-agent-title">Suggested response</h3><p>${data.offline?'Review a recorded response to this demo report.':'The agent checks the report against the fleet and remaining work.'}</p></div></div><span class="disruption-agent-state ${approved?'is-approved':ready?'is-waiting':''}" role="status">${escape(stateLabel)}</span></div>
        ${error?`<p class="disruption-error" role="alert">${escape(error)}</p>`:''}
        ${!data.offline&&!resolved&&openReportCount?`<p class="incident-context-note">This response accounts for ${openReportCount} open ${openReportCount===1?'report':'reports'}, including reports with an approved response that remain unresolved.</p>`:''}
        ${resolved?'<div class="incident-resolution-note"><strong>This issue was marked resolved.</strong><p>Its report remains in history. No new fleet action is needed here.</p></div>':reviewing?'<div class="incident-thinking" role="status"><span aria-hidden="true"></span><div><strong>Checking how to respond…</strong><p>The approved fleet queues stay in place while the agent prepares a suggestion.</p></div></div>':approved?this.approved():ready?this.response():recordedApproval&&!data.dirty&&!error?'<div class="incident-resolution-note"><strong>A response has been approved for this report.</strong><p>Approval updates the plan; it does not confirm that the equipment or field issue is fixed. Review the current fleet queues or mark the issue resolved when confirmed.</p><button type="button" class="secondary-button" data-disruption-action="fleet">View fleet queues</button></div>':`<div class="disruption-analyze-row"><p>${data.dirty?'Conditions or job progress changed. Refresh the suggestion before approving a response.':'Prepare a response to this report using the current fleet and remaining jobs.'}</p><button type="button" class="primary-button" data-disruption-action="analyze">${data.offline?'Load recorded suggestion':'Refresh suggestion'}</button></div>`}
        ${ready&&hasPlans&&!resolved?`<div class="disruption-approval-box"><div><strong>You decide what happens next.</strong><p>${underway?'Complete or hold underway jobs before replacing the fleet plan.':'Approve these coordinated fleet changes, or tell the agent what should change.'}</p></div><div class="disruption-approval-actions"><button type="button" class="secondary-button" data-disruption-action="feedback">Request changes</button><button type="button" class="primary-button" data-disruption-action="approve" ${canApprove?'':'disabled'}>Review & approve response</button></div></div>`:''}
        </section>
        <div class="incident-detail-footer"><p>${resolved?'Resolution was recorded manually.':'Approving a response does not mark the issue fixed. Record resolution after the crew confirms it.'}</p>${!resolved?`<button type="button" class="incident-resolve" data-disruption-action="resolve" data-incident-id="${escape(incident.id)}" ${data.busy?'disabled':''}>Mark issue resolved</button>`:''}</div>
        <p class="disruption-footnote">${data.offline?'Recorded OR-Tools results':'OR-Tools builds the response'} · Human approval required. No automatic messages or equipment commands are connected.</p>`;
    }
    response() {
      const data=this.data,plans=data.result?.plans||[],plan=data.selectedPlan;
      if(!plans.length||!plan)return `<div class="disruption-no-plan"><h3>${data.result?.remaining_field_count===0?'All remaining work is complete.':'No feasible fleet response found.'}</h3><p>${data.result?.remaining_field_count===0?'Completed jobs stay in the fleet history.':'Keep the current queues on hold as appropriate and review the reported conditions. The agent will not relax a hard rule to create a response.'}</p><button type="button" class="secondary-button" data-disruption-action="feedback">Review feedback</button><button type="button" class="secondary-button" data-disruption-action="analyze">Refresh suggestion</button></div>`;
      return `<div class="incident-recommendation"><div><span>${plan.id===plans[0]?.id?'Recommended response':'Selected response'}</span><h3>${escape(plan.name||'Revised fleet plan')}</h3><p>${escape(data.proposal?.summary||'Review the proposed route changes below.')}</p></div><dl><div><dt>Estimated cost</dt><dd>${money(plan.estimated_cost)}</dd></div><div><dt>Work scheduled</dt><dd>${number(plan.acres)} ac</dd></div><div><dt>Labor</dt><dd>${number(plan.labor_hours)} hr</dd></div></dl></div>
        ${this.proposal(data.proposal)}
        ${plans.length>1?`<details class="incident-alternatives"><summary>Compare ${plans.length-1} other ${plans.length===2?'response':'responses'}</summary><div class="disruption-options" role="group" aria-label="Alternative incident responses">${plans.map((item,index)=>`<button type="button" class="disruption-plan ${item.id===plan.id?'is-selected':''}" data-disruption-plan="${escape(item.id)}" aria-pressed="${item.id===plan.id}"><span class="disruption-plan-top"><strong>${escape(item.name)}</strong><span>${item.id===plan.id?'✓ Selected':index===0?'Recommended':`Option ${index+1}`}</span></span><span class="disruption-plan-cost">${money(item.estimated_cost)}<small>estimated cost</small></span><span class="disruption-plan-metrics"><span><strong>${number(item.acres)}</strong> acres</span><span><strong>${number(item.labor_hours)}</strong> labor-hours</span><span><strong>${number(item.min_rain_buffer_minutes)} min</strong> rain buffer</span></span></button>`).join('')}</div></details>`:''}
        <p class="disruption-estimate-note">Rain buffer is time beyond the required dry period, not a runoff prediction. Costs and conditions are modeled estimates.</p>`;
    }
    proposal(proposal) {
      if(!proposal)return '<p class="disruption-estimate-note">A suggested response is not available yet.</p>';
      const actions=(proposal.actions||[]).filter(action=>action.changed);
      return `<div class="disruption-proposal"><div class="disruption-proposal-heading"><h3>What to do next</h3><span class="disruption-pending">Pending approval</span></div><div class="disruption-actions-list">${actions.length?actions.map(action=>{
        const next=fieldId(action.next_first),previous=fieldId(action.previous_first),jobs=action.jobs||[];
        return `<details class="disruption-rig-action"><summary><span class="disruption-action-number" aria-hidden="true">↳</span><span><strong>${escape(action.rig_name||action.rig_id)}: ${next?`start with ${escape(this.fieldName(next))}`:jobs.length?'keep assigned jobs on hold':'hold for another plan'}</strong><small>${previous?`Previously first: ${escape(this.fieldName(previous))}`:'No previous first field'}${action.crew_name?` · ${escape(action.crew_name)}`:''}</small></span><span class="disruption-action-chevron" aria-hidden="true">⌄</span></summary><div class="disruption-action-detail"><p><strong>Proposed field order · existing holds stay in place</strong><span>${jobs.length?jobs.map(job=>escape(this.fieldName(job))+(job.on_hold?' (on hold)':'')).join(' → '):'No feasible work assigned.'}</span></p>${action.removed_fields?.length?`<p><strong>Removed from this rig</strong><span>${action.removed_fields.map(id=>escape(this.fieldName(id))).join(', ')}</span></p>`:''}</div></details>`;
      }).join(''):'<p class="disruption-no-changes">The current queues already match this response. Review the reported conditions before approving.</p>'}</div></div>`;
    }
    approved() {
      return `<div class="disruption-approved" role="status"><span aria-hidden="true">✓</span><div><h3>Response approved.</h3><p>The selected changes are now on the fleet workboard. Completed jobs remain in the log.</p><p class="disruption-approved-note">The issue stays open until the crew confirms it is resolved. No messages or equipment commands were sent.</p></div><button type="button" class="secondary-button" data-disruption-action="fleet">View fleet queues</button></div>`;
    }
    click(event) {
      const button=event.target.closest('button');
      if(!button||!this.root.contains(button)||button.disabled)return;
      if(button.dataset.incidentFilter){this.filter=button.dataset.incidentFilter;this.render(this.data);return;}
      let callback,args=[];
      if(button.dataset.disruptionPlan){callback='onChoosePlan';args=[button.dataset.disruptionPlan];}
      else {
        const action=button.dataset.disruptionAction;
        callback={open:'onOpenIncident',back:'onBackToFeed',report:'onReportIncident',analyze:'onAnalyze',approve:'onReviewApproval',feedback:'onRequestFeedback',fleet:'onInspectFleet',resolve:'onResolveIncident'}[action];
        if(action==='open'||action==='resolve')args=[button.dataset.incidentId];
      }
      if(!callback)return;
      this.lastError='';
      try {const result=this.callbacks[callback]?.(...args);if(result?.catch)result.catch(error=>{this.lastError=error.message||String(error);this.render(this.data);});}
      catch(error){this.lastError=error.message||String(error);this.render(this.data);}
    }
  }
  global.FieldworkDisruptionsDashboard=FieldworkDisruptionsDashboard;
  if(typeof module!=='undefined'&&module.exports)module.exports=FieldworkDisruptionsDashboard;
})(typeof window!=='undefined'?window:globalThis);
