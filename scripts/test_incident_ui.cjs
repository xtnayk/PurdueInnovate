#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const View=require('../web/disruptions-dashboard.js');
const tests=[];
const test=(name,fn)=>{fn();tests.push(name);};
const root=()=>({innerHTML:'',addEventListener(){},contains(){return true;}});
const incident={id:'i1',type:'breakdown',title:'Rig 3 hydraulic leak',message:'Down until 2pm',source:'Riley · Rig 3',reported_at:'2026-10-30T13:00:00Z',status:'new',simulated:true};
const plan={id:'p1',name:'Keep priority fields moving',estimated_cost:1025,acres:120,labor_hours:4,min_rain_buffer_minutes:45};
const data=extra=>({incidents:[incident],meta:{fields:[{id:'F01',name:'North Forty'}]},selectedIncident:null,phase:'idle',busy:false,dirty:false,result:{plans:[plan]},selectedPlan:plan,activeSnapshot:{records:{}},proposal:{summary:'Move work to two sprayers.',actions:[{rig_id:'R1',rig_name:'Green sprayer',crew_name:'Morgan',changed:true,next_first:'F01',previous_first:null,jobs:[{field_id:'F01'}]}]},...extra});
const render=extra=>{const host=root();const view=new View(host);view.render(data(extra));return {view,html:host.innerHTML};};
test('feed contains reports and intake, never the general planner',()=>{
 const {html}=render();assert.match(html,/Reports from the field/);assert.match(html,/Rig 3 hydraulic leak/);assert.match(html,/data-disruption-action="report"/);assert.doesNotMatch(html,/Suggested response|disruption-agent-panel|data-disruption-plan|data-disruption-scenario/);
});
test('connection and simulated source are stated on the inbox',()=>{
 const {html}=render();assert.match(html,/No live fleet connection/);assert.match(html,/Simulated report/);assert.match(html,/Riley · Rig 3/);
});
test('open filter excludes resolved reports without deleting them',()=>{
 const {view,html}=render({incidents:[incident,{...incident,id:'i2',title:'Resolved gate',status:'resolved'}]});assert.doesNotMatch(html,/Resolved gate/);view.filter='resolved';view.render(view.data);assert.match(view.root.innerHTML,/Resolved gate/);assert.doesNotMatch(view.root.innerHTML,/Rig 3 hydraulic leak/);
});
test('empty feed offers a useful report state',()=>{const {html}=render({incidents:[]});assert.match(html,/No reports to review/);assert.doesNotMatch(html,/Suggested response/);});
test('selecting an incident reveals its report and suggestion status',()=>{
 const {html}=render({selectedIncident:incident,phase:'analyzing',busy:true});assert.match(html,/Suggested response/);assert.match(html,/Checking how to respond/);assert.match(html,/All disruptions/);assert.doesNotMatch(html,/data-disruption-action="approve"/);
});
test('ready response leads with actions and keeps alternatives collapsed',()=>{
 const {html}=render({selectedIncident:incident,phase:'ready',result:{plans:[plan,{...plan,id:'p2',name:'More rain buffer'}]}});assert.match(html,/Recommended response/);assert.match(html,/Green sprayer: start with North Forty/);assert.match(html,/<details class="incident-alternatives">/);assert.match(html,/Review &amp; approve response|Review & approve response/);
});
test('underway jobs block approval but retain feedback',()=>{
 const {html}=render({selectedIncident:incident,phase:'ready',activeSnapshot:{records:{F02:{status:'in_progress'}}}});assert.match(html,/data-disruption-action="approve" disabled/);assert.match(html,/data-disruption-action="feedback"/);assert.match(html,/Complete or hold underway/);
});
test('stale response cannot be approved until refreshed',()=>{const {html}=render({selectedIncident:incident,phase:'ready',dirty:true});assert.doesNotMatch(html,/data-disruption-action="approve"/);assert.match(html,/Refresh the suggestion/);});
test('response approval leaves resolution as a separate action',()=>{
 const {html}=render({selectedIncident:{...incident,status:'response_approved'},phase:'approved'});assert.match(html,/Response approved\./);assert.match(html,/issue stays open/);assert.match(html,/Mark issue resolved/);assert.doesNotMatch(html,/data-disruption-action="approve"/);
});
test('previous approval never hides retry after a failed or stale response',()=>{
 for(const extra of [{phase:'error',error:'Solver unavailable'},{phase:'ready',dirty:true}]){
  const {html}=render({selectedIncident:{...incident,status:'response_approved'},...extra});
  assert.match(html,/data-disruption-action="analyze"/);assert.match(html,/Refresh suggestion/);assert.doesNotMatch(html,/data-disruption-action="approve"/);
 }
});
test('resolved incident has no new action or resolution button',()=>{
 const {html}=render({selectedIncident:{...incident,status:'resolved'},phase:'ready'});assert.match(html,/issue was marked resolved/);assert.doesNotMatch(html,/data-disruption-action="approve"|data-disruption-action="resolve"/);
});
test('report content is escaped across list and detail',()=>{
 const bad={...incident,title:'<img src=x>',source:'<script>bad</script>',message:'<b>unsafe</b>'};for(const selectedIncident of [null,bad]){const {html}=render({incidents:[bad],selectedIncident});assert.doesNotMatch(html,/<img|<script>|<b>unsafe/);assert.match(html,/&lt;img/);}
});
test('offline detail names recorded responses accurately',()=>{const {html}=render({selectedIncident:incident,offline:true});assert.match(html,/recorded response/);assert.match(html,/Load recorded suggestion/);});
test('empty solver response retains feedback and refresh controls',()=>{const {html}=render({selectedIncident:incident,phase:'ready',result:{plans:[]},selectedPlan:null});assert.match(html,/No feasible fleet response found/);assert.match(html,/Review feedback/);assert.doesNotMatch(html,/data-disruption-action="approve"/);});
test('incident actions route only to explicit callbacks',()=>{
 const calls=[];const host=root();const view=new View(host,{onOpenIncident:id=>calls.push(['open',id]),onResolveIncident:id=>calls.push(['resolve',id]),onBackToFeed:()=>calls.push(['back']),onReportIncident:()=>calls.push(['report'])});view.render(data());for(const action of ['open','resolve','back','report'])view.click({target:{closest:()=>({disabled:false,dataset:{disruptionAction:action,incidentId:'i1'}})}});assert.deepEqual(calls,[['open','i1'],['resolve','i1'],['back'],['report']]);
});
console.log(`${tests.length} incident UI checks passed.`);tests.forEach(name=>console.log(`✓ ${name}`));
