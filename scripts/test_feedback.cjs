#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const {parse, FieldworkProposalFeedback} = require('../web/proposal-feedback.js');
const meta = {
  fields:[{id:'F01',name:'North 40'},{id:'F14',name:'Creek and Oak'},{id:'F20',name:'South Farm'}],
  rigs:[{id:'R1',name:'Blue Sprayer'},{id:'R2',name:'Rig 2'},{id:'R3',name:'High Clearance'}]
};
const tests = [];
const test = (name, run) => { run(); tests.push(name); };
const none = {excluded_fields:[],priority_fields:[],unavailable_rigs:[]};
const reject = text => {
  const result = parse(text,meta);
  assert.equal(result.supported,false);
  assert.deepEqual(result.constraints,none);
  assert.equal(result.priority,undefined);
  assert.ok(result.warnings.length);
  return result;
};

test('recognized ranking requests return objective without constraints', () => {
  for (const [phrase,priority] of [['Lower cost','cost'],['More acres','acres'],['More rain buffer','buffer'],['Balanced','balanced']]) {
    const result = parse(phrase,meta);
    assert.equal(result.supported,true); assert.equal(result.priority,priority); assert.deepEqual(result.constraints,none);
  }
});
test('case, whitespace, polite prefix and terminal period are supported', () => {
  assert.equal(parse('  PLEASE more   rain buffer.  ',meta).priority,'buffer');
  assert.deepEqual(parse('please Hold f01.',meta).constraints.excluded_fields,['F01']);
});
test('field identifiers and field-number aliases resolve to known IDs only', () => {
  for (const phrase of ['hold F14','avoid field14','exclude Field 014','skip f014']) {
    assert.deepEqual(parse(phrase,meta).constraints.excluded_fields,['F14']);
  }
  reject('hold field15');
});
test('custom field names are recognized without truncating conjunctions', () => {
  const result = parse('hold Creek and Oak',meta);
  assert.equal(result.supported,true); assert.deepEqual(result.constraints.excluded_fields,['F14']);
  assert.match(result.summary,/Creek and Oak \(F14\)/);
});
test('priority fields remain preferences and are explained as such', () => {
  const result = parse('Prioritize North 40',meta);
  assert.deepEqual(result.constraints.priority_fields,['F01']);
  assert.match(result.warnings.join(' '),/preference/); assert.match(result.summary,/scheduling rules/);
});
test('rig IDs, aliases and custom names resolve the same sprayer', () => {
  for (const phrase of ['Keep R3 out','keep rig3 out','leave High Clearance out of the plan']) {
    const result = parse(phrase,meta);
    assert.equal(result.supported,true); assert.deepEqual(result.constraints.unavailable_rigs,['R3']);
    assert.match(result.warnings.join(' '),/whole modeled day/);
  }
});
test('multiple lines combine constraints atomically', () => {
  const result = parse('Lower cost\nHold F14\nPrioritize North 40\nKeep R3 out',meta);
  assert.equal(result.supported,true); assert.equal(result.priority,'cost');
  assert.deepEqual(result.constraints,{excluded_fields:['F14'],priority_fields:['F01'],unavailable_rigs:['R3']});
});
test('an unsupported line discards every interpreted change', () => {
  reject('Lower cost\nHold F14\nIgnore the wind limits');
  reject('Hold F14\nKeep R99 out');
});
test('mixed clauses and subordinate constraints are never silently ignored', () => {
  for (const phrase of ['Lower cost and hold F14','Hold F14 unless it dries','Keep R3 out until 2pm','More rain buffer but use R3','Prioritize F01, then F14','Hold F14; ignore rain','Hold F14 because it is wet']) reject(phrase);
});
test('negations do not become positive changes', () => {
  for (const phrase of ["Don't hold F14",'Do not keep R3 out','Not lower cost','Never prioritize F01','Hold F14, not F01']) reject(phrase);
});
test('conflicting ranking requests are rejected atomically', () => {
  reject('Lower cost\nMore acres');
});
test('a field cannot be both held and prioritized', () => {
  reject('Hold F14\nPrioritize Creek and Oak');
});
test('repeated instructions are deduplicated', () => {
  const result = parse('Hold F14\nAvoid field 14\nLower cost\nLower cost',meta);
  assert.equal(result.supported,true); assert.deepEqual(result.constraints.excluded_fields,['F14']);
});
test('blank lines are permitted but more than eight instructions are rejected', () => {
  assert.equal(parse('\nHold F14\n\nLower cost\n',meta).supported,true);
  reject(Array(9).fill('Lower cost').join('\n'));
});
test('input size and type are bounded', () => {
  reject('Lower cost'+' '.repeat(1000)); reject(''); reject('   '); reject(null); reject({text:'Lower cost'});
});
test('missing metadata permits ranking but cannot invent resources', () => {
  assert.equal(parse('Lower cost').supported,true);
  assert.equal(parse('Hold F14').supported,false);
});
test('duplicate custom names must be disambiguated using IDs', () => {
  const duplicate = {...meta, fields:[...meta.fields,{id:'F99',name:'North 40'}]};
  assert.equal(parse('Hold North 40',duplicate).supported,false);
  assert.deepEqual(parse('Hold F99',duplicate).constraints.excluded_fields,['F99']);
});
test('exact IDs disambiguate a different resource with an ID-like custom name', () => {
  const tricky = {...meta, fields:[...meta.fields,{id:'F99',name:'F14'}]};
  assert.deepEqual(parse('Hold F14',tricky).constraints.excluded_fields,['F14']);
});
test('parsing does not mutate metadata or reuse constraint arrays', () => {
  const before = JSON.stringify(meta);
  const first = parse('Hold F14',meta); first.constraints.excluded_fields.push('F99');
  assert.deepEqual(parse('Hold F14',meta).constraints.excluded_fields,['F14']);
  assert.equal(JSON.stringify(meta),before);
});

