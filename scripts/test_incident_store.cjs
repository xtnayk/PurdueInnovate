#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const Store=require('../web/incident-store.js');
const metadata={date:'2026-05-21',rigs:[1,2,3,4].map(i=>({id:`R${i}`,name:`Sprayer ${i}`,crew_name:`Operator ${i}`})),fields:[1,2].map(i=>({id:`F0${i}`,name:`Field ${i}`}))};
const memory=()=>{const values=new Map();return {values,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)};};
const make=(storage=memory(),meta=metadata)=>new Store({metadata:meta,storage});
const checks=[];const check=(label,fn)=>{fn();checks.push(label);};

check('fresh stores seed only one clearly simulated assigned-operator report',()=>{
  const store=make(),report=store.list()[0];assert.equal(store.list().length,1);assert.equal(report.id,'demo-initial-breakdown');
  assert.equal(report.rig_id,'R3');assert.equal(report.available_from,840);assert.equal(report.simulated,true);assert.match(report.source,/Operator 3.*demo/);
});
check('custom fleets seed the first available sprayer when R3 is absent',()=>{
  const store=make(memory(),{...metadata,profile_id:'small',rigs:[metadata.rigs[1]]});assert.equal(store.list()[0].rig_id,'R2');
});
check('reporting requires known fields, rigs and exact numeric bounds',()=>{
  const store=make();
  for(const input of [{type:'breakdown',rig_id:'R8',available_from:840},{type:'wet',field_id:'F33'},{type:'storm',rain_time:'840'},{type:'wind',wind_mph:0},{type:'wind',wind_mph:61},{type:'breakdown',rig_id:'R1',available_from:1201},{type:'storm',rain_time:479},{type:'wet',field_id:'F01',wind_mph:18},{type:'other'}])assert.throws(()=>store.report(input));
  assert.equal(store.list().length,1);
});
check('reported text is preserved and all four typed constraints are generated',()=>{
  const store=make();
  const wet=store.report({type:'wet',field_id:'F02',rig_id:'R1',message:'North gate flooded.',source:'Alex'});
  store.report({type:'storm',rain_time:900});store.report({type:'wind',wind_mph:18});
  assert.equal(wet.message,'North gate flooded.');assert.equal(wet.status,'new');
  const inputs=store.activeInputs();assert.equal(inputs.length,4);
  assert.deepEqual(inputs.find(r=>r.id===wet.id),{id:wet.id,type:'wet',field_id:'F02'});
  assert.ok(inputs.every(r=>r.message===undefined&&r.status===undefined&&r.simulated===undefined));
});
check('list returns latest reports first including same-millisecond ties',()=>{
  const store=make();const a=store.report({type:'wet',field_id:'F01'}),b=store.report({type:'wet',field_id:'F02'});
  assert.equal(store.list()[0].id,b.id);assert.equal(store.list()[1].id,a.id);
});
check('approval records a response and leaves the physical incident active',()=>{
  const store=make(),id=store.list()[0].id;
  assert.equal(store.markReviewed(id).status,'reviewing');
  const approved=store.approveResponse(id,{run_id:'run-1',plan_id:'plan-1'});assert.equal(approved.status,'response_approved');
  assert.equal(approved.response.plan_id,'plan-1');assert.equal(store.activeInputs().length,1);
  const before=store.snapshot();store.approveResponse(id,{run_id:'run-1',plan_id:'plan-1'});assert.deepEqual(store.snapshot(),before);
});
check('resolution explicitly removes constraints while retaining report history',()=>{
  const store=make(),id=store.list()[0].id;store.resolve(id);assert.equal(store.activeInputs().length,0);assert.equal(store.get(id).status,'resolved');
  assert.equal(store.list().length,1);assert.throws(()=>store.approveResponse(id,{run_id:'r',plan_id:'p'}),/resolved/);
  const before=store.snapshot();store.resolve(id);store.markReviewed(id);assert.deepEqual(store.snapshot(),before);
});
check('input, returned reports and snapshots cannot mutate stored incidents',()=>{
  const store=make(),input={type:'wet',field_id:'F01',message:'Wet gate'};const created=store.report(input);input.message='Changed';created.message='Changed';
  const list=store.list();list[0].status='resolved';const snap=store.snapshot();snap.incidents=[];
  assert.equal(store.get(created.id).message,'Wet gate');assert.equal(store.get(created.id).status,'new');assert.equal(store.list().length,2);
  const active=store.activeInputs();active[0].field_id='F02';assert.equal(store.get(created.id).field_id,'F01');
});
check('reports and approved responses survive reload without reseeding',()=>{
  const storage=memory(),store=make(storage),id=store.list()[0].id;store.approveResponse(id,{run_id:'r',plan_id:'p'});store.report({type:'wet',field_id:'F01'});
  assert.deepEqual(make(storage).snapshot(),store.snapshot());
});
check('farm configurations and dates keep separate incident histories',()=>{
  const storage=memory(),first=make(storage),id=first.list()[0].id;first.resolve(id);
  const other=make(storage,{...metadata,profile_id:'farm-a-rev1'});assert.equal(other.activeInputs().length,1);
  const day=make(storage,{...metadata,date:'2026-05-22'});assert.equal(day.activeInputs().length,1);assert.equal(make(storage).activeInputs().length,0);
});
check('stale tabs refresh and refuse to overwrite another tabs report',()=>{
  const storage=memory(),first=make(storage),second=make(storage);first.report({type:'wet',field_id:'F01'});
  assert.throws(()=>second.report({type:'wind',wind_mph:18}),/another tab/);assert.equal(second.list().length,2);
  second.report({type:'wind',wind_mph:18});assert.equal(make(storage).list().length,3);
});
check('corrupt or unknown saved records remain untouched with a visible warning',()=>{
  for(const mutate of [()=>'{broken',state=>{state.incidents[0].rig_id='R99';return JSON.stringify(state);},state=>{state.incidents[0].surprise=true;return JSON.stringify(state);}]){
    const storage=memory(),store=make(storage);const corrupt=mutate(store.snapshot());storage.setItem(store.key,corrupt);
    const loaded=make(storage);assert.ok(loaded.persistenceWarning);assert.equal(loaded.list().length,0);loaded.report({type:'wind',wind_mph:12});assert.equal(storage.getItem(store.key),corrupt);
  }
});
check('storage denial and quota failure preserve functional in-memory reporting',()=>{
  const denied=make({getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}});assert.ok(denied.persistenceWarning);assert.equal(denied.report({type:'wind',wind_mph:12}).status,'new');
  const quota=make({getItem(){return null;},setItem(){throw new Error('quota');}});assert.ok(quota.persistenceWarning);assert.equal(quota.list().length,1);quota.resolve(quota.list()[0].id);assert.equal(quota.activeInputs().length,0);
});
check('invalid response identifiers and unknown incident changes are rejected',()=>{
  const store=make(),id=store.list()[0].id;assert.throws(()=>store.approveResponse(id,{run_id:'',plan_id:'p'}));assert.throws(()=>store.approveResponse(id,{run_id:'r',plan_id:'p',extra:true}));assert.throws(()=>store.resolve('unknown'));
});
console.log(`${checks.length} incident-store checks passed.`);for(const label of checks)console.log(`✓ ${label}`);
