#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const PlanAgent=require('../web/plan-agent.js');
const tests=[];
const test=(name,fn)=>{fn();tests.push(name);};
const root=()=>({innerHTML:'',addEventListener(){},contains(){return true;}});
const sample=extra=>({meta:{fields:[{id:'F01',name:'North Forty'},{id:'F02',name:'Creek'}]},result:{run_id:'r1',plans:[{id:'p1'}]},plan:{id:'p1',name:'Cover more acres',acres:110,estimated_cost:460,labor_hours:5},proposal:{summary:'Assign two fields.',actions:[{rig_id:'R1',rig_name:'Green Sprayer',crew_name:'Alex',next_first:'F01',previous_first:'F02',jobs:[{field_id:'F01',start:540,end:570},{field_id:'F02',start:600,end:640,on_hold:true}]}]},...extra});
const view=extra=>{const el=root(),panel=new PlanAgent(el);panel.render(sample(extra));return {el,panel};};
const click=(panel,action)=>panel.click({target:{closest:()=>({dataset:{planAgentAction:action},disabled:false})}});
test('current proposal shows exact named sprayer and next field',()=>{
  const {el,panel}=view();assert.match(el.innerHTML,/Green Sprayer/);assert.match(el.innerHTML,/North Forty/);assert.match(el.innerHTML,/9:00 am/);assert.match(el.innerHTML,/On hold/);assert.equal(panel.canApprove(),true);
});
test('all proposed sprayers appear including rigs without work',()=>{
  const data=sample();data.proposal.actions.push({rig_id:'R2',rig_name:'Blue',jobs:[]});
  const {el}=view(data);assert.equal((el.innerHTML.match(/data-plan-agent-rig=/g)||[]).length,2);assert.match(el.innerHTML,/No field assigned/);
});
test('held routes never claim a field can be started',()=>{
  const data=sample();data.proposal.actions[0].next_first=null;
  assert.match(view(data).el.innerHTML,/Assigned jobs on hold/);
});
test('busy dirty errored and underway proposals cannot be approved',()=>{
  for(const extra of [{busy:true},{dirty:true},{error:'Planner unavailable'},{underway:true},{plan:null},{proposal:null}]){
    const {el,panel}=view(extra);assert.equal(panel.canApprove(),false);assert.match(el.innerHTML,/data-plan-agent-action="approve" disabled/);
  }
});
test('approved plan is marked approved without a repeat approval action',()=>{
  const {el,panel}=view({approved:true});assert.equal(panel.canApprove(),false);assert.match(el.innerHTML,/Approved by you/);assert.match(el.innerHTML,/Approved next field/);
});
test('stale routes are clearly labeled previous proposal',()=>{
  const {el}=view({dirty:true});assert.match(el.innerHTML,/Refresh needed/);assert.match(el.innerHTML,/Previous proposal/);
});
test('no feasible result keeps feedback accessible for restriction recovery',()=>{
  const {el,panel}=view({plan:null,proposal:null,result:{plans:[],remaining_field_count:5}});assert.equal(panel.canApprove(),false);assert.match(el.innerHTML,/No feasible work/);assert.match(el.innerHTML,/data-plan-agent-action="feedback" >/);assert.match(el.innerHTML,/data-plan-agent-action="compare" disabled/);
});
test('no remaining fields has a completion state',()=>{
  const {el}=view({plan:null,proposal:null,result:{plans:[],remaining_field_count:0}});assert.match(el.innerHTML,/All fields complete/);assert.match(el.innerHTML,/No remaining fields to schedule/);
});
test('offline view is explicit about recorded results',()=>{
  const {el}=view({offline:true});assert.match(el.innerHTML,/Recorded scenario replay/);assert.match(el.innerHTML,/Reload scenario/);assert.match(el.innerHTML,/Custom field or sprayer changes need the local solver/);
});
test('farm and error text are escaped',()=>{
  const data=sample({error:'<script>bad</script>'});data.plan.name='<img src=x>';data.meta.fields[0].name='<b>Field</b>';data.proposal.actions[0].rig_name='<svg>';
  const {el}=view(data);assert.match(el.innerHTML,/&lt;script&gt;/);assert.match(el.innerHTML,/&lt;img/);assert.match(el.innerHTML,/&lt;b&gt;/);assert.match(el.innerHTML,/&lt;svg&gt;/);assert.doesNotMatch(el.innerHTML,/<script>|<img|<svg>/);
});
test('button delegation calls only the selected review action',()=>{
  const calls=[],el=root(),panel=new PlanAgent(el,{onReplan:()=>calls.push('replan'),onFeedback:()=>calls.push('feedback'),onApprove:()=>calls.push('approve'),onCompare:()=>calls.push('compare')});panel.render(sample());
  for(const action of ['replan','feedback','approve','compare'])click(panel,action);assert.deepEqual(calls,['replan','feedback','approve','compare']);
  panel.render(sample({underway:true}));click(panel,'approve');assert.equal(calls.length,4);
  panel.render(sample({busy:true}));click(panel,'feedback');click(panel,'replan');assert.equal(calls.length,4);
});
test('open route details persist only within the same proposal',()=>{
  const {el,panel}=view();panel.openRigs.add('R1');panel.render(sample());assert.match(el.innerHTML,/data-plan-agent-rig="R1" open/);
  panel.render(sample({result:{run_id:'r2',plans:[{id:'p1'}]}}));assert.doesNotMatch(el.innerHTML,/data-plan-agent-rig="R1" open/);
});
console.log(`${tests.length} plan-agent checks passed.`);
tests.forEach(name=>console.log(`✓ ${name}`));