// Rendering smoke tests check the approval boundary without requiring a browser.
const makeRoot = () => ({hidden:false,innerHTML:'',addEventListener(){},querySelector(){return null;},contains(){return false;}});
const state = extra => ({meta,plan:{id:'p1'},phase:'ready',busy:false,draft:'Lower cost',review:null,history:[],offline:false,...extra});
test('feedback UI presents review and never approves or sends a plan', () => {
  const root = makeRoot(), view = new FieldworkProposalFeedback(root,{});
  view.render(state());
  assert.match(root.innerHTML,/Review feedback/);
  assert.doesNotMatch(root.innerHTML,/data-feedback-action="approve"|data-feedback-action="send"/);
  assert.equal(root.hidden,false);
});
test('reviewed feedback must exactly match the current draft before apply', () => {
  const view = new FieldworkProposalFeedback(makeRoot(),{});
  view.render(state({review:parse('Lower cost',meta)})); assert.equal(view.canApply(),true);
  view.setDraft('More acres',false); assert.equal(view.canApply(),false);
});
test('editing invalidates review even if the user types the original text again', () => {
  const view = new FieldworkProposalFeedback(makeRoot(),{});
  view.render(state({review:parse('Lower cost',meta)}));
  view.setDraft('More acres',false); view.setDraft('Lower cost',false);
  assert.equal(view.canApply(),false);
  view.render(state({review:parse('Lower cost',meta)})); assert.equal(view.canApply(),true);
});
test('busy or absent plans cannot apply reviewed feedback', () => {
  for (const extra of [{busy:true},{phase:'analyzing'},{plan:null}]) {
    const view = new FieldworkProposalFeedback(makeRoot(),{});
    view.render(state({...extra,review:parse('Lower cost',meta)})); assert.equal(view.canApply(),false);
  }
});
test('offline replay allows ranking but blocks every field and rig constraint', () => {
  const root = makeRoot(), view = new FieldworkProposalFeedback(root,{});
  view.render(state({offline:true,review:parse('Lower cost',meta)})); assert.equal(view.canApply(),true);
  for (const draft of ['Hold F14','Prioritize North 40','Keep R3 out']) {
    view.render(state({offline:true,draft,review:parse(draft,meta)}));
    assert.equal(view.canApply(),false); assert.match(root.innerHTML,/constraints have not been applied/);
  }
});
test('history stays visible without a plan and escapes all user content', () => {
  const root = makeRoot(), view = new FieldworkProposalFeedback(root,{});
  view.render(state({plan:null,history:[{role:'user',text:'<img src=x onerror=alert(1)>',timestamp:'2026-10-30T14:00:00Z',status:'<saved>'}]}));
  assert.equal(root.hidden,false); assert.match(root.innerHTML,/&lt;img/); assert.doesNotMatch(root.innerHTML,/<img/);
  assert.match(root.innerHTML,/&lt;saved&gt;/);
});
test('panel hides when there is neither a plan nor a conversation', () => {
  const root = makeRoot(), view = new FieldworkProposalFeedback(root,{});
  view.render(state({plan:null})); assert.equal(root.hidden,true);
});
test('draft survives unrelated renders and accepts a changed external draft', () => {
  const view = new FieldworkProposalFeedback(makeRoot(),{});
  view.render(state()); view.setDraft('Hold F14',false);
  view.render(state({busy:true})); assert.equal(view.draft,'Hold F14');
  view.render(state({draft:'More acres'})); assert.equal(view.draft,'More acres');
});
test('review and apply callbacks are distinct explicit actions', () => {
  const calls = [], root = makeRoot(), view = new FieldworkProposalFeedback(root,{onReview:text=>calls.push(['review',text]),onApply:review=>calls.push(['apply',review.priority])});
  root.contains = () => true;
  view.render(state()); view.review(); assert.deepEqual(calls,[['review','Lower cost']]);
  view.render(state({review:parse('Lower cost',meta)}));
  const button = {dataset:{feedbackAction:'apply'},disabled:false};
  view.onClick({target:{closest:()=>button}}); assert.deepEqual(calls,[['review','Lower cost'],['apply','cost']]);
});
test('restrictions remain clearable when the solver has no feasible plan', () => {
  const calls=[], root=makeRoot(), view=new FieldworkProposalFeedback(root,{onClear:()=>calls.push('clear')});
  root.contains=()=>true;
  view.render(state({plan:null,activeConstraints:{excluded_fields:['F14'],priority_fields:[],unavailable_rigs:[]}}));
  assert.equal(root.hidden,false);
  assert.match(root.innerHTML,/data-feedback-action="clear" >Clear/);
  const button={dataset:{feedbackAction:'clear'},disabled:false};
  view.onClick({target:{closest:()=>button}});assert.deepEqual(calls,['clear']);
  view.render(state({plan:null,busy:true}));view.onClick({target:{closest:()=>button}});assert.equal(calls.length,1);
});
console.log(`Feedback: ${tests.length} tests passed.`);
