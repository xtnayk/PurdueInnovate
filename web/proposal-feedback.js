/* Reviewed feedback is a draft input; this module never approves or dispatches work. */
(function (global) {
  'use strict';

  const emptyConstraints = () => ({excluded_fields: [], priority_fields: [], unavailable_rigs: []});
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const priorities = {
    'lower cost':'cost', 'reduce cost':'cost', 'minimize cost':'cost', 'prioritize cost':'cost',
    'more acres':'acres', 'maximize acreage':'acres', 'prioritize acreage':'acres', 'protect acreage':'acres',
    'more rain buffer':'buffer', 'increase rain buffer':'buffer', 'prioritize rain buffer':'buffer',
    'balanced':'balanced', 'balanced priorities':'balanced'
  };
  const priorityLabels = {cost:'lower estimated cost', acres:'more protected acres', buffer:'more rain buffer', balanced:'balanced priorities'};
  const hasConstraints = value => value && ['excluded_fields', 'priority_fields', 'unavailable_rigs'].some(key => Array.isArray(value[key]) && value[key].length);

  function resolve(value, collection, type) {
    const key = normalize(value);
    const items = Array.isArray(collection) ? collection : [];
    const exactIds = items.filter(item => item && normalize(item.id) === key);
    if (exactIds.length) return exactIds.length === 1 ? exactIds[0] : null;
    const matches = items.filter(item => {
      if (!item || !item.id) return false;
      if (normalize(item.id) === key || (item.name && normalize(item.name) === key)) return true;
      const number = String(item.id).match(type === 'field' ? /^F0*(\d+)$/i : /^R0*(\d+)$/i);
      if (!number) return false;
      const alias = key.match(type === 'field' ? /^(?:field\s*|f)0*(\d+)$/ : /^(?:rig\s*|r)0*(\d+)$/);
      return alias && Number(alias[1]) === Number(number[1]);
    });
    // An ambiguous custom name must be resolved with an ID, never the first match.
    return matches.length === 1 ? matches[0] : null;
  }

  function parse(text, meta) {
    const sourceText = typeof text === 'string' ? text.trim() : '';
    const reject = message => ({supported:false, summary:'Your feedback is saved as a note. No planning changes have been made.', warnings:[message], constraints:emptyConstraints(), sourceText});
    if (typeof text !== 'string' || !sourceText) return reject('Describe one change, or use the field and sprayer helper below.');
    if (text.length > 1000) return reject('Keep feedback to 1,000 characters or fewer.');
    const lines = sourceText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > 8) return reject('Use up to eight instructions, with one change on each line.');
    const constraints = emptyConstraints();
    let priority;
    const add = (key, id) => { if (!constraints[key].includes(id)) constraints[key].push(id); };
    for (const line of lines) {
      const instruction = normalize(line).replace(/^please /, '').replace(/\.$/, '');
      if (Object.prototype.hasOwnProperty.call(priorities, instruction)) {
        const next = priorities[instruction];
        if (priority && priority !== next) return reject('Choose one ranking preference: lower cost, more acres, more rain buffer, or balanced.');
        priority = next;
        continue;
      }
      const fieldMatch = instruction.match(/^(hold|avoid|exclude|skip|prioritize|prioritise)\s+(.+)$/);
      if (fieldMatch) {
        const field = resolve(fieldMatch[2], meta && meta.fields, 'field');
        if (!field) return reject(`I could not identify a single field in “${line}”. Use its exact name or field ID, and put each change on its own line.`);
        add(/^prioriti/.test(fieldMatch[1]) ? 'priority_fields' : 'excluded_fields', field.id);
        continue;
      }
      const rigMatch = instruction.match(/^(?:keep|leave)\s+(.+?)\s+out(?: of (?:the )?plan)?$/);
      if (rigMatch) {
        const rig = resolve(rigMatch[1], meta && meta.rigs, 'rig');
        if (!rig) return reject(`I could not identify a single sprayer in “${line}”. Use its exact name or rig ID, and put each change on its own line.`);
        add('unavailable_rigs', rig.id);
        continue;
      }
      return reject(`I cannot safely apply “${line}” yet. Try “lower cost”, “more rain buffer”, “hold F14”, “prioritize F14”, or “keep R3 out”. Put each change on its own line.`);
    }
    if (constraints.excluded_fields.some(id => constraints.priority_fields.includes(id))) return reject('The same field cannot be both held and prioritized. Choose one instruction for that field.');
    const label = (id, collection) => { const item = (collection || []).find(entry => entry.id === id); return item && item.name ? `${item.name} (${id})` : id; };
    const changes = [];
    if (priority) changes.push(`Rank options for ${priorityLabels[priority]}.`);
    if (constraints.excluded_fields.length) changes.push(`Exclude ${constraints.excluded_fields.map(id => label(id, meta.fields)).join(', ')} from the revised plan.`);
    if (constraints.priority_fields.length) changes.push(`Give ${constraints.priority_fields.map(id => label(id, meta.fields)).join(', ')} priority within the scheduling rules.`);
    if (constraints.unavailable_rigs.length) changes.push(`Keep ${constraints.unavailable_rigs.map(id => label(id, meta.rigs)).join(', ')} unavailable for this planning day.`);
    const warnings = [];
    if (constraints.priority_fields.length) warnings.push('Field priority is a preference; spray windows, weather and crew rules still apply.');
    if (constraints.unavailable_rigs.length) warnings.push('This excludes the sprayer for the whole modeled day. Partial-day availability is not supported in this feedback helper.');
    return {supported:true, summary:changes.join(' '), warnings, constraints, ...(priority ? {priority} : {}), sourceText};
  }

  class FieldworkProposalFeedback {
    constructor(root, callbacks) {
      this.root = root;
      this.callbacks = callbacks || {};
      this.data = {};
      this.draft = '';
      this.externalDraft = undefined;
      this.helperAction = 'hold';
      this.helperTarget = '';
      this.helperOpen = false;
      this.reviewInvalidated = false;
      root.addEventListener('click', event => this.onClick(event));
      root.addEventListener('input', event => this.onInput(event));
      root.addEventListener('change', event => this.onChange(event));
      root.addEventListener('keydown', event => {
        if (event.target.matches('[data-feedback-draft]') && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault(); this.review();
        }
      });
      root.addEventListener('toggle', event => {
        if (event.target.matches('[data-feedback-helper]')) this.helperOpen = event.target.open;
      }, true);
    }

    locked() { return !!this.data.busy || this.data.phase === 'analyzing' || !this.data.plan; }

    setDraft(text, focus) {
      const next = String(text).slice(0,1000);
      const changed = next !== this.draft;
      this.draft = next;
      if (changed) this.reviewInvalidated = true;
      if (changed && this.callbacks.onDraft) this.callbacks.onDraft(this.draft);
      const textarea = this.root.querySelector('[data-feedback-draft]');
      if (textarea) {
        if (textarea.value !== this.draft) textarea.value = this.draft;
        if (focus) { textarea.focus(); textarea.setSelectionRange(this.draft.length, this.draft.length); }
      }
      this.updateDraftControls();
    }

    updateDraftControls() {
      const count = this.root.querySelector('[data-feedback-count]');
      if (count) count.textContent = `${this.draft.length} / 1,000`;
      const review = this.root.querySelector('[data-feedback-action="review"]');
      if (review) review.disabled = this.locked() || !this.draft.trim();
      const apply = this.root.querySelector('[data-feedback-action="apply"]');
      if (apply) apply.disabled = !this.canApply();
      const stale = this.root.querySelector('[data-feedback-stale]');
      if (stale) stale.hidden = !this.data.review || (!this.reviewInvalidated && this.data.review.sourceText === this.draft.trim());
    }

    canApply() {
      const review = this.data.review;
      return !this.locked() && !this.reviewInvalidated && review && review.supported && review.sourceText === this.draft.trim() && !(this.data.offline && hasConstraints(review.constraints));
    }

    review() {
      if (!this.locked() && this.draft.trim() && this.callbacks.onReview) this.callbacks.onReview(this.draft);
    }

    onInput(event) {
      if (event.target.matches('[data-feedback-draft]')) this.setDraft(event.target.value, false);
    }

    onChange(event) {
      if (event.target.matches('[data-feedback-helper-action]')) {
        this.helperAction = event.target.value;
        this.helperTarget = '';
        this.helperOpen = true;
        this.render(this.data);
      } else if (event.target.matches('[data-feedback-helper-target]')) this.helperTarget = event.target.value;
    }

    onClick(event) {
      const button = event.target.closest('[data-feedback-action]');
      if (!button || !this.root.contains(button) || button.disabled) return;
      const action = button.dataset.feedbackAction;
      if (action === 'review') { this.review(); return; }
      if (action === 'apply') { if (this.canApply() && this.callbacks.onApply) this.callbacks.onApply(this.data.review); return; }
      if (action === 'clear') { if (!this.data.busy && this.data.phase !== 'analyzing' && this.callbacks.onClear) this.callbacks.onClear(); return; }
      if (this.locked()) return;
      if (action === 'cost') this.setDraft('Lower cost', true);
      if (action === 'buffer') this.setDraft('More rain buffer', true);
      if (action === 'hold' || action === 'rig') {
        this.helperAction = action === 'rig' ? 'unavailable' : 'hold';
        this.helperOpen = true; this.helperTarget = ''; this.render(this.data);
        const target = this.root.querySelector('[data-feedback-helper-target]');
        if (target) target.focus();
      }
      if (action === 'add') {
        const select = this.root.querySelector('[data-feedback-helper-target]');
        const id = select && select.value;
        if (!id) return;
        const line = this.helperAction === 'unavailable' ? `Keep ${id} out` : `${this.helperAction === 'prioritize' ? 'Prioritize' : 'Hold'} ${id}`;
        this.setDraft(`${this.draft.trim()}${this.draft.trim() ? '\n' : ''}${line}`, true);
      }
    }

    historyHtml(history) {
      if (!Array.isArray(history) || !history.length) return '';
      return `<div class="feedback-history" aria-label="Feedback conversation">${history.slice(-12).map(entry => {
        const role = entry.role === 'user' ? 'user' : 'assistant';
        const date = entry.timestamp ? new Date(entry.timestamp) : null;
        const time = date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : '';
        const status = ({recorded:'Saved',awaiting_confirmation:'Review required',needs_clarification:'Needs clarification',revised:'Draft ready',failed:'Could not revise'})[entry.status] || entry.status;
        return `<article class="feedback-message feedback-message-${role}"><div class="feedback-message-meta"><strong>${role === 'user' ? 'You' : 'Planning agent'}</strong>${time ? `<time>${escape(time)}</time>` : ''}${status ? `<span>${escape(status)}</span>` : ''}</div><p>${escape(entry.text || '')}</p></article>`;
      }).join('')}</div>`;
    }

    activeHtml(constraints) {
      if (!hasConstraints(constraints)) return '';
      const meta = this.data.meta || {};
      const names = (ids, list) => (ids || []).map(id => { const item = (list || []).find(entry => entry.id === id); return escape(item && item.name ? `${item.name} (${id})` : id); }).join(', ');
      return `<div class="feedback-active"><div><strong>Reviewed feedback restrictions</strong>${constraints.excluded_fields && constraints.excluded_fields.length ? `<p>Fields held: ${names(constraints.excluded_fields, meta.fields)}</p>` : ''}${constraints.priority_fields && constraints.priority_fields.length ? `<p>Priority fields: ${names(constraints.priority_fields, meta.fields)}</p>` : ''}${constraints.unavailable_rigs && constraints.unavailable_rigs.length ? `<p>Sprayers unavailable: ${names(constraints.unavailable_rigs, meta.rigs)}</p>` : ''}</div><button type="button" class="feedback-text-button" data-feedback-action="clear" ${this.data.busy || this.data.phase === 'analyzing' ? 'disabled' : ''}>Clear feedback changes</button></div>`;
    }

    render(data) {
      data = data || {};
      if (data.review !== this.data.review) this.reviewInvalidated = false;
      const focused = typeof document !== 'undefined' ? document.activeElement : null;
      const editing = focused && focused.matches && focused.matches('[data-feedback-draft]') && this.root.contains(focused);
      const selection = editing ? [focused.selectionStart, focused.selectionEnd] : null;
      if (Object.prototype.hasOwnProperty.call(data, 'draft') && data.draft !== this.externalDraft) {
        this.draft = String(data.draft || '').slice(0,1000); this.externalDraft = data.draft;
      }
      this.data = data || {};
      const history = this.data.history || [];
      const visible = !!this.data.plan || history.length || this.data.review || hasConstraints(this.data.activeConstraints);
      this.root.hidden = !visible;
      if (!visible) { this.root.innerHTML = ''; return; }
      const locked = this.locked();
      const disabled = locked ? 'disabled' : '';
      const meta = this.data.meta || {};
      const review = this.data.review;
      const offlineBlocked = this.data.offline && review && hasConstraints(review.constraints);
      const targets = this.helperAction === 'unavailable' ? meta.rigs || [] : meta.fields || [];
      const targetExists = targets.some(item => item.id === this.helperTarget);
      if (!targetExists) this.helperTarget = targets[0] ? targets[0].id : '';
      const active = this.activeHtml(this.data.activeConstraints);
      this.root.innerHTML = `<section class="feedback-panel" aria-labelledby="feedback-heading">
        <header class="feedback-heading"><div class="feedback-icon" aria-hidden="true">↺</div><div><h3 id="feedback-heading">Make the plan work for you</h3><p>Tell the agent what should change. Review its interpretation before creating a new draft.</p></div><span class="feedback-human-label">You stay in control</span></header>
        ${active}${this.historyHtml(history)}
        ${locked ? `<p class="feedback-notice" role="status">${this.data.phase === 'analyzing' || this.data.busy ? 'The agent is building your options. You can add feedback when they are ready.' : 'Generate a plan to give the agent feedback.'}</p>` : ''}
        <div class="feedback-composer"><label for="feedback-draft">What should change?</label><p id="feedback-help" class="feedback-help">Use one instruction per line. Choose a suggestion, or name a field or sprayer from your farm.</p>
          <div class="feedback-chips"><button type="button" data-feedback-action="cost" ${disabled}>Lower cost</button><button type="button" data-feedback-action="buffer" ${disabled}>More rain buffer</button><button type="button" data-feedback-action="hold" ${disabled}>Hold a field <span aria-hidden="true">+</span></button><button type="button" data-feedback-action="rig" ${disabled}>Keep a sprayer out <span aria-hidden="true">+</span></button></div>
          <textarea id="feedback-draft" data-feedback-draft rows="3" maxlength="1000" aria-describedby="feedback-help" placeholder="For example: Lower cost&#10;Hold F14&#10;Keep R3 out" ${disabled}>${escape(this.draft)}</textarea>
          <div class="feedback-composer-bottom"><span data-feedback-count>${this.draft.length} / 1,000</span><button type="button" class="primary-button feedback-review-button" data-feedback-action="review" ${locked || !this.draft.trim() ? 'disabled' : ''}>Review feedback <span aria-hidden="true">→</span></button></div>
          <details class="feedback-helper" data-feedback-helper ${this.helperOpen ? 'open' : ''}><summary>Choose a field or sprayer</summary><div class="feedback-helper-fields"><label>Change<select data-feedback-helper-action ${disabled}><option value="hold" ${this.helperAction === 'hold' ? 'selected' : ''}>Hold a field</option><option value="prioritize" ${this.helperAction === 'prioritize' ? 'selected' : ''}>Prioritize a field</option><option value="unavailable" ${this.helperAction === 'unavailable' ? 'selected' : ''}>Keep a sprayer out</option></select></label><label>${this.helperAction === 'unavailable' ? 'Sprayer' : 'Field'}<select data-feedback-helper-target ${disabled}>${targets.length ? targets.map(item => `<option value="${escape(item.id)}" ${this.helperTarget === item.id ? 'selected' : ''}>${escape(item.name || item.id)}${item.name ? ` · ${escape(item.id)}` : ''}</option>`).join('') : '<option value="">None available</option>'}</select></label><button type="button" class="feedback-outline-button" data-feedback-action="add" ${locked || !targets.length ? 'disabled' : ''}>Add instruction</button></div></details>
        </div>
        ${review ? `<article class="feedback-interpretation ${review.supported ? '' : 'is-note'}" aria-live="polite"><div class="feedback-interpretation-title"><span aria-hidden="true">${review.supported ? '✓' : '?'}</span><h4>${review.supported ? 'Here’s how I understood your feedback' : 'Let’s make that more specific'}</h4><span class="feedback-draft-label">${review.supported ? 'Not applied yet' : 'Saved as a note'}</span></div><p>${escape(review.summary)}</p>${review.warnings && review.warnings.length ? `<ul>${review.warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul>` : ''}<p data-feedback-stale class="feedback-warning" ${!this.reviewInvalidated && review.sourceText === this.draft.trim() ? 'hidden' : ''}>Your text has changed. Review the updated feedback before applying it.</p>${offlineBlocked ? '<p class="feedback-warning">The recorded replay can change option ranking only. Field and sprayer changes need the local solver; these constraints have not been applied.</p>' : ''}${review.supported ? `<div class="feedback-apply-row"><p>Creates a new draft for your review. Final approval is still a separate step.</p><button type="button" class="primary-button" data-feedback-action="apply" ${this.canApply() ? '' : 'disabled'}>${this.data.offline && !offlineBlocked ? 'Apply ranking' : 'Apply feedback & replan'}</button></div>` : ''}</article>` : ''}
        ${this.data.error ? `<p class="feedback-warning" role="alert">${escape(this.data.error)}</p>` : ''}
        <p class="feedback-footnote">The prototype understands the instructions above. Other feedback is kept for clarification; it never silently changes a plan.</p>
      </section>`;
      if (editing && !locked) {
        const textarea = this.root.querySelector('[data-feedback-draft]');
        textarea.focus(); textarea.setSelectionRange(Math.min(selection[0],this.draft.length), Math.min(selection[1],this.draft.length));
      }
    }
  }

  global.FieldworkFeedback = {parse};
  global.FieldworkProposalFeedback = FieldworkProposalFeedback;
  if (typeof module !== 'undefined' && module.exports) module.exports = {parse, FieldworkProposalFeedback};
})(typeof window !== 'undefined' ? window : globalThis);
